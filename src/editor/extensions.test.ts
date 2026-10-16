// @vitest-environment jsdom
import { Editor } from "@tiptap/react";
import { afterEach, expect, it } from "vitest";
import { validDoc } from "../../server/richText.js";
import { cleanDoc, extensions } from "./extensions.js";

let editor: Editor | undefined;
afterEach(() => editor?.destroy());

// jsdom has no ClipboardEvent, and ProseMirror's paste logic only passes the event along.
const pasteEvent = () => new Event("paste") as ClipboardEvent;

// Pastes HTML into an empty editor the way a browser paste does, and returns what Post sends.
function paste(html: string) {
  editor = new Editor({ extensions, element: document.createElement("div") });
  editor.view.pasteHTML(html, pasteEvent());
  return cleanDoc(editor.getJSON());
}

it("keeps only allowed formatting from pasted HTML, and the server accepts the result", () => {
  const sent = paste(`
    <h1 style="color:red">Big news</h1>
    <p><span style="font-family:Comic Sans;color:blue">Colored</span> <b>bold</b> <i>italic</i> <u>under</u> <s>struck</s> <code>code</code></p>
    <blockquote>Quoted</blockquote>
    <table><tr><td>Cell</td></tr></table>
    <p>Image <img src="https://tracker.example/pixel.gif"> here</p>
    <script>alert("script")</script>
    <p><a href="javascript:alert(1)">Bad link</a> <a href="ftp://example.com/x">FTP link</a> <a href="https://example.com/ok" title="t" class="c" style="x">Good link</a></p>
    <hr>
    <pre>Preformatted</pre>
  `);
  const json = JSON.stringify(sent);
  for (const word of ["Big news", "Colored", "bold", "italic", "under", "struck", "code", "Quoted", "Cell", "Bad link", "FTP link", "Good link", "Preformatted"]) {
    expect(json).toContain(word);
  }
  for (const bad of ["heading", "blockquote", "table", "image", "tracker", "script", "javascript", "ftp:", "color", "font", "codeBlock", "horizontalRule", "strike", "underline"]) {
    expect(json).not.toContain(bad);
  }
  const checked = validDoc(sent);
  expect(JSON.stringify(checked)).toContain('{"type":"link","attrs":{"href":"https://example.com/ok"}}');
});

it("keeps a lettered list from Google Docs as a numbered list the server accepts", () => {
  const sent = paste(`
    <meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1">
    <ol style="margin-top:0;margin-bottom:0;" start="0">
      <li dir="ltr" style="list-style-type:lower-alpha;font-size:11pt;"><p dir="ltr"><span style="font-weight:700;">First</span></p></li>
      <li dir="ltr" style="list-style-type:lower-alpha;"><p dir="ltr"><span>Second</span></p>
        <ul><li style="list-style-type:disc;"><p><span>Nested</span></p></li></ul></li>
    </ol></b>
  `);
  const checked = validDoc(sent);
  const list = checked.content.find((b) => b.type === "orderedList");
  expect(list).toMatchObject({ attrs: { start: 1, type: null } });
  expect(JSON.stringify(checked)).toContain("Nested");
});

it("links typed and pasted web addresses, but not other schemes", () => {
  editor = new Editor({ extensions, element: document.createElement("div") });
  editor.view.pasteText("See www.example.com and ftp://example.com/file and file:///etc/passwd", pasteEvent());
  const checked = validDoc(cleanDoc(editor.getJSON()));
  const hrefs = JSON.stringify(checked).match(/"href":"[^"]+"/g);
  // Tiptap's paste rule ignores defaultProtocol, so a pasted "www." address gets http://.
  expect(hrefs).toEqual(['"href":"http://www.example.com"']);
});

it("doesn't turn selected text into a link to another scheme when an address is pasted over it", () => {
  editor = new Editor({ extensions, element: document.createElement("div"), content: "<p>word</p>" });
  editor.commands.setTextSelection({ from: 1, to: 5 });
  editor.view.pasteText("ftp://example.com/x", pasteEvent());
  expect(JSON.stringify(editor.getJSON())).not.toContain('"type":"link"');

  editor.commands.setContent("<p>word</p>");
  editor.commands.setTextSelection({ from: 1, to: 5 });
  editor.view.pasteText("https://example.com/x", pasteEvent());
  expect(JSON.stringify(editor.getJSON())).toContain('"href":"https://example.com/x"');
});

it("sends a link the server would refuse as plain text", () => {
  const sent = cleanDoc({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }, { type: "bold" }] }] }],
  });
  expect(validDoc(sent)).toEqual({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "bold" }] }] }],
  });
});
