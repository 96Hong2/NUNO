import {
  closetLabel,
  isFinishedStatus,
  lookFailureCopy,
  makingCopy,
  type ManifestGarment,
} from "@nuno/generation";
import {
  sameOutfit,
  samplePiece,
  slotOf,
  type OutfitCategory,
  type OutfitPiece,
  type SampleGarmentKey,
} from "@nuno/outfit";
import { isPresetTwinKey, type PresetTwinKey } from "@nuno/twin";
import { useLocalSearchParams, usePreventRemove, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  discardJob,
  dropUnviewableJob,
  keepJob,
  loadJob,
  loadJobItems,
  markJobSeen,
  type JobView,
} from "../../src/composition/generation";
import { changeOutfit, loadCoordi } from "../../src/composition/outfit";
import { loadCurrentTwin, switchTwin } from "../../src/composition/twin";
import { loadClosetImages } from "../../src/composition/wardrobe";
import { useAppToast } from "../../src/ui/app-toast";
import { buildCatalog, type CatalogItem } from "../../src/ui/coordi-catalog";
import { CoordiStage, STAGE_PINK } from "../../src/ui/coordi-stage";
import { LeaveResultSheet } from "../../src/ui/generate-sheets";
import { CloseIcon } from "../../src/ui/line-icon";

const INK = "#151314";
const SUB = "#5F5C56";
const LINE = "#E7E6E3";
const SURFACE = "#F6F5F3";
const PHOTO = "#EFEDEA";
const PAPER = "#FCFBFA";
/** 작업 상태를 묻는 간격 */
const POLL_MS = 2000;
/** 결과 화면 알림은 사진 아래쪽에 겹쳐 띄워 안전 줄과 입은 옷 목록을 가리지 않는다(390×844 기준) */
const TOAST_OVER_PHOTO = 336;

/** 입력 목록의 옷 키(`g:<ID>`, `s:<견본 키>`)로 무대 옷을 다시 만든다 */
function pieceOf(item: ManifestGarment): OutfitPiece | null {
  if (item.id.startsWith("s:")) return samplePiece(item.id.slice(2) as SampleGarmentKey);
  if (item.id.startsWith("g:")) {
    const category = item.category as OutfitCategory;
    return { ref: { kind: "garment", id: item.id.slice(2) }, category, slot: slotOf(category) };
  }
  return null;
}

/** 저장 단추 상태. 실패하면 「다시 저장」 으로 다시 누르게 한다 */
type SaveState = "idle" | "saved" | "failed";

