/**
 * Shared runtime configuration for Forte API calls made by editor control tags
 * (FileUpload, LLMTextArea). Deliberately NOT read from XML attributes: the
 * upload host, Knox auth token, and assignment ID are per-deployment values
 * that rotate independently of any given batch config and must never be
 * hard-coded into per-batch Forte XML.
 *
 * The host application (Forte front/LabelStudioFrontend) must set this before
 * the annotation view mounts:
 *
 * ```js
 * window.ForteRuntime = {
 *   baseUrl: "https://forte-backend.example.com",
 *   token: "<knox-token>", // raw token preferred; "Token "-prefixed also accepted
 *   assignmentId: "123",
 * };
 * ```
 *
 * Auth uses Knox `Authorization: Token …` because production backend-ai drops
 * SessionAuthentication (only Knox + SAK accepted at !DEBUG). The Knox session
 * token is stored in a readable cookie by Auth0 login; hosts copy it here the
 * same way useFetch does for all other Forte API calls.
 */

/**
 * Reads and validates the Forte runtime config from `window.ForteRuntime`.
 * Throws a clear error if any required field is missing.
 * @returns {{ baseUrl: string, token: string, assignmentId: string }}
 */
export function getForteRuntime() {
  const cfg = typeof window !== "undefined" ? window.ForteRuntime : undefined;

  if (!cfg || !cfg.baseUrl || !cfg.token || !cfg.assignmentId) {
    throw new Error(
      "window.ForteRuntime = {baseUrl, token, assignmentId} must be set before using FileUpload or LLMTextArea",
    );
  }
  return cfg;
}

/**
 * Builds Knox Authorization + Content-Type headers for Forte JSON API calls.
 * Accepts the token with or without the "Token " prefix.
 * @param {{ token: string }} cfg
 * @returns {Record<string, string>}
 */
export function forteAuthHeaders(cfg) {
  const token = cfg.token.startsWith("Token ") ? cfg.token : `Token ${cfg.token}`;
  return {
    "Content-Type": "application/json",
    Authorization: token,
  };
}
