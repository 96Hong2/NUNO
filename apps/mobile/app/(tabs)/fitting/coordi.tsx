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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
  todayLookOf,
  wearTodayLook,
  type CoordiState,
} from "../../../src/composition/outfit";
import { switchTwin } from "../../../src/composition/twin";
import {
  loadClosetImages,
  toggleFavorite,
  type GarmentDetail,
} from "../../../src/composition/wardrobe";
import { AddGarmentSheet } from "../../../src/ui/add-garment-sheet";
import { useAppToast, type ToastAction } from "../../../src/ui/app-toast";
import { buildCatalog, pieceOf, type CatalogItem } from "../../../src/ui/coordi-catalog";
import { CoordiGarmentSheet, type StripTab } from "../../../src/ui/coordi-garment-sheet";
import { CoordiStage } from "../../../src/ui/coordi-stage";
import { CHERRY } from "../../../src/ui/garment-card";
import { withObject, withTopic } from "../../../src/ui/korean-particle";
import { MyOutfitsSheet, SavedFullSheet, SavedMenuSheet } from "../../../src/ui/my-outfits-sheet";
import { drawnOnStage } from "../../../src/ui/stage-config";
import { SuggestPanel, SuggestRange, type SuggestScope } from "../../../src/ui/suggest-panel";
import { TWIN_ASSETS } from "../../../src/ui/twin-assets";
import { TwinSwitchSheet } from "../../../src/ui/twin-switch-sheet";
import { useGenerateFlow } from "../../../src/ui/use-generate-flow";
import { useStartGarment } from "../../../src/ui/use-start-garment";

const ZOOM = { min: 1, max: 3, step: 0.5 } as const;

