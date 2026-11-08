import { toDocx } from "../src/exportDoc";

// The .docx must be a valid ZIP with the three Word parts, and keep Tamil text and escaped symbols.
(async () => {
  const blob = toDocx("வணக்கம்! இது ஒரு சோதனை.\nA & B <c>", "சோதனை");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  const checks: [string, boolean][] = [
    ["starts with a ZIP header", bytes[0] === 0x50 && bytes[1] === 0x4b],
    ["has [Content_Types].xml", text.includes("[Content_Types].xml")],
    ["has word/document.xml", text.includes("word/document.xml")],
    ["keeps Tamil text", text.includes("வணக்கம்! இது ஒரு சோதனை.")],
    ["escapes & and < >", text.includes("A &amp; B &lt;c&gt;")],
    ["ends with the ZIP directory", text.includes("PK\u0005\u0006")],
  ];
  const bad = checks.filter(([, ok]) => !ok);
  console.log(`${checks.length - bad.length}/${checks.length} Word file checks passed`);
  for (const [name] of bad) console.log(`  failed: ${name}`);
  if (bad.length) process.exitCode = 1;
})();
