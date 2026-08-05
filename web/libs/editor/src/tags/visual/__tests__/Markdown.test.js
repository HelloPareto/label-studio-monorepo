/* global describe, it, expect, jest */

// utils/html.js transitively imports utils/canvas.js which imports the
// ESM-only @thi.ng/rle-pack (pre-existing jest breakage; same stub as
// LatexText.test.js).
jest.mock("../../../utils/canvas", () => ({
  __esModule: true,
  default: {},
}));

jest.mock("../../../core/Registry", () => ({
  __esModule: true,
  default: { addTag: jest.fn() },
}));

// ProcessAttrsMixin pulls in the global store; stub it to avoid full tree setup.
jest.mock("../../../mixins/ProcessAttrs", () => ({
  __esModule: true,
  default: require("mobx-state-tree").types.model({}),
}));

jest.mock("../../../mixins/Visibility", () => ({
  __esModule: true,
  default: require("mobx-state-tree").types.model({}),
}));

jest.mock("../../../mixins/AnnotationMixin", () => ({
  __esModule: true,
  AnnotationMixin: require("mobx-state-tree").types.model({}),
}));

const { MarkdownModel } = require("../Markdown");

describe("MarkdownModel — updateValue + allowhtml attribute", () => {
  it("updateValue casts a numeric task field to string without crashing", () => {
    const model = MarkdownModel.create({ name: "md1", value: "$score" });

    model.updateValue({ task: { dataObj: { score: 42 } } });
    expect(model._value).toBe("42");
  });

  it("updateValue casts null to empty string without crashing", () => {
    const model = MarkdownModel.create({ name: "md2", value: "$score" });

    model.updateValue({ task: { dataObj: { score: null } } });
    expect(typeof model._value).toBe("string");
  });

  it("updateValue strips CDATA wrappers after casting", () => {
    const model = MarkdownModel.create({ name: "md3", value: "$body" });

    model.updateValue({ task: { dataObj: { body: "<![CDATA[**bold**]]>" } } });
    expect(model._value).toBe("**bold**");
  });

  it("allowhtml defaults to false", () => {
    const model = MarkdownModel.create({ name: "md4", value: "# Hello" });

    expect(model.allowhtml).toBe(false);
  });

  it("allowhtml can be set to true", () => {
    const model = MarkdownModel.create({ name: "md5", value: "# Hello", allowhtml: true });

    expect(model.allowhtml).toBe(true);
  });
});
