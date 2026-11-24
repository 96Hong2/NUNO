// 룩북 여러 권: 책장, 룩북 크게 보기의 즐겨찾기와 쪽 넘기기, 「다른 룩북에 넣기」 시트의 판정.
// 「모든 룩」 은 서버 룩북 행이 아니라 저장한 룩을 모두 모은 기본 룩북이다. 여기서는 null 로 가리킨다.

/** 룩북 이름 글자 수 상한. 서버 판 0003 의 lookbooks.title CHECK 와 같다 */
export const LOOKBOOK_TITLE_MAX = 12;

/** 서버 룩북 한 권. 책장 표지와 「다른 룩북에 넣기」 줄이 쓴다 */
export interface LookbookSummary {
  id: string;
  title: string;
  lookCount: number;
}

/** 「다른 룩북에 넣기」 줄 하나. 이미 그 룩이 든 룩북은 고르지 못한다 */
export interface PutSheetRow {
  id: string;
  title: string;
  /** 오른쪽 회색 글자: 「룩 N개」 또는 「이미 있어요」 */
  meta: string;
  already: boolean;
}

/** 지금 룩북은 줄에서 뺀다. currentId 가 null 이면 「모든 룩」 에서 연 시트다 */
export function putSheetRows(
  books: readonly LookbookSummary[],
  currentId: string | null,
  inLookbooks: readonly string[],
): PutSheetRow[] {
  return books
    .filter((book) => book.id !== currentId)
    .map((book) => {
      const already = inLookbooks.includes(book.id);
      return {
        id: book.id,
        title: book.title,
        meta: already ? "이미 있어요" : `룩 ${book.lookCount}개`,
        already,
      };
    });
}

export interface PutSheetState {
  /** 「복사해서 넣기」 글자가 검정이다 */
  copyReady: boolean;
  /** 「옮기기」 가 검정 바탕이다. 「모든 룩」 에서는 늘 회색이다 */
  moveReady: boolean;
  /** 단추 위 회색 안내 */
  note: string;
}

const ALL_LOOKS_COPY_ONLY = "「모든 룩」에서는 복사해서 넣기만 할 수 있어요";

/** currentTitle 이 null 이면 「모든 룩」 이다 */
export function putSheetState(currentTitle: string | null, picked: boolean): PutSheetState {
  const fromAll = currentTitle === null;
  return {
    copyReady: picked,
    moveReady: picked && !fromAll,
    note: fromAll
      ? ALL_LOOKS_COPY_ONLY
      : `복사해서 넣으면 두 룩북에 다 있고, 옮기면 「${currentTitle}」에서 빠져요`,
  };
}

/** 회색 단추를 눌렀을 때 띄울 알림. 막지 않으면 null 이다 */
export function putBlockedMessage(
  kind: "copy" | "move",
  currentTitle: string | null,
  picked: boolean,
): string | null {
  if (kind === "copy") return picked ? null : "넣을 룩북을 먼저 골라 주세요";
  if (currentTitle === null) return ALL_LOOKS_COPY_ONLY;
  return picked ? null : "옮길 룩북을 먼저 골라 주세요";
}

/** 룩북 크게 보기에서 넘겨 볼 룩. 「즐겨찾기만」 이면 별을 켠 룩만 */
export function bookPages<T extends { isFavorite: boolean }>(
  looks: readonly T[],
  favoritesOnly: boolean,
): T[] {
  return favoritesOnly ? looks.filter((look) => look.isFavorite) : [...looks];
}

/**
 * 「<」 「>」 를 누른 뒤의 쪽. 끝에서 더 가려 하면 그 자리에 두고 쪽 알약 글자를 준다.
 * index 는 0 부터, count 는 넘겨 볼 룩 수다.
 */
export function stepPage(
  index: number,
  count: number,
  delta: 1 | -1,
): { index: number; edge: "마지막 쪽" | "첫 쪽" | null } {
  const next = index + delta;
  if (next >= count) return { index, edge: "마지막 쪽" };
  if (next < 0) return { index, edge: "첫 쪽" };
  return { index: next, edge: null };
}

const hasFinal = (word: string) => {
  const code = (word.at(-1) ?? "").charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
};

/** 완성 룩 제목. 입은 옷 이름으로 만든다(「그레이 하프코트와 플리츠 미니」, 셋부터 「… 외 N벌」) */
export function lookTitleFromNames(names: readonly string[]): string {
  const [first, second] = names;
  if (!first) return "완성 룩";
  if (!second) return first;
  const pair = `${first}${hasFinal(first) ? "과" : "와"} ${second}`;
  return names.length > 2 ? `${pair} 외 ${names.length - 2}벌` : pair;
}
