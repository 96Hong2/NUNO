import {
  outfitTitle,
  RECOMMENDED_LOOKS,
  refKey,
  samplePiece,
  type OutfitPiece,
  type RecommendedLook,
} from "@nuno/outfit";
import { DEFAULT_PRESET_TWIN, presetTwin, type PresetTwinKey } from "@nuno/twin";
import { categoryLabel, type GarmentMethod } from "@nuno/wardrobe";
import { Tabs, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewInstance,
  type ViewInstance,
} from "react-native";
import {
  changeOutfit,
  leaveOutfitNotice,
  loadCoordi,
  onCoordiChange,
  wearTodayLook,
} from "../../src/composition/outfit";
import { loadRecentLooks, type BookLook } from "../../src/composition/lookbook";
import { completeTour } from "../../src/composition/profile";
import { loadCurrentTwin, switchTwin } from "../../src/composition/twin";
import {
  loadClosetImages,
  loadRecentGarments,
  onClosetChange,
  type ClosetView,
} from "../../src/composition/wardrobe";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AddGarmentSheet } from "../../src/ui/add-garment-sheet";
import { buildCatalog } from "../../src/ui/coordi-catalog";
import { FirstTour } from "../../src/ui/first-tour";
import { HomeRecoStrip } from "../../src/ui/home-reco-strip";
import { BellIcon } from "../../src/ui/line-icon";
import { LookCard } from "../../src/ui/look-card";
import { LOOK_PHOTOS } from "../../src/ui/sample-assets";
import { GarmentCard } from "../../src/ui/garment-card";
import { useProfile } from "../../src/ui/profile-gate";
import { useAppToast } from "../../src/ui/app-toast";
import { TWIN_ASSETS } from "../../src/ui/twin-assets";
import { TwinSwitchSheet } from "../../src/ui/twin-switch-sheet";
import { useStartGarment } from "../../src/ui/use-start-garment";

const INK = "#151314";
const SUB = "#5F5C56";
/** 홈 머리 줄 높이(상태 표시줄 아래). 피팅룸 머리 줄과 같다 */
const HEADER_HEIGHT = 52;
const LINE = "#E7E6E3";
const SURFACE = "#F6F5F3";

// 홈 시트 두 칸. 「최근 추가한 옷」 은 옷장 두 칸을 합쳐 마지막에 추가한 옷부터 12벌을 3열로 보인다.
// 「최근 저장한 룩」 은 기기 견본 룩과 서버 완성 룩을 최근 저장 순으로 보인다. 완성 룩은 「모든 룩」 크게 보기로 연다.
// 칸이 비면 빈 안내 대신 추천 코디 줄을 보인다.
// 칸은 role tab 이 아니라 단추다. 하단 탭 셋만 tab 으로 센다.
const CELLS = [
  { key: "recentLooks", label: "최근 저장한 룩" },
  { key: "recentGarments", label: "최근 추가한 옷" },
] as const;

type CellKey = (typeof CELLS)[number]["key"];

/** 홈 「최근 저장한 룩」 카드 수(와이어프레임 8장) */
const RECENT_LOOK_LIMIT = 8;

/** 시트 좌우 여백과 카드 사이(룩 두 열 16, 옷 세 열 8) */
const SIDE = 16;
const LOOK_GAP = 16;
const GARMENT_GAP = 8;

