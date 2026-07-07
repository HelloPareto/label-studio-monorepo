import { useEffect } from "react";
import { observer } from "mobx-react";
import { types } from "mobx-state-tree";
import { Alert, Button, List, Progress, Typography, Upload } from "antd";
import { InboxOutlined } from "@ant-design/icons";

import InfoModal from "../../../components/Infomodal/Infomodal";
import Registry from "../../../core/Registry";
import { guidGenerator } from "../../../core/Helpers";
import { AnnotationMixin } from "../../../mixins/AnnotationMixin";
import RequiredMixin from "../../../mixins/Required";
import { ReadOnlyControlMixin } from "../../../mixins/ReadOnlyMixin";
import ControlBase from "../Base";
import ClassificationBase from "../ClassificationBase";

import "./FileUpload.scss";

const { Text } = Typography;
const { Dragger } = Upload;

const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB, matches S3 multipart minimum part size

/**
 * Reads the runtime upload configuration. Deliberately NOT read from XML
 * attributes: the upload host/auth token/assignment id are per-deployment,
 * rotate independently of any given batch config, and must never be
 * hard-coded into (or exfiltrated via) per-batch Forte XML.
 *
 * Host application must set this before the annotation view mounts:
 *
 * ```js
 * window.ForteUpload = {
 *   baseUrl: "https://forte-backend.example.com",
 *   token: "<knox-token>",
 *   assignmentId: "123",
 * };
 * ```
 */
function getUploadConfig() {
  const cfg = typeof window !== "undefined" ? window.ForteUpload : undefined;

  if (!cfg || !cfg.baseUrl || !cfg.token || !cfg.assignmentId) {
    throw new Error(
      "FileUpload: window.ForteUpload = {baseUrl, token, assignmentId} must be configured before upload",
    );
  }
  return cfg;
}

function attachmentsBase(cfg) {
  return `${cfg.baseUrl}/api/v1/active-assignments/${cfg.assignmentId}/attachments`;
}

function authHeaders(cfg) {
  return {
    "Content-Type": "application/json",
    Authorization: `Token ${cfg.token}`,
  };
}

// One row per file the user picked; tracks upload progress client-side only.
// Never holds a presigned URL — those expire and must not be persisted anywhere.
const FileEntryModel = types
  .model("FileUploadEntry", {
    id: types.identifier,
    name: types.string,
    size: types.number,
    status: types.optional(types.enumeration(["pending", "uploading", "uploaded", "error"]), "pending"),
    progress: types.optional(types.number, 0),
    fileId: types.maybeNull(types.string),
    uploadId: types.maybeNull(types.string),
    error: types.maybeNull(types.string),
  })
  .actions((self) => ({
    setUploading() {
      self.status = "uploading";
      self.error = null;
    },
    setProgress(pct) {
      self.progress = pct;
    },
    setRemoteIds(fileId, uploadId) {
      self.fileId = fileId;
      self.uploadId = uploadId;
    },
    setUploaded(fileId) {
      self.status = "uploaded";
      self.fileId = fileId;
      self.progress = 100;
      self.error = null;
    },
    setError(message) {
      self.status = "error";
      self.error = message || "Upload failed";
    },
  }));

/**
 * The `FileUpload` tag lets an annotator attach one or more files to the task.
 * Modeled on `<TextArea>`: it is a control tag that also renders its own
 * input UI, and `toName` must point at a primary object tag.
 *
 * Files are uploaded directly to S3 via presigned multipart URLs minted by
 * the Forte backend (`{baseUrl}/api/v1/active-assignments/{assignmentId}/attachments/`).
 * The annotation result stores only `{file_id, original_name}` per file —
 * NEVER a presigned URL, since those expire (see `AWS_PRESIGNED_EXPIRY`,
 * currently 1h). To display an already-uploaded file, mint a fresh URL via
 * `GET .../attachments/{file_id}/url/` at read time.
 *
 * Upload host/auth are injected at runtime via `window.ForteUpload`, see
 * `getUploadConfig` in this file's source — never via XML attributes.
 *
 * @example
 * <!--Basic file upload attached to a text task -->
 * <View>
 *   <Text name="text" value="$text"/>
 *   <FileUpload name="attachment" toName="text"/>
 * </View>
 * @example
 * <!--Allow up to 3 files, restricted to PDFs -->
 * <View>
 *   <Text name="text" value="$text"/>
 *   <FileUpload name="attachment" toName="text" maxFiles="3" accept="application/pdf" fileType="PDF"/>
 * </View>
 * @name FileUpload
 * @meta_title FileUpload Tag for File Attachments
 * @meta_description Customize Label Studio with the FileUpload tag to let annotators attach supporting files (documents, images, audio) to a task.
 * @param {string} name                  - Name of the element
 * @param {string} toName                - Name of the element that you want to attach files to
 * @param {string} [label]               - Label text shown above the picker
 * @param {number} [maxFiles=1]          - Maximum number of files that can be attached
 * @param {string} [accept]              - Comma-separated MIME types / extensions accepted by the file picker
 * @param {string} [fileType=Generic]    - Backend `File.type` value to tag the upload with (Video|Text|Image|PDF|Audio|Generic|Resume)
 * @param {boolean} [required=false]     - Validate that at least one file has been uploaded
 * @param {string} [requiredMessage]     - Message to show if validation fails
 */
