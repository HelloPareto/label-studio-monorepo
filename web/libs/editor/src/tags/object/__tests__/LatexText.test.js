/* global describe, it, expect, jest */
import { renderLatexMarkdown } from "../LatexText";

// utils/html.js transitively imports utils/canvas.js, which imports the
// ESM-only @thi.ng/rle-pack (pre-existing jest breakage, unrelated to
// sanitizeHtml itself - see jest.config.cjs transformIgnorePatterns). Stub it
// out so this suite can exercise the real sanitizeHtml implementation.
jest.mock("../../../utils/canvas", () => ({
  __esModule: true,
  default: {},
}));

jest.mock("../../../core/Registry", () => ({
  __esModule: true,
  default: {
    addTag: jest.fn(),
    addObjectType: jest.fn(),
  },
}));

describe("renderLatexMarkdown", () => {
  it("returns empty string for empty/falsy input", () => {
    expect(renderLatexMarkdown("")).toBe("");
    expect(renderLatexMarkdown(undefined)).toBe("");
    expect(renderLatexMarkdown(null)).toBe("");
  });

  it("renders markdown formatting", () => {
    const html = renderLatexMarkdown("**bold** and _em_ text");

    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>em</em>");
  });

  it("renders inline math with KaTeX", () => {
    const html = renderLatexMarkdown("Solve $x^2 = 4$ for x");

    expect(html).toContain('class="katex"');
    expect(html).not.toContain("$x^2 = 4$");
  });

  it("renders display math with KaTeX in display mode", () => {
    const html = renderLatexMarkdown("$$x^2 - 4 = 0$$");

    expect(html).toContain("katex-display");
  });

  it("does not let marked mangle math containing markdown-special characters", () => {
    // underscores/asterisks inside math must reach KaTeX untouched, not be
    // interpreted as markdown emphasis by `marked`
    const html = renderLatexMarkdown("$a_b*c$ works");

    expect(html).toContain('class="katex"');
    expect(html).not.toContain("<em>");
  });

  it("extracts display math before inline math so $$ isn't split by the inline regex", () => {
    const html = renderLatexMarkdown("$$a+b$$ and $c+d$");
    const katexCount = (html.match(/class="katex"/g) || []).length;

    expect(katexCount).toBe(2);
    expect(html).toContain("katex-display");
  });

  it("sanitizes script/event-handler injection while keeping math and markdown", () => {
    const html = renderLatexMarkdown(
      '<script>alert(1)</script><img src=x onerror=alert(1)>\n\nMath $x$ and **bold**',
    );

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("onerror");
    expect(html).toContain('class="katex"');
    expect(html).toContain("<strong>bold</strong>");
  });

  it("format=text skips markdown parsing but still renders math", () => {
    const html = renderLatexMarkdown("**not bold** $x$", { format: "text" });

    expect(html).toContain("**not bold**");
    expect(html).not.toContain("<strong>");
    expect(html).toContain('class="katex"');
  });

  it("recovers gracefully from invalid LaTeX without throwing", () => {
    expect(() => renderLatexMarkdown("$\\invalidcmd{$")).not.toThrow();
  });

  describe("currency and escaped dollar handling", () => {
    it("does not treat plain currency ($5) as math", () => {
      const html = renderLatexMarkdown("The price is $5 today");
      // Should not render KaTeX for a plain number
      expect(html).not.toContain('class="katex"');
      expect(html).toContain("$5");
    });

    it("does not treat $5.00 as math", () => {
      const html = renderLatexMarkdown("Total: $5.00");
      expect(html).not.toContain('class="katex"');
      expect(html).toContain("$5.00");
    });

    it("renders \\$ as a literal dollar sign without entering math mode", () => {
      const html = renderLatexMarkdown("The cost is \\$10");
      // No KaTeX rendering — just a literal $
      expect(html).not.toContain('class="katex"');
      expect(html).toContain("$10");
    });

    it("still renders real math like $x_1$ correctly", () => {
      const html = renderLatexMarkdown("Solve $x_1 + x_2 = 0$");
      expect(html).toContain('class="katex"');
    });

    it("handles currency and math on the same line without false math rendering", () => {
      // With the pre-protection step, $5 is tokenised before the math regex
      // runs, so the two dollar signs no longer form a `$...$` math span.
      const html = renderLatexMarkdown("Price: $5 and equation $x^2$");
      expect(html).toContain("$5");
      expect(html).toContain('class="katex"');
    });

    it("does not treat two currency amounts on the same line as math", () => {
      const html = renderLatexMarkdown("Items cost $5 and $10");
      expect(html).not.toContain('class="katex"');
      expect(html).toContain("$5");
      expect(html).toContain("$10");
    });
  });
});

describe("LatexTextModel (MST wiring)", () => {
  it("resolves $field value via parseValue/updateValue and renders it end-to-end", () => {
    // biome-ignore lint: dynamic require after jest.mock hoisting, mirrors
    // Paragraphs/__tests__/model.test.ts pattern for object-tag MST models
    const { types } = require("mobx-state-tree");
    const { LatexTextModel } = require("../LatexText");

    const MockStore = types.model({ latextext: LatexTextModel }).volatile(() => ({
      task: { dataObj: { latex_text: "<![CDATA[**Bold** claim: $x^2 = 4$]]>" } },
    }));

    const model = LatexTextModel.create({ name: "text1", value: "$latex_text" });
    const store = MockStore.create({ latextext: model });

    model.updateValue(store);

    expect(model._value).toBe("**Bold** claim: $x^2 = 4$");

    const html = renderLatexMarkdown(model._value, { format: model.format });

    expect(html).toContain("<strong>Bold</strong>");
    expect(html).toContain('class="katex"');
  });

  it("defaults format to markdown and type to latextext", () => {
    const { LatexTextModel } = require("../LatexText");
    const model = LatexTextModel.create({ name: "text2", value: "static $y$ text" });

    expect(model.type).toBe("latextext");
    expect(model.format).toBe("markdown");
  });
});