// 홈 무대: 고른 트윈의 기본 코디 완성 사진이 흰 바탕 위에 선다. 꾸민 얼굴과 입힌 옷은 반영하지 않는다.
export default function HomeScreen() {
  const { profile, refresh } = useProfile();
  const toast = useAppToast();
  const { show } = toast;
  const [twin, setTwin] = useState<PresetTwinKey | null>(null);
  const [switching, setSwitching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [cell, setCell] = useState<CellKey>("recentLooks");
  // 두 칸 목록은 읽기 전 null 이다. 다 읽고 0건일 때만 추천 코디 줄을 보인다.
  const [recent, setRecent] = useState<ClosetView | null>(null);
  const [looks, setLooks] = useState<BookLook[] | null>(null);
  const [failed, setFailed] = useState<Record<CellKey, boolean>>({
    recentLooks: false,
    recentGarments: false,
  });
  const [outfitName, setOutfitName] = useState("");
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [sheetWidth, setSheetWidth] = useState(0);
  const { start } = useStartGarment("mine");
  // 처음 둘러보기 1 / 2 가 밝히는 무대 「코디」 단추
  const coordiButton = useRef<ViewInstance>(null);

  // 시트 탭을 누르면 시트 윗변까지 올린다. 시트가 화면 위에 닿으면 머리글이 트윈 얼굴, 이름, 코디 이름으로 바뀐다.
  const scroll = useRef<ScrollViewInstance>(null);
  const [sheetY, setSheetY] = useState<number | null>(null);
  const [viewHeight, setViewHeight] = useState(0);
  const [raised, setRaised] = useState(false);

  const loadOutfitName = useCallback(() => {
    void Promise.all([loadCoordi(), loadClosetImages("mine")]).then(([state, garments]) => {
      const names = new Map(buildCatalog(garments).map((item) => [item.key, item.name]));
      const nameOf = (piece: OutfitPiece) => names.get(refKey(piece.ref)) ?? "";
      setOutfitName(outfitTitle(state.outfit, nameOf));
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      const load = () => {
        const fail = (key: CellKey) => setFailed((current) => ({ ...current, [key]: true }));
        const ok = (key: CellKey) => setFailed((current) => ({ ...current, [key]: false }));
        loadRecentGarments().then(
          (next) => (setRecent(next), ok("recentGarments")),
          () => fail("recentGarments"),
        );
        loadRecentLooks().then(
          (next) => (setLooks(next), ok("recentLooks")),
          () => fail("recentLooks"),
        );
        loadOutfitName();
      };
      load();
      const offCloset = onClosetChange(load);
      const offCoordi = onCoordiChange(loadOutfitName);
      return () => {
        offCloset();
        offCoordi();
      };
    }, [loadOutfitName]),
  );

  useEffect(() => {
    loadCurrentTwin().then(setTwin, (caught: unknown) => show(String(caught)));
  }, [show]);

  const pick = async (key: PresetTwinKey) => {
    if (key === twin) {
      setSwitching(false);
      return;
    }
    await switchTwin(key);
    setTwin(key);
    setSwitching(false);
    show(`${presetTwin(key).name} 트윈으로 바꿨어요`);
  };

  const finishTour = async () => {
    await completeTour();
    await refresh();
  };

  const openCell = (key: CellKey) => {
    setCell(key);
    if (sheetY !== null) scroll.current?.scrollTo({ y: sheetY, animated: true });
  };

  const openCoordi = () => router.navigate("/fitting/coordi");

  // 추천 코디 카드는 코디 탭 「추천 코디」 카드와 같이 그 코디를 입힌다.
  // 알림과 「되돌리기」 는 코디 무대에 넘겨, 코디 탭 카드를 누를 때와 같은 무대 아래 자리에 뜨게 한다.
  const wearReco = (look: RecommendedLook) => {
    const twinKey = twin;
    void changeOutfit(look.items.map(samplePiece)).then((before) => {
      if (before && twinKey)
        leaveOutfitNotice({ message: `${look.name} 코디로 바꿨어요`, before, twinKey });
      openCoordi();
    });
  };

  const onPickMethod = (method: GarmentMethod) => {
    setAdding(false);
    if (method === "camera")
      router.push({ pathname: "/garment/new/shoot", params: { from: "mine" } });
    else void start("album");
  };

  const inner = Math.max(0, sheetWidth - SIDE * 2);
  const lookWidth = (inner - LOOK_GAP) / 2;
  const garmentWidth = (inner - GARMENT_GAP * 2) / 3;

  const looksEmpty = looks !== null && looks.length === 0;
  const garmentsEmpty = recent !== null && recent.garments.length === 0;
  const cellEmpty = cell === "recentLooks" ? looksEmpty : garmentsEmpty;
  const cellLoaded = cell === "recentLooks" ? looks !== null : recent !== null;

  const textButton = (label: string, onPress: () => void, ariaLabel?: string): ReactNode => (
    <Pressable role="button" aria-label={ariaLabel} onPress={onPress} style={styles.textButton}>
      <Text style={styles.textButtonLabel}>{label}</Text>
    </Pressable>
  );

  let content: ReactNode;
  if (!cellLoaded) {
    content = failed[cell] ? <Text style={styles.loadFailed}>목록을 불러오지 못했어요</Text> : null;
  } else if (cellEmpty) {
    content = twin ? (
      <HomeRecoStrip
        twinKey={twin}
        action={
          cell === "recentLooks"
            ? textButton("코디하러 가기 ›", openCoordi, "코디하러 가기")
            : textButton("+ 옷 추가", () => setAdding(true), "옷 추가")
        }
        onPick={wearReco}
      />
    ) : null;
  } else if (cell === "recentLooks" && looks) {
    content = (
      <View>
        <View style={styles.countRow}>
          <Text style={styles.count}>저장한 룩 {looks.length}개</Text>
          {textButton("내 룩북 전체 보기 ›", () => router.navigate("/fitting/lookbook"))}
        </View>
        <View style={[styles.grid, styles.lookGrid]}>
          {looks.slice(0, RECENT_LOOK_LIMIT).map((look) => (
            <View key={look.key} style={{ width: lookWidth }}>
              <LookCard
                look={look}
                onPress={() =>
                  look.kind === "device"
                    ? router.push(`/look/${look.look.id}`)
                    : router.push({
                        pathname: "/lookbook/[id]",
                        params: { id: "all", look: look.key },
                      })
                }
              />
            </View>
          ))}
        </View>
      </View>
    );
  } else if (recent) {
    content = (
      <View>
        <View style={styles.countRow}>
          <Text style={styles.count}>
            내 옷 {recent.counts.mine}벌, 담은 옷 {recent.counts.wanted}벌
          </Text>
          {textButton("옷장 보기 ›", () => router.navigate("/fitting/closet"))}
        </View>
        <View style={[styles.grid, styles.garmentGrid]}>
          {recent.garments.map((garment) => (
            <View key={garment.id} style={{ width: garmentWidth }}>
              <GarmentCard
                name={garment.name}
                thumbUri={garment.thumbUri}
                subline={categoryLabel(garment.category)}
                wanted={garment.closet === "wanted"}
                onPress={() => router.push(`/garment/${garment.id}`)}
              />
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Tabs.Screen
        options={{
          headerTitle:
            raised && twin
              ? () => (
                  <View style={styles.headTwin}>
                    <View style={styles.headFace}>
                      <Image source={TWIN_ASSETS[twin].base} style={styles.headFaceImage} />
                    </View>
                    <View>
                      <Text role="heading" aria-level={1} style={styles.headName}>
                        {presetTwin(twin).name}
                      </Text>
                      <Text numberOfLines={1} style={styles.headOutfit}>
                        {outfitName}
                      </Text>
                    </View>
                  </View>
                )
              : "NUNO",
          headerTitleAlign: "left",
          headerTitleStyle: styles.wordmark,
          headerTitleContainerStyle: styles.wordmarkBox,
          headerStyle: StyleSheet.flatten([styles.header, { height: HEADER_HEIGHT + insets.top }]),
          headerShadowVisible: false,
          headerRight: () => (
            <Pressable
              role="button"
              aria-label="알림"
              onPress={() => show("새 알림이 없어요")}
              style={styles.bell}
            >
              <BellIcon color={INK} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        ref={scroll}
        scrollEventThrottle={16}
        onLayout={(event) => setViewHeight(event.nativeEvent.layout.height)}
        onScroll={(event) => {
          const y = event.nativeEvent.contentOffset.y;
          setRaised(sheetY !== null && y >= sheetY - 8);
        }}
      >
        <View style={styles.stage}>
          {twin ? (
            <Image
              role="img"
              aria-label={`${presetTwin(twin).name} 기본 코디`}
              source={TWIN_ASSETS[twin].outfit}
              resizeMode="contain"
              style={styles.stageImage}
            />
          ) : null}
          <View style={[styles.stageColumn, styles.stageLeft]}>
            <StageButton label="트윈 바꾸기" onPress={() => setSwitching(true)}>
              <View testID="stage-twin-face" style={styles.faceCircle}>
                {twin ? <Image source={TWIN_ASSETS[twin].base} style={styles.faceImage} /> : null}
              </View>
              <View style={styles.swapBadge}>
                <Text style={styles.swapGlyph}>⇄</Text>
              </View>
            </StageButton>
            <StageButton label="오늘 추천" onPress={() => void wearTodayLook().then(openCoordi)}>
              <View style={styles.circle}>
                <SunIcon color={INK} />
              </View>
            </StageButton>
            <StageButton label="룩북" onPress={() => router.navigate("/fitting/lookbook")}>
              <View style={styles.circle}>
                <BookIcon color={INK} />
              </View>
            </StageButton>
          </View>
          <View style={[styles.stageColumn, styles.stageRight]}>
            <StageButton label="코디" strong buttonRef={coordiButton} onPress={openCoordi}>
              <View testID="stage-coordi-circle" style={[styles.circle, styles.circleInk]}>
                <HangerIcon color="#fff" />
              </View>
            </StageButton>
          </View>
        </View>

        <View
          style={[styles.sheet, !cellEmpty && styles.sheetWithList, { minHeight: viewHeight }]}
          onLayout={(event) => {
            setSheetY(event.nativeEvent.layout.y);
            setSheetWidth(event.nativeEvent.layout.width);
          }}
        >
          <View style={styles.grip} />
          <View style={styles.cells}>
            {CELLS.map((item) => (
              <Pressable
                key={item.key}
                role="button"
                aria-pressed={cell === item.key}
                onPress={() => openCell(item.key)}
                style={StyleSheet.flatten([styles.cell, cell === item.key && styles.cellOn])}
              >
                <Text style={[styles.cellLabel, cell === item.key && styles.cellLabelOn]}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {content}
        </View>
      </ScrollView>

      {/* 시트를 올렸을 때만 보인다. 칸이 비면 머리 줄 글자 단추가 같은 일을 하므로 숨긴다. */}
      {raised && cellLoaded && !cellEmpty ? (
        <Pressable
          role="button"
          onPress={cell === "recentLooks" ? openCoordi : () => setAdding(true)}
          style={styles.floating}
        >
          <Text style={styles.floatingLabel}>
            {cell === "recentLooks" ? "+ 코디하기" : "+ 옷 추가"}
          </Text>
        </Pressable>
      ) : null}

      <TwinSwitchSheet
        visible={switching}
        current={twin ?? DEFAULT_PRESET_TWIN}
        onPick={(key) => void pick(key)}
        onClose={() => setSwitching(false)}
      />
      <AddGarmentSheet
        visible={adding}
        counts={recent ? { mine: recent.counts.mine, wanted: recent.counts.wanted } : null}
        onPick={onPickMethod}
        onClose={() => setAdding(false)}
      />
      <FirstTour
        visible={!profile.tourSeen}
        lead={looks !== null && looks.length > 0}
        anchorRef={coordiButton}
        photo={twin ? LOOK_PHOTOS[RECOMMENDED_LOOKS[twin]?.[0]?.key ?? ""] : undefined}
        onAddGarment={() => void finishTour().then(() => setAdding(true))}
        onDone={() => void finishTour()}
      />
    </View>
  );
}

interface StageButtonProps {
  label: string;
  /** 잉크색 원 「코디」 는 이름을 600 으로 */
  strong?: boolean;
  buttonRef?: RefObject<ViewInstance | null>;
  onPress: () => void;
  children: ReactNode;
}

/** 무대 원형 단추: 원 48 과 아래 이름 13px. 누르는 영역은 원과 이름을 합친 72×70 이다. */
function StageButton({ label, strong, buttonRef, onPress, children }: StageButtonProps) {
  return (
    <Pressable
      ref={buttonRef}
      role="button"
      aria-label={label}
      onPress={onPress}
      style={styles.stageButton}
    >
      <View style={styles.circleBox}>{children}</View>
      <Text style={[styles.stageLabel, strong && styles.stageLabelStrong]}>{label}</Text>
    </Pressable>
  );
}

// 무대 단추 아이콘(22 칸, 선 굵기 1.75). 글자 기호 대신 View 로 그린다.
const ICON = 22;
const STROKE = 1.75;
const SUN_RAYS = [0, 45, 90, 135, 180, 225, 270, 315];

function SunIcon({ color }: { color: string }) {
  return (
    <View style={icon.box} aria-hidden>
      <View style={[icon.sunCore, { borderColor: color }]} />
      {SUN_RAYS.map((angle) => (
        <View
          key={angle}
          style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${angle}deg` }] }]}
        >
          <View style={[icon.sunRay, { backgroundColor: color }]} />
        </View>
      ))}
    </View>
  );
}

function BookIcon({ color }: { color: string }) {
  return (
    <View style={icon.box} aria-hidden>
      <View style={[icon.page, icon.pageLeft, { borderColor: color }]} />
      <View style={[icon.page, icon.pageRight, { borderColor: color }]} />
    </View>
  );
}

function HangerIcon({ color }: { color: string }) {
  return (
    <View style={icon.box} aria-hidden>
      <View style={[icon.hook, { borderTopColor: color, borderRightColor: color }]} />
      <View style={[icon.bar, icon.armLeft, { backgroundColor: color }]} />
      <View style={[icon.bar, icon.armRight, { backgroundColor: color }]} />
      <View style={[icon.bar, icon.rail, { backgroundColor: color }]} />
    </View>
  );
}

const icon = StyleSheet.create({
  box: { width: ICON, height: ICON },
  sunCore: {
    position: "absolute",
    left: 6.5,
    top: 6.5,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: STROKE,
  },
  sunRay: {
    position: "absolute",
    left: (ICON - STROKE) / 2,
    top: 0.5,
    width: STROKE,
    height: 3.5,
    borderRadius: STROKE / 2,
  },
  page: { position: "absolute", top: 4, width: 9.875, height: 14, borderWidth: STROKE },
  pageLeft: { left: 2, borderTopLeftRadius: 2, borderBottomLeftRadius: 2 },
  pageRight: { left: 10.125, borderTopRightRadius: 2, borderBottomRightRadius: 2 },
  hook: {
    position: "absolute",
    left: 8.5,
    top: 2,
    width: 5,
    height: 6,
    borderTopWidth: STROKE,
    borderRightWidth: STROKE,
    borderTopRightRadius: 3,
  },
  bar: { position: "absolute", height: STROKE, borderRadius: STROKE / 2 },
  armLeft: { left: 0.5, top: 11.5, width: 12, transform: [{ rotate: "-41deg" }] },
  armRight: { left: 9.5, top: 11.5, width: 12, transform: [{ rotate: "41deg" }] },
  rail: { left: 2, top: 15.5, width: 18 },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  header: { backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: LINE },
  // 시트를 내린 머리 줄 왼쪽 「NUNO」 20px 800. 시트를 올리면 트윈 얼굴과 이름으로 바뀐다.
  wordmark: { fontSize: 20, lineHeight: 26, fontWeight: "800", letterSpacing: 0.5, color: INK },
  wordmarkBox: { marginLeft: 16 },
  // 종 24 아이콘, 누르는 영역 44. 오른쪽 끝을 화면 안쪽 16 에 맞춘다.
  bell: { width: 44, height: 44, marginRight: 6, alignItems: "center", justifyContent: "center" },
  headTwin: { flexDirection: "row", alignItems: "center", gap: 10 },
  headFace: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#F2F1EF",
  },
  // 기본 사진(900x1205)에서 얼굴이 동그라미 가운데에 오게 키워 옮긴다.
  headFaceImage: { position: "absolute", width: 164, height: 220, left: -64, top: -10 },
  headName: { fontSize: 16, fontWeight: "700", color: INK },
  headOutfit: { maxWidth: 240, fontSize: 13, color: SUB },
  // 무대 448, 사진 높이 420 을 위 12 띄워 가운데에 세운다. 시트가 무대 아래 12 를 덮는다.
  stage: { width: "100%", height: 448, backgroundColor: "#fff" },
  stageImage: { position: "absolute", top: 12, left: 0, width: "100%", height: 420 },
  // 단추 열 가운데는 왼쪽 x48, 오른쪽 x342, 위아래 간격 84(단추 70 + 14).
  stageColumn: { position: "absolute", top: 12, gap: 14 },
  stageLeft: { left: 12 },
  // 「코디」 는 오른쪽 둘째 자리다. 첫째 자리(「트윈 꾸미기」, 아직 개발 안 됨)는 비워 둔다.
  stageRight: { right: 12, paddingTop: 84 },
  stageButton: { width: 72, height: 70, alignItems: "center", gap: 4 },
  circleBox: { width: 48, height: 48 },
  circle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SURFACE,
  },
  circleInk: { backgroundColor: INK },
  faceCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: "#F2F1EF",
  },
  // 머리 줄 얼굴(원 36)과 같은 자리를 원 48 에 맞게 키운다.
  faceImage: { position: "absolute", width: 219, height: 293, left: -85, top: -13 },
  swapBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: INK,
  },
  swapGlyph: { color: "#fff", fontSize: 10, lineHeight: 12, fontWeight: "700" },
  stageLabel: { fontSize: 13, lineHeight: 18, fontWeight: "500", color: INK },
  stageLabelStrong: { fontWeight: "600" },
  sheet: {
    marginTop: -12,
    paddingTop: 8,
    paddingBottom: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: "#fff",
    shadowColor: INK,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
  },
  // 떠 있는 단추 48 과 위아래 여백 28 만큼 목록 끝을 비운다.
  sheetWithList: { paddingBottom: 76 },
  grip: {
    alignSelf: "center",
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(21,19,20,0.2)",
  },
  cells: {
    marginTop: 8,
    paddingHorizontal: SIDE,
    flexDirection: "row",
    gap: 24,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  cell: {
    height: 44,
    justifyContent: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    marginBottom: -1,
  },
  cellOn: { borderBottomColor: INK },
  cellLabel: { fontSize: 16, fontWeight: "500", color: SUB },
  cellLabelOn: { color: INK, fontWeight: "700" },
  countRow: {
    height: 40,
    paddingHorizontal: SIDE,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  count: { fontSize: 13, color: SUB },
  loadFailed: { paddingHorizontal: SIDE, paddingVertical: 24, fontSize: 14, color: SUB },
  textButton: { minHeight: 44, justifyContent: "center" },
  textButtonLabel: { fontSize: 14, fontWeight: "600", color: INK },
  grid: { marginTop: 8, paddingHorizontal: SIDE, flexDirection: "row", flexWrap: "wrap" },
  lookGrid: { columnGap: LOOK_GAP, rowGap: 20 },
  garmentGrid: { columnGap: GARMENT_GAP, rowGap: 16 },
  floating: {
    position: "absolute",
    right: 16,
    bottom: 16,
    height: 48,
    paddingHorizontal: 20,
    justifyContent: "center",
    borderRadius: 24,
    backgroundColor: INK,
  },
  floatingLabel: { fontSize: 15, fontWeight: "600", color: "#fff" },
});
