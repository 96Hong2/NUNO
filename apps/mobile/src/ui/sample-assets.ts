import type { SampleGarmentKey } from "@nuno/outfit";
import type { ImageSourcePropType } from "react-native";

// 설치 파일에 넣는 견본 옷 그림과 추천 코디 착장 사진. Metro 는 고정 문자열 require 만 번들에 넣는다.
// 견본 옷 키가 하나라도 빠지면 Record 타입이 막는다. 원본은 기획 폴더 와이어프레임 v26 빌드 원본이다.

const image = (source: unknown) => source as ImageSourcePropType;

/* eslint-disable @typescript-eslint/no-require-imports -- Metro 가 번들에 넣을 그림은 require 로만 가리킨다 */
export const SAMPLE_GARMENT_IMAGES: Record<SampleGarmentKey, ImageSourcePropType> = {
  w01: image(require("../../assets/sample-garments/w01.webp")),
  w02: image(require("../../assets/sample-garments/w02.webp")),
  w03: image(require("../../assets/sample-garments/w03.webp")),
  w04: image(require("../../assets/sample-garments/w04.webp")),
  w05: image(require("../../assets/sample-garments/w05.webp")),
  w06: image(require("../../assets/sample-garments/w06.webp")),
  w07: image(require("../../assets/sample-garments/w07.webp")),
  w08: image(require("../../assets/sample-garments/w08.webp")),
  w09: image(require("../../assets/sample-garments/w09.webp")),
  w10: image(require("../../assets/sample-garments/w10.webp")),
  w11: image(require("../../assets/sample-garments/w11.webp")),
  w14: image(require("../../assets/sample-garments/w14.webp")),
  w18: image(require("../../assets/sample-garments/w18.webp")),
  w19: image(require("../../assets/sample-garments/w19.webp")),
  w20: image(require("../../assets/sample-garments/w20.webp")),
  w21: image(require("../../assets/sample-garments/w21.webp")),
  w22: image(require("../../assets/sample-garments/w22.webp")),
  w23: image(require("../../assets/sample-garments/w23.webp")),
  w24: image(require("../../assets/sample-garments/w24.webp")),
  w25: image(require("../../assets/sample-garments/w25.webp")),
  w26: image(require("../../assets/sample-garments/w26.webp")),
  w27: image(require("../../assets/sample-garments/w27.webp")),
  w28: image(require("../../assets/sample-garments/w28.webp")),
  w29: image(require("../../assets/sample-garments/w29.webp")),
  w32: image(require("../../assets/sample-garments/w32.webp")),
  w36: image(require("../../assets/sample-garments/w36.webp")),
  w37: image(require("../../assets/sample-garments/w37.webp")),
  w38: image(require("../../assets/sample-garments/w38.webp")),
  w39: image(require("../../assets/sample-garments/w39.webp")),
  w40: image(require("../../assets/sample-garments/w40.webp")),
  w41: image(require("../../assets/sample-garments/w41.webp")),
  w42: image(require("../../assets/sample-garments/w42.webp")),
  w43: image(require("../../assets/sample-garments/w43.webp")),
  w44: image(require("../../assets/sample-garments/w44.webp")),
  w45: image(require("../../assets/sample-garments/w45.webp")),
  w46: image(require("../../assets/sample-garments/w46.webp")),
  w47: image(require("../../assets/sample-garments/w47.webp")),
  w48: image(require("../../assets/sample-garments/w48.webp")),
  w49: image(require("../../assets/sample-garments/w49.webp")),
  w50: image(require("../../assets/sample-garments/w50.webp")),
  w51: image(require("../../assets/sample-garments/w51.webp")),
  w52: image(require("../../assets/sample-garments/w52.webp")),
  w53: image(require("../../assets/sample-garments/w53.webp")),
  w54: image(require("../../assets/sample-garments/w54.webp")),
  w55: image(require("../../assets/sample-garments/w55.webp")),
  w56: image(require("../../assets/sample-garments/w56.webp")),
  w57: image(require("../../assets/sample-garments/w57.webp")),
  w58: image(require("../../assets/sample-garments/w58.webp")),
  w59: image(require("../../assets/sample-garments/w59.webp")),
  w60: image(require("../../assets/sample-garments/w60.webp")),
  w61: image(require("../../assets/sample-garments/w61.webp")),
  w62: image(require("../../assets/sample-garments/w62.webp")),
  w63: image(require("../../assets/sample-garments/w63.webp")),
  w64: image(require("../../assets/sample-garments/w64.webp")),
  w65: image(require("../../assets/sample-garments/w65.webp")),
};

/** 트윈이 추천 코디를 실제로 입은 사진(분홍 바탕, 기본 사진과 같은 구도). 키는 「<트윈>-<코디>」 다. */
export const LOOK_PHOTOS: Record<string, ImageSourcePropType | undefined> = {
  "harin-co": image(require("../../assets/looks/harin-co.webp")),
  "harin-p07": image(require("../../assets/looks/harin-p07.webp")),
  "lulu-co": image(require("../../assets/looks/lulu-co.webp")),
  "lulu-d7": image(require("../../assets/looks/lulu-d7.webp")),
  "moa-co": image(require("../../assets/looks/moa-co.webp")),
  "moa-d5": image(require("../../assets/looks/moa-d5.webp")),
  "noel-co": image(require("../../assets/looks/noel-co.webp")),
  "noel-d5": image(require("../../assets/looks/noel-d5.webp")),
  "serin-co": image(require("../../assets/looks/serin-co.webp")),
  "serin-d1": image(require("../../assets/looks/serin-d1.webp")),
  "yuna-co": image(require("../../assets/looks/yuna-co.webp")),
  "yuna-d1": image(require("../../assets/looks/yuna-d1.webp")),
};
/* eslint-enable @typescript-eslint/no-require-imports */
