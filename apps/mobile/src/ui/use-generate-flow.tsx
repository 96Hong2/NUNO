import {
  consentNeeded,
  freeLooksNow,
  SIGNUP_TRIAL_COUNT,
  stageButtonNote,
  type ManifestGarment,
  type PaymentKind,
} from "@nuno/generation";
import { refKey, type Outfit } from "@nuno/outfit";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import {
  canDevSignIn,
  devSignIn,
  loadAccount,
  onAccountChange,
  type AccountState,
} from "../composition/account";
import {
  findRunningJob,
  findUnsavedJob,
  hasPersonPhoto,
  onGenerationFinished,
  submitGeneration,
} from "../composition/generation";
import { useAppToast } from "./app-toast";
import type { CatalogItem } from "./coordi-catalog";
import { GENERATE_CHERRY, JoinSheet, MakeLookSheet } from "./generate-sheets";

const INK = "#151314";

/** 지금 무료로 접수할 수 있는 장 수. 오늘 무료 한도에 닿았으면 남은 장이 있어도 0 이다 */
const freeLooksOf = (state: AccountState): number =>
  state.gold ? freeLooksNow(state.gold.trialCount, state.gold.trialUsableToday) : 0;

const PERSON_PHOTO_MESSAGE = "사람이 함께 찍힌 옷 사진은 완성 룩으로 만들 수 없어요";

type FlowSheet = "join" | "make" | null;

interface GenerateFlow {
  /** 무대 안 오른쪽 아래 「이대로 입히기」. 서버가 없거나 스위치가 꺼지면 null */
  button: ReactNode;
  /** 옷 칸을 끌어 올렸을 때 작은 무대 줄 왼쪽에 두는 작은 「이대로 입히기」. 자리는 그리는 쪽이 정한다 */
  compactButton: ReactNode;
  /** 화면 맨 위에 덮는 가입 시트와 「완성 룩 만들기」 시트 */
  sheets: ReactNode;
}

/** 무대 단추가 가리키는 것: 만들기, 만드는 중인 작업, 다 됐는데 저장하지 않은 결과 */
type StageState =
  | { kind: "make"; note: string | null; empty: boolean }
  | { kind: "running"; jobId: string }
  | { kind: "done"; jobId: string };

