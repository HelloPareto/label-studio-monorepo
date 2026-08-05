# FileUpload

A Label Studio control tag that lets an annotator attach one or more files to
a task, uploading directly to S3 via presigned multipart URLs minted by the
Forte backend. See `../../SPEC.md` for how this tag is registered/whitelisted,
and `../LLMTextArea/SPEC.md` for the sibling tag sharing the same runtime
config.

## Runtime config

Reads the same `window.ForteRuntime = { baseUrl, token, assignmentId }` global
as `LLMTextArea` (`utils/forteRuntime.js`) — never from XML attributes, for the
same reason: upload host, Knox token, and assignment ID are per-deployment
values that must not be baked into per-batch XML config. Requests use
`Authorization: Token <knox-token>` and JSON content-type.

## Basic usage

```xml
<View>
  <FileUpload name="attachment" toName="article" maxFiles="3" accept=".pdf,.docx" fileType="report"/>
</View>
```

## Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `name` | string | required | Unique identifier for the tag |
| `toName` | string | required | Name of the object tag this attaches to |
| `label` | string | "Upload files" | Text shown above the file picker |
| `maxFiles` | number (string) | 1 | Maximum number of files that can be attached |
| `accept` | string | — | Comma-separated MIME types/extensions accepted by the file picker |
| `fileType` | string | "Generic" | Backend `File.type` tag: `Video`, `Text`, `Image`, `PDF`, `Audio`, `report`, `Generic`, `Resume` |
| `required` | boolean | false | Require at least one file before submit |
| `requiredMessage` | string | — | Custom validation message |

## Upload flow

Base path: `{baseUrl}/api/v1/active-assignments/{assignmentId}/attachments`.
Per file:

1. `POST .../initiate-upload/` with `{name, type, mimeType, count: ceil(size / 8MB)}`
   → `{id, uploadId, presignedUrls: [...]}`.
2. `PUT` each 8MB chunk directly to its presigned S3 URL, reading the `ETag`
   response header per part.
3. `POST .../confirm-upload/` with
   `{id, uploadId, parts: [{status: "fulfilled", value: {value: {ETag}, PartNo}}, ...]}`
   → `{id}`, used as the final `file_id`.

Progress is tracked client-side only, as percent-of-parts-completed in MST
volatile state. Presigned URLs are never persisted — they expire
(`AWS_PRESIGNED_EXPIRY`, ~1h) and would need to be re-minted via
`GET .../attachments/{file_id}/url/` at display time; this tag does not
implement re-display of already-uploaded files, only the upload path.

**Deployment prerequisite**: S3 CORS config must set `ExposeHeaders: ["ETag"]`,
or every upload fails with `"Part N upload did not return an ETag"`. Tests
mock the `ETag` header, so a missing CORS config only surfaces in real
deployments, not in CI.

## Abort, cancel, and dedupe

Each file entry holds its own `AbortController` (`_controllers` map),
aborted on `removeFile`, on `abortAllPending` (component unmount), or on the
file's own failure path. An `entry.aborted` flag prevents the abort-remote
call from firing twice when a controller-triggered fetch rejection races with
an explicit remove/unmount call — whichever path acts first calls
`markAborted()` so the other doesn't repeat it.

## Removing files — no orphaned S3 objects

`removeFile` branches on the entry's status:

- `"uploading"` → best-effort `POST .../abort/` (cancels the in-progress
  multipart upload).
- `"uploaded"` → best-effort `DELETE .../delete-upload/` with `{id: file_id}`
  (`deleteRemote()`), removing the backend `File` row and its S3 object.

Both calls are fire-and-forget; errors are swallowed. This exists because an
earlier version only called abort for `"uploading"` entries — removing an
already-`uploaded` file dropped the local UI state but left the backend `File`
row and its S3 object permanently orphaned, since there was nothing
"in-progress" left to abort. Any removal now always cleans up its remote
state, regardless of which stage the file was in.

## Result value

`regions/Result.js` declares `value.fileupload: types.frozen()` — deliberately
`frozen()` rather than a shaped MST type, after an earlier bug where the
`value` submodel had no `fileupload` field at all and MST silently dropped the
tag's payload on submit (`result[0].value == {}`). Current shape:

```json
{
  "fileupload": [
    { "file_id": "123", "original_name": "doc.pdf" }
  ]
}
```

Always an array, even when `maxFiles="1"`. `null`/absent when nothing has been
uploaded (`selectedValues()` returns `null` in that case). Backend ids are
normalized to strings even if the API returns numbers.

## maxFiles enforcement

`activeFileCount` excludes entries with `status === "error"`, so a failed
attempt doesn't permanently consume a slot. `canAddMore = activeFileCount <
maxFilesInt`. When a file-picker or drag delivers more files than remaining
room, `addFiles` truncates the batch and shows `InfoModal.error` naming how
many files were dropped.

## Error handling and edge cases

- Zero-byte files are rejected before upload starts.
- Any part that fails to `PUT` or returns without an `ETag` aborts the
  **entire** upload (no partial confirm) — a partial part set would silently
  drop bytes with no way to detect it later — and triggers a best-effort
  remote abort.
- `validate()` blocks submission while any file is `pending` or `uploading`,
  so an in-flight upload can't be silently dropped from the submitted result.
- `isAlive(entry)` is checked after every `yield` in the upload flow, since
  `removeFile` can destroy the MST node mid-upload.
