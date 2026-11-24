import { describe, expect, it } from "vitest";
import { pickGarmentColor } from "./dominant-color";
import { normalizeLinkUrl } from "./garment";
import { faceStillVisible } from "./geometry";

const pixel = (r: number, g: number, b: number, a = 255) => [r, g, b, a];

describe("색 미리 고르기", () => {
  it("보이는 점 가운데 가장 넓은 색을 고르고 투명한 배경 점은 세지 않는다", () => {
    const brown = pixel(120, 80, 52);
    const cream = pixel(230, 220, 200);
    const background = pixel(250, 250, 250, 0);
    const rgba = [
      ...brown,
      ...brown,
      ...brown,
      ...cream,
      ...cream,
      ...background,
      ...background,
      ...background,
      ...background,
    ];
    expect(pickGarmentColor(rgba)).toBe("brown");
  });

  it("짙은 갈색은 밝기가 낮아도 검정이 아니라 브라운으로 고른다", () => {
    expect(
      pickGarmentColor([...pixel(78, 38, 22), ...pixel(78, 38, 22), ...pixel(240, 228, 205)]),
    ).toBe("brown");
  });

  it("보이는 점이 없으면 고르지 않는다", () => {
    expect(pickGarmentColor([...pixel(0, 0, 0, 0)])).toBeNull();
  });
});

describe("옷만 보이도록 자르기", () => {
  const face = { x: 0.4, y: 0.05, width: 0.2, height: 0.15 };

  it("네모 안에 얼굴이 들면 넘어가지 못하고, 얼굴을 빼거나 붓으로 가리면 넘어간다", () => {
    const whole = { x: 0, y: 0, width: 1, height: 1 };
    expect(faceStillVisible(whole, face)).toBe(true);
    expect(faceStillVisible({ x: 0.1, y: 0.25, width: 0.8, height: 0.6 }, face)).toBe(false);
    const cover = {
      mode: "cover" as const,
      radius: 0.12,
      points: [
        { x: 0.45, y: 0.12 },
        { x: 0.55, y: 0.12 },
      ],
    };
    expect(faceStillVisible(whole, face, [cover])).toBe(false);
  });

  it("세로 사진에서는 붓 폭을 세로로 늘려 세지 않아, 얼굴 띠가 남으면 넘어가지 못한다", () => {
    const whole = { x: 0, y: 0, width: 1, height: 1 };
    const thin = {
      mode: "cover" as const,
      radius: 0.08,
      points: [
        { x: 0.4, y: 0.125 },
        { x: 0.6, y: 0.125 },
      ],
    };
    expect(faceStillVisible(whole, face, [thin], 1)).toBe(false);
    expect(faceStillVisible(whole, face, [thin], 1.5)).toBe(true);
  });

  it("사람이 없는 사진은 얼굴 판정 없이 넘어간다", () => {
    expect(faceStillVisible({ x: 0, y: 0, width: 1, height: 1 }, null)).toBe(false);
  });
});

describe("상품 링크", () => {
  it("스킴이 없으면 https 를 붙이고, http 와 https 가 아닌 주소는 받지 않는다", () => {
    expect(normalizeLinkUrl("monowhale.kr/item")).toBe("https://monowhale.kr/item");
    expect(normalizeLinkUrl("http://a.kr")).toBe("http://a.kr");
    expect(normalizeLinkUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeLinkUrl("  ")).toBeNull();
  });
});