const TagAttrs = types.model({
  toname: types.string,
  label: types.optional(types.string, "Upload files"),
  maxfiles: types.optional(types.string, "1"),
  accept: types.maybeNull(types.string),
  filetype: types.optional(types.string, "Generic"),
});

const Model = types
  .model({
    type: "fileupload",
    files: types.array(FileEntryModel),
  })
  .volatile(() => ({
    _controllers: new Map(),
  }))
  .views((self) => ({
    get maxFilesInt() {
      return Math.max(1, Number.parseInt(self.maxfiles, 10) || 1);
    },

    get canAddMore() {
      return self.files.length < self.maxFilesInt;
    },

    get holdsState() {
      return self.files.some((f) => f.status === "uploaded");
    },

    selectedValues() {
      const uploaded = self.files.filter((f) => f.status === "uploaded");

      if (!uploaded.length) return null;

      return uploaded.map((f) => ({ file_id: f.fileId, original_name: f.name }));
    },

    get serializableValue() {
      return self.selectedValues();
    },
  }))
  .actions((self) => ({
    unselectAll() {
      // Required by ControlBase; FileUpload has no drawable region to deselect.
    },

    needsUpdate() {
      self.updateFromResult(self.result?.mainValue);
    },

    updateFromResult(value) {
      self.files = [];
      if (!value) return;

      const entries = Array.isArray(value) ? value : [value];

      entries.forEach((v) => {
        self.files.push(
          FileEntryModel.create({
            id: guidGenerator(),
            name: v.original_name || "",
            size: 0,
            status: "uploaded",
            progress: 100,
            fileId: v.file_id,
          }),
        );
      });
    },

    requiredModal() {
      InfoModal.warning(self.requiredmessage || `Attachment for "${self.name}" is required.`);
    },

    // Best-effort: tells the backend to release the in-progress multipart
    // upload and delete the placeholder File row. Failures are swallowed —
    // this is cleanup, not the primary flow, and must never block the UI.
    async abortRemote(cfg, fileId, uploadId) {
      if (!fileId || !uploadId) return;
      try {
        await fetch(`${attachmentsBase(cfg)}/abort/`, {
          method: "POST",
          headers: authHeaders(cfg),
          body: JSON.stringify({ id: fileId, uploadId }),
        });
      } catch (e) {
        // ignore - best effort cleanup
      }
    },

    removeFile(id) {
      const entry = self.files.find((f) => f.id === id);

      if (!entry) return;

      if (entry.status === "uploading" && entry.fileId && entry.uploadId) {
        const controller = self._controllers.get(id);

        controller?.abort();
        self._controllers.delete(id);

        try {
          const cfg = getUploadConfig();

          self.abortRemote(cfg, entry.fileId, entry.uploadId);
        } catch (e) {
          // no runtime config available; nothing to abort remotely
        }
      }

      self.files = self.files.filter((f) => f.id !== id);
      self.updateResult();
    },

    // Cancels every upload still in flight (in-flight fetches + backend
    // multipart upload) without waiting for completion. Intended for the
    // component's unmount cleanup so a torn-down annotation doesn't leave
    // stray in-flight requests or orphaned S3 multipart uploads.
    abortAllPending() {
      self.files.forEach((entry) => {
        if (entry.status !== "uploading" && entry.status !== "pending") return;

        const controller = self._controllers.get(entry.id);

        controller?.abort();
        self._controllers.delete(entry.id);

        if (entry.fileId && entry.uploadId) {
          try {
            const cfg = getUploadConfig();

            self.abortRemote(cfg, entry.fileId, entry.uploadId);
          } catch (e) {
            // no runtime config available; nothing to abort remotely
          }
        }
      });
    },

    // Kicks off upload for each newly picked browser File. Returns a promise
    // that resolves once every file has settled (uploaded or errored) so
    // tests/callers can await the batch.
    addFiles(fileList) {
      const files = Array.from(fileList || []);
      const room = self.maxFilesInt - self.files.length;
      const accepted = files.slice(0, Math.max(0, room));

      const entries = accepted.map((file) =>
        FileEntryModel.create({
          id: guidGenerator(),
          name: file.name,
          size: file.size,
          status: "pending",
        }),
      );

      entries.forEach((entry) => self.files.push(entry));

      return Promise.all(entries.map((entry, i) => self.uploadFile(entry, accepted[i])));
    },

    async uploadFile(entry, file) {
      if (!file || file.size === 0) {
        entry.setError("Cannot upload an empty file");
        return;
      }

      let cfg;

      try {
        cfg = getUploadConfig();
      } catch (e) {
        entry.setError(e.message);
        return;
      }

      entry.setUploading();

      const controller = new AbortController();

      self._controllers.set(entry.id, controller);

      const count = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
      let initiateData;

      try {
        const initRes = await fetch(`${attachmentsBase(cfg)}/initiate-upload/`, {
          method: "POST",
          headers: authHeaders(cfg),
          body: JSON.stringify({
            name: file.name,
            type: self.filetype,
            mimeType: file.type || "application/octet-stream",
            count,
          }),
          signal: controller.signal,
        });

        if (!initRes.ok) {
          throw new Error(`Could not start upload (HTTP ${initRes.status})`);
        }
        initiateData = await initRes.json();
      } catch (e) {
        entry.setError(e.message);
        self._controllers.delete(entry.id);
        return;
      }

      const { id: fileId, uploadId, presignedUrls } = initiateData;

      entry.setRemoteIds(fileId, uploadId);

      const parts = [];
      let failure = null;

      for (let i = 0; i < presignedUrls.length; i++) {
        if (failure) break;

        const start = i * CHUNK_SIZE;
        const chunk = file.slice(start, start + CHUNK_SIZE);

        try {
          const putRes = await fetch(presignedUrls[i], {
            method: "PUT",
            body: chunk,
            signal: controller.signal,
          });

          if (!putRes.ok) {
            throw new Error(`Part ${i + 1} failed to upload (HTTP ${putRes.status})`);
          }

          const eTag = putRes.headers?.get?.("ETag") || putRes.headers?.get?.("etag");

          if (!eTag) {
            throw new Error(`Part ${i + 1} upload did not return an ETag`);
          }

          parts.push({ value: { eTag }, partNo: i + 1 });
          entry.setProgress(Math.round(((i + 1) / presignedUrls.length) * 100));
        } catch (e) {
          failure = e;
        }
      }

      // Only confirm when every single part succeeded; a partial part set
      // would silently drop bytes from the object with no way to detect it
      // later, so any failure here always aborts instead of confirming.
      if (failure || parts.length !== presignedUrls.length) {
        entry.setError(failure?.message || "Upload failed");
        await self.abortRemote(cfg, fileId, uploadId);
        self._controllers.delete(entry.id);
        return;
      }

      try {
        const confirmRes = await fetch(`${attachmentsBase(cfg)}/confirm-upload/`, {
          method: "POST",
          headers: authHeaders(cfg),
          body: JSON.stringify({ id: fileId, uploadId, parts }),
          signal: controller.signal,
        });

        if (!confirmRes.ok) {
          throw new Error(`Could not confirm upload (HTTP ${confirmRes.status})`);
        }

        const confirmData = await confirmRes.json();

        entry.setUploaded(confirmData.id || fileId);
        self.updateResult();
      } catch (e) {
        entry.setError(e.message);
        await self.abortRemote(cfg, fileId, uploadId);
      } finally {
        self._controllers.delete(entry.id);
      }
    },
  }));


