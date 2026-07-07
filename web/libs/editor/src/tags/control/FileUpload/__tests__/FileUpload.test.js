/* global describe, it, expect, beforeEach, afterEach, jest */
import { unprotect } from "mobx-state-tree";
import { FileUploadModel } from "../FileUpload";
import InfoModal from "../../../../components/Infomodal/Infomodal";

jest.mock("../../../../components/Infomodal/Infomodal", () => ({
  __esModule: true,
  default: {
    warning: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("../../../../core/Registry", () => ({
  __esModule: true,
  default: {
    addTag: jest.fn(),
  },
}));

function makeFile(name, size, type = "application/pdf") {
  const file = new File([new Uint8Array(size)], name, { type });

  return file;
}

function mockResponse({ ok = true, status = 200, json = {}, headers = {} } = {}) {
  return {
    ok,
    status,
    json: async () => json,
    headers: {
      get: (key) => headers[key] ?? headers[key.toLowerCase()] ?? headers[key.toUpperCase()] ?? null,
    },
  };
}

describe("FileUpload Model", () => {
  let model;

  beforeEach(() => {
    model = FileUploadModel.create({
      name: "attachment",
      toname: "text",
      maxfiles: "2",
    });

    unprotect(model);
    model.updateResult = jest.fn();
    model.isReadOnly = () => false;

    global.window.ForteUpload = {
      baseUrl: "http://backend.test",
      token: "test-token",
      assignmentId: "42",
    };

    InfoModal.warning.mockClear();
    InfoModal.error.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete global.window.ForteUpload;
  });

  describe("Initial state", () => {
    it("has correct defaults", () => {
      expect(model.type).toBe("fileupload");
      expect(model.files.length).toBe(0);
      expect(model.holdsState).toBe(false);
      expect(model.maxFilesInt).toBe(2);
      expect(model.canAddMore).toBe(true);
      expect(model.selectedValues()).toBe(null);
    });
  });

  describe("Runtime config guard", () => {
    it("errors out without window.ForteUpload and does not call fetch", async () => {
      delete global.window.ForteUpload;
      global.fetch = jest.fn();

      const file = makeFile("a.pdf", 10);

      await model.addFiles([file]);

      expect(global.fetch).not.toHaveBeenCalled();
      expect(model.files[0].status).toBe("error");
      expect(model.files[0].error).toMatch(/ForteUpload/);
    });
  });

  describe("Empty file guard", () => {
    it("does not call fetch for a zero-byte file", async () => {
      global.fetch = jest.fn();

      const file = makeFile("empty.pdf", 0);

      await model.addFiles([file]);

      expect(global.fetch).not.toHaveBeenCalled();
      expect(model.files[0].status).toBe("error");
      expect(model.files[0].error).toMatch(/empty/i);
    });
  });

  describe("Happy path: initiate -> PUT parts -> confirm", () => {
    it("uploads a single-part file and stores only file_id/original_name", async () => {
      global.fetch = jest
        .fn()
        // initiate
        .mockResolvedValueOnce(
          mockResponse({
            json: {
              id: "generated-abc123",
              uploadId: "upload-xyz",
              presignedUrls: ["https://s3.test/part1"],
            },
          }),
        )
        // PUT part 1
        .mockResolvedValueOnce(mockResponse({ headers: { ETag: '"etag-1"' } }))
        // confirm
        .mockResolvedValueOnce(
          mockResponse({ json: { id: "generated-abc123", fileUrl: "https://s3.test/signed-get" } }),
        );

      const file = makeFile("report.pdf", 10, "application/pdf");

      await model.addFiles([file]);

      expect(global.fetch).toHaveBeenCalledTimes(3);

      const [initUrl, initOpts] = global.fetch.mock.calls[0];

      expect(initUrl).toBe("http://backend.test/api/v1/active-assignments/42/attachments/initiate-upload/");
      expect(initOpts.headers.Authorization).toBe("Token test-token");
      const initBody = JSON.parse(initOpts.body);

      expect(initBody).toEqual({
        name: "report.pdf",
        type: "Generic",
        mimeType: "application/pdf",
        count: 1,
      });

      const [putUrl, putOpts] = global.fetch.mock.calls[1];

      expect(putUrl).toBe("https://s3.test/part1");
      expect(putOpts.method).toBe("PUT");

      const [confirmUrl, confirmOpts] = global.fetch.mock.calls[2];

      expect(confirmUrl).toBe("http://backend.test/api/v1/active-assignments/42/attachments/confirm-upload/");
      const confirmBody = JSON.parse(confirmOpts.body);

      expect(confirmBody).toEqual({
        id: "generated-abc123",
        uploadId: "upload-xyz",
        parts: [{ value: { eTag: '"etag-1"' }, partNo: 1 }],
      });

      expect(model.files[0].status).toBe("uploaded");
      expect(model.updateResult).toHaveBeenCalled();

      const values = model.selectedValues();

      expect(values).toEqual([{ file_id: "generated-abc123", original_name: "report.pdf" }]);

      // never store presigned/signed URLs in the result payload
      const serialized = JSON.stringify(values);

      expect(serialized).not.toMatch(/s3\.test/);
      expect(serialized).not.toMatch(/fileUrl|file_url/i);
    });

    it("uploads multi-part files with correct chunk math and part numbering", async () => {
      const size = 8 * 1024 * 1024 + 10; // just over one 8MB chunk -> 2 parts

      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(
          mockResponse({
            json: {
              id: "generated-multi",
              uploadId: "upload-multi",
              presignedUrls: ["https://s3.test/p1", "https://s3.test/p2"],
            },
          }),
        )
        .mockResolvedValueOnce(mockResponse({ headers: { ETag: '"etag-1"' } }))
        .mockResolvedValueOnce(mockResponse({ headers: { ETag: '"etag-2"' } }))
        .mockResolvedValueOnce(mockResponse({ json: { id: "generated-multi" } }));

      const file = makeFile("video.mp4", size, "video/mp4");

      await model.addFiles([file]);

      const initBody = JSON.parse(global.fetch.mock.calls[0][1].body);

      expect(initBody.count).toBe(2);

      const confirmBody = JSON.parse(global.fetch.mock.calls[3][1].body);

      expect(confirmBody.parts).toEqual([
        { value: { eTag: '"etag-1"' }, partNo: 1 },
        { value: { eTag: '"etag-2"' }, partNo: 2 },
      ]);
      expect(model.files[0].status).toBe("uploaded");
    });
  });

  describe("Partial failure aborts and never confirms", () => {
    it("calls abort and leaves the entry errored when a part PUT fails", async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(
          mockResponse({
            json: {
              id: "generated-fail",
              uploadId: "upload-fail",
              presignedUrls: ["https://s3.test/p1", "https://s3.test/p2"],
            },
          }),
        )
        .mockResolvedValueOnce(mockResponse({ headers: { ETag: '"etag-1"' } }))
        .mockResolvedValueOnce(mockResponse({ ok: false, status: 500 }))
        // abort call
        .mockResolvedValueOnce(mockResponse({ json: { id: "generated-fail", uploadId: "upload-fail" } }));

      const file = makeFile("big.bin", 8 * 1024 * 1024 + 5);

      await model.addFiles([file]);

      expect(global.fetch).toHaveBeenCalledTimes(4);

      const confirmCalls = global.fetch.mock.calls.filter(([url]) => url.includes("confirm-upload"));

      expect(confirmCalls.length).toBe(0);

      const [abortUrl, abortOpts] = global.fetch.mock.calls[3];

      expect(abortUrl).toBe("http://backend.test/api/v1/active-assignments/42/attachments/abort/");
      expect(JSON.parse(abortOpts.body)).toEqual({ id: "generated-fail", uploadId: "upload-fail" });

      expect(model.files[0].status).toBe("error");
      expect(model.updateResult).not.toHaveBeenCalled();
      expect(model.selectedValues()).toBe(null);
    });

    it("aborts and does not confirm when the initiate call itself fails", async () => {
      global.fetch = jest.fn().mockResolvedValueOnce(mockResponse({ ok: false, status: 400 }));

      const file = makeFile("bad.pdf", 10);

      await model.addFiles([file]);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(model.files[0].status).toBe("error");
    });

    it("swallows abort-endpoint network errors without throwing", async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(
          mockResponse({
            json: { id: "generated-x", uploadId: "upload-x", presignedUrls: ["https://s3.test/p1"] },
          }),
        )
        .mockResolvedValueOnce(mockResponse({ ok: false, status: 500 }))
        .mockRejectedValueOnce(new Error("network down"));

      const file = makeFile("x.pdf", 10);

      await expect(model.addFiles([file])).resolves.toBeDefined();
      expect(model.files[0].status).toBe("error");
    });
  });

  describe("maxFiles", () => {
    it("does not accept more files than maxFiles allows", async () => {
      global.fetch = jest.fn().mockResolvedValue(
        mockResponse({
          json: { id: "id", uploadId: "uid", presignedUrls: ["https://s3.test/p1"] },
        }),
      );

      await model.addFiles([makeFile("a.pdf", 10), makeFile("b.pdf", 10), makeFile("c.pdf", 10)]);

      expect(model.files.length).toBe(2);
      expect(model.canAddMore).toBe(false);

      // dropped file(s) must surface user-visible feedback, not silent truncation
      expect(InfoModal.error).toHaveBeenCalledTimes(1);
      expect(InfoModal.error.mock.calls[0][0]).toMatch(/1 file/i);
    });

    it("does not surface feedback when every file fits under the cap", async () => {
      global.fetch = jest.fn().mockResolvedValue(
        mockResponse({
          json: { id: "id", uploadId: "uid", presignedUrls: ["https://s3.test/p1"] },
        }),
      );

      await model.addFiles([makeFile("a.pdf", 10)]);

      expect(model.files.length).toBe(1);
      expect(InfoModal.error).not.toHaveBeenCalled();
    });
  });

  describe("updateFromResult / round-trip", () => {
    it("restores uploaded entries from a saved result without re-uploading", () => {
      model.updateFromResult([{ file_id: "abc", original_name: "doc.pdf" }]);

      expect(model.files.length).toBe(1);
      expect(model.files[0].status).toBe("uploaded");
      expect(model.files[0].fileId).toBe("abc");
      expect(model.selectedValues()).toEqual([{ file_id: "abc", original_name: "doc.pdf" }]);
    });

    it("clears files when the result value is null", () => {
      model.updateFromResult([{ file_id: "abc", original_name: "doc.pdf" }]);
      model.updateFromResult(null);

      expect(model.files.length).toBe(0);
    });
  });

  describe("abortAllPending (unmount cleanup)", () => {
    it("aborts in-flight controllers and calls the backend abort endpoint", async () => {
      let resolvePut;
      const putPromise = new Promise((resolve) => {
        resolvePut = resolve;
      });

      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(
          mockResponse({
            json: { id: "generated-um", uploadId: "upload-um", presignedUrls: ["https://s3.test/p1"] },
          }),
        )
        .mockImplementationOnce(() => putPromise)
        .mockResolvedValueOnce(mockResponse({ json: {} }));

      const file = makeFile("um.pdf", 10);
      const uploadPromise = model.addFiles([file]);

      // let the initiate call resolve and the PUT call start
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(model.files[0].status).toBe("uploading");

      model.abortAllPending();

      resolvePut({ ok: false, status: 0 });
      await uploadPromise;

      const abortCalls = global.fetch.mock.calls.filter(([url]) => url.includes("/abort/"));

      // abortAllPending's own abort fires synchronously; uploadFile's catch
      // must see entry.aborted and skip its own duplicate abort/ call once
      // the (now-failed) in-flight PUT settles.
      expect(abortCalls.length).toBe(1);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });
  });

  describe("removeFile", () => {
    it("removes an uploaded entry and updates the result", () => {
      model.updateFromResult([{ file_id: "abc", original_name: "doc.pdf" }]);
      const id = model.files[0].id;

      model.removeFile(id);

      expect(model.files.length).toBe(0);
      expect(model.updateResult).toHaveBeenCalled();
    });
  });
});
