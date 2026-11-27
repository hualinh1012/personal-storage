import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Landing, { SOURCE_URL } from "../src/pages/Landing";

const html = renderToStaticMarkup(<Landing onSignIn={() => {}} />);
const text = html.replace(/<[^>]+>/g, " ");

describe("Landing (#70)", () => {
  it("introduces the app and says only invited people get in", () => {
    expect(text).toContain("Family Drive is where one family keeps and shares its files");
    expect(text).toContain("Only invited people can sign in");
    expect(text).toContain("ask the person who runs it");
  });

  it("keeps the Sign in with Google button", () => {
    expect(html).toMatch(/<button[^>]*>.*Sign in with Google<\/button>/);
  });

  it("links to the source in a new tab without an opener", () => {
    const link = html.match(/<a [^>]*>/)?.[0] ?? "";
    expect(link).toContain(`href="${SOURCE_URL}"`);
    expect(link).toContain('target="_blank"');
    expect(link).toContain('rel="noopener noreferrer"');
  });

  it("has no request-access form and no contact details", () => {
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("mailto:");
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(html.match(/<button/g)).toHaveLength(1);
  });
});
