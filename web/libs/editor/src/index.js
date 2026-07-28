import "./core/feature-flags";
import "./assets/styles/global.scss";
import { info } from "./core/introspection";
import { VERSION } from "./core/version";
import { LabelStudio } from "./LabelStudio";

// See core/introspection.ts for details. Usage from devtools:
// `window.LabelStudio.info()`
LabelStudio.info = info;

window.LabelStudio = LabelStudio;

// biome-ignore lint/suspicious/noConsole: intentional one-line build fingerprint for stale-bundle diagnosis
console.info(`[LabelStudio] editor v${VERSION} loaded — ${info().tags.length} tags registered`);

export default LabelStudio;

export { LabelStudio };

