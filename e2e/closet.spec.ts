import { expect, test, type Page } from "@playwright/test";

// 기대값은 로드맵 T3 DoD(plan_T3 D3~D10)에서 가져온다. 견본 사진은 e2e/fixtures/garments 에 있다.
const FIXTURES = "e2e/fixtures/garments";

const segment = (page: Page, label: "내 옷" | "담은 옷") =>
  page.getByRole("button", { name: new RegExp(`^${label} \\d+$`) });

async function openCloset(page: Page) {
  await page.goto("/");
  await page.getByRole("tab", { name: "피팅룸" }).click();
  await page.getByRole("tablist", { name: "피팅룸 칸" }).getByRole("tab", { name: "옷장" }).click();
}

test("앨범 사진을 담은 옷에 담고, 「옷장에서 보기」 로 그 칸을 열고, 내 옷으로 옮기면 상세 단추가 바뀐다", async ({
  page,
}) => {
  await openCloset(page);
  await expect(page.getByText("아직 넣은 옷이 없어요")).toBeVisible();

  await page.getByRole("button", { name: "옷 추가" }).last().click();
  const sheet = page.getByRole("dialog", { name: "옷을 어떻게 넣을까요?" });
  await expect(sheet.getByRole("button", { name: "사진 찍기" })).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await sheet.getByRole("button", { name: "앨범에서 고르기" }).click();
  await (await chooser).setFiles(`${FIXTURES}/knit-stripe.jpg`);

  await expect(page.getByRole("heading", { name: "배경을 지웠어요" })).toBeVisible();
  for (const tool of ["지우기", "되살리기", "자르기", "돌리기"]) {
    await expect(page.getByRole("button", { name: tool, exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "다음" }).click();

  await expect(page.getByRole("heading", { name: "어떤 옷인가요?" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "브라운" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: "사고 싶은 옷" }).click();
  await page.getByLabel("브랜드").fill("모노웨일");
  await page.getByRole("button", { name: "다음" }).click();

  await expect(page.getByRole("heading", { name: "트윈에 맞춰 볼게요" })).toBeVisible();
  await page.getByRole("button", { name: "담은 옷에 담기" }).click({ clickCount: 5 });

  const toast = page.getByRole("alert");
  await expect(toast).toContainText("담은 옷에 넣었어요");
  await toast.getByRole("button", { name: "옷장에서 보기" }).click();
  await expect(segment(page, "담은 옷")).toHaveAttribute("aria-pressed", "true");
  await expect(segment(page, "담은 옷")).toHaveText(/담은 옷 1/);
  await expect(page.getByText("모노웨일")).toBeVisible();
  await expect(page.getByText("담은 옷", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "여러 벌 옮기기" }).click();
  await page.getByRole("checkbox").first().click();
  await page.getByRole("button", { name: "내 옷으로 옮기기 1" }).click();
  await expect(segment(page, "내 옷")).toHaveText(/내 옷 1/);
  await expect(segment(page, "담은 옷")).toHaveText(/담은 옷 0/);
  await expect(page.getByText("아직 담은 옷이 없어요")).toBeVisible();

  await segment(page, "내 옷").click();
  await page.getByRole("button", { name: "브라운 상의" }).click();
  await expect(page.getByRole("button", { name: "내 옷에 있어요" })).toBeVisible();

  // 새로고침해도 옷과 칸이 남는다.
  await page.reload();
  await expect(page.getByRole("heading", { name: "브라운 상의" })).toBeVisible();
});
