import { describe, expect, it } from "vitest";
import { createFakeProvider } from "../adapters/fake-provider.ts";
import type { GenerationProvider } from "../generation/provider.ts";
import { checkScoringFolder } from "./check-scoring.ts";
import { parseCsv } from "./csv.ts";
import { buildReport, finalJudgement, outsideAgreement } from "./report.ts";
import { runTrial, type TrialIo, type TrialRequest } from "./run-trial.ts";
import { metadataLeft, stripMetadata } from "./strip-metadata.ts";

/** 메모리 파일 시스템. 무작위 이름은 차례 번호, 섞기는 고정 수열이다 */
function memoryIo() {
  const files = new Map<string, Uint8Array | string>();
  let n = 0;
  let r = 0;
  const io: TrialIo = {
    readFile: (path) => Promise.resolve(new Uint8Array([path.length])),
    readText: (path) => Promise.resolve((files.get(path) as string | undefined) ?? null),
    writeFile: (path, bytes) => {
      files.set(path, bytes);
      return Promise.resolve();
    },
    moveFile: (from, to) => {
      const bytes = files.get(from);
      if (bytes === undefined) return Promise.resolve(false);
      files.delete(from);
      files.set(to, bytes);
      return Promise.resolve(true);
    },
    exists: (path) => Promise.resolve(files.has(path)),
    writeText: (path, text) => {
      files.set(path, text);
      return Promise.resolve();
    },
    appendText: (path, text) => {
      files.set(path, ((files.get(path) as string | undefined) ?? "") + text);
      return Promise.resolve();
    },
    lock: (path) => {
      if (files.has(path)) return Promise.reject(new Error("잠김"));
      files.set(path, "");
      return Promise.resolve(() => {
        files.delete(path);
        return Promise.resolve();
      });
    },
    randomName: () => `r${String((n += 1)).padStart(3, "0")}`,
    random: () => [0.7, 0.1, 0.5, 0.9, 0.3][(r += 1) % 5] ?? 0,
    now: () => Date.UTC(2026, 10, 25),
  };
  return { io, files };
}

const request = (
  id: string,
  model: TrialRequest["model"],
  extra: Partial<TrialRequest> = {},
): TrialRequest => ({
  id,
  input: `in-${id}`,
  set: "select",
  model,
  twinKind: "realistic",
  garmentSource: "product",
  items: 1,
  attempt: 1,
  twinImage: "twin.jpg",
  garmentImages: ["g.jpg"],
  prompt: "",
  ...extra,
});

/** EXIF 덩어리가 든 JPEG 를 주는 공급사. 메타데이터 지우기가 빈 시험이 되지 않게 한다 */
const EXIF_JPEG = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0xff, 0xda, 0x00, 0x02,
  0x11, 0xff, 0xd9,
]);
const exifProvider = (costUsd: number): GenerationProvider => ({
  name: "exif",
  generate: () =>
    Promise.resolve({ kind: "succeeded", image: EXIF_JPEG, mimeType: "image/jpeg", costUsd }),
});

const providers = {
  seedream: exifProvider(0.035),
  sunburst: createFakeProvider("refuse"),
  flare: createFakeProvider("succeed"),
};
const CAPS = { seedream: 2, sunburst: 2, flare: 1 };
const paths = { ledgerPath: "ledger/calls.csv", scoringDir: "out/scoring", caps: CAPS };

