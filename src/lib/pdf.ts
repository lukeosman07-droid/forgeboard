// A small PDF writer for register logs: a title, then a table that runs over
// as many landscape pages as it needs. Helvetica only (built into every PDF
// reader), so nothing has to be embedded. Text outside Latin-1 becomes "?".

export type PdfColumn = { header: string; /** Share of the page width. */ width: number };

const PAGE_W = 792; // 11 in landscape
const PAGE_H = 612; // 8.5 in
const MARGIN = 36;
const FONT = 8;
const LINE = 10;
const HEADER_FONT = 8;
// Helvetica's average glyph width is about half the font size.
const CHAR_W = FONT * 0.5;

function latin1(s: string) {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
}

function escapePdf(s: string) {
  return latin1(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Splits text into lines that fit a width, at most maxLines (the last ends with "..."). */
export function wrap(text: string, width: number, maxLines = 6): string[] {
  const perLine = Math.max(4, Math.floor(width / CHAR_W));
  const lines: string[] = [];
  for (const para of text.replace(/\r\n?/g, "\n").split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let w = word;
      while (w.length > perLine) {
        if (line) {
          lines.push(line);
          line = "";
        }
        lines.push(w.slice(0, perLine));
        w = w.slice(perLine);
      }
      if (!line) line = w;
      else if (line.length + 1 + w.length <= perLine) line += ` ${w}`;
      else {
        lines.push(line);
        line = w;
      }
    }
    lines.push(line);
  }
  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].slice(0, Math.max(0, perLine - 3))}...`;
    return kept;
  }
  return lines;
}

export function tablePdf({ title, subtitle, columns, rows }: { title: string; subtitle?: string; columns: PdfColumn[]; rows: string[][] }): Uint8Array {
  const usable = PAGE_W - 2 * MARGIN;
  const total = columns.reduce((n, c) => n + c.width, 0);
  const widths = columns.map((c) => (c.width / total) * usable);
  const xs = widths.map((_, i) => MARGIN + widths.slice(0, i).reduce((n, w) => n + w, 0));

  const pages: string[][] = [];
  let ops: string[] = [];
  let y = 0;
  const text = (x: number, yy: number, s: string, size = FONT, bold = false) =>
    ops.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(1)} ${yy.toFixed(1)} Td (${escapePdf(s)}) Tj ET`);

  const startPage = () => {
    ops = [];
    pages.push(ops);
    y = PAGE_H - MARGIN;
    text(MARGIN, y - 14, title, 14, true);
    y -= 20;
    if (subtitle) {
      text(MARGIN, y - 10, subtitle, 9);
      y -= 14;
    }
    y -= 8;
    // Column headers on a shaded band.
    ops.push(`0.9 g ${MARGIN} ${(y - LINE - 4).toFixed(1)} ${usable} ${LINE + 6} re f 0 g`);
    columns.forEach((c, i) => text(xs[i] + 2, y - LINE + 1, c.header, HEADER_FONT, true));
    y -= LINE + 8;
  };

  startPage();
  for (const row of rows) {
    const cells = row.map((v, i) => wrap(v ?? "", widths[i] - 4));
    const height = Math.max(1, ...cells.map((c) => c.length)) * LINE + 4;
    if (y - height < MARGIN + 14) startPage();
    cells.forEach((lines, i) => lines.forEach((line, j) => text(xs[i] + 2, y - LINE * (j + 1) + 2, line)));
    y -= height;
    ops.push(`0.8 G 0.5 w ${MARGIN} ${y.toFixed(1)} m ${MARGIN + usable} ${y.toFixed(1)} l S 0 G`);
  }
  if (rows.length === 0) text(MARGIN, y - LINE, "Nothing logged yet.", FONT);

  pages.forEach((p, i) => {
    const label = `Page ${i + 1} of ${pages.length}`;
    p.push(`BT /F1 8 Tf ${(PAGE_W - MARGIN - label.length * 4).toFixed(1)} ${MARGIN - 14} Td (${label}) Tj ET`);
  });

  // Objects: 1 catalog, 2 pages, 3 font, 4 bold font, then a content + page pair per page.
  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(""); // filled in below
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids: number[] = [];
  for (const p of pages) {
    const stream = p.join("\n");
    objects.push(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    const content = objects.length;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${content} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`);
    kids.push(objects.length);
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}
