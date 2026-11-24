import { parseCsv } from "./csv.ts";
import { imageKind } from "./strip-metadata.ts";

// D5 판정 명령의 본체. 채점 폴더를 훑어 블라인드가 새는 곳을 찾는다.
// 이름이 무작위(UUID)인지, 그림 형식이 하나인지, 메타데이터 표지가 남았는지, 채점 CSV 에 모델을 드러내는 열이 있는지.

const UUID_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$/;
/** 남으면 안 되는 표지: EXIF, XMP, PNG 글과 시각과 EXIF 덩어리 이름 */
const MARKERS = ["Exif\0\0", "http://ns.adobe.com/xap", "tEXt", "iTXt", "zTXt", "eXIf", "tIME"];
const LEAKY_COLUMNS = [
  "model",
  "provider",
  "cost_usd",
  "elapsed_ms",
  "blocked_reason",
  "request_id",
];

export function checkScoringFolder(
  files: readonly { name: string; bytes: Uint8Array }[],
  scoringCsv: string,
): string[] {
  const problems: string[] = [];
  const images = files.filter((file) => file.name !== "scoring.csv");
  const kinds = new Set<string>();
  for (const file of images) {
    if (!UUID_NAME.test(file.name)) problems.push(`무작위 이름이 아니다: ${file.name}`);
    kinds.add(imageKind(file.bytes));
    const text = new TextDecoder("latin1").decode(file.bytes);
    for (const marker of MARKERS) {
      if (text.includes(marker))
        problems.push(`메타데이터 표지 ${JSON.stringify(marker)} 가 남았다: ${file.name}`);
    }
  }
  if (kinds.size > 1) problems.push(`그림 형식이 섞였다: ${[...kinds].join(", ")}`);
  const header = Object.keys(parseCsv(`${scoringCsv}\n`)[0] ?? {});
  const columns = header.length > 0 ? header : (scoringCsv.split("\n")[0] ?? "").split(",");
  for (const column of LEAKY_COLUMNS) {
    if (columns.includes(column)) problems.push(`채점 CSV 에 모델을 드러내는 열이 있다: ${column}`);
  }
  const listed = new Set(parseCsv(scoringCsv).map((row) => row.file));
  for (const file of images)
    if (!listed.has(file.name)) problems.push(`채점 CSV 에 없는 그림: ${file.name}`);
  return problems;
}
