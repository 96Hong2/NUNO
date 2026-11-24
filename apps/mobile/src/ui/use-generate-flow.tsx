import {
  consentNeeded,
  makeSheetCopy,
  SIGNUP_TRIAL_COUNT,
  stagePriceLabel,
  type ManifestGarment,
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
import { hasPersonPhoto, submitGeneration } from "../composition/generation";
import { useAppToast } from "./app-toast";
import type { CatalogItem } from "./coordi-catalog";
import { GENERATE_CHERRY, GoldConfirmSheet, JoinSheet, MakeLookSheet } from "./generate-sheets";

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

  const reload = useCallback(() => loadAccount().then((next) => (setAccount(next), next)), []);
  useFocusEffect(
    useCallback(() => {
      void reload();
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

  const submit = () =>
    void run(async () => {
      const outcome = await submitGeneration(twinKey, items);
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
      } else {
        proceed(state);
      }
    });

  const make = () => {
    if (makeSheetCopy(account?.gold?.trialCount ?? 0).needsGold) setSheet("gold");
    else submit();
  };

  const visible = Boolean(account?.server && account.generateOn);
  const trialCount = account?.signedIn ? (account.gold?.trialCount ?? null) : SIGNUP_TRIAL_COUNT;
  const empty = items.length === 0;

  const button = visible ? (
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
        trialCount={account?.gold?.trialCount ?? 0}
        busy={busy}
        onMake={make}
        onClose={() => setSheet(null)}
      />
      <GoldConfirmSheet
        visible={sheet === "gold"}
        balance={account?.gold?.balance ?? 0}
        busy={busy}
        onSpend={submit}
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
  label: { color: "#fff", fontSize: 15, fontWeight: "800" },
  price: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "600" },
});
