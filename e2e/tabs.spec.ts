import { expect, test, type Page } from "@playwright/test";

// 기대값은 로드맵 T1 DoD D16, D17 과 GLOSSARY.md 「탭과 칸」 에서 가져온다.
const TABS = ["홈", "피팅룸", "마이"];
const FITTING_CELLS = [
  { label: "코디", path: "/fitting/coordi" },
  { label: "옷장", path: "/fitting/closet" },
  { label: "트윈", path: "/fitting/twin" },
  { label: "룩북", path: "/fitting/lookbook" },
];

// 하단 탭은 지나간 화면을 inert 로 뒤에 남긴다. 사용자가 보는 화면은 inert 밖에 있다.
const header = (page: Page) => page.locator("h1:not([inert] *)");
const bodyHeading = (page: Page, name: string) =>
  page.locator('[role="heading"][aria-level="2"]:not([inert] *)', { hasText: name });
const bottomTab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
const fittingCells = (page: Page) => page.getByRole("tablist", { name: "피팅룸 칸" });

test("하단 탭 「홈」, 「피팅룸」, 「마이」 를 누르면 머리글에 그 탭 이름이 보인다", async ({
  page,
}) => {
  await page.goto("/");
  for (const name of TABS) {
    await bottomTab(page, name).click();
    await expect(header(page)).toHaveText(name);
  }
});

test("하단에 「탐색」 과 「찜」 탭이 없고 탭은 셋뿐이다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab")).toHaveText(TABS);
  for (const name of ["탐색", "찜"]) {
    await expect(page.getByRole("tab", { name })).toHaveCount(0);
  }
});

test("「피팅룸」 위쪽 네 칸을 누르면 그 칸의 빈 화면이 열리고 「스토어」 칸은 없다", async ({
  page,
}) => {
  await page.goto("/");
  await bottomTab(page, "피팅룸").click();
  await expect(header(page)).toHaveText("피팅룸");

  const cells = fittingCells(page);
  await expect(cells.getByRole("tab")).toHaveText(FITTING_CELLS.map((cell) => cell.label));
  await expect(page.getByRole("tab", { name: "스토어" })).toHaveCount(0);

  for (const { label, path } of FITTING_CELLS) {
    await cells.getByRole("tab", { name: label, exact: true }).click();
    await expect(page).toHaveURL(path);
    await expect(bodyHeading(page, label)).toHaveText(label);
    await expect(cells.getByRole("tab", { name: label, exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  }
});
