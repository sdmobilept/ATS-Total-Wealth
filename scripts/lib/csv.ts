import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

/** Split one CSV line, honoring double-quoted fields (Zillow metro names contain commas). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Stream a CSV file, calling `onRow` with the header and each row's fields. */
export async function readCsv(path: string, onRow: (row: string[], header: string[]) => void): Promise<string[]> {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let header: string[] | null = null;
  for await (const line of rl) {
    if (!line) continue;
    const fields = splitCsvLine(line);
    if (!header) header = fields;
    else onRow(fields, header);
  }
  return header ?? [];
}