// 피팅룸 「코디」: 트윈 무대 위에 옷을 바로 겹쳐 입히고 벗긴다. 서버는 「이대로 입히기」 흐름만 부른다.
export default function CoordiScreen() {
  const router = useRouter();
  const toast = useAppToast();
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
  const [range, setRange] = useState(false);
  const [suggest, setSuggest] = useState<{ scopes: SuggestScope[]; seed: number } | null>(null);

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

  const generate = useGenerateFlow(state?.twinKey ?? "", state?.outfit ?? [], catalogMap);

  const notify = (message: string, actions?: ToastAction[]) => toast.show(message, actions);

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
          setZoom(Math.min(ZOOM.max, Math.max(ZOOM.min, next)));
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
  // 알림 「되돌리기」 는 알림을 띄운 트윈이 지금 트윈일 때만 바꾸기 전 코디를 다시 입힌다.
  const restore = (before: Outfit): ToastAction => ({
    label: "되돌리기",
    onPress: () => void changeOutfit(before, { twinKey }),
  });
  const withRestore = (message: string) => (before: Outfit | null) => {
    if (before) notify(message, [restore(before)]);
  };

  const wear = (item: CatalogItem) =>
    void changeOutfit((current) => toggleGarment(current, pieceOf(item)));

  const clear = () => {
    if (outfit.length === 0) return;
    void changeOutfit([]).then(withRestore("입은 옷을 모두 벗었어요"));
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
  const pool = suggest
    ? closetItems.filter((item) => suggest.scopes.includes("closet") || item.favorite)
    : [];
  const picks = suggest
    ? suggestGarments(
        pool.map((item) => ({ ref: item.ref, category: item.category })),
        outfit,
        suggest.seed,
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
        title: outfitTitle(look.items.map(samplePiece), nameOf),
      }
    : null;

  return (
    <View style={styles.screen}>
      {/* 화면 읽기 프로그램용 칸 제목. 피팅룸 칸마다 본문 첫 제목이 칸 이름이다. */}
      <Text role="heading" aria-level={2} style={styles.hiddenHeading}>
        코디
      </Text>
      <View
        testID="coordi-stage"
        style={[styles.stageWrap, expanded && styles.stageSmall]}
        {...stagePan.panHandlers}
      >
        <View
          style={[
            styles.stageInner,
            { transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale: zoom }] },
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
          <Pressable role="button" onPress={() => setExpanded(false)} style={styles.bigPill}>
            <Text style={styles.pillLabel}>트윈 크게 보기 ⌄</Text>
          </Pressable>
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
                aria-label={outfit.length > 0 ? "입은 옷 모두 벗기" : "입은 옷이 없어요"}
                onPress={clear}
                style={[styles.pill, outfit.length === 0 && styles.dim]}
              >
                <Text style={styles.pillLabel}>옷 비우기</Text>
              </Pressable>
            </View>
            <View style={styles.rightTop}>
              <Pressable role="button" onPress={() => setSheet("my")} style={styles.myButton}>
                <View style={styles.round}>
                  <Text style={styles.roundIcon}>🔖</Text>
                </View>
                <Text style={styles.myLabel}>내 코디</Text>
              </Pressable>
              <View style={styles.column}>
                <View style={styles.vpill}>
                  <Pressable
                    role="button"
                    aria-label="트윈 확대"
                    onPress={() => setZoom(Math.min(ZOOM.max, zoom + ZOOM.step))}
                    style={styles.vbutton}
                  >
                    <Text style={[styles.vicon, zoom >= ZOOM.max && styles.dim]}>＋</Text>
                  </Pressable>
                  <Pressable
                    role="button"
                    aria-label="트윈 축소"
                    onPress={() => {
                      const next = Math.max(ZOOM.min, zoom - ZOOM.step);
                      setZoom(next);
                      if (next === 1) setPan({ x: 0, y: 0 });
                    }}
                    style={styles.vbutton}
                  >
                    <Text style={[styles.vicon, zoom <= ZOOM.min && styles.dim]}>−</Text>
                  </Pressable>
                </View>
                <View style={styles.vpill}>
                  <Pressable
                    role="button"
                    aria-label="이전 코디"
                    onPress={() => step("undo")}
                    style={styles.vbutton}
                  >
                    <Text style={[styles.vicon, !state.canUndo && styles.dim]}>↶</Text>
                  </Pressable>
                  <Pressable
                    role="button"
                    aria-label="다음 코디"
                    onPress={() => step("redo")}
                    style={styles.vbutton}
                  >
                    <Text style={[styles.vicon, !state.canRedo && styles.dim]}>↷</Text>
                  </Pressable>
                </View>
              </View>
            </View>
            <Pressable
              role="button"
              onPress={() => setRange(!range)}
              style={[styles.pill, styles.leftBottom]}
            >
              <Text style={styles.pillLabel}>💡 추천 코디</Text>
            </Pressable>
            {range ? (
              <Pressable
                role="button"
                aria-label="추천 범위 닫기"
                style={styles.rangeBackdrop}
                onPress={() => setRange(false)}
              />
            ) : null}
            {generate.button}
            <SuggestRange
              visible={range}
              counts={{
                closet: closetItems.length,
                favorite: closetItems.filter((item) => item.favorite).length,
              }}
              onBlocked={(message) => notify(message)}
              onSubmit={(scopes) => {
                setRange(false);
                setSuggest({ scopes, seed: 0 });
              }}
            />
          </>
        )}
      </View>

      {hiddenWorn.length > 0 ? (
        <Text style={styles.hiddenLine}>
          {withTopic(hiddenWorn.map(nameOf).join(", "))} 미리보기에 안 보여요. 옷 칸에서 확인해요
        </Text>
      ) : null}

      <View style={styles.sheet}>
        <View
          role="button"
          aria-label={expanded ? "옷 칸 내리고 트윈 크게 보기" : "옷 칸 크게 올리기"}
          style={styles.handleArea}
          {...handle.panHandlers}
        >
          <View style={styles.handle} />
        </View>
        <ScrollView contentContainerStyle={styles.sheetBody}>
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
            tab={tab}
            onTab={setTab}
            onWear={wear}
            onDetail={(item) =>
              item.ref.kind === "garment" && router.push(`/garment/${item.ref.id}`)
            }
            onFavorite={(item) =>
              item.ref.kind === "garment" &&
              void toggleFavorite(item.ref.id, !item.favorite).then(() =>
                notify(item.favorite ? "즐겨찾기에서 뺐어요" : "즐겨찾기에 넣었어요"),
              )
            }
            onAdd={() => setSheet("add")}
            onPickOutfit={pickOutfit}
            suggestion={
              suggest ? (
                <SuggestPanel
                  picks={picks}
                  scopes={suggest.scopes}
                  onWear={wear}
                  onRetry={() => setSuggest({ ...suggest, seed: suggest.seed + 1 })}
                  onClose={() => setSuggest(null)}
                />
              ) : null
            }
          />
        </ScrollView>
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  hiddenHeading: { position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" },
  stageWrap: { height: 400, overflow: "hidden" },
  stageSmall: { height: 150 },
  stageInner: { flex: 1 },
  leftTop: { position: "absolute", top: 12, left: 12, gap: 10, alignItems: "flex-start" },
  face: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: CHERRY,
    backgroundColor: "#fff",
  },
  faceClip: { flex: 1, overflow: "hidden", borderRadius: 20 },
  // 기본 사진(900x1205)에서 얼굴(가로 0.49, 세로 0.12)이 동그라미 가운데에 오게 키워 옮긴다.
  faceImage: { position: "absolute", width: 200, height: 268, left: -78, top: -12 },
  faceBadge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: "#151314",
  },
  faceBadgeLabel: { color: "#fff", fontSize: 10 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: "#fff",
  },
  pillLabel: { fontSize: 13, fontWeight: "600", color: "#151314" },
  dim: { opacity: 0.38 },
  rightTop: { position: "absolute", top: 12, right: 12, flexDirection: "row", gap: 8 },
  myButton: { alignItems: "center", gap: 3 },
  round: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "#fff",
  },
  roundIcon: { fontSize: 16 },
  myLabel: { fontSize: 11, fontWeight: "600", color: "#151314" },
  column: { gap: 8 },
  vpill: { borderRadius: 18, backgroundColor: "#fff" },
  vbutton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  vicon: { fontSize: 17, color: "#151314" },
  // 옷 칸 시트가 무대 아래를 16 만큼 덮으므로(sheet marginTop) 무대 아래 알약은 그만큼 올린다.
  leftBottom: { position: "absolute", left: 12, bottom: 28 },
  rangeBackdrop: { ...StyleSheet.absoluteFill, zIndex: 5 },
  bigPill: {
    position: "absolute",
    right: 12,
    bottom: 26,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: "#fff",
  },
  hiddenLine: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 22,
    fontSize: 12,
    color: "#76736C",
  },
  sheet: {
    flex: 1,
    marginTop: -16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: "#fff",
  },
  handleArea: { alignItems: "center", paddingVertical: 8 },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: "#D9D7D2" },
  sheetBody: { paddingHorizontal: 16, paddingBottom: 32 },
});
