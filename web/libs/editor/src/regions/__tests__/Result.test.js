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
