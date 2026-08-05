/**
 * Configure the global `marked` singleton with options shared by all markdown
 * renderers in this package (LatexText, Markdown component).
 *
 * Importing this module is a safe side-effect-only operation: calling
 * `marked.setOptions` with the same options more than once is idempotent, but
 * having one canonical location makes the intent clear and prevents drift.
 */
import { marked } from "marked";

marked.setOptions({ mangle: false, headerIds: false });

export { marked };
