import { describe, expect, it } from "vitest";
import { contentFrom, docFromText, shownContent, textOf, validDoc } from "./richText.js";

const text = (t: string, marks?: unknown[]) => (marks ? { type: "text", text: t, marks } : { type: "text", text: t });
const p = (...content: unknown[]) => (content.length ? { type: "paragraph", content } : { type: "paragraph" });
const li = (...content: unknown[]) => ({ type: "listItem", content });
const ul = (...items: unknown[]) => ({ type: "bulletList", content: items });
const ol = (attrs: unknown, ...items: unknown[]) => ({ type: "orderedList", attrs, content: items });
const doc = (...content: unknown[]) => ({ type: "doc", content });
const link = (href: unknown) => ({
  type: "link",
  attrs: { href, target: "_blank", rel: "noopener noreferrer nofollow", class: null, title: null },
});

function refuses(input: unknown) {
  expect(() => validDoc(input)).toThrow(expect.objectContaining({ status: 400 }));
}

describe("validDoc", () => {
  it("accepts a document from the editor, keeping only each link's href", () => {
    const input = doc(
      p(text("Bold", [{ type: "bold" }]), text(" and ", [{ type: "italic" }]), { type: "hardBreak" }, text("site", [link("https://example.com")])),
      ul(li(p(text("one")), ol({ start: 3, type: null }, li(p(text("nested")))))),
      p(),
    );
    expect(validDoc(input)).toEqual(
      doc(
        p(text("Bold", [{ type: "bold" }]), text(" and ", [{ type: "italic" }]), { type: "hardBreak" }, text("site", [{ type: "link", attrs: { href: "https://example.com" } }])),
        ul(li(p(text("one")), ol({ start: 3, type: null }, li(p(text("nested")))))),
        p(),
      ),
    );
  });

  it("drops formatting on a line break and an empty marks list", () => {
    expect(validDoc(doc(p(text("a", []), { type: "hardBreak", marks: [{ type: "bold" }] }, text("b"))))).toEqual(
      doc(p(text("a"), { type: "hardBreak" }, text("b"))),
    );
  });

  it("normalizes pasted list numbering and style", () => {
    for (const start of [0, -3, 10_000, null, "5", 1.5, undefined]) {
      expect(validDoc(doc(ol({ start, type: "a" }, li(p(text("x"))))))).toEqual(doc(ol({ start: 1, type: null }, li(p(text("x"))))));
    }
    expect(validDoc(doc({ type: "orderedList", content: [li(p(text("x")))] }))).toEqual(doc(ol({ start: 1, type: null }, li(p(text("x"))))));
    expect(validDoc(doc(ol({ start: 9_999, type: "I" }, li(p(text("x"))))))).toEqual(doc(ol({ start: 9_999, type: null }, li(p(text("x"))))));
  });

  it("refuses nodes and marks the app doesn't allow", () => {
    for (const type of ["heading", "image", "codeBlock", "blockquote", "horizontalRule", "photo", "table", "mystery"]) {
      refuses(doc({ type, content: [text("x")] }));
    }
    for (const type of ["code", "strike", "underline", "textStyle", "highlight"]) {
      refuses(doc(p(text("x", [{ type }]))));
    }
  });

  it("refuses unknown keys anywhere", () => {
    refuses({ ...doc(p(text("x"))), attrs: {} });
    refuses(doc({ ...p(text("x")), attrs: { textAlign: "center" } }));
    refuses(doc({ ...text("x"), style: "color:red" } as never));
    refuses(doc(p({ ...text("x"), extra: 1 })));
    refuses(doc(p(text("x", [{ type: "bold", attrs: {} }]))));
    refuses(doc(p(text("x", [{ type: "link", attrs: { href: "https://example.com", style: "x" } }]))));
    refuses(doc(ol({ start: 1, type: null, reversed: true }, li(p(text("x"))))));
    refuses(doc(ul(li(p(text("x"))), { type: "listItem", content: [p(text("y"))], attrs: { checked: true } })));
    refuses(doc(p(text("x")), JSON.parse('{"type":"paragraph","__proto__":{"evil":true}}')));
  });

  it("refuses malformed structure", () => {
    for (const bad of [null, "text", [], {}, { type: "doc" }, doc(), { type: "paragraph", content: [text("x")] }]) refuses(bad);
    refuses(doc(p(text("x", [{ type: "bold" }, { type: "bold" }]))));
    refuses(doc(p(text("x", [{ type: "bold" }, { type: "italic" }, link("https://a.example"), { type: "bold" }]))));
    refuses(doc(p(text(""))));
    refuses(doc(p({ type: "text", text: 5 })));
    refuses(doc(p(text("two\nlines"))));
    refuses(doc(ul()));
    refuses(doc(ul(li())));
    refuses(doc(ul(li(ul(li(p(text("x"))))))));
    refuses(doc(p(ul(li(p(text("x")))))));
    refuses(doc(ol("3", li(p(text("x"))))));
    refuses(doc(ol({ start: 1, type: 5 }, li(p(text("x"))))));
  });

  it("refuses links that aren't http, https, or mailto", () => {
    for (const href of [
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      " javascript:alert(1)",
      "java\nscript:alert(1)",
      "java\tscript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "/relative",
      "//example.com",
      "file:///etc/passwd",
      "ftp://example.com",
      "not a url",
      "https://",
      `https://example.com/${"a".repeat(2_000)}`,
      null,
      42,
    ]) {
      refuses(doc(p(text("x", [link(href)]))));
    }
    for (const href of ["https://example.com/a?b=c#d", "http://example.com", "mailto:ana@example.com"]) {
      expect(validDoc(doc(p(text("x", [link(href)]))))).toEqual(doc(p(text("x", [{ type: "link", attrs: { href } }]))));
    }
  });

  it("refuses too much text, too many nodes, or nesting too deep", () => {
    expect(() => validDoc(doc(p(text("x".repeat(20_000)))))).not.toThrow();
    refuses(doc(p(text("x".repeat(20_001)))));
    refuses(doc(p(text("x".repeat(10_000))), p(text("x".repeat(10_001)))));
    // The document, a paragraph, its text, and 9,997 more paragraphs make 10,000 nodes.
    expect(() => validDoc(doc(p(text("x")), ...Array.from({ length: 9_997 }, () => p())))).not.toThrow();
    refuses(doc(p(text("x")), ...Array.from({ length: 9_998 }, () => p())));
    // Three levels of lists fit in ten; a fourth doesn't.
    const nest = (levels: number): unknown => (levels === 0 ? p(text("x")) : ul(li(p(text("x")), nest(levels - 1))));
    expect(() => validDoc(doc(nest(3)))).not.toThrow();
    refuses(doc(nest(4)));
  });

  it("refuses an empty document", () => {
    refuses(doc(p()));
    refuses(doc(p(text("   ")), p({ type: "hardBreak" })));
    refuses(doc(ul(li(p()))));
  });
});

