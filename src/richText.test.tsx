import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { RichText } from "./richText.js";

const render = (doc: unknown) => renderToStaticMarkup(<RichText doc={doc} />).replace(/^<div[^>]*>|<\/div>$/g, "");
const text = (t: string, marks?: unknown[]) => ({ type: "text", text: t, marks });
const doc = (...content: unknown[]) => ({ type: "doc", content });

it("draws each node and mark", () => {
  expect(
    render(
      doc(
        { type: "paragraph", content: [text("b", [{ type: "bold" }]), text("i", [{ type: "italic" }]), { type: "hardBreak" }, text("x")] },
        { type: "paragraph" },
        { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [text("one")] }] }] },
        { type: "orderedList", attrs: { start: 3, type: null }, content: [{ type: "listItem", content: [{ type: "paragraph", content: [text("three")] }] }] },
      ),
    ),
  ).toBe("<p><strong>b</strong><em>i</em><br/>x</p><p><br/></p><ul><li><p>one</p></li></ul><ol start=\"3\"><li><p>three</p></li></ol>");
});

it("opens links in a new tab without a referrer", () => {
  expect(render(doc({ type: "paragraph", content: [text("site", [{ type: "link", attrs: { href: "https://example.com/?a=1&b=2" } }])] }))).toBe(
    '<p><a href="https://example.com/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">site</a></p>',
  );
});

it("escapes text and never draws a refused link or unknown node", () => {
  expect(
    render(
      doc(
        { type: "paragraph", content: [text("<script>alert(1)</script>"), text("x", [{ type: "link", attrs: { href: "javascript:alert(1)" } }])] },
        { type: "heading", content: [text("unknown")] },
        { type: "paragraph", attrs: { style: "color:red" }, content: [text("y", [{ type: "textStyle", attrs: { color: "red" } }])] },
      ),
    ),
  ).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt;x</p><p>y</p>");
});

it("draws nothing for a malformed document, rather than failing", () => {
  for (const bad of [null, "text", 5, { type: "doc", content: "x" }, doc(null, 5, { type: "paragraph", content: [null, { type: "text", text: 5 }] })]) {
    expect(() => render(bad)).not.toThrow();
  }
  expect(render(doc(null, { type: "paragraph", content: [{ type: "text" }] }))).toBe("<p></p>");
});

it("draws a real photo full width, in a grey box until it loads", () => {
  const url = "https://res.cloudinary.com/demo/image/authenticated/s--abcdefgh--/c_limit,w_1600/f_auto/q_auto/families/x/abc";
  const html = render(
    doc(
      { type: "photo", attrs: { caption: "At the <park>", publicId: "families/x/abc", url } },
      { type: "photo", attrs: { caption: "", publicId: "families/x/def", url: null } },
      { type: "photo", attrs: { caption: "", url: "javascript:alert(1)" } },
    ),
  );
  expect(html).toContain(`src="${url}"`);
  expect(html).toContain('alt="Photo 1 of 3"');
  expect(html).toContain('loading="lazy"');
  expect(html).toContain('referrerPolicy="no-referrer"');
  expect(html).toContain("aspect-[4/3]");
  expect(html).toContain("w-full");
  expect(html).toContain("At the &lt;park&gt;");
  expect(html).not.toContain("families/x/def");
  expect(html).not.toContain("javascript:");
});

it("draws a placeholder photo as a grey box, with its caption beneath when it has one", () => {
  const box = '<div class="aspect-[4/3] w-full rounded-lg bg-muted" role="img" aria-label="Placeholder photo"></div>';
  expect(
    render(
      doc(
        { type: "photo", attrs: { caption: "At the <park>", placeholder: true } },
        { type: "photo", attrs: { caption: "", placeholder: true } },
      ),
    ),
  ).toBe(
    `<figure class="space-y-2 whitespace-normal">${box}<figcaption class="text-sm text-muted-foreground">At the &lt;park&gt;</figcaption></figure>` +
      `<figure class="space-y-2 whitespace-normal">${box}</figure>`,
  );
});
