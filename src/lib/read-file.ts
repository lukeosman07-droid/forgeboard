import "server-only";
import mammoth from "mammoth";
import PostalMime from "postal-mime";
import { extractText, getDocumentProxy } from "unpdf";
import { cleanTranscript, htmlToText, joinPages } from "./capture";

// Turns an uploaded file into text the AI can read. PDFs keep their pages
// (unpdf reads the text layer page by page), Word files go through mammoth,
// email through postal-mime, and transcripts lose their timing lines.
// Nothing here renders the file; HTML in email is stripped to text.

export type FileText = {
  text: string;
  /** Where each page starts in text (PDFs only). */
  pageOffsets: number[] | null;
  pageCount: number | null;
  /** A PDF with (almost) no text layer: a scan, which the AI must read as images. */
  scanned: boolean;
  /** The email's subject, used as the document title. */
  title?: string;
  /** The email's sender. */
  from?: string;
};

/** Longest text kept for one document (the database allows 1,000,000). */
export const MAX_DOCUMENT_CHARS = 1_000_000;

export async function readFileText(bytes: Uint8Array, mime: string): Promise<FileText> {
  switch (mime) {
    case "application/pdf":
      return readPdf(bytes);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      return plain(value);
    }
    case "message/rfc822": {
      const email = await parseEmail(bytes);
      return { ...plain(email.text), title: email.subject, from: email.from };
    }
    case "text/vtt":
    case "application/x-subrip":
      return plain(cleanTranscript(decode(bytes)));
    case "text/plain":
      return plain(decode(bytes));
    default:
      throw new Error(`Can't read text from ${mime}`);
  }
}

function plain(text: string): FileText {
  return { text: text.replace(/\r\n?/g, "\n").trim().slice(0, MAX_DOCUMENT_CHARS), pageOffsets: null, pageCount: null, scanned: false };
}

function decode(bytes: Uint8Array) {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

async function readPdf(bytes: Uint8Array): Promise<FileText> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = text.map((p) => p.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n"));
  const { text: joined, offsets } = joinPages(pages);
  // A scan: most pages have no real text layer.
  const withText = pages.filter((p) => p.replace(/\s+/g, "").length >= 10).length;
  const scanned = withText < Math.ceil(totalPages / 2);
  if (joined.length > MAX_DOCUMENT_CHARS) {
    // Keep whole pages that fit.
    const keep = offsets.filter((o) => o < MAX_DOCUMENT_CHARS);
    return { text: joined.slice(0, MAX_DOCUMENT_CHARS), pageOffsets: keep, pageCount: totalPages, scanned: false };
  }
  return { text: scanned ? "" : joined, pageOffsets: scanned ? null : offsets, pageCount: totalPages, scanned };
}

export type ParsedEmail = {
  from: string;
  fromName: string;
  subject: string;
  text: string;
  attachmentNames: string[];
};

/** Parses a raw email (RFC 822). HTML-only mail is reduced to text. */
export async function parseEmail(raw: Uint8Array | string): Promise<ParsedEmail> {
  const email = await PostalMime.parse(raw);
  const sender = email.from && "address" in email.from && email.from.address ? email.from : null;
  const body = email.text?.trim() ? email.text : email.html ? htmlToText(email.html) : "";
  const attachmentNames = (email.attachments ?? [])
    .filter((a) => a.disposition !== "inline")
    .map((a) => a.filename ?? "attachment");
  const lines = [
    sender ? `From: ${sender.name ? `${sender.name} <${sender.address}>` : sender.address}` : "",
    email.date ? `Date: ${email.date}` : "",
    email.subject ? `Subject: ${email.subject}` : "",
    "",
    body.replace(/\r\n?/g, "\n").trim(),
    attachmentNames.length ? `\n(Attachments not imported: ${attachmentNames.join(", ")})` : "",
  ];
  return {
    from: sender?.address?.toLowerCase() ?? "",
    fromName: sender?.name ?? "",
    subject: email.subject?.trim() ?? "",
    text: lines.filter((l, i) => l || i === 3).join("\n").trim().slice(0, MAX_DOCUMENT_CHARS),
    attachmentNames,
  };
}
