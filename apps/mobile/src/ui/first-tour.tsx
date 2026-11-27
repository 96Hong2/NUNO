import { useEffect, useState, type RefObject } from "react";
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
  type ViewInstance,
} from "react-native";
import { AiBadge } from "./book-look-image";

const INK = "#151314";
const SUB = "#5F5C56";
const DIM = "rgba(21,19,20,0.4)";

/** 「코디」 단추 원 48 을 밝히는 구멍 지름과, 구멍 둘레를 덮는 테두리 굵기(화면 밖까지 닿게) */
const HOLE = 56;
const RING = 2400;
/** 상자 좌우 여백, 2 / 2 카드 상자의 위 자리(작은 화면은 아래에서 320 위) */
const SIDE = 16;
const CARD_TOP = 345;

type Page = "lead" | "coordi" | "card";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FirstTourProps {
  visible: boolean;
  /** 온보딩에서 룩을 저장했으면 맨 앞에 「첫 코디를 룩북에 저장했어요」 장을 더한다 */
  lead: boolean;
  /** 1 / 2 에서 밝힐 홈 무대 「코디」 단추 */
  anchorRef: RefObject<ViewInstance | null>;
  /** 2 / 2 카드의 완성 룩 사진(무대 트윈의 기본 코디) */
  photo: ImageSourcePropType | undefined;
  /** 2 / 2 「내 옷 추가」. 둘러보기를 끝내고 「옷을 어떻게 추가할까요?」 시트를 연다 */
  onAddGarment: () => void;
  /** 「건너뛰기」, 「시작하기」 로 끝낼 때 */
  onDone: () => void;
}

/**
 * 처음 둘러보기 두 장. 1 / 2 는 홈 무대 「코디」 단추만 밝히고 아래 말풍선으로 알린다(밝힌 자리를 눌러도 넘어간다).
 * 2 / 2 는 완성 룩 사진 카드와 「내 옷 추가」, 「시작하기」 다. 마지막 장에는 「건너뛰기」 가 없다.
 */
