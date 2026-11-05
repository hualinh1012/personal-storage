import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownView } from "../src/preview/MarkdownPreview";

const render = (source: string) => renderToStaticMarkup(<MarkdownView source={source} />);

describe("MarkdownView", () => {
  it("formats headings, lists and emphasis", () => {
    const html = render("# Tết 2026\n\n- **bold** item\n- second");
    expect(html).toContain("<h1>Tết 2026</h1>");
    expect(html).toContain("<li><strong>bold</strong> item</li>");
  });

  it("renders GitHub-style tables, checklists and strikethrough", () => {
    const html = render("| Day | Plan |\n| --- | --- |\n| 1 | Drive up |\n\n- [x] Jackets\n- [ ] Camera\n\n~~cancelled~~");
    expect(html).toContain("<table>");
    expect(html).toContain("<td>Drive up</td>");
    const boxes = html.match(/<input[^>]*>/g) ?? [];
    expect(boxes).toHaveLength(2);
    expect(boxes.every((b) => b.includes('type="checkbox"') && b.includes("disabled"))).toBe(true);
    expect(boxes.filter((b) => b.includes("checked"))).toHaveLength(1);
    expect(html).toContain("<del>cancelled</del>");
  });

  it("never turns raw HTML in the file into elements", () => {
    const html = render('<script>alert(1)</script>\n\n<img src=x onerror="alert(2)">');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror=");
  });

  it("drops javascript: links but keeps normal ones, opening them in a new tab", () => {
    const html = render("[bad](javascript:alert(1)) and [good](https://example.com)");
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("shows images as a link instead of loading them", () => {
    const html = render("![family photo](https://tracker.example/p.png)");
    expect(html).not.toContain("<img");
    expect(html).toContain('href="https://tracker.example/p.png"');
    expect(html).toContain("family photo");
  });
});