const FileUploadModel = types.compose(
  "FileUploadModel",
  ControlBase,
  ClassificationBase,
  TagAttrs,
  RequiredMixin,
  ReadOnlyControlMixin,
  AnnotationMixin,
  Model,
);

const HtxFileUpload = observer(({ item }) => {
  const isReadOnly = item.isReadOnly();

  useEffect(() => {
    return () => {
      item.abortAllPending();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="file-upload" ref={item.elementRef}>
      <div className="file-upload__label">{item.label}</div>

      {!isReadOnly && item.canAddMore && (
        <Dragger
          multiple={item.maxFilesInt > 1}
          showUploadList={false}
          accept={item.accept || undefined}
          beforeUpload={(file) => {
            item.addFiles([file]);
            return false;
          }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">Click or drag a file here to upload</p>
        </Dragger>
      )}

      {item.files.length > 0 && (
        <List
          size="small"
          dataSource={item.files.slice()}
          renderItem={(entry) => (
            <List.Item
              actions={
                !isReadOnly
                  ? [
                      <Button key="remove" size="small" danger type="link" onClick={() => item.removeFile(entry.id)}>
                        Remove
                      </Button>,
                    ]
                  : []
              }
            >
              <div className="file-upload__item">
                <Text ellipsis style={{ maxWidth: 240 }}>
                  {entry.name}
                </Text>
                {entry.status === "uploading" && <Progress percent={entry.progress} size="small" />}
                {entry.status === "error" && <Alert type="error" message={entry.error} showIcon />}
                {entry.status === "uploaded" && <Text type="success">Uploaded</Text>}
              </div>
            </List.Item>
          )}
        />
      )}
    </div>
  );
});

Registry.addTag("fileupload", FileUploadModel, HtxFileUpload);

export { FileUploadModel, HtxFileUpload };
