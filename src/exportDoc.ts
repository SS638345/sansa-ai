/**
 * Export the text as Word (.docx), PDF (browser "Save as PDF", which shapes Tamil correctly)
 * or share it to WhatsApp. No libraries: the .docx is a small ZIP written here.
 */

/* ------------------------------------------------------------------ minimal ZIP (stored, no compression) */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zip(files: { name: string; data: string }[]): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = enc.encode(f.data);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x0800, true); // UTF-8 names
    v.setUint16(8, 0, true); // stored
    v.setUint32(14, crc, true);
    v.setUint32(18, data.length, true);
    v.setUint32(22, data.length, true);
    v.setUint16(26, name.length, true);
    local.set(name, 30);
    parts.push(local, data);
    const cd = new Uint8Array(46 + name.length);
    const w = new DataView(cd.buffer);
    w.setUint32(0, 0x02014b50, true);
    w.setUint16(4, 20, true);
    w.setUint16(6, 20, true);
    w.setUint16(8, 0x0800, true);
    w.setUint16(10, 0, true);
    w.setUint32(16, crc, true);
    w.setUint32(20, data.length, true);
    w.setUint32(24, data.length, true);
    w.setUint16(28, name.length, true);
    w.setUint32(42, offset, true);
    cd.set(name, 46);
    central.push(cd);
    offset += local.length + data.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true);
  e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end] as BlobPart[], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

/* ------------------------------------------------------------------ Word */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A real .docx: title, date line, one paragraph per line of text. Tamil font set so Word shows Tamil properly. */
export function toDocx(text: string, title: string): Blob {
  const run = (t: string, opts = "") =>
    `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Nirmala UI"/>${opts}</w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
  const para = (t: string, opts = "") => `<w:p>${t ? run(t, opts) : ""}</w:p>`;
  const body = [
    para(title, '<w:b/><w:sz w:val="32"/><w:szCs w:val="32"/>'),
    para(`SANSA AI · ${new Date().toLocaleString()}`, '<w:color w:val="777777"/><w:sz w:val="18"/><w:szCs w:val="18"/>'),
    para(""),
    ...text.split(/\r?\n/).map((l) => para(l, '<w:sz w:val="24"/><w:szCs w:val="24"/>')),
  ].join("");
  return zip([
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    },
    {
      name: "word/document.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`,
    },
  ]);
}

/* ------------------------------------------------------------------ PDF (print) */

/** Opens a clean print page; the visitor picks "Save as PDF". The browser shapes Tamil letters correctly. */
export function printAsPdf(text: string, title: string): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  const html = `<!doctype html><html lang="ta"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>@page{margin:18mm}body{font:15px/1.7 "Noto Sans Tamil","Nirmala UI","Latha",system-ui,sans-serif;color:#111}h1{font-size:20px;margin:0 0 4px}
.meta{color:#777;font-size:12px;margin-bottom:18px}p{margin:0 0 10px;white-space:pre-wrap}</style></head>
<body><h1>${esc(title)}</h1><div class="meta">SANSA AI · ${esc(new Date().toLocaleString())}</div>
${text.split(/\r?\n/).map((l) => `<p>${esc(l) || "&nbsp;"}</p>`).join("")}
</body></html>`;
  w.document.open();
  w.document.write(html);
  w.document.close();
  // Print from this page: an inline <script> in the new window would be blocked by the site's CSP (2026-11-10 fix).
  setTimeout(() => {
    try {
      w.focus();
      w.print();
    } catch {
      /* window closed: nothing to print */
    }
  }, 400);
  return true;
}

/* ------------------------------------------------------------------ WhatsApp */

/** Phone: the system share sheet (WhatsApp is in it). Computer: WhatsApp Web with the text filled in. */
export async function shareToWhatsApp(text: string): Promise<"shared" | "opened" | "cancelled"> {
  const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
  const touch = window.matchMedia?.("(pointer:coarse)").matches;
  if (touch && nav.share) {
    try {
      await nav.share({ text });
      return "shared";
    } catch {
      return "cancelled";
    }
  }
  // wa.me links get unreliable past a few thousand characters
  const body = text.length > 3500 ? text.slice(0, 3500) + "…" : text;
  window.open(`https://wa.me/?text=${encodeURIComponent(body)}`, "_blank", "noopener");
  return "opened";
}
