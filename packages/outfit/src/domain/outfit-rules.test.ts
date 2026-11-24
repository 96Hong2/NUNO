import { describe, expect, it } from "vitest";
import { undo, redo, remember, EMPTY_HISTORY } from "./history";
import {
  layered,
  slotOf,
  toggleGarment,
  type OutfitCategory,
  type OutfitPiece,
  type OutfitSlot,
} from "./outfit";
import { recordRecent, MAX_RECENT } from "./recent";
import { todayLook } from "./samples";

const piece = (id: string, category: OutfitCategory, slot?: OutfitSlot): OutfitPiece => ({
  ref: { kind: "garment", id },
  category,
  slot: slotOf(category, slot),
});
const ids = (outfit: readonly OutfitPiece[]) =>
  outfit.map((p) => (p.ref.kind === "garment" ? p.ref.id : p.ref.key));

describe("입히기와 겹침", () => {
  it("같은 종류는 바뀌고, 같은 옷을 다시 누르면 벗는다", () => {
    let outfit = toggleGarment([], piece("coat-1", "outer"));
    outfit = toggleGarment(outfit, piece("coat-2", "outer"));
    expect(ids(outfit)).toEqual(["coat-2"]);
    expect(toggleGarment(outfit, piece("coat-2", "outer"))).toEqual([]);
  });

  it("액세서리는 셋까지 겹치고 넷째를 넣으면 가장 먼저 넣은 것이 빠진다", () => {
    let outfit: readonly OutfitPiece[] = [];
    for (const id of ["a1", "a2", "a3", "a4"]) outfit = toggleGarment(outfit, piece(id, "acc"));
    expect(ids(outfit)).toEqual(["a2", "a3", "a4"]);
  });

  it("아래부터 다리, 신발, 하의, 상의, 아우터, 가방, 머리 순으로 그린다", () => {
    const outfit = [
      piece("hat", "acc", "head"),
      piece("coat", "outer"),
      piece("bag", "bag"),
      piece("knit", "top"),
      piece("skirt", "bottom"),
      piece("tights", "acc", "legwear"),
      piece("boots", "shoes"),
    ];
    expect(ids(layered(outfit))).toEqual([
      "tights",
      "boots",
      "skirt",
      "knit",
      "coat",
      "bag",
      "hat",
    ]);
  });
});

describe("되돌리기 기록", () => {
  it("되돌리면 앞 코디로, 다시 앞으로 돌리면 뒤 코디로 간다. 기록이 없으면 null", () => {
    const before = [piece("coat", "outer")];
    const after: OutfitPiece[] = [];
    const history = remember(EMPTY_HISTORY, before);
    const back = undo(history, after);
    expect(back?.outfit).toBe(before);
    expect(redo(back?.history ?? EMPTY_HISTORY, before)?.outfit).toBe(after);
    expect(undo(EMPTY_HISTORY, after)).toBeNull();
  });
});

describe("최근 입혀 본 코디", () => {
  const base = [piece("coat", "outer"), piece("skirt", "bottom")];

  it("한 벌만 바꾸면 맨 앞을 고치고, 두 벌 이상 바뀌면 맨 앞에 더한다", () => {
    const first = recordRecent([], "harin", base, "r1");
    const oneChange = recordRecent(first, "harin", [...base, piece("knit", "top")], "r2");
    expect(oneChange.map((r) => r.id)).toEqual(["r1"]);
    const twoChanges = recordRecent(
      oneChange,
      "harin",
      [piece("coat-2", "outer"), piece("pants", "bottom")],
      "r3",
    );
    expect(twoChanges.map((r) => r.id)).toEqual(["r3", "r1"]);
  });

  it("있던 조합이 되면 그 카드를 맨 앞으로 옮기고, 1벌 이하면 줄을 두며, 12장까지 남긴다", () => {
    const a = recordRecent([], "harin", base, "a");
    const b = recordRecent(a, "harin", [piece("x", "outer"), piece("y", "bottom")], "b");
    expect(recordRecent(b, "harin", base, "c").map((r) => r.id)).toEqual(["a", "b"]);
    expect(recordRecent(b, "harin", [piece("solo", "outer")], "d")).toEqual(b);
    let many = b;
    for (let i = 0; i < 20; i += 1) {
      many = recordRecent(
        many,
        "harin",
        [piece(`o${i}`, "outer"), piece(`p${i}`, "bottom")],
        `n${i}`,
      );
    }
    expect(many).toHaveLength(MAX_RECENT);
  });
});

describe("오늘 코디", () => {
  it("이어진 두 날은 그 트윈의 추천 코디 둘을 번갈아 고르고, 같은 날은 늘 같다", () => {
    const first = todayLook("harin", "2026-11-25")?.key;
    const second = todayLook("harin", "2026-11-26")?.key;
    expect(new Set([first, second])).toEqual(new Set(["harin-p07", "harin-co"]));
    expect(todayLook("harin", "2026-11-25")?.key).toBe(first);
    expect(todayLook("nobody", "2026-11-25")).toBeUndefined();
  });
});
