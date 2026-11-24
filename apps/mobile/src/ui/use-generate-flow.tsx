import {
  consentNeeded,
  freeLooksNow,
  makeSheetCopy,
  payWithFor,
  SIGNUP_TRIAL_COUNT,
  stagePriceLabel,
  type ManifestGarment,
  type PaymentKind,
} from "@nuno/generation";
import { refKey, type Outfit } from "@nuno/outfit";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import {
  canDevSignIn,
  devSignIn,
  loadAccount,
  onAccountChange,
  type AccountState,
} from "../composition/account";
import { findUnsavedJob, hasPersonPhoto, submitGeneration } from "../composition/generation";
import { useAppToast } from "./app-toast";
import type { CatalogItem } from "./coordi-catalog";
import { GENERATE_CHERRY, GoldConfirmSheet, JoinSheet, MakeLookSheet } from "./generate-sheets";

/** 지금 무료로 접수할 수 있는 장 수. 오늘 무료 한도에 닿았으면 남은 장이 있어도 0 이다 */
const freeLooksOf = (state: AccountState): number =>
  state.gold ? freeLooksNow(state.gold.trialCount, state.gold.trialUsableToday) : 0;

/** 시트가 열려 있으면 알림을 무대 위쪽에 띄운다 */
const TOAST_OVER_SHEET = 560;
const PERSON_PHOTO_MESSAGE = "사람이 함께 찍힌 옷 사진은 완성 룩으로 만들 수 없어요";

type FlowSheet = "join" | "make" | "gold" | null;

interface GenerateFlow {
  /** 무대 아래 오른쪽 「이대로 입히기」. 서버가 없거나 스위치가 꺼지면 null */
  button: ReactNode;
  /** 화면 맨 위에 덮는 가입, 만들기, 골드 확인 시트 */
  sheets: ReactNode;
}

/**
 * 피팅룸 「이대로 입히기」 흐름: 가입 시트 → 동의 화면 → 「완성 룩 만들기」 → 골드 확인 → 접수.
 * 가입하면 처음 누른 흐름을 잇는다. 동의 화면이 동의를 받으면 `make=1` 로 이 화면에 돌아와 시트를 연다.
 */
