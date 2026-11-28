import {
  outfitTitle,
  refKey,
  sameOutfit,
  samplePiece,
  sameRef,
  suggestGarments,
  toggleGarment,
  type Outfit,
  type OutfitCategory,
  type OutfitPiece,
  type SavedOutfit,
} from "@nuno/outfit";
import { presetTwin, type PresetTwinKey } from "@nuno/twin";
import { categoryLabel } from "@nuno/wardrobe";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import {
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
} from "react-native";
import {
  changeOutfit,
  deleteSaved,
  loadCoordi,
  onCoordiChange,
  overwriteSavedSlot,
  renameSaved,
  saveCurrentOutfit,
  stepOutfit,
  takeOutfitNotice,
  todayLookOf,
  wearTodayLook,
  type CoordiState,
} from "../../../src/composition/outfit";
import { switchTwin } from "../../../src/composition/twin";
import { loadClosetImages, type GarmentDetail } from "../../../src/composition/wardrobe";
import { AddGarmentSheet } from "../../../src/ui/add-garment-sheet";
import { useAppToast, type ToastAction } from "../../../src/ui/app-toast";
import {
  buildCatalog,
  lookPhotoOf,
  pieceOf,
  type CatalogItem,
} from "../../../src/ui/coordi-catalog";
import { CoordiGarmentSheet, type StripTab } from "../../../src/ui/coordi-garment-sheet";
import { CoordiStage } from "../../../src/ui/coordi-stage";
import { withObject, withTopic } from "../../../src/ui/korean-particle";
import { PersonIcon } from "../../../src/ui/line-icon";
import { MyOutfitsSheet, SavedFullSheet, SavedMenuSheet } from "../../../src/ui/my-outfits-sheet";
import { drawnOnStage } from "../../../src/ui/stage-config";
import { SuggestPanel } from "../../../src/ui/suggest-panel";
import { TWIN_ASSETS } from "../../../src/ui/twin-assets";
import { TwinSwitchSheet } from "../../../src/ui/twin-switch-sheet";
import { useGenerateFlow } from "../../../src/ui/use-generate-flow";
import { useStartGarment } from "../../../src/ui/use-start-garment";

const ZOOM = { min: 1, max: 3 } as const;
const INK = "#151314";
/** 옷 칸을 올렸을 때 작은 무대 줄 높이 */
const MINI_STAGE = 80;
/** 옷 칸 시트가 무대 아래를 덮는 높이. 옷 칸을 올리면 12 */
const SHEET_OVERLAP = { normal: 20, expanded: 12 } as const;
/** 코디 탭 알림 띠의 윗변은 무대 아랫변에서 128 위, 띠 높이 44 라 아랫변은 84 위다 */
const TOAST_ABOVE_STAGE_BOTTOM = 84;
const HINT_MS = 3000;

/** 무대 높이. 와이어프레임 v27 처럼 화면 높이에서 아래 옷 칸 몫을 빼고 236~308 안에 둔다. */
function stageHeight(screenHeight: number): number {
  return Math.min(308, Math.max(236, screenHeight - 536));
}

// 「옷을 누르면 빠져요」 는 앱을 켠 뒤 처음 옷을 입힌 직후 한 번만 보인다. 기기에 적지 않는다.
let removeHintShown = false;

