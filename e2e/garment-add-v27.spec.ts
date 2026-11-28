import { expect, test, type Page } from "@playwright/test";

// 기대값은 와이어프레임 v27 의 옷 추가 화면(옷장 칸 수 줄은 v28)과 시안 v2 명세 4(옷 정보, 트윈에 맞춰 보기)에서 가져온다.
test.use({ viewport: { width: 390, height: 844 } });

const FIXTURES = "e2e/fixtures/garments";

const segment = (page: Page, label: "내 옷" | "담은 옷") =>
  page.getByRole("button", { name: new RegExp(`^${label} \\d+$`) });

/** 옷장 「옷 추가」 → 「옷을 어떻게 추가할까요?」 → 「앨범에서 고르기」 로 2 / 4 를 연다. */
async function openCutout(page: Page) {
  await page.goto("/");
  await page.getByRole("tab", { name: "피팅룸" }).click();
  await page.getByRole("tablist", { name: "피팅룸 칸" }).getByRole("tab", { name: "옷장" }).click();
  await page.getByRole("button", { name: "옷 추가", exact: true }).first().click();
  const sheet = page.getByRole("dialog", { name: "옷을 어떻게 추가할까요?" });
  await expect(sheet.getByRole("heading", { name: "옷을 어떻게 추가할까요?" })).toBeVisible();
  await expect(sheet.getByText("내 옷장 0 / 100칸", { exact: true })).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await sheet.getByRole("button", { name: "앨범에서 고르기" }).click();
  await (await chooser).setFiles(`${FIXTURES}/knit-stripe.jpg`);
  await expect(page.getByRole("heading", { name: "배경을 지웠어요" })).toBeVisible();
}

test("배경 지우기에서 뒤로 가면 「추가하던 옷을 삭제할까요?」 가 뜨고, 「삭제」 를 누르면 옷장으로 돌아간다", async ({
  page,
}) => {
  await openCutout(page);

  // 뒤로 → 확인 시트. 「계속 추가」 는 시트만 닫는다.
  await page.getByRole("button", { name: "뒤로" }).click();
  const discard = page.getByRole("dialog", { name: "추가하던 옷을 삭제할까요?" });
  await expect(discard.getByRole("button", { name: "삭제" })).toBeVisible();
  await expect(discard.getByRole("button", { name: "계속 추가" })).toBeVisible();
  await discard.getByRole("button", { name: "계속 추가" }).click();
  await expect(discard).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "배경을 지웠어요" })).toBeVisible();

  // 「삭제」 는 추가하던 옷을 담지 않고 옷장으로 돌아간다.
  await page.getByRole("button", { name: "뒤로" }).click();
  await discard.getByRole("button", { name: "삭제" }).click();
  await expect(page.getByRole("heading", { name: "배경을 지웠어요" })).toHaveCount(0);
  await expect(segment(page, "내 옷")).toHaveText(/내 옷 0/);
  await expect(segment(page, "담은 옷")).toHaveText(/담은 옷 0/);
});

test("이름을 비우고 「다음」 을 누르면 칸 아래 오류가 뜨고, 「내 옷에 추가」 를 누르면 「내 옷에 추가했어요」 화면이 열린다", async ({
  page,
}) => {
  await openCutout(page);
  await page.getByRole("button", { name: "다음" }).click();

  // 안내, 소유 질문, 접힌 「정보 더 넣기」
  await expect(page.getByRole("heading", { name: "어떤 옷인가요?" })).toBeVisible();
  await expect(
    page.getByText("종류와 색은 사진을 보고 채웠어요. 다르면 바꿔 주세요"),
  ).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "이 옷을 가지고 있나요?" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "이미 가진 옷" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByRole("textbox", { name: "브랜드" })).toHaveCount(0);

  // 옷 추가 시트가 닫힌 뒤에도 입력칸 초점을 빼앗기지 않아야 이름을 지울 수 있다.
  const name = page.getByRole("textbox", { name: "이름" });
  await name.clear();
  await expect(name).toHaveValue("");
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByText("이름을 적어 주세요", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "어떤 옷인가요?" })).toBeVisible();

  await name.fill("브라운 스트라이프 니트");
  await expect(page.getByText("이름을 적어 주세요", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "정보 더 넣기" }).click();
  await page.getByRole("textbox", { name: "브랜드" }).fill("모노웨일");
  await expect(page.getByText("브랜드 넣음", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click();

  // 제목, 접힌 치수 줄, 마지막 단추
  await expect(page.getByRole("heading", { name: "트윈에 맞춰 보세요" })).toBeVisible();
  await expect(page.getByText("옷을 끌어 옮기고 두 손가락으로 크기를 바꿔요")).toBeVisible();
  await expect(page.getByRole("button", { name: "치수로 더 정확하게 맞추기" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "총장" })).toHaveCount(0);
  await page.getByRole("button", { name: "내 옷에 추가" }).click({ clickCount: 3 });

  await expect(page.getByRole("heading", { name: "내 옷에 추가했어요" })).toBeVisible();
  await expect(page.getByText("브라운 스트라이프 니트", { exact: true })).toBeVisible();
  await expect(
    page.getByText("사진으로 계산한 크기로 입혀요. 내 옷장 1 / 100칸", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "이 옷으로 코디하기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "한 벌 더 넣기" })).toBeVisible();

  // X 는 그 옷이 든 옷장 칸으로 간다. 연타해도 한 벌만 들어간다.
  await page.getByRole("button", { name: "닫기" }).click();
  await expect(segment(page, "내 옷")).toHaveAttribute("aria-pressed", "true");
  await expect(segment(page, "내 옷")).toHaveText(/내 옷 1/);
});

test("「사고 싶은 옷」 으로 고르면 「담은 옷에 추가」 뒤 「담은 옷에 추가했어요」 가 열리고, X 는 담은 옷 칸으로 간다", async ({
  page,
}) => {
  await openCutout(page);
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("radio", { name: "사고 싶은 옷" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "담은 옷에 추가" }).click();

  await expect(page.getByRole("heading", { name: "담은 옷에 추가했어요" })).toBeVisible();
  await expect(
    page.getByText("사진으로 계산한 크기로 입혀요. 내 옷장 1 / 100칸", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "한 벌 더 넣기" })).toBeVisible();
  await page.getByRole("button", { name: "닫기" }).click();
  await expect(segment(page, "담은 옷")).toHaveAttribute("aria-pressed", "true");
  await expect(segment(page, "담은 옷")).toHaveText(/담은 옷 1/);
});
