import katex from "katex";
import { inject, observer } from "mobx-react";
import { types } from "mobx-state-tree";
import { useMemo } from "react";

import "katex/dist/katex.min.css";
import "./LatexText.scss";

import Registry from "../../core/Registry";
import { AnnotationMixin } from "../../mixins/AnnotationMixin";
import ProcessAttrsMixin from "../../mixins/ProcessAttrs";
import { parseValue } from "../../utils/data";
import { sanitizeHtml } from "../../utils/html";
import { marked } from "../../utils/markedInit";
import { escapeHtml } from "../../utils/utilities";
import Base from "./Base";

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
 *
 * `\$` is treated as an escaped literal dollar sign and is never entered into
 * math mode. Plain currency like `$5` or `$5.00` (no letters or operators) is
 * also skipped so common financial text is not mis-rendered as math.
 *
 * @param {string} text
 * @returns {{ text: string, segments: string[], nonce: string }}
 */
function extractMath(text) {
  const segments = [];
  const nonce = Math.random().toString(36).slice(2);
  const placeholder = (i) => `${MATH_PLACEHOLDER_PREFIX}${nonce}I${i}${MATH_PLACEHOLDER_SUFFIX}`;

  // Step 1: protect `\$` — replace with a unique literal-dollar token that
  // won't be mistaken for a math delimiter by the regexes below.
  const ESCAPED_DOLLAR = `${MATH_PLACEHOLDER_PREFIX}${nonce}DOLLAR${MATH_PLACEHOLDER_SUFFIX}`;
  let out = text.replace(/\\\$/g, ESCAPED_DOLLAR);

  // Step 2: protect currency signs before math extraction.
  // A currency `$` is one immediately followed by digits (optionally with
  // commas/dots, e.g. $5, $5.00, $1,000) that is NOT followed by a word
  // character (which would indicate a math variable like `$5x`).
  // This must run before the display/inline math regexes so that two
  // currency amounts on the same line (`$5 and $10`) don't get the text
  // between them captured as a single `$...$` math span.
  out = out.replace(/\$(\d[\d,.]*)(?!\w)/g, (_match, num) => `${ESCAPED_DOLLAR}${num}`);

  // Step 3: display math `$$...$$` (must run before inline to avoid `$$`
  // being consumed as two consecutive inline delimiters).
  out = out.replace(/\$\$([\s\S]+?)\$\$/g, (_match, expr) => {
    const idx = segments.push(renderMath(expr, true)) - 1;

    return placeholder(idx);
  });

  // Step 4: inline math `$...$`.
  out = out.replace(/\$([^\n$]+?)\$/g, (_match, expr) => {
    const idx = segments.push(renderMath(expr, false)) - 1;

    return placeholder(idx);
  });

  // Step 5: restore escaped/currency dollars as literal `$`.
  out = out.replace(new RegExp(ESCAPED_DOLLAR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "$");

  return { text: out, segments, nonce };
}

// Known limitation: this is a plain string substitution into HTML already
// produced by marked, not a DOM-aware insertion. If a `$...$`/`$$...$$` span
// ends up inside an attribute-generating markdown construct (e.g. image
// alt/title, link title), the restored KaTeX markup's own `"`/`<`/`>`
// characters (e.g. `class="katex"`) can break that attribute's quoting and
// corrupt the surrounding markup. Not an XSS bypass: `sanitizeHtml` still
// runs last (see renderLatexMarkdown below) and strips script/iframe/on*
// regardless of how the markup got mangled.
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
        className="lsf-htx-latextext"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }),
);

Registry.addTag("latextext", LatexTextModel, HtxLatexText);
Registry.addObjectType(LatexTextModel);

export { HtxLatexText, LatexTextModel };