describe("반증 실험 호출 스크립트", () => {
  it("모델 상한에 닿으면 그 모델은 부르지 않고, 폴더를 바꿔 다시 돌려도 같은 장부로 센다", async () => {
    const { io, files } = memoryIo();
    const list = [request("a", "seedream"), request("b", "seedream"), request("c", "seedream")];
    const first = await runTrial(list, providers, paths, io);
    expect(first).toMatchObject({ called: 2, capped: { seedream: 1 } });
    const again = await runTrial(list, providers, { ...paths, scoringDir: "out2/scoring" }, io);
    expect(again).toMatchObject({ called: 0, skipped: 2, capped: { seedream: 1 } });
    const calls = parseCsv(files.get("ledger/calls.csv") as string);
    // 차례를 섞으므로 셋 가운데 어느 둘인지는 섞기에 달렸다. 장부에는 서로 다른 두 요청만 있다.
    const called = new Set(calls.map((row) => row.request_id));
    expect(called.size).toBe(2);
    expect([...called].every((id) => ["a", "b", "c"].includes(id ?? ""))).toBe(true);
    expect(files.has("ledger/calls.csv.lock")).toBe(false);
  });

  it("도중에 끊긴 호출은 다시 부르지 않고 알리며 상한에 센다", async () => {
    const { io, files } = memoryIo();
    await runTrial([request("a", "flare")], providers, paths, io);
    const lines = (files.get("ledger/calls.csv") as string).split("\n");
    files.set("ledger/calls.csv", `${lines.slice(0, 2).join("\n")}\n`);
    const result = await runTrial(
      [request("a", "flare"), request("b", "flare")],
      providers,
      paths,
      io,
    );
    expect(result).toMatchObject({ called: 0, interrupted: ["a"], capped: { flare: 1 } });
  });

  it("잠금 파일이 있으면, 상한 표에 없는 모델이 있으면 한 건도 부르지 않는다", async () => {
    const { io, files } = memoryIo();
    files.set("ledger/calls.csv.lock", "");
    await expect(runTrial([request("a", "seedream")], providers, paths, io)).rejects.toThrow();
    files.delete("ledger/calls.csv.lock");
    const unknown = { ...request("a", "seedream"), model: "fashn" } as unknown as TrialRequest;
    await expect(
      runTrial([request("b", "seedream"), unknown], providers, paths, io),
    ).rejects.toThrow("상한 표에 없는 모델");
    expect(files.has("ledger/calls.csv")).toBe(false);
  });

  it("채점 폴더에는 무작위 이름의 메타데이터 없는 그림과 모델을 가린 CSV 만 남는다", async () => {
    const { io, files } = memoryIo();
    await runTrial([request("a", "seedream"), request("b", "sunburst")], providers, paths, io);
    const scoringCsv = files.get("out/scoring/scoring.csv") as string;
    expect(parseCsv(scoringCsv).map((row) => row.file)).toEqual(["r001.jpg"]);
    expect(scoringCsv).not.toMatch(/seedream|sunburst|exif|0\.035|refused/);
    expect([...(files.get("out/scoring/r001.jpg") as Uint8Array)]).toEqual([
      0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0x11, 0xff, 0xd9,
    ]);
    const calls = parseCsv(files.get("ledger/calls.csv") as string).filter(
      (row) => row.status !== "calling",
    );
    expect(calls.map((row) => [row.model, row.status, row.file, row.cost_usd]).sort()).toEqual([
      ["seedream", "succeeded", "r001.jpg", "0.035"],
      ["sunburst", "refused", "", ""],
    ]);
  });

  it("D5 검사는 무작위가 아닌 이름, 남은 EXIF, 모델 열, 섞인 형식을 찾는다", () => {
    const good = {
      name: "0b5c5f2e-1111-4222-8333-444455556666.jpg",
      bytes: stripMetadata(EXIF_JPEG).bytes,
    };
    const csv = "file,input,normal\n0b5c5f2e-1111-4222-8333-444455556666.jpg,in-a,\n";
    expect(checkScoringFolder([good], csv)).toEqual([]);
    const bad = checkScoringFolder(
      [good, { name: "seedream-1.jpg", bytes: EXIF_JPEG }],
      "file,model\nseedream-1.jpg,seedream\n",
    );
    expect(bad.join("\n")).toMatch(/무작위 이름이 아니다/);
    expect(bad.join("\n")).toMatch(/메타데이터 덩어리 APP1 가 남았다: seedream-1\.jpg/);
    expect(bad.join("\n")).toMatch(/모델을 드러내는 열이 있다: model/);
  });

  it("JPEG 은 색 프로파일(APP2)을 남기고, PNG 는 글 덩어리를 뺀다", () => {
    const iccId = [..."ICC_PROFILE\0"].map((c) => c.charCodeAt(0));
    const icc = [0xff, 0xe2, 0x00, 2 + iccId.length + 2, ...iccId, 0x01, 0x01];
    const jpeg = Uint8Array.from([0xff, 0xd8, ...icc, 0xff, 0xda, 0x00, 0x02, 0x11, 0xff, 0xd9]);
    expect([...stripMetadata(jpeg).bytes]).toEqual([...jpeg]);

    const chunk = (type: string, data: number[]) => [
      ...[0, 0, 0, data.length],
      ...[...type].map((c) => c.charCodeAt(0)),
      ...data,
      ...[0, 0, 0, 0],
    ];
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const keep = [...chunk("IHDR", [1, 2]), ...chunk("IDAT", [3]), ...chunk("IEND", [])];
    const png = Uint8Array.from([...sig, ...chunk("tEXt", [65, 66]), ...keep]);
    expect([...stripMetadata(png).bytes]).toEqual([...sig, ...keep]);
    expect(() => stripMetadata(Uint8Array.from([0x52, 0x49, 0x46, 0x46]))).toThrow();
  });
});

