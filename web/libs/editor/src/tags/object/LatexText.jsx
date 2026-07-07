import katex from "katex";
import { marked } from "marked";
import { inject, observer } from "mobx-react";
import { types } from "mobx-state-tree";
import { useMemo } from "react";

import "katex/dist/katex.min.css";

import Registry from "../../core/Registry";
import { AnnotationMixin } from "../../mixins/AnnotationMixin";
import ProcessAttrsMixin from "../../mixins/ProcessAttrs";
import { parseValue } from "../../utils/data";
import { sanitizeHtml } from "../../utils/html";
import { escapeHtml } from "../../utils/utilities";
import Base from "./Base";

// marked@4 is CJS-compatible; configure once (shared global singleton, same
// options as components/Markdown/Markdown.tsx)
marked.setOptions({ mangle: false, headerIds: false });

const MATH_PLACEHOLDER_PREFIX = "LSFKATEXPLACEHOLDER";
const MATH_PLACEHOLDER_SUFFIX = "ENDPLACEHOLDER";

function renderMath(expr, displayMode) {
  try {
    return katex.renderToString(expr, { displayMode, throwOnError: false });
  } catch (e) {
    // renderToString with throwOnError:false already renders a KaTeX error
    // span for most failures; this catch is a last-resort guard so a single
    // bad expression can't break the whole render pipeline
    return escapeHtml(expr);
  }
}

/**
 * Pull `$$...$$` (display) and `$...$` (inline) math out of `text`, render
 * each with KaTeX, and replace it with an alnum-only placeholder token that
 * `marked` cannot mistake for markdown syntax (no `_`, `*`, `` ` ``, etc, so
 * it survives emphasis/code-span parsing untouched). Display math is
 * extracted first so its `$$` delimiters aren't consumed by the inline regex.
 * @param {string} text
 * @returns {{ text: string, segments: string[], nonce: string }}
 */
function extractMath(text) {
  const segments = [];
  const nonce = Math.random().toString(36).slice(2);
  const placeholder = (i) => `${MATH_PLACEHOLDER_PREFIX}${nonce}I${i}${MATH_PLACEHOLDER_SUFFIX}`;

  let out = text.replace(/\$\$([\s\S]+?)\$\$/g, (_match, expr) => {
    const idx = segments.push(renderMath(expr, true)) - 1;

    return placeholder(idx);
  });

  out = out.replace(/\$([^\n$]+?)\$/g, (_match, expr) => {
    const idx = segments.push(renderMath(expr, false)) - 1;

    return placeholder(idx);
  });

  return { text: out, segments, nonce };
}

function restoreMath(html, segments, nonce) {
  const re = new RegExp(`${MATH_PLACEHOLDER_PREFIX}${nonce}I(\\d+)${MATH_PLACEHOLDER_SUFFIX}`, "g");

  return html.replace(re, (_match, idx) => segments[Number(idx)] ?? "");
}

/**
 * Render markdown text with inline/display LaTeX math to sanitized HTML.
 * Math is extracted before markdown parsing (so KaTeX source like `_x_` or
 * `a*b` can't be mangled by `marked`) and restored after, then the whole
 * result passes through the shared sanitizer (`utils/html.js`).
 * @param {string} text
 * @param {{ format?: "markdown"|"text" }} [options]
 * @returns {string}
 */
export function renderLatexMarkdown(text, { format = "markdown" } = {}) {
  if (!text) return "";

  const { text: withPlaceholders, segments, nonce } = extractMath(text);
  const html = format === "text" ? escapeHtml(withPlaceholders).replace(/\n/g, "<br/>") : marked.parse(withPlaceholders);
  const restored = restoreMath(html, segments, nonce);

  return sanitizeHtml(restored);
}

/**
 * The `LatexText` element renders task data (or inline content) as markdown
 * with inline (`$...$`) and display (`$$...$$`) LaTeX math, e.g. for showing
 * a math problem statement above regions created by other tags. Unlike
 * `Text`/`HyperText`, it holds no region model, so it's safe to reformat the
 * content — it's not an offset-based annotation substrate.
 * @example
 * <!-- Display markdown+math from task data -->
 * <View>
 *   <LatexText name="problem" value="$problem_text"/>
 * </View>
 * @example
 * <!-- Display static markdown+math content -->
 * <View>
 * <LatexText name="problem">
 * Solve for $x$: $$x^2 - 4 = 0$$
 * </LatexText>
 * </View>
 * @name LatexText
 * @meta_title LatexText Tag for Rendering Markdown with LaTeX Math
 * @meta_description Customize Label Studio with the LatexText tag to display markdown text with LaTeX-rendered math for machine learning and data science projects.
 * @param {string} name                  Name of the element
 * @param {string} value                 Markdown+math content, either static text or field name in task data (e.g. $field)
 * @param {markdown|text} [format=markdown] `markdown` renders full markdown (plus math); `text` skips markdown parsing and only renders math
 */
const Model = types
  .model({
    type: "latextext",
    value: types.optional(types.string, ""),
    _value: types.optional(types.string, ""),
    format: types.optional(types.enumeration(["markdown", "text"]), "markdown"),
  })
  .actions((self) => ({
    updateValue(store) {
      const value = parseValue(self.value, store?.task?.dataObj ?? {});

      // cut CDATA, same fallback as Markdown.jsx for inline/CDATA-wrapped children
      self._value = String(value).replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, "");
    },
  }));

const LatexTextModel = types.compose("LatexTextModel", Base, ProcessAttrsMixin, AnnotationMixin, Model);

const HtxLatexText = inject("store")(
  observer(({ item }) => {
    const html = useMemo(
      () => renderLatexMarkdown(item._value || "", { format: item.format }),
      [item._value, item.format],
    );

    return (
      <div
        className="htx-latextext"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }),
);

Registry.addTag("latextext", LatexTextModel, HtxLatexText);
Registry.addObjectType(LatexTextModel);

export { HtxLatexText, LatexTextModel };
