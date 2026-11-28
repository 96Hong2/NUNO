import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

// 설정 「사진 보관 안내」 시트와 동의 화면의 보관 기간. 기대값은 로드맵 T7 DoD D34 와 와이어프레임 v29 시트 문구다.
// v29 의 「내 사진으로 만들기」 줄은 앱에 없는 기능이라 시트에 두지 않는다.
// 보관 기간은 서버의 공급사 설정 줄 값이다. 시험은 보관 기간이 다른 새 줄을 켜고 옛 줄을 끈 뒤, 끝나면 되돌린다.
// 판을 올리는 길은 쓰지 않는다. 판은 내리지 못해, 뒤에 도는 시험의 앱 판(1)이 서버 판과 어긋난다.

const RETENTION_VERSION = "e2e-retention";

function sql(query: string): string {
  return execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "postgres",
      "-d",
      "nuno_e2e",
      "-t",
      "-A",
      "-c",
      query,
    ],
    { encoding: "utf8" },
  ).trim();
}

const retentionSheet = (page: Page) => page.getByRole("dialog", { name: "사진 보관 안내" });

async function openRetentionSheet(page: Page) {
  await page.getByRole("button", { name: "사진 보관 안내" }).click();
  await expect(retentionSheet(page)).toContainText(
    "옷 추가에 쓴 원본 사진은 배경을 지운 뒤 기기에서 지워요.",
  );
  await expect(retentionSheet(page)).toContainText(
    "옷 추가는 배경을 지운 옷 이미지만, 트윈은 고른 기본 모습만 저장해요.",
  );
}

const sentTo = (days: number) => `AI 업체 서버의 보관 기간은 ${days}일이에요.`;

test("D34: 설정 「사진 보관 안내」 는 AI 업체 서버의 보관 기간을 서버가 준 값으로 보이고, 서버 값이 바뀌면 시트와 동의 화면이 함께 바뀐다", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "피팅룸" }).click();
  await page.getByRole("button", { name: "이대로 입히기" }).click();
  await page
    .getByRole("dialog", { name: "완성 룩을 만들려면 가입이 필요해요" })
    .getByRole("button", { name: "시험 계정으로 계속하기" })
    .click();
  await expect(page.getByText("받은 자료는 30일 두고 지워요")).toBeVisible();
  await page.getByRole("button", { name: "뒤로" }).click();

  await page.getByRole("tab", { name: "마이" }).click();
  await page.getByRole("button", { name: "설정" }).click();
  await openRetentionSheet(page);
  await expect(retentionSheet(page)).toContainText(sentTo(30));
  await retentionSheet(page).getByRole("button", { name: "닫기" }).click();
  await expect(retentionSheet(page)).toHaveCount(0);

  sql(`INSERT INTO provider_configs
         (provider, model, model_version, mode, priority, country, max_concurrency, price_usd,
          enabled, retention_days)
       VALUES ('fake', 'fake', '${RETENTION_VERSION}', 'sync', 1, '대한민국', 4, 0.04, true, 7)`);
  try {
    sql(
      `UPDATE provider_configs SET enabled = false WHERE model_version <> '${RETENTION_VERSION}'`,
    );
    await openRetentionSheet(page);
    await expect(retentionSheet(page)).toContainText(sentTo(7));
    await expect(retentionSheet(page)).not.toContainText("30일");
    await retentionSheet(page).getByRole("button", { name: "닫기" }).click();

    // 아직 동의하지 않은 계정이라 「완성 룩 만들기 동의」 줄이 동의 화면을 연다. 동의는 누르지 않는다.
    await page.getByRole("button", { name: /완성 룩 만들기 동의/ }).click();
    await expect(page.getByText("받은 자료는 7일 두고 지워요")).toBeVisible();
    await page.getByRole("button", { name: "뒤로" }).click();

    // 켜 둔 공급사 줄이 없으면 보관 기간 대신 다시 불러오기를 보인다.
    sql("UPDATE provider_configs SET enabled = false");
    await openRetentionSheet(page);
    await expect(retentionSheet(page)).toContainText("보관 기간을 불러오지 못했어요");
    await expect(retentionSheet(page)).not.toContainText("AI 업체 서버의 보관 기간");
  } finally {
    sql(`DELETE FROM provider_configs WHERE model_version = '${RETENTION_VERSION}'`);
    sql("UPDATE provider_configs SET enabled = true WHERE provider = 'fake'");
  }
  await retentionSheet(page).getByRole("button", { name: "다시 불러오기" }).click();
  await expect(retentionSheet(page)).toContainText(sentTo(30));
});