describe("반증 실험 호출 스크립트: 장부가 어긋나는 장면", () => {
  it("엑셀이 장부 앞에 BOM 을 붙여도 이미 부른 요청을 다시 부르지 않는다", async () => {
    const { io, files } = memoryIo();
    const list = [request("a", "seedream"), request("b", "seedream")];
    await runTrial(list, providers, paths, io);
    files.set("ledger/calls.csv", `\uFEFF${files.get("ledger/calls.csv") as string}`);
    expect(await runTrial(list, providers, paths, io)).toMatchObject({ called: 0, skipped: 2 });
  });

  it("장부 머리줄이 망가졌으면 한 건도 부르지 않는다", async () => {
    const { io, files } = memoryIo();
    files.set("ledger/calls.csv", "요청,모델\na,seedream\n");
    await expect(runTrial([request("b", "seedream")], providers, paths, io)).rejects.toThrow(
      "머리줄",
    );
  });

  it("입력 그림을 읽지 못하면 부르기 전 줄을 쓰지 않아 상한 칸을 쓰지 않는다", async () => {
    const { io, files } = memoryIo();
    const broken: TrialIo = { ...io, readFile: () => Promise.reject(new Error("없는 파일")) };
    await expect(runTrial([request("a", "seedream")], providers, paths, broken)).rejects.toThrow();
    expect(await runTrial([request("a", "seedream")], providers, paths, io)).toMatchObject({
      called: 1,
      interrupted: [],
    });
    expect(files.get("ledger/calls.csv")).toMatch(/a,r001\.jpg/);
  });

  it("받은 그림을 쓸 수 없어도 청구액과 응답 시간을 장부에 남기고 멈춘다", async () => {
    const { io, files } = memoryIo();
    const webp: GenerationProvider = {
      name: "webp",
      generate: () =>
        Promise.resolve({
          kind: "succeeded",
          image: Uint8Array.from([0x52, 0x49, 0x46, 0x46]),
          mimeType: "image/webp",
          costUsd: 0.05,
        }),
    };
    await expect(
      runTrial([request("a", "seedream")], { ...providers, seedream: webp }, paths, io),
    ).rejects.toThrow();
    const rows = parseCsv(files.get("ledger/calls.csv") as string);
    expect(rows.at(-1)).toMatchObject({ request_id: "a", status: "unusable", cost_usd: "0.05" });
  });

  it("그림은 대기 폴더를 거쳐 실행이 끝날 때 채점 폴더로 옮겨지고, 대기 폴더는 빈다", async () => {
    const { io, files } = memoryIo();
    await runTrial([request("a", "seedream"), request("b", "seedream")], providers, paths, io);
    const names = [...files.keys()];
    expect(names.filter((name) => name.startsWith("ledger/calls.csv.staging/"))).toEqual([]);
    expect(names.filter((name) => name.startsWith("out/scoring/r")).sort()).toEqual([
      "out/scoring/r001.jpg",
      "out/scoring/r002.jpg",
    ]);
    expect(parseCsv(files.get("out/scoring/scoring.csv") as string)).toHaveLength(2);
  });

  it("MPF APP2, 스캔 사이 COM, EOI 뒤에 덧붙은 둘째 그림의 EXIF 까지 지우고, 검사는 남은 것을 찾는다", () => {
    const text = (value: string) => [...value].map((c) => c.charCodeAt(0));
    const segment = (marker: number, body: number[]) => [
      0xff,
      marker,
      0x00,
      body.length + 2,
      ...body,
    ];
    const mpf = segment(0xe2, text("MPF\0xx"));
    const scan = [...segment(0xda, [0x11]), 0x12, 0xff, 0x00, 0x13, 0xff, 0xd0, 0x14];
    const comment = segment(0xfe, text("made by sunburst"));
    const second = [0xff, 0xd8, ...segment(0xe1, text("Exif\0\0Model=Seedream")), 0xff, 0xd9];
    const jpeg = Uint8Array.from([
      0xff,
      0xd8,
      ...mpf,
      ...scan,
      ...comment,
      ...scan,
      0xff,
      0xd9,
      ...second,
    ]);
    expect(metadataLeft(jpeg)).toEqual(["APP2", "COM", "EOI 뒤 데이터"]);
    const clean = stripMetadata(jpeg).bytes;
    expect([...clean]).toEqual([0xff, 0xd8, ...scan, ...scan, 0xff, 0xd9]);
    expect(metadataLeft(clean)).toEqual([]);
  });

  it("스프레드시트가 끝 줄바꿈 없이 저장한 장부와 채점 CSV 에도 줄이 붙지 않고, 채운 칸은 남는다", async () => {
    const { io, files } = memoryIo();
    await runTrial([request("a", "seedream")], providers, paths, io);
    const scoring = (files.get("out/scoring/scoring.csv") as string)
      .trimEnd()
      .replace("in-a,select", "in-a,select");
    files.set("out/scoring/scoring.csv", scoring.replace(/,1,,/, ",1,y,"));
    files.set("ledger/calls.csv", (files.get("ledger/calls.csv") as string).trimEnd());
    await runTrial([request("b", "seedream")], providers, paths, io);
    const rows = parseCsv(files.get("out/scoring/scoring.csv") as string);
    expect(rows.map((row) => row.file).sort()).toEqual(["r001.jpg", "r002.jpg"]);
    expect(rows.find((row) => row.file === "r001.jpg")?.normal).toBe("y");
    const ledger = parseCsv(files.get("ledger/calls.csv") as string);
    expect(ledger.filter((row) => row.status === "succeeded").map((row) => row.request_id)).toEqual(
      ["a", "b"],
    );
  });

  it("채점 폴더로 옮긴 직후 죽어 줄이 없는 그림은 다음 실행이 줄을 더하고, 어디에도 없는 그림은 알린다", async () => {
    const { io, files } = memoryIo();
    await runTrial([request("a", "seedream"), request("b", "seedream")], providers, paths, io);
    files.set("out/scoring/scoring.csv", "file\n");
    files.delete("out/scoring/r002.jpg");
    const result = await runTrial([], providers, paths, io);
    expect(parseCsv(files.get("out/scoring/scoring.csv") as string).map((row) => row.file)).toEqual(
      ["r001.jpg"],
    );
    expect(result.missing).toEqual(["r002.jpg"]);
  });

  it("멈춤 요청이 오면 지금 호출을 마치고 끝내며, 받은 그림은 채점 폴더로 옮기고 잠금을 푼다", async () => {
    const { io, files } = memoryIo();
    let calls = 0;
    const counting: GenerationProvider = {
      name: "counting",
      generate: (request, signal) => {
        calls += 1;
        return exifProvider(0.03).generate(request, signal);
      },
    };
    const result = await runTrial(
      [request("a", "seedream"), request("b", "seedream")],
      { ...providers, seedream: counting },
      { ...paths, shouldStop: () => calls >= 1 },
      io,
    );
    expect(result).toMatchObject({ called: 1, stopped: true });
    expect(parseCsv(files.get("out/scoring/scoring.csv") as string)).toHaveLength(1);
    expect(files.has("ledger/calls.csv.lock")).toBe(false);
  });

  it("두 번에 나눠 돌린 그림 줄도 채점 CSV 에서 섞여, 앞줄과 뒷줄로 실행 묶음이 갈리지 않는다", async () => {
    const { io, files } = memoryIo();
    const first = Array.from({ length: 6 }, (_, i) => request(`s${i}`, "seedream"));
    const second = Array.from({ length: 6 }, (_, i) => request(`u${i}`, "flare"));
    await runTrial(
      first,
      providers,
      { ...paths, caps: { seedream: 10, sunburst: 10, flare: 10 } },
      io,
    );
    await runTrial(
      second,
      providers,
      { ...paths, caps: { seedream: 10, sunburst: 10, flare: 10 } },
      io,
    );
    const order = parseCsv(files.get("out/scoring/scoring.csv") as string).map(
      (row) => row.input?.[3],
    );
    expect(order.slice(0, 6).every((key) => key === "s")).toBe(false);
  });

  it("D5 검사는 점 파일을 건너뛰고, 화상 데이터 안의 우연한 글자는 메타데이터로 보지 않는다", () => {
    const name = "0b5c5f2e-1111-4222-8333-444455556666.jpg";
    // SOS 뒤 화상 데이터에 「tIME」, 「Exif」 와 같은 바이트가 우연히 들어 있다
    const jpeg = Uint8Array.from([
      0xff,
      0xd8,
      0xff,
      0xda,
      0x00,
      0x02,
      ...[..."tIMEExif"].map((c) => c.charCodeAt(0)),
      0xff,
      0xd9,
    ]);
    const csv = `file,input,normal\n${name},in-a,\n`;
    expect(
      checkScoringFolder(
        [
          { name, bytes: jpeg },
          { name: ".DS_Store", bytes: Uint8Array.from([0, 0]) },
        ],
        csv,
      ),
    ).toEqual([]);
  });
});

