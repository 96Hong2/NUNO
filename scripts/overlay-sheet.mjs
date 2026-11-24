#!/usr/bin/env node
// `pnpm overlay:sheet`: 겹쳐 보기 20장 시험(plan_T4 D16)에 쓸 무대 사진을 만든다.
// 웹 견본 옷 10벌을 옷 넣기 네 단계로 넣고, 하린과 세린에게 한 벌씩 입혀 무대를 찍는다(10벌 x 2트윈).
// 개발 서버(`pnpm web`)가 떠 있어야 한다. 주소는 OVERLAY_URL(기본 http://localhost:8090).
// 결과: docs/plans/evidence/T4/overlay-20/<번호>-<트윈>-<견본 파일>.jpg. 평가자 판정은 사람이 한다.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.OVERLAY_URL ?? "http://localhost:8090";
const FIXTURES = join(root, "e2e/fixtures/garments");
const OUT = join(root, "docs/plans/evidence/T4/overlay-20");
/** 견본 파일과 3/4 에서 고를 종류. 액세서리는 두르는 자리 값이 없어 무대에 그리지 않는다(plan_T4 결정 2). */
const GARMENTS = [
  ["beads-beanie.jpg", "액세서리"],
  ["highneck-knit.jpg", "상의"],
  ["hline-skirt.jpg", "하의"],
  ["hobo-bag.jpg", "가방"],
  ["hood-muffler.jpg", "액세서리"],
  ["knit-stripe.jpg", "상의"],
  ["lavender-padding.jpg", "아우터"],
  ["long-boots.jpg", "신발"],
  ["mustang-jacket.jpg", "아우터"],
  ["person-yuna.jpg", "아우터"],
];
const TWINS = ["하린", "세린"];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const go = (path) => page.goto(`${BASE}${path}`);

await go("/");
await page.getByRole("button", { name: "다음" }).click();
await page.getByRole("button", { name: "닫기" }).click();
await page
  .getByRole("dialog", { name: "처음 둘러보기" })
  .getByRole("button", { name: "닫기" })
  .click();

/** 옷 넣기 네 단계로 「내 옷」 에 넣는다. 이름을 견본 파일 이름으로 바꿔 옷장에서 그 카드를 찾는다. */
async function addGarment(file, category) {
  const name = `시험 ${file.replace(/\.jpg$/, "")}`;
  await go("/fitting/closet?closet=mine");
  await page.getByRole("button", { name: "옷 추가" }).first().click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "앨범에서 고르기" }).click();
  await (await chooser).setFiles(join(FIXTURES, file));
  const crop = page.getByRole("button", { name: "이대로 자르기" });
  const cutout = page.getByRole("heading", { name: "배경을 지웠어요" });
  await crop.or(cutout).first().waitFor({ timeout: 60000 });
  if (await crop.isVisible()) await crop.click();
  await cutout.waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("heading", { name: "어떤 옷인가요?" }).waitFor();
  await page.getByRole("button", { name: category, exact: true }).click();
  await page.getByLabel("이름").fill(name);
  await page.getByRole("radio", { name: /이미 가진 옷/ }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "내 옷에 담기" }).click();
  await page.getByRole("alert").waitFor();
  await page.getByRole("button", { name, exact: true }).click();
  await page.waitForURL(/\/garment\/[^/]+$/);
  return new URL(page.url()).pathname;
}

async function pickTwin(name) {
  await go("/fitting/coordi");
  await page.getByRole("button", { name: /트윈 메뉴 열기$/ }).click();
  await page.getByRole("radio", { name }).click();
  await page.getByRole("radiogroup", { name: "트윈" }).waitFor({ state: "hidden" });
  await page.getByRole("button", { name: `${name}, 트윈 메뉴 열기` }).waitFor();
}

let n = 0;
for (const [file, category] of GARMENTS) {
  const detail = await addGarment(file, category);
  for (const twin of TWINS) {
    await pickTwin(twin);
    // 비우기가 기기에 저장된 뒤에 다음 화면으로 간다.
    await page.getByRole("button", { name: /^입은 옷(이 없어요| 모두 벗기)$/ }).click();
    await page.getByRole("button", { name: "입은 옷이 없어요" }).waitFor();
    await go(detail);
    await page.getByRole("button", { name: "트윈에 입혀 보기" }).click();
    await page.waitForURL(/\/fitting\/coordi$/);
    // 옷장 액세서리처럼 무대에 그리지 않는 옷도 있어, 옷 그림을 기다리지 않고 잠깐 둔 뒤 찍는다.
    await page.waitForTimeout(1500);
    n += 1;
    const name = `${String(n).padStart(2, "0")}-${twin === "하린" ? "harin" : "serin"}-${file.replace(/\.jpg$/, "")}.jpg`;
    await page
      .getByTestId("coordi-stage")
      .screenshot({ path: join(OUT, name), type: "jpeg", quality: 80 });
    console.log("찍음", name);
  }
}
await browser.close();
