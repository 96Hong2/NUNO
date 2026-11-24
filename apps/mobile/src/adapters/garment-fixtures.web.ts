import type { Rect } from "@nuno/wardrobe";
import { Asset } from "expo-asset";

/**
 * 웹 화면 테스트의 견본 옷 사진. 원본은 `e2e/fixtures/garments/<키>.jpg`, 미리 만든 누끼는 `assets/dev-garments/<키>.webp` 다.
 * 키는 원본 파일의 SHA-256 이다. 원본을 바꾸면 해시도 다시 적는다.
 * 사람 사진(person-yuna)은 프리셋 트윈 유나의 기본 코디 그림이다. 누끼는 MediaPipe 사람 분할로, face 는 몸 점의 얼굴 자리로 잡았다.
 * 이 파일은 웹 어댑터만 불러서 아이폰 설치 파일에는 들어가지 않는다.
 */
export interface GarmentFixture {
  cutoutUri: string;
  face: Rect | null;
}

const fixture = (module: number, face: Rect | null): GarmentFixture => ({
  cutoutUri: Asset.fromModule(module).uri,
  face,
});

/* eslint-disable @typescript-eslint/no-require-imports -- Metro 가 번들에 넣을 그림은 require 로만 가리킨다 */
export const GARMENT_FIXTURES: Record<string, GarmentFixture | undefined> = {
  // mustang-jacket
  ec2444d3c40ddbebecaf5d4ae6fdd9bfdaab85f03b43817087b4c0bb510a4ba2: fixture(
    require("../../assets/dev-garments/mustang-jacket.webp") as number,
    null,
  ),
  // lavender-padding
  "8005fbd038c5d8a9103073469aa68f12b047671a2ad7389e956b546d9be7da2f": fixture(
    require("../../assets/dev-garments/lavender-padding.webp") as number,
    null,
  ),
  // highneck-knit
  "591606d3eb3039c406c64605ebd61629a2b37611942a5297b79bcd84f88e376b": fixture(
    require("../../assets/dev-garments/highneck-knit.webp") as number,
    null,
  ),
  // hline-skirt
  "4ea1ab1ac36a4b80cc5c6864ea4e20780ea7da48b65a58728e638e45e76951eb": fixture(
    require("../../assets/dev-garments/hline-skirt.webp") as number,
    null,
  ),
  // long-boots
  b146c78636a5015529e85c5a72d313fbaf8585392b9304a8bf7b4bc28478caa6: fixture(
    require("../../assets/dev-garments/long-boots.webp") as number,
    null,
  ),
  // hobo-bag
  c8370522c78ddae2bf7927a6dfb8b539c90ed016621ab408321258bf28a2314b: fixture(
    require("../../assets/dev-garments/hobo-bag.webp") as number,
    null,
  ),
  // beads-beanie
  "17fb7dda6503bf8d81a4a215443c43a6d86a6f62a6ef349db569987469a0d014": fixture(
    require("../../assets/dev-garments/beads-beanie.webp") as number,
    null,
  ),
  // hood-muffler
  a2e66b13fecc0c5cfd92cc1d62b57058e47b35687ae8aea4ddc02f1472635620: fixture(
    require("../../assets/dev-garments/hood-muffler.webp") as number,
    null,
  ),
  // knit-stripe
  "9cc766d0dba0c02226ad00702b6e3fb3c0fa391e22671dcbf308d171ae3a741d": fixture(
    require("../../assets/dev-garments/knit-stripe.webp") as number,
    null,
  ),
  // person-yuna
  fec4968105ecc659f439aa0e3bed33683caf49781682c1408e8c5c9a813bbdd1: fixture(
    require("../../assets/dev-garments/person-yuna.webp") as number,
    { x: 0.4293, y: 0.0361, width: 0.1483, height: 0.2029 },
  ),
};
/* eslint-enable @typescript-eslint/no-require-imports */
