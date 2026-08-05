# Tags — Custom Tag Additions (Fork)

This fork adds tags beyond upstream label-studio's set: `LatexText`, `Markdown`,
`FileUpload`, `LLMTextArea`. `FileUpload` and `LLMTextArea` have their own scoped
specs (`control/FileUpload/SPEC.md`, `control/LLMTextArea/SPEC.md`). This spec
covers the mechanism shared by all new tags, plus the two simple display tags
that don't warrant their own file.

## Registering a new tag

Every tag in this fork self-registers via `Registry.addTag(tagName, model, view)`
(`core/Registry.ts`) at module load, storing the MST model and React view keyed
by lowercase tag name. Object tags additionally call `Registry.addObjectType()`;
region-producing tags call `Registry.addRegionType()`.

`Registry.addCustomTag()` — ported from upstream's custom-tags feature
(HumanSignal/label-studio PR #8108) so a host app could register a tag without
forking `tags/` — exists but is **not used**: `Registry` isn't publicly exported,
and every tag added in this fork self-registers via plain `addTag()` instead.
Don't build on `addCustomTag`/`customTags` without first exporting `Registry`
and wiring a host-facing registration API; treat it as dead code today.

Adding a new tag requires touching three places beyond the tag's own file:

1. **Registration** — call `Registry.addTag()` (and `addObjectType`/`addRegionType`
   if applicable) in the tag's own module.
2. **Container whitelists** — see below. Skipping this produces a
   `"Not expecting tag"` XML validation error at parse time, not a registration
   error, which makes it easy to misdiagnose as a `Registry` problem when it
   isn't.
3. **Result type enum** — only if the tag serializes an annotation value (see
   below).

## Container whitelists

`View`, `Collapse` (rendered as `Panel`), and `PagedView` each declare an
explicit children allow-list via MST's `Types.unionArray` mechanism
(`tags/visual/View.jsx`, `tags/visual/Collapse.jsx`, `tags/object/PagedView.jsx`).
A tag name missing from these three lists cannot be nested inside `<View>`,
`<Collapse>`, or `<PagedView>` even though it's registered — XML validation
rejects it as `"Not expecting tag"` before the tag's own model is ever
constructed. All three lists must be kept in sync; there is no shared source
of truth, so a new tag has to be added to each one individually.

`markdown`, `latextext`, and `fileupload` are present in all three lists as of
this branch.

## Result type enum

`regions/Result.js` declares an explicit `type: types.enumeration([...])` for
every tag whose value can be serialized into an annotation `Result`, plus a
`value` submodel with one field per such type.

Only add a tag to this enum (and give it a `value.<tag>` field) if it actually
produces a `Result` — i.e., its output is part of the annotation being
submitted. `fileupload` is in the enum (`value.fileupload: types.frozen()`,
chosen deliberately over a shaped MST type after a prior fix where a
non-`frozen()` field silently stripped the payload — see
`control/FileUpload/SPEC.md`). `markdown` and `latextext` are **intentionally
not** in the enum: both are pure display tags with no annotation value, and
adding them would be a no-op at best (nothing in the UI ever writes to that
value slot) and a foot-gun at worst (implies a contract that doesn't exist).
A regression test in `regions/__tests__/Result.test.js` pins this: `fileupload`
must be accepted, `markdown`/`latextext` must be rejected.

## Runtime introspection

`window.LabelStudio.info()` (wired in `index.js`, backed by
`core/introspection.ts` and `Registry.registeredTags()` /
`Registry.registeredObjectTypes()`) returns `{ version, buildDate, tags }` for
whichever editor bundle is actually loaded. `version` is read from
`package.template.json` (the same source `editor:build-npm` uses); `buildDate`
comes from a webpack `DefinePlugin` timestamp and is `null` outside a webpack
build (e.g. under Jest). This exists so a stale bundle — e.g. an old cached
`vite`/webpack dependency — is visible immediately in devtools as a tag list
mismatch, instead of surfacing later as an opaque `"tag not registered"` error
during annotation.

## LatexText (object tag)

Renders markdown text with inline (`$...$`) and display (`$$...$$`) LaTeX math
— e.g. a math problem statement sitting above regions created by other tags.
It holds no region model, so it's a pure display substrate, not an
offset-based annotation target.

| Attribute | Type | Default | Description |
|---|---|---|---|
| `name` | string | required | Element name |
| `value` | string | required | Markdown+math content; static text or `$field` task-data reference |
| `format` | `markdown` \| `text` | `markdown` | `markdown` renders full markdown+math; `text` skips markdown parsing and only renders math (plain text is HTML-escaped, newlines become `<br/>`) |

**Rendering pipeline** (not a single library call): `extractMath()` pulls
`$$...$$` / `$...$` spans out of the raw text first — protecting escaped `\$`
and plain currency like `$5.00` from being misread as math — and renders each
with `katex.renderToString(..., {throwOnError: false})`, replacing them with
alnum-only placeholder tokens designed to survive `marked` parsing untouched.
`marked.parse()` (the shared CJS `marked@4` singleton in `utils/markedInit.js`)
then runs on the placeholder'd text, and `restoreMath()` string-substitutes the
KaTeX HTML back into the placeholders. `sanitizeHtml()` runs last. Math is
extracted *before* markdown parsing specifically so KaTeX source like `_x_` or
`a*b` isn't mangled by markdown emphasis rules.

**Known limitation** (documented in-code): `restoreMath` is a plain string
substitution into already-generated HTML, not DOM-aware. If a math span lands
inside an attribute-generating markdown construct (image `alt`/`title`, link
`title`), the restored KaTeX markup's own `"`/`<`/`>` characters (e.g.
`class="katex"`) can break that attribute's quoting and corrupt surrounding
markup. This is **not** an XSS bypass — `sanitizeHtml()` still runs last and
strips `script`/`iframe`/`on*` regardless of how the markup got mangled — it's
a rendering-correctness limitation, not a security one.

Dark mode: `LatexText.scss` forces `color: inherit` on itself and all
descendants, to override a host-CSS leak (the host app's global `p { color }`
reset otherwise washes out text in dark mode) — same issue as Markdown below.

Never produces a `Result` (see Result type enum above).

## Markdown (visual tag)

Displays markdown-formatted text — static or from task data — with optional
CSS styling and `VisibilityMixin` conditional display (`visibleWhen`,
`whenTagName`, `whenLabelValue`, `whenChoiceValue`).

| Attribute | Type | Default | Description |
|---|---|---|---|
| `value` | string | required | Markdown text; static or `$field` reference |
| `allowHtml` | boolean | `false` | Allow raw HTML in the markdown source (see below) |
| `style`, `className`/`classname`, `idAttr` | string | — | CSS hooks |

`tags/visual/Markdown.jsx` is a thin MST-model wrapper (value/CDATA/visibility)
that delegates rendering to the `Markdown` React component
(`components/Markdown/Markdown.tsx`); they are not duplicates. The component
uses the same shared CJS `marked@4` singleton as `LatexText`
(`utils/markedInit.js`) rather than ESM-only `react-markdown`, to avoid
ESM-in-webpack/Jest bundling friction.

**`allowHtml` contract**: `allowHtml=false` (default) — raw HTML in the source
is escaped and shown as literal text, not rendered. `allowHtml=true` — raw
HTML is parsed and rendered, matching upstream's `rehype-raw` gating
semantics. `sanitizeHtml()` always runs last on the final output regardless of
the flag. (A prior bug had both branches sanitizing identically without ever
escaping the `allowHtml=false` case first, so the flag had no effect — fixed
in this branch.)

Dark mode: `Markdown.scss` forces `color: inherit` on all descendants, same
host-CSS-leak reasoning as `LatexText.scss`.

Never produces a `Result` (see Result type enum above).
