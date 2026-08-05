/* global describe, it, expect, jest */
import { render } from "@testing-library/react";

// utils/html.js transitively imports utils/canvas.js, which imports the
// ESM-only @thi.ng/rle-pack (pre-existing jest breakage, unrelated to
// sanitizeHtml itself - see jest.config.cjs transformIgnorePatterns and
// tags/object/__tests__/LatexText.test.js). Stub it out so this suite can
// exercise the real sanitizeHtml implementation.
jest.mock("../../../utils/canvas", () => ({
  __esModule: true,
  default: {},
}));

import { Markdown } from "../Markdown";

describe("Markdown", () => {
  it("renders basic markdown formatting", () => {
    const { container } = render(<Markdown text="**bold** and _em_ text" />);

    expect(container.innerHTML).toContain("<strong>bold</strong>");
    expect(container.innerHTML).toContain("<em>em</em>");
  });

  it("allowHtml=true keeps benign HTML but strips script/onerror", () => {
    const { container } = render(
      <Markdown text={'<div class="benign">hi</div><script>alert(1)</script><img src=x onerror=alert(1)>'} allowHtml />,
    );

    expect(container.innerHTML).toContain('<div class="benign">hi</div>');
    expect(container.innerHTML).not.toContain("<script>");
    expect(container.innerHTML).not.toContain("onerror");
  });

  it("allowHtml=false neutralizes raw HTML", () => {
    const { container } = render(
      <Markdown text={'<div class="benign">hi</div><script>alert(1)</script> **bold**'} allowHtml={false} />,
    );

    expect(container.querySelector("div.benign")).toBeNull();
    expect(container.innerHTML).toContain("&lt;div");
    expect(container.innerHTML).not.toContain("<script>");
    expect(container.innerHTML).not.toContain("onerror");
    expect(container.innerHTML).toContain("<strong>bold</strong>");
  });
});