/**
 * 피팅룸 「이대로 입히기」 흐름: 가입 시트 → 동의 화면 → 「완성 룩 만들기」 시트 → 접수.
 * 시트 한 틀이 무료, 골드, 골드 부족 세 상태를 그린다. 가입하면 처음 누른 흐름을 잇는다.
 * 동의 화면이 동의를 받으면 `make=1` 로 이 화면에 돌아와 시트를 연다.
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
  const [runningJob, setRunningJob] = useState<string | null>(null);

  const reload = useCallback(() => loadAccount().then((next) => (setAccount(next), next)), []);
  const reloadJobs = useCallback(() => {
    void findUnsavedJob().then(setUnsavedJob, () => setUnsavedJob(null));
    void findRunningJob().then(setRunningJob, () => setRunningJob(null));
  }, []);
  useFocusEffect(
    useCallback(() => {
      void reload();
      reloadJobs();
    }, [reload, reloadJobs]),
  );
  useEffect(() => onAccountChange(() => void reload()), [reload]);
  // 무대에 머문 채로 작업이 끝나도 단추가 바로 바뀌게, 작업 감시가 끝난 작업을 적을 때 다시 읽는다.
  useEffect(() => onGenerationFinished(reloadJobs), [reloadJobs]);

  const notify = (message: string) => toast.show(message);

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

  // 동의 화면이나 실패 화면 「같은 코디로 다시 만들기」 에서 돌아오면 「완성 룩 만들기」 시트를 연다.
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
      notify("옷을 한 벌 이상 입히면 만들 수 있어요");
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
        setRunningJob(outcome.jobId);
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
      } else if (next.kind === "goldShort" || next.kind === "paymentChanged") {
        // 그사이 무료 장이나 골드가 바뀌었다. 다시 읽은 값으로 시트가 상태를 다시 고른다.
        setSheet("make");
      } else {
        proceed(state);
      }
    });

  const freeLooks = account ? freeLooksOf(account) : 0;
  const visible = Boolean(account?.server && account.generateOn);
  // 가입 전에는 가입하면 받을 무료 장 수, 가입 뒤 골드를 못 읽었으면 글자를 비운다.
  let note: string | null = stageButtonNote(SIGNUP_TRIAL_COUNT);
  if (account?.signedIn) note = account.gold ? stageButtonNote(freeLooks) : null;

  // 알림을 놓쳐도 저장하지 않은 결과로 돌아갈 수 있게, 다 된 결과가 있으면 단추 자체가 그 결과를 연다.
  let stage: StageState = { kind: "make", note, empty: items.length === 0 };
  if (account?.signedIn && unsavedJob) stage = { kind: "done", jobId: unsavedJob };
  else if (account?.signedIn && runningJob) stage = { kind: "running", jobId: runningJob };

  const openJob = (jobId: string) => router.push(`/generate/${jobId}`);
  const render = (compact: boolean) =>
    visible ? (
      <StageGenerateButton state={stage} compact={compact} onMake={press} onOpen={openJob} />
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
        freeLooks={freeLooks}
        trialCount={account?.gold?.trialCount ?? 0}
        balance={account?.gold?.balance ?? 0}
        busy={busy}
        onMake={submit}
        onClose={() => setSheet(null)}
      />
    </>
  );

  return { button: render(false), compactButton: render(true), sheets };
}

/** 무대 단추 한 자리. 만들기(체리), 만드는 중(흰 바탕과 원 진행 표시), 다 된 결과(잉크) 가운데 하나를 그린다 */
function StageGenerateButton({
  state,
  compact,
  onMake,
  onOpen,
}: {
  state: StageState;
  compact: boolean;
  onMake: () => void;
  onOpen: (jobId: string) => void;
}) {
  const frame = [styles.base, compact ? styles.compact : styles.full];
  // 작은 단추는 높이 36 이라 위아래 4 씩 넓혀 누르는 영역 44 를 맞춘다.
  const hitSlop = compact ? { top: 4, bottom: 4 } : undefined;

  if (state.kind === "done") {
    return (
      <Pressable
        role="button"
        aria-label="다 된 완성 룩 보기"
        hitSlop={hitSlop}
        onPress={() => onOpen(state.jobId)}
        style={[...frame, styles.done]}
      >
        <Text style={styles.statusLabelLight}>다 된 완성 룩 보기</Text>
      </Pressable>
    );
  }
  if (state.kind === "running") {
    return (
      <Pressable
        role="button"
        aria-label="완성 룩 만드는 중"
        hitSlop={hitSlop}
        onPress={() => onOpen(state.jobId)}
        style={[...frame, styles.running]}
      >
        <ActivityIndicator size="small" color={INK} />
        <Text style={styles.statusLabel}>완성 룩 만드는 중</Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      role="button"
      aria-label="이대로 입히기"
      aria-disabled={state.empty}
      hitSlop={hitSlop}
      onPress={onMake}
      style={[...frame, styles.make, state.empty && styles.dim]}
    >
      <Text style={compact ? styles.labelCompact : styles.label}>이대로 입히기</Text>
      {state.note === null ? null : <Text style={styles.note}>{state.note}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  // 무대 안 오른쪽 아래: 높이 44, 모서리 22, 폭 185 이상, 좌우 안쪽 16
  full: {
    position: "absolute",
    right: 16,
    bottom: 28,
    height: 44,
    minWidth: 185,
    paddingHorizontal: 16,
    borderRadius: 22,
  },
  // 옷 칸을 올린 상태의 작은 무대 줄: 높이 36, 모서리 18, 폭 175 이상, 좌우 안쪽 14
  compact: { height: 36, minWidth: 175, paddingHorizontal: 14, borderRadius: 18 },
  make: { backgroundColor: GENERATE_CHERRY },
  running: {
    borderWidth: 1,
    borderColor: "#E7E6E3",
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  done: { backgroundColor: INK },
  dim: { opacity: 0.45 },
  label: { color: "#fff", fontSize: 15, fontWeight: "700" },
  labelCompact: { color: "#fff", fontSize: 14, fontWeight: "700" },
  note: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "500" },
  statusLabel: { color: INK, fontSize: 13, fontWeight: "600" },
  statusLabelLight: { color: "#fff", fontSize: 13, fontWeight: "600" },
});
