import { marked } from "marked";
import { sanitizeHtml } from "../../utils/html";

interface MarkdownProps {
  text: string;
  allowHtml?: boolean;
}

// marked@4 is CJS-compatible; configure once
marked.setOptions({ mangle: false, headerIds: false });

export const Markdown = ({ text, allowHtml = false }: MarkdownProps) => {
  const rawHtml = marked.parse(text || "");
  const safeHtml = allowHtml
    ? sanitizeHtml(rawHtml)
    : sanitizeHtml(rawHtml);

  return (
    <div
      className="htx-markdown"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
};