// 피팅룸 「코디」: 트윈 무대 위에 옷을 바로 겹쳐 입히고 벗긴다. 서버는 「이대로 입히기」 흐름만 부른다.
export default function CoordiScreen() {
  const router = useRouter();
  const toast = useAppToast();
  const { height: screenHeight } = useWindowDimensions();
  const fullStage = stageHeight(screenHeight);
  const { start } = useStartGarment("mine");
  const [state, setState] = useState<CoordiState | null>(null);
  const [garments, setGarments] = useState<GarmentDetail[]>([]);
  const [category, setCategory] = useState<OutfitCategory>("outer");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [tab, setTab] = useState<StripTab>("recent");
  const [expanded, setExpanded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [sheet, setSheet] = useState<"my" | "full" | "twin" | "add" | null>(null);
  const [menu, setMenu] = useState<SavedOutfit | null>(null);
  const [suggestSeed, setSuggestSeed] = useState<number | null>(null);
  const [hint, setHint] = useState(false);
  const [stageBottom, setStageBottom] = useState<number | null>(null);
  const stageRef = useRef<ComponentRef<typeof View>>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(hintTimer.current), []);

  const load = useCallback(() => {
    void Promise.all([loadCoordi(), loadClosetImages("mine")]).then(([next, list]) => {
      setState(next);
      setGarments(list);
    });
  }, []);

  // 다른 화면(옷 상세 등)이 위에 떠 있는 동안에도 변경을 듣는다. 지운 옷 그림을 낡은 상태로 다시 그리지 않게 한다.
  useEffect(() => onCoordiChange(load), [load]);
  useFocusEffect(load);

  const catalog = useMemo(() => buildCatalog(garments), [garments]);
  const catalogMap = useMemo(() => new Map(catalog.map((item) => [item.key, item])), [catalog]);

  const generate = useGenerateFlow(state?.twinKey ?? "", state?.outfit ?? null, catalogMap);

  // 옷 칸이 내려와 있으면 알림을 옷 칸 시트 바로 위, 무대 아래쪽에 띄운다.
  const notify = (message: string, actions?: ToastAction[]) =>
    toast.show(
      message,
      actions,
      !expanded && stageBottom !== null
        ? { bottom: screenHeight - (stageBottom - TOAST_ABOVE_STAGE_BOTTOM) }
        : undefined,
    );

  // 홈 추천 코디 카드가 남긴 알림은 무대 자리를 잰 뒤 무대 아래에 띄운다.
  useFocusEffect(
    useCallback(() => {
      if (stageBottom === null) return;
      const notice = takeOutfitNotice();
      if (!notice) return;
      notify(notice.message, [
        {
          label: "되돌리기",
          onPress: () => void changeOutfit(notice.before, { twinKey: notice.twinKey }),
        },
      ]);
      // notify 는 렌더마다 새로 만든다. 무대 자리가 정해질 때만 다시 본다.
    }, [stageBottom]),
  );

  const measureStage = () =>
    stageRef.current?.measureInWindow((_x, y, _width, height) => setStageBottom(y + height));

  // 손잡이: 누르거나 위로 끌면 옷 칸이 올라오고, 아래로 끌면 내려온다.
  const handle = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy < -14) setExpanded(true);
        else if (gesture.dy > 14) setExpanded(false);
        else setExpanded((value) => !value);
      },
    }),
  ).current;

  // 확대한 무대는 한 손가락으로 옮기고, 두 손가락 벌리기로 키운다.
  const gesture = useRef({ startPan: { x: 0, y: 0 }, startZoom: 1, startDistance: 0 });
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const panRef = useRef(pan);
  panRef.current = pan;
  const distance = (event: GestureResponderEvent) => {
    const [a, b] = event.nativeEvent.touches;
    return a && b ? Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) : 0;
  };
  const stagePan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (event, g) =>
        event.nativeEvent.touches.length === 2 ||
        (zoomRef.current > 1 && Math.abs(g.dx) + Math.abs(g.dy) > 4),
      onPanResponderGrant: (event) => {
        gesture.current = {
          startPan: panRef.current,
          startZoom: zoomRef.current,
          startDistance: distance(event),
        };
      },
      onPanResponderMove: (event, g) => {
        const now = distance(event);
        if (now > 0 && gesture.current.startDistance > 0) {
          const next = (gesture.current.startZoom * now) / gesture.current.startDistance;
          const clamped = Math.min(ZOOM.max, Math.max(ZOOM.min, next));
          setZoom(clamped);
          if (clamped === ZOOM.min) setPan({ x: 0, y: 0 });
          return;
        }
        if (zoomRef.current > 1) {
          setPan({ x: gesture.current.startPan.x + g.dx, y: gesture.current.startPan.y + g.dy });
        }
      },
    }),
  ).current;

  if (!state) {
    return (
      <View style={styles.screen}>
        {/* 화면 읽기 프로그램용 칸 제목. 피팅룸 칸마다 본문 첫 제목이 칸 이름이다. */}
        <Text role="heading" aria-level={2} style={styles.hiddenHeading}>
          코디
        </Text>
      </View>
    );
  }
  const twinKey = state.twinKey as PresetTwinKey;
  const outfit = state.outfit;
  const nameOf = (piece: OutfitPiece) => catalogMap.get(refKey(piece.ref))?.name ?? "";
  const shortOf = (piece: OutfitPiece) => catalogMap.get(refKey(piece.ref))?.shortName ?? "";
  // 알림 「되돌리기」 는 알림을 띄운 트윈이 지금 트윈일 때만 바꾸기 전 코디를 다시 입힌다.
  const restore = (before: Outfit): ToastAction => ({
    label: "되돌리기",
    onPress: () => void changeOutfit(before, { twinKey }),
  });
  const withRestore = (message: string) => (before: Outfit | null) => {
    if (before) notify(message, [restore(before)]);
  };

  const showRemoveHint = () => {
    removeHintShown = true;
    // 안내는 알림 띠와 같은 높이에 뜬다. 앞서 띄운 알림은 걷어 안내가 가려지지 않게 한다.
    toast.hide();
    setHint(true);
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(false), HINT_MS);
  };

  const wear = (item: CatalogItem) => {
    const next = toggleGarment(outfit, pieceOf(item));
    // 무대에 옷 그림이 겹쳐 보일 때만 「옷을 누르면 빠져요」 를 띄운다. 착장 사진이면 옷을 누를 수 없다.
    const firstWear =
      !removeHintShown &&
      !expanded &&
      next.length > outfit.length &&
      !lookPhotoOf(twinKey, next) &&
      drawnOnStage(pieceOf(item));
    void changeOutfit((current) => toggleGarment(current, pieceOf(item))).then(() => {
      if (firstWear) showRemoveHint();
    });
  };

  const clear = () => {
    if (outfit.length === 0) return;
    void changeOutfit([]).then(withRestore("옷을 모두 비웠어요"));
  };

  const step = (direction: "undo" | "redo") =>
    void stepOutfit(direction).then((done) => {
      if (!done)
        notify(direction === "undo" ? "되돌릴 코디가 없어요" : "앞으로 돌릴 코디가 없어요");
    });

  const takeOff = (piece: OutfitPiece) =>
    void changeOutfit((current) => current.filter((item) => !sameRef(item.ref, piece.ref))).then(
      withRestore(`${withObject(categoryLabel(piece.category))} 벗었어요`),
    );

  const pickOutfit = (next: Outfit, title: string) => {
    if (sameOutfit(next, outfit)) return;
    void changeOutfit(next).then(withRestore(`${title} 코디로 바꿨어요`));
  };

  const save = () =>
    void saveCurrentOutfit().then((result) => {
      if (result.kind === "empty") notify("옷을 입힌 뒤 담을 수 있어요");
      else if (result.kind === "full") {
        toast.hide();
        setSheet("full");
      } else notify(`내 코디에 저장했어요 ${result.count}/5`);
    });

  const pickTwin = (key: PresetTwinKey) => {
    setSheet(null);
    if (key === twinKey) return;
    toast.hide();
    void switchTwin(key).then(load);
  };

  const closetItems = catalog.filter((item) => !item.sample);
  const picks =
    suggestSeed !== null
      ? suggestGarments(
          closetItems.map((item) => ({ ref: item.ref, category: item.category })),
          outfit,
          suggestSeed,
        )
          .map((pick) => catalogMap.get(refKey(pick.ref)))
          .filter((item): item is CatalogItem => Boolean(item))
      : [];
  const hiddenWorn = outfit.filter(
    (piece) => catalogMap.has(refKey(piece.ref)) && !drawnOnStage(piece),
  );
  const look = todayLookOf(twinKey);
  const today = look
    ? {
        outfit: look.items.map(samplePiece),
        title: outfitTitle(look.items.map(samplePiece), shortOf),
      }
    : null;

  return (
    <View style={styles.screen}>
      {/* 화면 읽기 프로그램용 칸 제목. 피팅룸 칸마다 본문 첫 제목이 칸 이름이다. */}
      <Text role="heading" aria-level={2} style={styles.hiddenHeading}>
        코디
      </Text>
      <View
        ref={stageRef}
        testID="coordi-stage"
        onLayout={measureStage}
        style={[styles.stageWrap, { height: expanded ? MINI_STAGE : fullStage }]}
        {...stagePan.panHandlers}
      >
        {/* 옷 칸을 올려도 트윈은 같은 크기로 두고 작은 무대 줄이 얼굴과 어깨만 보인다. */}
        <View
          style={[
            styles.stageInner,
            {
              height: fullStage,
              transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale: zoom }],
            },
          ]}
        >
          <CoordiStage
            twinKey={twinKey}
            outfit={outfit}
            catalog={catalogMap}
            onTapPiece={expanded || zoom > 1 ? undefined : takeOff}
          />
        </View>

        {expanded ? (
          <>
            <View style={styles.miniLeft}>{generate.compactButton}</View>
            <Pressable
              role="button"
              hitSlop={{ top: 4, bottom: 4 }}
              onPress={() => setExpanded(false)}
              style={[styles.pill, styles.miniRight]}
            >
              <Text style={styles.pillLabelStrong}>트윈 크게 보기</Text>
              <View aria-hidden style={styles.chevronBox}>
                <View style={styles.chevron} />
              </View>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.leftTop}>
              <Pressable
                role="button"
                aria-label={`${presetTwin(twinKey).name}, 트윈 메뉴 열기`}
                onPress={() => setSheet("twin")}
                style={styles.face}
              >
                <View style={styles.faceClip}>
                  <Image source={TWIN_ASSETS[twinKey].base} style={styles.faceImage} />
                </View>
                <View style={styles.faceBadge}>
                  <Text style={styles.faceBadgeLabel}>⇄</Text>
                </View>
              </Pressable>
              <Pressable
                role="button"
                aria-label={outfit.length > 0 ? "옷 비우기" : "입은 옷이 없어요"}
                hitSlop={{ top: 4, bottom: 4 }}
                onPress={clear}
                style={[styles.pill, outfit.length === 0 && styles.dim]}
              >
                <View aria-hidden style={styles.icon16}>
                  <View style={styles.icon16Scale}>
                    <PersonIcon color={INK} />
                  </View>
                </View>
                <Text style={styles.pillLabel}>옷 비우기</Text>
              </Pressable>
            </View>
            <Pressable role="button" onPress={() => setSheet("my")} style={styles.myButton}>
              <View style={styles.round}>
                <View aria-hidden style={styles.bookmark}>
                  <View style={styles.bookmarkNotch} />
                </View>
              </View>
              <Text style={styles.myLabel}>내 코디</Text>
            </Pressable>
            {hint ? (
              <View pointerEvents="none" style={styles.hint}>
                <Text style={styles.hintLabel}>옷을 누르면 빠져요</Text>
              </View>
            ) : null}
            <Pressable
              role="button"
              hitSlop={{ top: 4, bottom: 4 }}
              onPress={() => setSuggestSeed(0)}
              style={[styles.pill, styles.leftBottom]}
            >
              <View aria-hidden style={styles.bulb}>
                <View style={styles.bulbGlass} />
                <View style={styles.bulbBase} />
              </View>
              <Text style={styles.pillLabelStrong}>내 옷으로 추천</Text>
            </Pressable>
            {generate.button}
          </>
        )}
      </View>

      {hiddenWorn.length > 0 ? (
        <Text style={styles.hiddenLine}>
          {withTopic(hiddenWorn.map(nameOf).join(", "))} 미리보기에 안 보여요. 옷 칸에서 확인해요
        </Text>
      ) : null}

      <View
        style={[
          styles.sheet,
          { marginTop: -(expanded ? SHEET_OVERLAP.expanded : SHEET_OVERLAP.normal) },
        ]}
      >
        <View
          role="button"
          aria-label={expanded ? "옷 칸 내리고 트윈 크게 보기" : "옷 칸 크게 올리기"}
          style={styles.handleArea}
          {...handle.panHandlers}
        >
          <View style={styles.handle} />
        </View>
        <CoordiGarmentSheet
          twinKey={twinKey}
          outfit={outfit}
          catalog={catalog}
          catalogMap={catalogMap}
          recents={state.recents}
          category={category}
          onCategory={setCategory}
          favoriteOnly={favoriteOnly}
          onFavoriteOnly={setFavoriteOnly}
          canUndo={state.canUndo}
          canRedo={state.canRedo}
          onStep={step}
          showStrip={!expanded && suggestSeed === null}
          tab={tab}
          onTab={setTab}
          onWear={wear}
          onDetail={(item) => item.ref.kind === "garment" && router.push(`/garment/${item.ref.id}`)}
          onAdd={() => setSheet("add")}
          onPickOutfit={pickOutfit}
          suggestion={
            suggestSeed !== null ? (
              <SuggestPanel
                picks={picks}
                onWear={wear}
                onRetry={() => setSuggestSeed(suggestSeed + 1)}
                onClose={() => setSuggestSeed(null)}
              />
            ) : null
          }
        />
      </View>

      <MyOutfitsSheet
        visible={sheet === "my"}
        twinKey={twinKey}
        saved={state.saved}
        catalog={catalogMap}
        today={today}
        onClose={() => setSheet(null)}
        onSave={save}
        onLoad={(saved) => {
          setSheet(null);
          void changeOutfit(saved.outfit, { remember: false });
        }}
        onToday={() => {
          setSheet(null);
          void wearTodayLook();
        }}
        onMenu={setMenu}
      />
      <SavedFullSheet
        visible={sheet === "full"}
        saved={state.saved}
        catalog={catalogMap}
        onClose={() => setSheet("my")}
        onOverwrite={(slot) =>
          void overwriteSavedSlot(slot).then(() => {
            setSheet("my");
            notify("이 칸에 덮어썼어요");
          })
        }
      />
      <SavedMenuSheet
        saved={menu}
        onClose={() => setMenu(null)}
        onRename={(title) => {
          if (!menu) return;
          void renameSaved(menu.id, title).then(() => {
            setMenu(null);
            notify("이름을 바꿨어요");
          });
        }}
        onDelete={() => {
          if (!menu) return;
          void deleteSaved(menu.id).then(() => {
            setMenu(null);
            notify("코디를 지웠어요");
          });
        }}
      />
      <TwinSwitchSheet
        visible={sheet === "twin"}
        current={twinKey}
        onPick={pickTwin}
        onClose={() => setSheet(null)}
      />
      <AddGarmentSheet
        visible={sheet === "add"}
        counts={null}
        onClose={() => setSheet(null)}
        onPick={(method) => {
          setSheet(null);
          if (method === "camera")
            router.push({ pathname: "/garment/new/shoot", params: { from: "mine" } });
          else void start(method);
        }}
      />
      {generate.sheets}
    </View>
  );
}