describe("반증 실험 보고", () => {
  const row = (id: string, extra: Record<string, string>) => ({
    request_id: id,
    model: "seedream",
    set: "select",
    attempt: "1",
    status: "succeeded",
    file: `${id}.jpg`,
    cost_usd: "0.05",
    elapsed_ms: "1000",
    twin_kind: "doll",
    garment_source: "product",
    items: "1",
    ...extra,
  });

  it("선택 세트만 모델마다 정상 수, p1, p2, 차단 수, 정상 사진당 원가, p95 를 낸다", () => {
    const calls = [
      row("1", { items: "2" }),
      row("2", { twin_kind: "realistic", elapsed_ms: "3000" }),
      row("3", {
        status: "refused",
        file: "",
        cost_usd: "",
        elapsed_ms: "500",
        garment_source: "own-photo",
      }),
      row("4", { attempt: "2" }),
      row("5", { set: "block", status: "refused", file: "", cost_usd: "" }),
    ];
    const scoring = [
      { file: "1.jpg", normal: "y" },
      { file: "2.jpg", normal: "n" },
      { file: "4.jpg", normal: "y" },
    ];
    const [seedream] = buildReport(calls, scoring);
    // 호출 기준 p1: 처음 부른 3건(거절 1 포함) 가운데 정상 1장
    expect(seedream?.p1Calls).toBeCloseTo(1 / 3);
    expect(seedream).toMatchObject({
      calls: 4,
      blocked: 1,
      scored: 3,
      normal: 2,
      p1: 0.5,
      p2: 1,
      p95Ms: 3000,
      costMissing: 1,
    });
    // (0.15 USD x 1400 + 4.2 x 4) / 2 + 15
    expect(seedream?.krwPerNormal).toBeCloseTo((210 + 16.8) / 2 + 15);
    expect(seedream?.normalBy).toEqual({
      "twin_kind=doll": 2,
      "garment_source=product": 2,
      "items=2": 1,
      "items=1": 1,
    });
    expect(buildReport(calls, scoring, "block")[0]).toMatchObject({ calls: 1, blocked: 1 });
  });

  it("바깥 평가자 둘이 채우면 셋 가운데 둘이 불합격일 때 정상이 아니고, 일치 수를 센다", () => {
    expect(finalJudgement({ normal: "y", outside_1: "n", outside_2: "n" })).toBe("n");
    expect(finalJudgement({ normal: "n", outside_1: "y", outside_2: "y" })).toBe("y");
    expect(finalJudgement({ normal: "y", outside_1: "n", outside_2: "" })).toBe("y");
    expect(finalJudgement({ normal: "" })).toBe("");
    const scoring = [
      { normal: "y", outside_sample: "y", outside_1: "y", outside_2: "n" },
      { normal: "n", outside_sample: "y", outside_1: "n", outside_2: "n" },
      { normal: "y", outside_sample: "", outside_1: "", outside_2: "" },
    ];
    expect(outsideAgreement(scoring)).toEqual({ sample: 2, agree: [2, 1] });
  });
});