export function useGenerateFlow(
  twinKey: string,
  outfit: Outfit,
  catalog: ReadonlyMap<string, CatalogItem>,
): GenerateFlow {
  const router = useRouter();
  const toast = useAppToast();
  const params = useLocalSearchParams<{ make?: string }>();
  const [account, setAccount] = useState<AccountState | null>(null);
  const [sheet, setSheet] = useState<FlowSheet>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const [unsavedJob, setUnsavedJob] = useState<string | null>(null);

  const reload = useCallback(() => loadAccount().then((next) => (setAccount(next), next)), []);
  useFocusEffect(
    useCallback(() => {
      void reload();
      void findUnsavedJob().then(setUnsavedJob, () => setUnsavedJob(null));
    }, [reload]),
  );
  useEffect(() => onAccountChange(() => void reload()), [reload]);

  const notify = (message: string) =>
    toast.show(message, undefined, sheet ? { bottom: TOAST_OVER_SHEET } : undefined);

  const items: ManifestGarment[] = outfit.flatMap((piece) => {
    const item = catalog.get(refKey(piece.ref));
    if (!item) return [];
    return [
      {
        id: refKey(piece.ref),
        name: item.name,
        category: piece.category,
        closet: item.sample ? null : "mine",
        imageHash: "",
      },
    ];
  });

  const proceed = (state: AccountState) => {
    if (!state.signedIn) {
      setSheet("join");
      return;
    }
    if (consentNeeded(state.consent)) {
      setSheet(null);
      router.push("/generate/consent");
      return;
    }
    setSheet("make");
  };

  // 동의 화면에서 돌아오면 「완성 룩 만들기」 시트를 연다.
  useEffect(() => {
    if (params.make !== "1") return;
    router.setParams({ make: undefined });
    void reload().then((state) => {
      if (state.signedIn && !consentNeeded(state.consent)) setSheet("make");
    });
  }, [params.make, reload, router]);

  const run = async (task: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await task();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const press = () => {
    if (!account) return;
    if (items.length === 0) {
      notify("옷을 담으면 만들 수 있어요");
      return;
    }
    void run(async () => {
      if (await hasPersonPhoto(items)) {
        notify(PERSON_PHOTO_MESSAGE);
        return;
      }
      proceed(await reload());
    });
  };

  const signIn = () =>
    void run(async () => {
      if (!(await devSignIn())) {
        notify("로그인하지 못했어요. 잠시 뒤에 다시 해 주세요");
        return;
      }
      proceed(await reload());
    });

  const submit = (payWith: PaymentKind) =>
    void run(async () => {
      const outcome = await submitGeneration(twinKey, items, payWith);
      if (outcome.kind === "job") {
        setSheet(null);
        void reload();
        router.push(`/generate/${outcome.jobId}`);
        return;
      }
      if (outcome.kind === "hadPerson") {
        notify(PERSON_PHOTO_MESSAGE);
        return;
      }
      const { next } = outcome;
      if (next.kind === "notice") {
        notify(next.message);
        return;
      }
      const state = await reload();
      if (next.kind === "consent") {
        setSheet(null);
        router.push("/generate/consent");
      } else if (next.kind === "goldShort") {
        setSheet("gold");
      } else if (next.kind === "paymentChanged") {
        // 그사이 무료 장이 바뀌었다. 다시 읽은 값으로 시트를 다시 고른다.
        setSheet(freeLooksOf(state) > 0 ? "make" : "gold");
      } else {
        proceed(state);
      }
    });

  const freeLooks = account ? freeLooksOf(account) : 0;
  const make = () => {
    if (makeSheetCopy(freeLooks).needsGold) setSheet("gold");
    else submit(payWithFor(freeLooks));
  };

  const visible = Boolean(account?.server && account.generateOn);
  // 가입 전에는 가입하면 받을 무료 장 수, 가입 뒤 골드를 못 읽었으면 글자를 비운다.
  let trialCount: number | null = SIGNUP_TRIAL_COUNT;
  if (account?.signedIn) trialCount = account.gold ? freeLooks : null;
  const empty = items.length === 0;

  // 알림을 놓쳐도 저장하지 않은 결과로 돌아갈 수 있게 무대 단추 위에 둔다.
  const resultChip =
    visible && account?.signedIn && unsavedJob ? (
      <Pressable
        role="button"
        aria-label="다 된 완성 룩 보기"
        onPress={() => router.push(`/generate/${unsavedJob}`)}
        style={styles.resultChip}
      >
        <Text style={styles.resultChipLabel}>다 된 완성 룩 보기</Text>
      </Pressable>
    ) : null;

  const generateButton = visible ? (
    <Pressable
      role="button"
      aria-label="이대로 입히기"
      aria-disabled={empty}
      onPress={press}
      style={[styles.button, empty && styles.dim]}
    >
      <Text style={styles.label}>이대로 입히기</Text>
      {trialCount === null ? null : <Text style={styles.price}>{stagePriceLabel(trialCount)}</Text>}
    </Pressable>
  ) : null;

  const button = (
    <>
      {resultChip}
      {generateButton}
    </>
  );

  const sheets = (
    <>
      <JoinSheet
        visible={sheet === "join"}
        devSignIn={canDevSignIn()}
        busy={busy}
        onDevSignIn={signIn}
        onClose={() => setSheet(null)}
      />
      <MakeLookSheet
        visible={sheet === "make"}
        trialCount={freeLooks}
        busy={busy}
        onMake={make}
        onClose={() => setSheet(null)}
      />
      <GoldConfirmSheet
        visible={sheet === "gold"}
        balance={account?.gold?.balance ?? 0}
        trialCount={account?.gold?.trialCount ?? 0}
        busy={busy}
        onSpend={() => submit("gold")}
        onClose={() => setSheet(null)}
      />
    </>
  );

  return { button, sheets };
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    right: 12,
    bottom: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: GENERATE_CHERRY,
  },
  dim: { opacity: 0.45 },
  resultChip: {
    position: "absolute",
    right: 12,
    bottom: 76,
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
    justifyContent: "center",
    backgroundColor: "#151314",
  },
  resultChipLabel: { color: "#fff", fontSize: 13, fontWeight: "700" },
  label: { color: "#fff", fontSize: 15, fontWeight: "800" },
  price: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "600" },
});
