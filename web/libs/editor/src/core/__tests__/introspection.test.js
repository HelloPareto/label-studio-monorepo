/* global it, expect */
import pkg from "../../../package.template.json";
import "../../tags/visual/Markdown";
import "../../tags/object/LatexText";
import "../../tags/control/FileUpload/FileUpload";
import "../../tags/control/TextArea/TextArea";
import Registry from "../Registry";
import { info } from "../introspection";

it("Registry.registeredTags() includes core/well-known tags", () => {
  const tags = Registry.registeredTags();

  expect(tags).toEqual([...tags].sort());
  expect(tags).toEqual(expect.arrayContaining(["markdown", "latextext", "fileupload", "textarea"]));
});

it("info() exposes version (matching package.template.json), buildDate and tags", () => {
  const result = info();

  expect(result).toEqual({
    version: pkg.version,
    buildDate: null,
    tags: expect.any(Array),
  });
  expect(result.version).toBe("1.0.16-dev.0");
  expect(result.tags).toEqual(expect.arrayContaining(["markdown", "latextext", "fileupload", "textarea"]));
});
