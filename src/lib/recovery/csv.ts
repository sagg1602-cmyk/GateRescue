/** Minimal RFC 4180 CSV parsing for the scenario source files. */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((v) => v !== "")) rows.push(row);
  }
  return rows;
}

/** Parses a CSV whose header must equal `expectedHeader` exactly. */
export function parseCsvRecords(text: string, expectedHeader: string, label: string): Record<string, string>[] {
  const [header, ...body] = parseCsv(text);
  if (!header || header.join(",") !== expectedHeader) {
    throw new Error(`${label}: unexpected header\n  got:      ${header?.join(",")}\n  expected: ${expectedHeader}`);
  }
  return body.map((values, i) => {
    if (values.length !== header.length) {
      throw new Error(`${label} row ${i + 2}: ${values.length} fields, expected ${header.length}`);
    }
    return Object.fromEntries(header.map((h, j) => [h, values[j]]));
  });
}
