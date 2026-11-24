import type { PresetTwinKey } from "@nuno/twin";
import type { ImageSourcePropType } from "react-native";

// 설치 파일에 넣는 프리셋 트윈 그림과 점. Metro 는 고정 문자열 require 만 번들에 넣는다.
// 키가 하나라도 빠지면 Record 타입이 막는다. 마스크와 점(landmarks)은 T4 겹쳐 입히기가 쓴다.
// 원본은 저장소 루트 assets-source/twins 에 있고, 앱은 그쪽을 require 하지 않는다.

export interface TwinAssets {
  /** 트윈 고르기 카드의 기본 사진 */
  base: ImageSourcePropType;
  /** 홈 무대의 기본 코디 완성 사진(흰 바탕 위에 올리는 투명 PNG) */
  outfit: ImageSourcePropType;
  mask: ImageSourcePropType;
  landmarks: unknown;
}

/** require 는 any 를 낸다. Metro 가 그림마다 주는 자산 번호를 그림 타입으로 받는다. */
const image = (source: unknown) => source as ImageSourcePropType;

/* eslint-disable @typescript-eslint/no-require-imports -- Metro 가 번들에 넣을 그림은 require 로만 가리킨다 */
export const TWIN_ASSETS: Record<PresetTwinKey, TwinAssets> = {
  yuna: {
    base: image(require("../../assets/twins/yuna/base.jpg")),
    outfit: image(require("../../assets/twins/yuna/outfit.png")),
    mask: image(require("../../assets/twins/yuna/mask.png")),
    landmarks: require("../../assets/twins/yuna/landmarks.json"),
  },
  harin: {
    base: image(require("../../assets/twins/harin/base.jpg")),
    outfit: image(require("../../assets/twins/harin/outfit.png")),
    mask: image(require("../../assets/twins/harin/mask.png")),
    landmarks: require("../../assets/twins/harin/landmarks.json"),
  },
  serin: {
    base: image(require("../../assets/twins/serin/base.jpg")),
    outfit: image(require("../../assets/twins/serin/outfit.png")),
    mask: image(require("../../assets/twins/serin/mask.png")),
    landmarks: require("../../assets/twins/serin/landmarks.json"),
  },
  moa: {
    base: image(require("../../assets/twins/moa/base.jpg")),
    outfit: image(require("../../assets/twins/moa/outfit.png")),
    mask: image(require("../../assets/twins/moa/mask.png")),
    landmarks: require("../../assets/twins/moa/landmarks.json"),
  },
  lulu: {
    base: image(require("../../assets/twins/lulu/base.jpg")),
    outfit: image(require("../../assets/twins/lulu/outfit.png")),
    mask: image(require("../../assets/twins/lulu/mask.png")),
    landmarks: require("../../assets/twins/lulu/landmarks.json"),
  },
  noel: {
    base: image(require("../../assets/twins/noel/base.jpg")),
    outfit: image(require("../../assets/twins/noel/outfit.png")),
    mask: image(require("../../assets/twins/noel/mask.png")),
    landmarks: require("../../assets/twins/noel/landmarks.json"),
  },
};
/* eslint-enable @typescript-eslint/no-require-imports */
