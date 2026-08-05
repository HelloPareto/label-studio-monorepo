// Single source of truth for the editor's published version: the npm
// package manifest used by `editor:build-npm` (web/libs/editor/package.template.json).
// Importing it directly (resolveJsonModule) guarantees this never drifts out
// of sync with what actually gets published, unlike a hand-maintained constant.
import pkg from "../../package.template.json";

export const VERSION: string = pkg.version;

// Build timestamp, injected by webpack's DefinePlugin at bundle time (see
// web/webpack.config.js). Falls back to null outside of a webpack build
// (e.g. under Jest) where the define isn't present.
export const BUILD_DATE: string | null =
  typeof process !== "undefined" && process.env && process.env.EDITOR_BUILD_DATE ? process.env.EDITOR_BUILD_DATE : null;
