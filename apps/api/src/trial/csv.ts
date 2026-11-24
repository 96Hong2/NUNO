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

/** 글자 칸 배열로 나눈다. BOM 을 떼고, 모든 칸이 빈 줄(엑셀이 남긴 빈 행)은 건너뛴다. */
function parseRecords(source: string): string[][] {
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
  return records.filter((row) => row.some((value) => value !== ""));
}

/** 머리줄 이름을 열쇠로 한 줄씩 돌려준다. 빈 줄은 건너뛴다. */
export function parseCsv(source: string): CsvRow[] {
  const [header, ...rows] = parseRecords(source);
  if (!header) return [];
  return rows.map((row) => Object.fromEntries(header.map((name, i) => [name, row[i] ?? ""])));
}

/** 머리줄의 열 이름. parseCsv 와 같은 줄(빈 행 다음 첫 줄)을 머리줄로 본다 */
export function csvColumns(text: string): string[] {
  return parseRecords(text)[0] ?? [];
}

/**
 * 이름으로 칸을 다시 쓰면 값을 잃는 모양인지 본다: 같은 이름이나 빈 이름 열, 머리줄보다 칸이 많은 줄.
 * 문제가 없으면 null.
 */
export function csvShapeProblem(text: string): string | null {
  const [header, ...rows] = parseRecords(text);
  if (!header) return null;
  const names = header.map((name) => name.trim());
  const empty = names.findIndex((name) => name === "");
  if (empty >= 0) return `머리줄 ${empty + 1}번째 열에 이름이 없다`;
  const duplicate = names.find((name, i) => names.indexOf(name) !== i);
  if (duplicate) return `머리줄에 같은 이름 열(${duplicate})이 둘 이상 있다`;
  const wide = rows.findIndex(
    (row) => row.length > header.length && row.slice(header.length).some((v) => v !== ""),
  );
  if (wide >= 0) return `${wide + 2}번째 줄에 머리줄보다 칸이 많다`;
  return null;
}
