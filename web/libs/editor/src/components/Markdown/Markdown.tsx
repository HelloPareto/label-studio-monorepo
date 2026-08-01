import { sanitizeHtml } from "../../utils/html";
import { marked } from "../../utils/markedInit";
import { escapeHtml } from "../../utils/utilities";

interface MarkdownProps {
  text: string;
  allowHtml?: boolean;
}

export const Markdown = ({ text, allowHtml = false }: MarkdownProps) => {
  // When allowHtml is falsy, escape raw HTML in the source before marked
  // parses it, so only markdown-generated markup reaches the DOM (matches
  // upstream's rehype-raw gating). sanitizeHtml always runs last regardless.
  const source = allowHtml ? text || "" : escapeHtml(text || "");
  const rawHtml = marked.parse(source);
  const safeHtml = sanitizeHtml(rawHtml);

  return (
    <div
      className="lsf-htx-markdown"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
};
