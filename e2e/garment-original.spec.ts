import { expect, test } from "@playwright/test";

// 옷 추가에 쓴 원본 사진은 배경을 지운 뒤 기기에서 지운다.
// 웹은 옷 그림을 OPFS `garments/<옷 ID>/` 에 쓴다. 옷을 추가한 뒤 그 폴더에 누끼와 카드 그림만 남았는지 본다.

interface OpfsEntry {
  kind: string;
}
interface OpfsDirectory extends OpfsEntry {
  entries(): AsyncIterable<[string, OpfsEntry]>;
  getDirectoryHandle(name: string): Promise<OpfsDirectory>;
}

test("앨범 사진으로 옷을 추가하면 옷 폴더에 원본 사진이 남지 않고 누끼와 카드 그림만 남는다", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "피팅룸" }).click();
  await page.getByRole("tablist", { name: "피팅룸 칸" }).getByRole("tab", { name: "옷장" }).click();

  await page.getByRole("button", { name: "옷 추가" }).last().click();
  const sheet = page.getByRole("dialog", { name: "옷을 어떻게 추가할까요?" });
  const chooser = page.waitForEvent("filechooser");
  await sheet.getByRole("button", { name: "앨범에서 고르기" }).click();
  await (await chooser).setFiles("e2e/fixtures/garments/knit-stripe.jpg");

  await expect(page.getByRole("heading", { name: "배경을 지웠어요" })).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByRole("heading", { name: "어떤 옷인가요?" })).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByRole("heading", { name: "트윈에 맞춰 보세요" })).toBeVisible();
  await page.getByRole("button", { name: "내 옷에 추가" }).click();
  await expect(page.getByRole("heading", { name: "내 옷에 추가했어요" })).toBeVisible();

  const files = await page.evaluate(async () => {
    const storage = (
      globalThis as unknown as { navigator: { storage: { getDirectory(): Promise<OpfsDirectory> } } }
    ).navigator.storage;
    const garments = await (await storage.getDirectory()).getDirectoryHandle("garments");
    const names: string[] = [];
    for await (const [id, entry] of garments.entries()) {
      if (entry.kind !== "directory") continue;
      for await (const [name] of (entry as OpfsDirectory).entries()) names.push(`${id}/${name}`);
    }
    return names.sort();
  });
  expect(files).toHaveLength(2);
  expect(files.map((path) => path.split("/")[1])).toEqual(["cutout.png", "thumb.png"]);
});
