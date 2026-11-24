import type { OutfitCategory, OutfitSlot } from "@nuno/outfit";
import {
  placeGarment,
  referenceBox,
  type Placement,
  type PosePoints,
  type Rect,
} from "@nuno/wardrobe";

// 코디 무대에서 옷 그림을 놓을 자리(트윈 사진 대비 0~1 비율).
// 옷장 옷과 견본 옷 모두 「트윈에 맞춰 볼게요」 와 같은 기준 상자와 placement 로 놓는다.
// 액세서리는 두르는 자리마다 상자를 따로 잡는다. 머리 자리는 옷장의 액세서리 상자를 쓴다.

/** 트윈 몸 점 자료(assets/twins/<키>/landmarks.json) */
export interface Landmarks {
  image: { width: number; height: number };
  pose: PosePoints;
}

const at = (pose: PosePoints, index: number) => ({
  x: pose[index]?.[0] ?? 0.5,
  y: pose[index]?.[1] ?? 0.5,
});

const centered = (cx: number, top: number, width: number, height: number): Rect => ({
  x: cx - width / 2,
  y: top,
  width,
  height,
});

function accessoryBox(slot: OutfitSlot, pose: PosePoints): Rect {
  const ls = at(pose, 11);
  const rs = at(pose, 12);
  const lw = at(pose, 15);
  const rw = at(pose, 16);
  const lh = at(pose, 23);
  const rh = at(pose, 24);
  const la = at(pose, 27);
  const ra = at(pose, 28);
  const shoulderWidth = Math.abs(ls.x - rs.x);
  const shoulderY = (ls.y + rs.y) / 2;
  const hipY = (lh.y + rh.y) / 2;
  const ankleY = (la.y + ra.y) / 2;
  switch (slot) {
    case "legwear":
      return centered((lh.x + rh.x) / 2, hipY - 0.02, shoulderWidth * 1.2, ankleY - hipY + 0.06);
    case "neck":
      return centered((ls.x + rs.x) / 2, shoulderY - 0.08, shoulderWidth * 1.3, 0.14);
    case "hands":
      return centered(
        (lw.x + rw.x) / 2,
        Math.min(lw.y, rw.y) - 0.04,
        Math.abs(lw.x - rw.x) * 1.25,
        0.1,
      );
    default:
      return referenceBox("acc", pose);
  }
}

/** 기준 상자. 옷장 종류와 코디 종류는 같은 글자다. */
export function slotBox(category: OutfitCategory, slot: OutfitSlot, pose: PosePoints): Rect {
  if (category === "acc") return accessoryBox(slot, pose);
  return referenceBox(category, pose);
}

/**
 * 옷 그림을 그릴 상자. 그림은 이 상자 안에 비율을 지켜(contain) 그린다.
 * 상자 비율을 그대로 placeGarment 에 넘기므로, 그 안에 contain 으로 그린 그림은
 * 실제 그림 비율로 placeGarment 를 한 자리와 같다(가운데 기준 확대와 맞춤이 서로 바뀌어도 같다).
 */
export function garmentFrame(
  category: OutfitCategory,
  slot: OutfitSlot,
  pose: PosePoints,
  placement: Placement,
): Rect {
  const box = slotBox(category, slot, pose);
  return placeGarment(box, placement, box.width / box.height);
}