describe("docFromText and textOf", () => {
  const cases = [
    'Quotes "double" and \'single\'',
    "A backslash \\ and a literal \\n",
    "Emoji 💛🙏 and accents é",
    "One\nTwo\n\nThree",
    "Three newlines\n\n\nthen text",
    "Four newlines\n\n\n\nthen text",
    "  leading and trailing spaces  ",
    "Visit https://example.com/a?b=1, or (https://example.org).",
  ];

  it("gives back the original text exactly", () => {
    for (const t of cases) expect(textOf(docFromText(t))).toBe(t);
    expect(textOf(docFromText("a\r\nb"))).toBe("a\nb");
  });

  it("makes paragraphs, line breaks, and links", () => {
    expect(docFromText("One\nTwo\n\n\n\nVisit https://example.com.")).toEqual(
      doc(
        p(text("One"), { type: "hardBreak" }, text("Two")),
        p(),
        p(text("Visit "), text("https://example.com", [{ type: "link", attrs: { href: "https://example.com" } }]), text(".")),
      ),
    );
    expect(docFromText("a\n\n\nb")).toEqual(doc(p(text("a")), p({ type: "hardBreak" }, text("b"))));
  });

  it("leaves addresses that aren't allowed links as text", () => {
    expect(docFromText("https:// and javascript:alert(1)")).toEqual(doc(p(text("https:// and javascript:alert(1)"))));
    const long = `https://example.com/${"a".repeat(2_000)}`;
    expect(docFromText(long)).toEqual(doc(p(text(long))));
  });

  it("writes lists as lines, indented when nested", () => {
    const d = validDoc(doc(p(text("Intro")), ul(li(p(text("a")), ol({ start: 2 }, li(p(text("b"))), li(p(text("c"))))), li(p(text("d"))))));
    expect(textOf(d)).toBe("Intro\n\n- a\n  2. b\n  3. c\n- d");
  });
});

describe("contentFrom", () => {
  it("uses content over body, and converts body alone", () => {
    expect(contentFrom({ content: doc(p(text("c"))), body: "b" })).toEqual({ content: doc(p(text("c"))), body: "c" });
    expect(contentFrom({ body: " b\nc " })).toEqual({ content: doc(p(text("b"), { type: "hardBreak" }, text("c"))), body: "b\nc" });
    expect(() => contentFrom({})).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => contentFrom({ body: 5 })).toThrow(expect.objectContaining({ status: 400 }));
  });
});

describe("shownContent", () => {
  it("shows content while it matches body, and body otherwise", () => {
    const d = doc(p(text("Hello")));
    expect(shownContent(d, "Hello")).toBe(d);
    expect(shownContent(d, "Changed")).toEqual(doc(p(text("Changed"))));
    expect(shownContent(null, "Old")).toEqual(doc(p(text("Old"))));
    expect(shownContent({ type: "doc", content: "nonsense" }, "Fallback")).toEqual(doc(p(text("Fallback"))));
  });
});
