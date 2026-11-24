// 채점 CSV 와 대응표를 읽고 쓴다. 쉼표, 따옴표, 줄바꿈이 든 칸은 따옴표로 감싼다.
// 기획자가 스프레드시트로 열어 「정상」 칸을 채우므로 머리줄 이름으로 칸을 찾는다.

export type CsvRow = Record<string, string>;

function cell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function csvLine(columns: readonly string[], row: CsvRow): string {
  return `${columns.map((column) => cell(row[column] ?? "")).join(",")}\n`;
}

export function csvHeader(columns: readonly string[]): string {
  return `${columns.map(cell).join(",")}\n`;
}

/** 머리줄 이름을 열쇠로 한 줄씩 돌려준다. 빈 줄은 건너뛴다. */
export function parseCsv(source: string): CsvRow[] {
  // 엑셀이 「CSV UTF-8」 로 저장하면 앞에 BOM 이 붙는다. 떼지 않으면 첫 열 이름이 달라져 모든 줄의 ID 가 빈다.
  const text = source.startsWith("\uFEFF") ? source.slice(1) : source;
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || record.length > 0) records.push([...record, field]);
  const [header, ...rows] = records.filter((row) => row.some((value) => value !== ""));
  if (!header) return [];
  return rows.map((row) => Object.fromEntries(header.map((name, i) => [name, row[i] ?? ""])));
}