const PILL_BG = "rgba(255,255,255,0.92)";

// 자리와 크기는 와이어프레임 v27 코디 무대(390x844 기준 무대 308)를 따른다.
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  hiddenHeading: { position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" },
  stageWrap: { overflow: "hidden" },
  stageInner: { width: "100%" },
  leftTop: { position: "absolute", top: 12, left: 16, gap: 12, alignItems: "flex-start" },
  face: { width: 48, height: 48 },
  faceClip: {
    flex: 1,
    overflow: "hidden",
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "#EFEDEA",
  },
  // 기본 사진(900x1205)에서 얼굴(가로 0.49, 세로 0.12)이 동그라미 가운데에 오게 키워 옮긴다.
  faceImage: { position: "absolute", width: 220, height: 295, left: -86, top: -13 },
  faceBadge: {
    position: "absolute",
    left: 32,
    top: 32,
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: "#fff",
    backgroundColor: INK,
  },
  faceBadgeLabel: { color: "#fff", fontSize: 10, lineHeight: 12 },
  pill: {
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: PILL_BG,
  },
  pillLabel: { fontSize: 13, fontWeight: "500", color: INK },
  pillLabelStrong: { fontSize: 13, fontWeight: "600", color: INK },
  dim: { opacity: 0.38 },
  icon16: { width: 16, height: 16, overflow: "hidden" },
  icon16Scale: { width: 24, height: 24, margin: -4, transform: [{ scale: 16 / 24 }] },
  myButton: {
    position: "absolute",
    top: 12,
    right: 16,
    width: 48,
    alignItems: "center",
    gap: 4,
  },
  round: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    backgroundColor: PILL_BG,
  },
  myLabel: {
    width: 80,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    color: INK,
  },
  // 책갈피 22: 선 1.75 의 세로 사각형과 아래 가운데 V 홈
  bookmark: {
    width: 14,
    height: 18,
    borderWidth: 1.75,
    borderBottomWidth: 0,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    borderColor: INK,
    overflow: "hidden",
  },
  bookmarkNotch: {
    position: "absolute",
    left: 1.5,
    bottom: -6,
    width: 8,
    height: 8,
    borderTopWidth: 1.75,
    borderLeftWidth: 1.75,
    borderColor: INK,
    backgroundColor: PILL_BG,
    transform: [{ rotate: "45deg" }],
  },
  // 전구 16: 동그란 유리와 아래 받침
  bulb: { width: 16, height: 16, alignItems: "center" },
  bulbGlass: { width: 11, height: 11, borderRadius: 5.5, borderWidth: 1.75, borderColor: INK },
  bulbBase: { width: 6, height: 3, marginTop: 1, borderRadius: 1, backgroundColor: INK },
  // 옷 칸 시트가 무대 아래를 20 만큼 덮으므로 무대 아래 알약은 아랫변을 무대 끝에서 32 위에 둔다.
  leftBottom: { position: "absolute", left: 16, bottom: 32 },
  hint: {
    position: "absolute",
    alignSelf: "center",
    bottom: 80,
    height: 32,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "rgba(21,19,20,0.8)",
  },
  hintLabel: { color: "#fff", fontSize: 13, fontWeight: "500" },
  miniLeft: { position: "absolute", left: 16, top: 16 },
  miniRight: { position: "absolute", right: 16, top: 16 },
  chevronBox: { width: 16, height: 16, alignItems: "center", justifyContent: "center" },
  chevron: {
    width: 7,
    height: 7,
    marginTop: -4,
    borderRightWidth: 1.75,
    borderBottomWidth: 1.75,
    borderColor: INK,
    transform: [{ rotate: "45deg" }],
  },
  hiddenLine: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 26,
    fontSize: 12,
    color: "#5F5C56",
  },
  sheet: {
    flex: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: "#fff",
    boxShadow: "0px -2px 12px rgba(21,19,20,0.06)",
  },
  handleArea: { height: 21, alignItems: "center", paddingTop: 8 },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: "rgba(21,19,20,0.2)" },
});
