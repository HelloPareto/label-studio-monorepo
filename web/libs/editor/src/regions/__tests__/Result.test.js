/* global describe, it, expect */
import ResultModel from "../Result";

describe("Result model type enumeration", () => {
  it("accepts fileupload as a valid result type", () => {
    expect(ResultModel.properties.type.is("fileupload")).toBe(true);
  });

  it("still accepts pre-existing sibling result types", () => {
    expect(ResultModel.properties.type.is("textarea")).toBe(true);
    expect(ResultModel.properties.type.is("llmtextarea")).toBe(true);
  });

  it("rejects display-only tags that never produce results", () => {
    // Markdown and LatexText are visual/object display tags — they never
    // serialize into a Result, so they must not be added to this enumeration.
    expect(ResultModel.properties.type.is("markdown")).toBe(false);
    expect(ResultModel.properties.type.is("latextext")).toBe(false);
  });

  it("rejects unknown/typo'd tag names", () => {
    expect(ResultModel.properties.type.is("not-a-real-tag")).toBe(false);
  });
});

describe("Result model value.fileupload round-trip", () => {
  // Regression test for Bug #3: the `value` submodel must declare a
  // `fileupload` field (matching FileUpload's valueType, which defaults to
  // `self.type` = "fileupload" via ControlBase — see mainValue's
  // `self.value[self.from_name.valueType]` lookup). Without it MST silently
  // strips the tag's payload down to `{}` on submission.
  it("preserves a fileupload payload instead of stripping it to {}", () => {
    const payload = [{ file_id: "abc123", original_name: "report.pdf" }];
    const value = ResultModel.properties.value.create({ fileupload: payload });

    expect(value.fileupload).toEqual(payload);
  });

  it("keeps working for a sibling frozen field (llmtextarea) unaffected by the fix", () => {
    const value = ResultModel.properties.value.create({ llmtextarea: { foo: "bar" } });

    expect(value.llmtextarea).toEqual({ foo: "bar" });
  });
});
