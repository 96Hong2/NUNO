import { parseCsv } from "./csv.ts";
import { imageKind, metadataLeft } from "./strip-metadata.ts";

// 블라인드 검사 명령의 본체. 채점 폴더를 훑어 블라인드가 새는 곳을 찾는다.
// 이름이 무작위(UUID)인지, 그림 형식이 하나인지, 메타데이터 덩어리가 남았는지, 채점 CSV 에 모델을 드러내는 열이 있는지.

const UUID_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$/;
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
  // 점 파일(.DS_Store 등)은 Finder 가 만든다. 그림이 아니라 건너뛴다.
  const images = files.filter((file) => file.name !== "scoring.csv" && !file.name.startsWith("."));
  const kinds = new Set<string>();
  for (const file of images) {
    if (!UUID_NAME.test(file.name)) problems.push(`무작위 이름이 아니다: ${file.name}`);
    try {
      kinds.add(imageKind(file.bytes));
      const left = metadataLeft(file.bytes);
      if (left.length > 0)
        problems.push(`메타데이터 덩어리 ${left.join(", ")} 가 남았다: ${file.name}`);
    } catch (error) {
      problems.push(
        `그림으로 읽지 못했다: ${file.name} (${error instanceof Error ? error.message : String(error)})`,
      );
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
