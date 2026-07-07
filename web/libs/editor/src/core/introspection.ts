import Registry from "./Registry";
import { BUILD_DATE, VERSION } from "./version";

export interface EditorInfo {
  version: string;
  buildDate: string | null;
  tags: string[];
}

/**
 * Runtime introspection: lets consumers verify which editor build is
 * actually loaded and which tags it registers, without digging through
 * devtools sourcemaps. Handy for diagnosing stale-bundle issues (e.g. an
 * old cached copy served via a dependency cache reporting tags as
 * "not registered").
 *
 * Usage from devtools: `window.LabelStudio.info()`
 */
export function info(): EditorInfo {
  return {
    version: VERSION,
    buildDate: BUILD_DATE,
    tags: Registry.registeredTags(),
  };
}