export function FirstTour({
  visible,
  lead,
  anchorRef,
  photo,
  onAddGarment,
  onDone,
}: FirstTourProps) {
  const { width, height } = useWindowDimensions();
  const pages: Page[] = lead ? ["lead", "coordi", "card"] : ["coordi", "card"];
  const [index, setIndex] = useState(0);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  const page = pages[index] ?? "card";
  const next = () => (index < pages.length - 1 ? setIndex(index + 1) : onDone());
  const tipCount = (target: Page) => `${pages.indexOf(target) - (lead ? 1 : 0) + 1} / 2`;
  const boxWidth = width - SIDE * 2;

  useEffect(() => {
    if (!visible || page !== "coordi") return;
    // 홈 무대가 자리를 잡은 뒤 잰다. 화면 크기가 바뀌면 다시 잰다.
    const timer = setTimeout(() => {
      anchorRef.current?.measureInWindow((x, y, w, h) => {
        if (w > 0) setAnchor({ x, y, width: w, height: h });
      });
    }, 50);
    return () => clearTimeout(timer);
  }, [visible, page, width, height, anchorRef]);

  const skip = (
    <Pressable role="button" onPress={onDone} style={styles.skip}>
      <Text style={styles.skipLabel}>건너뛰기</Text>
    </Pressable>
  );

  let body = null;
  if (page === "lead") {
    body = (
      <View style={[styles.fill, styles.dim, styles.middle]}>
        <View style={[styles.box, styles.static, { width: boxWidth }]}>
          <View style={styles.countRow}>
            <Text style={styles.count} />
            {skip}
          </View>
          <Text role="heading" aria-level={3} style={styles.title}>
            첫 코디를 룩북에 저장했어요
          </Text>
          <Text style={styles.body}>자주 쓰는 곳만 짧게 알려 드릴게요</Text>
          <View style={styles.actions}>
            <Pressable role="button" onPress={next} style={styles.next}>
              <Text style={styles.nextLabel}>둘러보기</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  } else if (page === "coordi") {
    if (anchor) {
      // 밝힌 원의 가운데는 단추 원 48 의 가운데다. 말풍선은 단추(원과 이름) 아래 14 에 둔다.
      const cx = anchor.x + anchor.width / 2;
      const cy = anchor.y + 24;
      const arrow = Math.max(12, Math.min(boxWidth - 28, cx - SIDE - 8));
      body = (
        <View style={styles.fill}>
          <View
            pointerEvents="none"
            style={[
              styles.ring,
              {
                left: cx - HOLE / 2 - RING,
                top: cy - HOLE / 2 - RING,
                width: HOLE + RING * 2,
                height: HOLE + RING * 2,
                borderRadius: HOLE / 2 + RING,
              },
            ]}
          />
          <Pressable
            role="button"
            aria-label="코디"
            onPress={next}
            style={[styles.hole, { left: cx - HOLE / 2, top: cy - HOLE / 2 }]}
          />
          <View
            style={[
              styles.box,
              { top: anchor.y + anchor.height + 14, left: SIDE, width: boxWidth },
            ]}
          >
            <View style={[styles.arrow, { left: arrow }]} />
            <View style={styles.countRow}>
              <Text style={styles.count}>{tipCount("coordi")}</Text>
              {skip}
            </View>
            <Text style={styles.body}>
              여기를 누르면 옷을 골라 트윈에 입혀요. 겹쳐 입혀 보기는 늘 무료예요
            </Text>
            <View style={styles.actions}>
              <Pressable role="button" onPress={next} style={styles.next}>
                <Text style={styles.nextLabel}>다음</Text>
              </Pressable>
            </View>
          </View>
        </View>
      );
    }
  } else {
    body = (
      <View style={[styles.fill, styles.dim]}>
        <View
          style={[
            styles.box,
            { top: Math.min(CARD_TOP, height - 320), left: SIDE, width: boxWidth },
          ]}
        >
          <View style={styles.cardRow}>
            <View style={styles.mini}>
              {photo ? (
                <Image
                  role="img"
                  aria-label="완성 룩 사진 예시"
                  source={photo}
                  resizeMode="cover"
                  style={styles.miniImage}
                />
              ) : null}
              <AiBadge />
            </View>
            <View style={styles.cardText}>
              <View style={styles.countRow}>
                <Text style={styles.count}>{tipCount("card")}</Text>
              </View>
              {/* 「이대로 입히기」로 는 한 줄에 둔다(사이 띄어쓰기는 줄을 바꾸지 않는 공백). */}
              <Text style={styles.body}>
                마음에 드는 코디는 「이대로{" "}입히기」로 AI 완성 룩 사진을 만들어요
              </Text>
            </View>
          </View>
          <Pressable role="button" onPress={onAddGarment} style={styles.primary}>
            <Text style={styles.nextLabel}>내 옷 추가</Text>
          </Pressable>
          <Pressable role="button" onPress={onDone} style={styles.secondary}>
            <Text style={styles.secondaryLabel}>시작하기</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDone}>
      <View role="dialog" aria-label="처음 둘러보기" style={styles.fill}>
        {body}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill, overflow: "hidden" },
  dim: { backgroundColor: DIM },
  middle: { justifyContent: "center", paddingHorizontal: SIDE },
  ring: { position: "absolute", borderWidth: RING, borderColor: DIM },
  hole: { position: "absolute", width: HOLE, height: HOLE, borderRadius: HOLE / 2 },
  box: { position: "absolute", padding: 16, borderRadius: 12, backgroundColor: "#fff" },
  static: { position: "relative" },
  arrow: {
    position: "absolute",
    top: -8,
    width: 16,
    height: 16,
    borderRadius: 2,
    backgroundColor: "#fff",
    transform: [{ rotate: "45deg" }],
  },
  countRow: {
    height: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  count: { fontSize: 12, fontWeight: "600", color: SUB, fontVariant: ["tabular-nums"] },
  skip: {
    height: 44,
    marginVertical: -12,
    marginRight: -4,
    paddingHorizontal: 4,
    justifyContent: "center",
  },
  skipLabel: { fontSize: 14, fontWeight: "500", color: SUB },
  title: { marginTop: 8, fontSize: 16, lineHeight: 24, fontWeight: "700", color: INK },
  body: { marginTop: 8, fontSize: 15, lineHeight: 22, color: INK },
  actions: { flexDirection: "row", justifyContent: "flex-end", marginTop: 16 },
  next: {
    height: 44,
    paddingHorizontal: 20,
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: INK,
  },
  nextLabel: { fontSize: 15, fontWeight: "600", color: "#fff" },
  cardRow: { flexDirection: "row", gap: 16 },
  mini: {
    width: 104,
    height: 139,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#EFEDEA",
  },
  miniImage: { width: "100%", height: "100%" },
  cardText: { flex: 1, minWidth: 0 },
  primary: {
    height: 48,
    marginTop: 20,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: INK,
  },
  secondary: { height: 44, marginTop: 4, alignItems: "center", justifyContent: "center" },
  secondaryLabel: { fontSize: 15, fontWeight: "600", color: INK },
});