// 완성 룩 작업 한 화면: 만드는 중, 결과, 실패를 작업 상태(2초마다 물음)로 바꿔 보인다.
// 「무료로 만들기」, 「4골드 사용」, 무대 「완성 룩 만드는 중」, 작업 감시 알림 「보기」 가 모두 이 주소로 연다.
export default function GenerateJobScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const router = useRouter();
  const toast = useAppToast();
  const [job, setJob] = useState<JobView | null>(null);
  const [missing, setMissing] = useState(false);
  const [items, setItems] = useState<ManifestGarment[]>([]);
  const [twinKey, setTwinKey] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<ReadonlyMap<string, CatalogItem>>(new Map());
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const pendingLeave = useRef<(() => void) | null>(null);
  const saved = saveState === "saved";

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
    if (finished) void markJobSeen(jobId);
  }, [finished, jobId]);

  // 서버가 작업을 찾지 못했거나 결과 주소가 사라졌으면 기기 요청 줄을 지운다.
  // 남겨 두면 무대 단추가 늘 「다 된 완성 룩 보기」 로 이 화면만 열어 새 완성 룩을 만들 수 없다.
  const unviewable = missing || (job?.status === "succeeded" && job.result === null);
  useEffect(() => {
    if (unviewable) void dropUnviewableJob(jobId);
  }, [unviewable, jobId]);

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
  const toStage = (make = false) => {
    if (router.canDismiss()) router.dismissAll();
    if (make) router.navigate({ pathname: "/fitting/coordi", params: { make: "1" } });
    else router.navigate("/fitting/coordi");
  };
  // 「같은 코디로 다시 만들기」: 그 트윈과 코디를 무대에 다시 입히고 「완성 룩 만들기」 시트를 연다.
  // 입은 옷을 읽지 못했거나 무대가 그 코디와 다르면 시트를 열지 않고 무대만 연다(다른 코디로 골드를 쓰지 않게).
  const retry = async () => {
    if (pieces.length === 0 || !twinKey || !isPresetTwinKey(twinKey)) {
      toStage();
      return;
    }
    if ((await loadCurrentTwin()) !== twinKey) await switchTwin(twinKey);
    await changeOutfit(pieces, { twinKey });
    const stage = await loadCoordi();
    toStage(stage.twinKey === twinKey && sameOutfit(stage.outfit, pieces));
  };

  const save = async (thenLeave: boolean) => {
    if (busy) return;
    setBusy(true);
    const lookId = await keepJob(jobId);
    setBusy(false);
    if (!lookId) {
      setSaveState("failed");
      toast.show("룩북에 저장하지 못했어요", undefined, { bottom: TOAST_OVER_PHOTO });
      return;
    }
    setSaveState("saved");
    setLeaveOpen(false);
    toast.show(
      "모든 룩에 저장했어요",
      [
        {
          label: "룩북에서 보기",
          onPress: () =>
            router.push({ pathname: "/lookbook/[id]", params: { id: "all", look: lookId } }),
        },
      ],
      { bottom: TOAST_OVER_PHOTO },
    );
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

  const preview = twinKey ? (
    <CoordiStage thumbnail twinKey={twinKey as PresetTwinKey} outfit={pieces} catalog={catalog} />
  ) : null;

  if (missing) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.muted}>이 완성 룩을 찾지 못했어요</Text>
        <Pressable role="button" onPress={() => toStage()}>
          <Text style={styles.link}>코디로 돌아가기</Text>
        </Pressable>
      </View>
    );
  }
  if (!job) return <View style={styles.screen} />;

  if (!finished) {
    const copy = makingCopy(job.status);
    return (
      <View style={styles.screen}>
        <Header
          left={
            <Pressable
              role="button"
              aria-label="닫기"
              onPress={() => toStage()}
              style={styles.closeButton}
            >
              <CloseIcon color={INK} />
              <Text style={styles.closeLabel}>닫기</Text>
            </Pressable>
          }
        />
        <View style={styles.makingBody}>
          <View style={styles.makingPhoto}>{preview}</View>
          <View
            role="progressbar"
            aria-label="만드는 중"
            aria-valuenow={copy.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            style={styles.track}
          >
            <View style={[styles.fillBar, { width: `${copy.percent}%` }]} />
          </View>
          <Text style={styles.makingTitle}>{copy.title}</Text>
          <Text style={styles.makingNote}>{copy.note}</Text>
        </View>
        <View style={styles.footer}>
          <Pressable
            role="button"
            onPress={() => toStage()}
            style={[styles.button, styles.surfaceFill]}
          >
            <Text style={styles.surfaceLabel}>코디로 돌아가기</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (job.status === "failed") {
    const copy = lookFailureCopy(job.paymentKind, job.failureCode, job.refund?.amount ?? 0);
    return (
      <View style={styles.screen}>
        <Header left={<BackButton onPress={back} />} />
        <ScrollView contentContainerStyle={styles.failBody}>
          <View style={styles.failPreviewFrame}>
            <View style={styles.failPreview}>{preview}</View>
            <View style={styles.failMark}>
              <Text style={styles.failMarkLabel}>!</Text>
            </View>
          </View>
          <Text role="heading" aria-level={2} style={styles.failTitle}>
            {`${copy.headline}\n${copy.title}`}
          </Text>
          <Text style={styles.failText}>{copy.body}</Text>
          <View style={styles.refund}>
            <Text style={styles.refundLabel}>{copy.refund.label}</Text>
            <Text style={styles.refundValue}>{copy.refund.value}</Text>
          </View>
        </ScrollView>
        <View style={styles.footer}>
          <Pressable
            role="button"
            onPress={() => (copy.action === "retry" ? void retry() : toStage())}
            style={[styles.button, styles.inkFill]}
          >
            <Text style={styles.inkLabel}>{copy.actionLabel}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Header left={<BackButton onPress={back} />} />
      <ScrollView contentContainerStyle={styles.resultBody}>
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
        <View style={styles.safetyRow}>
          <View style={styles.safetyPill}>
            <Text style={styles.safetyLabel}>안전 확인 끝</Text>
          </View>
          <Text style={styles.fitNote}>주름과 핏은 실제와 다를 수 있어요</Text>
        </View>
        {items.length > 0 ? (
          <View aria-label="입은 옷" style={styles.worn}>
            <Text role="heading" aria-level={2} style={styles.wornTitle}>
              {`입은 옷 ${items.length}벌`}
            </Text>
            {items.map((item, index) => {
              const thumb = catalog.get(item.id)?.thumb;
              return (
                <View key={item.id} style={[styles.wornRow, index > 0 && styles.wornDivider]}>
                  <View style={styles.wornThumb}>
                    {thumb ? (
                      <Image source={thumb} resizeMode="contain" style={styles.fill} />
                    ) : null}
                  </View>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.closet}>{closetLabel(item.closet)}</Text>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
      <View style={styles.bar}>
        <Text style={styles.barNote}>저장한 룩은 나만 봐요. 공개는 룩북에서 정해요</Text>
        <Pressable
          role="button"
          aria-label={saved ? "룩북에 저장했어요" : undefined}
          disabled={busy || saved}
          onPress={() => void save(false)}
          style={[styles.button, saved ? styles.surfaceFill : styles.inkFill, busy && styles.busy]}
        >
          {saved ? (
            <Text style={styles.savedLabel}>✓ 룩북에 저장했어요</Text>
          ) : (
            <Text style={styles.inkLabel}>
              {saveState === "failed" ? "다시 저장" : "내 룩북에 저장"}
            </Text>
          )}
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

/** 머리 줄: 왼쪽 단추와 가운데 「완성 룩」 */
function Header({ left }: { left: ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerSide}>{left}</View>
      <Text role="heading" aria-level={1} style={styles.headerTitle}>
        완성 룩
      </Text>
      <View style={styles.headerSide} />
    </View>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable role="button" aria-label="뒤로" onPress={onPress} style={styles.backButton}>
      <Text style={styles.backIcon}>‹</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAPER },
  center: { alignItems: "center", justifyContent: "center", gap: 10 },
  header: { flexDirection: "row", alignItems: "center", height: 44, paddingHorizontal: 8 },
  headerSide: { width: 96, alignItems: "flex-start" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "600", color: INK },
  // X 와 「닫기」 를 함께 누르는 영역 88×44
  closeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    width: 88,
    height: 44,
    paddingLeft: 8,
  },
  closeLabel: { fontSize: 15, fontWeight: "500", color: INK },
  backButton: { width: 44, height: 44, justifyContent: "center", paddingLeft: 10 },
  backIcon: { fontSize: 30, lineHeight: 34, color: INK },
  makingBody: { flex: 1, paddingHorizontal: 20, paddingTop: 8, overflow: "hidden" },
  makingPhoto: {
    width: "100%",
    flexShrink: 1,
    aspectRatio: 3 / 4,
    alignSelf: "center",
    overflow: "hidden",
    borderRadius: 12,
    backgroundColor: STAGE_PINK,
  },
  track: {
    height: 4,
    marginTop: 16,
    overflow: "hidden",
    borderRadius: 2,
    backgroundColor: LINE,
  },
  fillBar: { height: 4, borderRadius: 2, backgroundColor: INK },
  makingTitle: {
    marginTop: 16,
    fontSize: 17,
    fontWeight: "600",
    color: INK,
    textAlign: "center",
  },
  makingNote: { marginTop: 8, fontSize: 13, lineHeight: 20, color: SUB, textAlign: "center" },
  footer: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 },
  button: { alignItems: "center", justifyContent: "center", height: 52, borderRadius: 12 },
  inkFill: { backgroundColor: INK },
  surfaceFill: { backgroundColor: SURFACE },
  inkLabel: { color: "#fff", fontSize: 16, fontWeight: "600" },
  surfaceLabel: { color: INK, fontSize: 16, fontWeight: "600" },
  savedLabel: { color: SUB, fontSize: 16, fontWeight: "600" },
  busy: { opacity: 0.6 },
  failBody: { paddingHorizontal: 20, paddingTop: 32, paddingBottom: 24 },
  failPreviewFrame: { alignSelf: "center", width: 120, height: 160 },
  failPreview: {
    width: 120,
    height: 160,
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: STAGE_PINK,
  },
  // 미리보기 오른쪽 아래 모서리에 걸친 지름 28 흰 원과 느낌표
  failMark: {
    position: "absolute",
    right: -14,
    bottom: -14,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    boxShadow: "0px 1px 4px rgba(21,19,20,0.12)",
  },
  failMarkLabel: { fontSize: 16, fontWeight: "700", color: SUB },
  failTitle: {
    marginTop: 24,
    fontSize: 22,
    lineHeight: 32,
    fontWeight: "700",
    color: INK,
    textAlign: "center",
  },
  failText: { marginTop: 12, fontSize: 15, lineHeight: 22, color: SUB, textAlign: "center" },
  refund: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    height: 52,
    marginTop: 24,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: SURFACE,
  },
  refundLabel: { fontSize: 15, fontWeight: "500", color: INK },
  refundValue: { fontSize: 16, fontWeight: "700", color: INK },
  // 목록 끝에 아래 고정 영역 높이만큼 빈 자리를 둔다
  resultBody: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 140 },
  photo: { aspectRatio: 3 / 4, overflow: "hidden", borderRadius: 12, backgroundColor: STAGE_PINK },
  fill: { width: "100%", height: "100%" },
  badge: {
    position: "absolute",
    top: 12,
    left: 12,
    height: 24,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "rgba(21,19,20,0.8)",
  },
  badgeLabel: { color: "#fff", fontSize: 11, fontWeight: "600" },
  safetyRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  safetyPill: {
    height: 24,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: SURFACE,
  },
  safetyLabel: { fontSize: 12, fontWeight: "600", color: INK },
  fitNote: { flexShrink: 1, fontSize: 13, color: SUB },
  worn: { marginTop: 20 },
  wornTitle: { fontSize: 16, fontWeight: "600", color: INK, marginBottom: 4 },
  wornRow: { flexDirection: "row", alignItems: "center", gap: 12, height: 64 },
  wornDivider: { borderTopWidth: 1, borderTopColor: LINE },
  wornThumb: {
    width: 48,
    height: 48,
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: PHOTO,
  },
  itemName: { flex: 1, fontSize: 14, fontWeight: "500", color: INK },
  closet: { fontSize: 12, color: SUB },
  muted: { fontSize: 13, color: SUB },
  link: { fontSize: 14, fontWeight: "700", color: INK },
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: LINE,
    backgroundColor: "#fff",
  },
  barNote: { fontSize: 12, color: SUB, textAlign: "center" },
});
