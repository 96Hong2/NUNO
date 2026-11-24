import {
  closetLabel,
  failureCopy,
  isFinishedStatus,
  progressStep,
  type ManifestGarment,
} from "@nuno/generation";
import {
  samplePiece,
  slotOf,
  type OutfitCategory,
  type OutfitPiece,
  type SampleGarmentKey,
} from "@nuno/outfit";
import type { PresetTwinKey } from "@nuno/twin";
import { useLocalSearchParams, usePreventRemove, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { loadAccount, type GoldSummary } from "../../src/composition/account";
import {
  discardJob,
  keepJob,
  loadJob,
  loadJobItems,
  markJobSeen,
  type JobView,
} from "../../src/composition/generation";
import { loadClosetImages } from "../../src/composition/wardrobe";
import { useAppToast } from "../../src/ui/app-toast";
import { buildCatalog, type CatalogItem } from "../../src/ui/coordi-catalog";
import { CoordiStage, STAGE_PINK } from "../../src/ui/coordi-stage";
import { LeaveResultSheet } from "../../src/ui/generate-sheets";

const INK = "#151314";
const SUB = "#76736C";
/** 작업 상태를 묻는 간격 */
const POLL_MS = 2000;
/** 아래 단추 줄 위에 알림을 띄운다 */
const TOAST_OVER_BAR = 150;

/** 입력 목록의 옷 키(`g:<ID>`, `s:<견본 키>`)로 무대 옷을 다시 만든다 */
function pieceOf(item: ManifestGarment): OutfitPiece | null {
  if (item.id.startsWith("s:")) return samplePiece(item.id.slice(2) as SampleGarmentKey);
  if (item.id.startsWith("g:")) {
    const category = item.category as OutfitCategory;
    return { ref: { kind: "garment", id: item.id.slice(2) }, category, slot: slotOf(category) };
  }
  return null;
}

// 완성 룩 작업 한 화면: 만드는 중, 결과, 실패를 작업 상태(2초마다 물음)로 바꿔 보인다.
// 무대 「무료로 만들기」, 작업 감시 알림 「보기」, 푸시가 모두 이 주소로 연다.
export default function GenerateJobScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const router = useRouter();
  const toast = useAppToast();
  const [job, setJob] = useState<JobView | null>(null);
  const [missing, setMissing] = useState(false);
  const [items, setItems] = useState<ManifestGarment[]>([]);
  const [twinKey, setTwinKey] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<ReadonlyMap<string, CatalogItem>>(new Map());
  const [gold, setGold] = useState<GoldSummary | null>(null);
  const [saved, setSaved] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const pendingLeave = useRef<(() => void) | null>(null);

  useEffect(() => {
    void loadJobItems(jobId).then((loaded) => {
      setItems(loaded.items);
      setTwinKey(loaded.twinKey);
    });
    void loadClosetImages("mine").then((garments) =>
      setCatalog(new Map(buildCatalog(garments).map((item) => [item.key, item]))),
    );
  }, [jobId]);

  // 끝날 때까지 묻는다. 끝나면 결과 서명 주소를 그대로 쓰고 더 묻지 않는다.
  const finished = job ? isFinishedStatus(job.status) : false;
  useEffect(() => {
    if (finished || missing) return;
    let alive = true;
    const tick = async () => {
      const loaded = await loadJob(jobId);
      if (!alive) return;
      if (loaded.kind === "ok") setJob(loaded.job);
      else if (loaded.kind === "missing") setMissing(true);
    };
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [jobId, finished, missing]);

  useEffect(() => {
    if (!finished) return;
    void markJobSeen(jobId);
    if (job?.status === "failed") void loadAccount().then((state) => setGold(state.gold));
  }, [finished, jobId, job?.status]);

  const unsaved = job?.status === "succeeded" && job.result !== null && !saved;
  usePreventRemove(unsaved, ({ repeat }) => {
    pendingLeave.current = repeat;
    setLeaveOpen(true);
  });

  const pieces = useMemo(
    () => items.map(pieceOf).filter((piece): piece is OutfitPiece => piece !== null),
    [items],
  );

  const back = () => (router.canGoBack() ? router.back() : router.replace("/fitting/coordi"));
  const toStage = () => {
    if (router.canDismiss()) router.dismissAll();
    router.navigate("/fitting/coordi");
  };

  const save = async (thenLeave: boolean) => {
    if (busy) return;
    setBusy(true);
    const ok = await keepJob(jobId);
    setBusy(false);
    if (!ok) {
      toast.show("저장하지 못했어요. 잠시 뒤에 다시 해 주세요", undefined, {
        bottom: TOAST_OVER_BAR,
      });
      return;
    }
    setSaved(true);
    setLeaveOpen(false);
    toast.show("룩북에 저장했어요. 나만 볼 수 있어요", undefined, { bottom: TOAST_OVER_BAR });
    if (thenLeave) pendingLeave.current?.();
  };

  const leave = async () => {
    if (busy) return;
    setBusy(true);
    await discardJob(jobId);
    setBusy(false);
    setLeaveOpen(false);
    pendingLeave.current?.();
  };

  if (missing) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.muted}>이 완성 룩을 찾지 못했어요</Text>
        <Pressable role="button" onPress={toStage}>
          <Text style={styles.link}>코디로 돌아가기</Text>
        </Pressable>
      </View>
    );
  }
  if (!job) return <View style={styles.screen} />;

  if (!finished) {
    const step = progressStep(job.status);
    return (
      <View style={styles.screen}>
        <View style={styles.top}>
          <Pressable
            role="button"
            hitSlop={12}
            onPress={() => {
              toast.show("다 만들면 알려 드릴게요");
              back();
            }}
          >
            <Text style={styles.closeLabel}>닫기</Text>
          </Pressable>
        </View>
        <View style={styles.makingBody}>
          <View style={styles.makingPhoto}>
            {twinKey ? (
              <CoordiStage
                thumbnail
                twinKey={twinKey as PresetTwinKey}
                outfit={pieces}
                catalog={catalog}
              />
            ) : null}
          </View>
        </View>
        <View style={styles.makingFoot}>
          <View
            role="progressbar"
            aria-label="만드는 중"
            aria-valuenow={step.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            style={styles.track}
          >
            <View style={[styles.fillBar, { width: `${step.percent}%` }]} />
          </View>
          <Text style={styles.stepLabel}>{step.label}</Text>
          <Text style={styles.muted}>앞 1장</Text>
          <Text style={styles.makingNote}>
            화면을 닫아도 계속 만들어요. 다 되면 결과를 보여 드려요.
          </Text>
        </View>
      </View>
    );
  }

  if (job.status === "failed") {
    const copy = failureCopy(
      job.paymentKind,
      job.refund?.amount ?? 0,
      job.paymentKind === "gold" ? (gold?.balance ?? 0) : (gold?.trialCount ?? 0),
    );
    return (
      <View style={styles.screen}>
        <Header onBack={back} />
        <ScrollView contentContainerStyle={styles.body}>
          <View style={[styles.photo, styles.failBox]}>
            <Text style={styles.failIcon}>⚠︎</Text>
            <Text style={styles.failBoxLabel}>만들지 못했어요</Text>
          </View>
          <Text style={styles.failTitle}>
            {"만들지 못했어요.\n"}
            {copy.title}
          </Text>
          <Text style={styles.failBody}>{copy.body}</Text>
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>{copy.refundLabel}</Text>
              <Text style={styles.cardValue}>{copy.refundValue}</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>{copy.remainLabel}</Text>
              <Text style={styles.cardValue}>{gold ? copy.remainValue : ""}</Text>
            </View>
          </View>
        </ScrollView>
        <View style={styles.bar}>
          <Pressable role="button" onPress={toStage} style={styles.primary}>
            <Text style={styles.primaryLabel}>다른 옷으로 다시 해 보기</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Header onBack={back} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.photo}>
          {job.result ? (
            <Image
              role="img"
              aria-label="완성 룩 사진"
              source={{ uri: job.result.url }}
              resizeMode="cover"
              style={styles.fill}
            />
          ) : null}
          <View style={styles.badge}>
            <Text style={styles.badgeLabel}>✦ AI 생성</Text>
          </View>
        </View>
        <Text style={styles.muted}>주름과 핏은 실제와 다를 수 있어요</Text>
        {items.length > 0 ? (
          <View aria-label="입은 옷" style={styles.card}>
            {items.map((item) => (
              <View key={item.id} style={styles.cardRow}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.muted}>{closetLabel(item.closet)}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <Text style={styles.guide}>
          저장한 그림에는 「AI 생성」 표시가 함께 들어가요. 이 표시는 끌 수 없어요.
        </Text>
      </ScrollView>
      <View style={styles.bar}>
        <Text style={styles.barNote}>저장한 룩은 나만 봐요. 공개는 룩북에서 정해요</Text>
        <Pressable
          role="button"
          disabled={busy || saved}
          onPress={() => void save(false)}
          style={[styles.primary, busy && styles.busy]}
        >
          <Text style={styles.primaryLabel}>{saved ? "룩북에 저장했어요" : "내 룩북에 저장"}</Text>
        </Pressable>
      </View>
      <LeaveResultSheet
        visible={leaveOpen}
        busy={busy}
        onSave={() => void save(true)}
        onLeave={() => void leave()}
        onClose={() => setLeaveOpen(false)}
      />
    </View>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable
        role="button"
        aria-label="뒤로"
        hitSlop={12}
        onPress={onBack}
        style={styles.headerSide}
      >
        <Text style={styles.backIcon}>‹</Text>
      </Pressable>
      <Text role="heading" aria-level={1} style={styles.headerTitle}>
        완성 룩
      </Text>
      <View style={styles.headerSide} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  center: { alignItems: "center", justifyContent: "center", gap: 10 },
  top: { paddingHorizontal: 20, paddingVertical: 14, alignItems: "flex-start" },
  closeLabel: { fontSize: 15, fontWeight: "600", color: INK },
  makingBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  makingPhoto: {
    width: "100%",
    maxHeight: "100%",
    aspectRatio: 3 / 4,
    overflow: "hidden",
    borderRadius: 18,
    backgroundColor: STAGE_PINK,
  },
  makingFoot: { alignItems: "center", gap: 10, paddingHorizontal: 40, paddingBottom: 28 },
  track: {
    alignSelf: "stretch",
    height: 4,
    overflow: "hidden",
    borderRadius: 2,
    backgroundColor: "#E7E6E3",
  },
  fillBar: { height: 4, borderRadius: 2, backgroundColor: INK },
  stepLabel: { fontSize: 17, fontWeight: "800", color: INK, marginTop: 6 },
  makingNote: { fontSize: 13, color: SUB, textAlign: "center", marginTop: 6 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerSide: { width: 40, alignItems: "flex-start" },
  backIcon: { fontSize: 28, color: INK },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: INK },
  body: { paddingHorizontal: 20, paddingBottom: 170, gap: 12 },
  photo: { aspectRatio: 3 / 4, overflow: "hidden", borderRadius: 18, backgroundColor: STAGE_PINK },
  fill: { width: "100%", height: "100%" },
  badge: {
    position: "absolute",
    top: 10,
    left: 10,
    height: 24,
    justifyContent: "center",
    paddingHorizontal: 9,
    borderRadius: 8,
    backgroundColor: "rgba(21,19,20,0.8)",
  },
  badgeLabel: { color: "#fff", fontSize: 11, fontWeight: "700" },
  muted: { fontSize: 13, color: SUB },
  link: { fontSize: 14, fontWeight: "700", color: INK },
  card: {
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#EDECEA",
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
  },
  itemName: { flex: 1, fontSize: 15, fontWeight: "600", color: INK },
  cardLabel: { fontSize: 15, color: INK },
  cardValue: { fontSize: 15, fontWeight: "800", color: INK },
  guide: {
    fontSize: 13,
    lineHeight: 19,
    color: SUB,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#F4F3F1",
  },
  failBox: { alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#F2F2F4" },
  failIcon: { fontSize: 34, color: "#8E8C92" },
  failBoxLabel: { fontSize: 14, fontWeight: "700", color: "#8E8C92" },
  failTitle: { fontSize: 19, lineHeight: 27, fontWeight: "800", color: INK },
  failBody: { fontSize: 14, lineHeight: 21, color: SUB },
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    gap: 10,
    padding: 16,
    backgroundColor: "#fff",
  },
  barNote: { fontSize: 12, color: SUB, textAlign: "center" },
  primary: {
    alignItems: "center",
    justifyContent: "center",
    height: 54,
    borderRadius: 14,
    backgroundColor: INK,
  },
  busy: { opacity: 0.6 },
  primaryLabel: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
