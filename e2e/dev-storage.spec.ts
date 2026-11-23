import { expect, test, type Page } from "@playwright/test";

// 기대값은 로드맵 T1 DoD D18 과 plan_T1.md 「기술 검토 결과」 에서 가져온다.
// 같은 기기 DB(OPFS)를 탭 둘이 열면 잠기므로 페이지 하나로만 돈다.

const isolated = (page: Page) =>
  page.evaluate(() => (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated);

test("「저장소 보기」 에서 「시험 값 쓰기」 로 쓴 값이 새로고침 뒤에도 남는다", async ({
  page,
}) => {
  // 사용자처럼 첫 화면에서 「마이」 탭을 거쳐 연다.
  await page.goto("/");
  await page.getByRole("tab", { name: "마이", exact: true }).click();
  await page.getByRole("link", { name: /저장소 보기/ }).click();
  await expect(page.locator("h1:not([inert] *)")).toHaveText("저장소 보기");
  await expect(page.getByText(/^어댑터: (expo-sqlite|wa-sqlite)$/)).toBeVisible();
  const isolatedBefore = await isolated(page);

  const probes = page.getByLabel("dev_probe 값");
  const before = await probes.getByText(/^probe-/).count();
  await page.getByRole("button", { name: "시험 값 쓰기" }).click();
  await expect(probes.getByText(/^probe-.+ = 시험 값$/)).toHaveCount(before + 1);
  const written =
    (await probes
      .getByText(/^probe-/)
      .last()
      .textContent()) ?? "";

  await page.reload();
  await expect(page.getByText(/^어댑터: /)).toBeVisible();
  await expect(probes.getByText(written, { exact: true })).toBeVisible();
  await expect(page.getByLabel("표마다 행 수").getByText(/^dev_probe: \d+행$/)).toBeVisible();

  console.log(
    `crossOriginIsolated 쓰기 때=${String(isolatedBefore)} 새로고침 뒤=${String(await isolated(page))}`,
  );
  console.log(`새로고침 뒤 남은 값: ${written}`);
});

test("웹 기기 DB 도 같은 키 두 번과 value 의 NULL 을 막고, 실패한 트랜잭션을 되돌린다", async ({
  page,
}) => {
  await page.goto("/dev/storage");
  await expect(page.getByText(/^어댑터: /)).toBeVisible();
  await page.getByRole("button", { name: "제약 확인" }).click();

  const results = page.getByLabel("제약 확인 결과");
  await expect(results.getByText(/^같은 키 두 번: 막힘/)).toBeVisible();
  await expect(results.getByText(/^value 에 NULL: 막힘/)).toBeVisible();
  // SqlDatabase 계약: 던진 트랜잭션은 되돌리고, 그동안 밖에서 부른 쓰기는 따로 남는다.
  await expect(
    results.getByText("중간에 실패한 트랜잭션: 막힘 (안 0줄, 밖 1줄)", { exact: true }),
  ).toBeVisible();
  console.log((await results.innerText()).trim());
});
