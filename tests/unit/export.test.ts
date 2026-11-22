import { describe, expect, it } from "vitest";
import { crc32, csvField, fileSlug, toCsv, zip } from "@/lib/export";

describe("csvField", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("two\nlines")).toBe('"two\nlines"');
  });

  it("defuses spreadsheet formulas", () => {
    expect(csvField("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvField("+1")).toBe("'+1");
    expect(csvField("@sum")).toBe("'@sum");
    expect(csvField(-5)).toBe("-5");
  });

  it("writes empty for null and undefined", () => {
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
    expect(csvField(false)).toBe("false");
  });
});

describe("toCsv", () => {
  it("writes a header and CRLF lines", () => {
    expect(toCsv(["a", "b"], [[1, "x"], [null, "y,z"]])).toBe('a,b\r\n1,x\r\n,"y,z"\r\n');
  });
});

describe("fileSlug", () => {
  it("makes a safe file name", () => {
    expect(fileSlug("Elm St. Pump #2")).toBe("elm-st-pump-2");
    expect(fileSlug("!!!", "project")).toBe("project");
  });
});

describe("zip", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("builds an archive whose entries can be read back", () => {
    const files = [
      { name: "a.csv", data: "id,name\r\n1,Pump\r\n" },
      { name: "notes/ü.txt", data: "hello" },
    ];
    const archive = zip(files, new Date(2026, 10, 22, 12, 0, 0));
    const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);

    // End of central directory: entry count and where the directory starts.
    const end = archive.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    let at = view.getUint32(end + 16, true);

    const decoder = new TextDecoder();
    for (const file of files) {
      expect(view.getUint32(at, true)).toBe(0x02014b50);
      const size = view.getUint32(at + 20, true);
      const nameLength = view.getUint16(at + 28, true);
      const offset = view.getUint32(at + 42, true);
      expect(decoder.decode(archive.subarray(at + 46, at + 46 + nameLength))).toBe(file.name);

      // The local header points at the stored (uncompressed) bytes.
      const localNameLength = view.getUint16(offset + 26, true);
      const data = archive.subarray(offset + 30 + localNameLength, offset + 30 + localNameLength + size);
      expect(decoder.decode(data)).toBe(file.data);
      expect(crc32(data)).toBe(view.getUint32(at + 16, true));
      at += 46 + nameLength;
    }
  });
});
