import "./core/feature-flags";
import "./assets/styles/global.scss";
import { info } from "./core/introspection";
import { LabelStudio } from "./LabelStudio";

// See core/introspection.ts for details. Usage from devtools:
// `window.LabelStudio.info()`
LabelStudio.info = info;

window.LabelStudio = LabelStudio;

export default LabelStudio;

export { LabelStudio };
