import { Link, Slot, Tabs, useGlobalSearchParams, usePathname, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const INK = "#151314";
const SUB = "#5F5C56";
const LINE = "#E7E6E3";
const PAPER = "#FCFBFA";

/** 피팅룸 머리 줄 높이(상태 표시줄 아래) */
const HEADER_HEIGHT = 52;

// 피팅룸 위쪽 네 칸. 경로는 GLOSSARY.md 의 fitting/* 이름이다.
// Link asChild 의 자식에는 스타일 배열을 넘기지 못해 flatten 한다.
// 칸 아래 하위 경로(예: 옷장 안 두 칸)에서도 위 칸은 선택된 채로 둔다.
const CELLS = [
  { href: "/fitting/coordi", label: "코디" },
  { href: "/fitting/closet", label: "옷장" },
  { href: "/fitting/twin", label: "트윈" },
  { href: "/fitting/lookbook", label: "룩북" },
] as const;

export default function FittingLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { moving } = useGlobalSearchParams<{ moving?: string }>();
  const inCloset = pathname.startsWith("/fitting/closet");
  // 「코디」 칸은 무대를 넓게 쓰려고 「피팅룸」 머리 줄을 두지 않는다. 위 칸 줄이 상태 표시줄 바로 아래에 온다.
  const inCoordi = pathname === "/fitting" || pathname.startsWith("/fitting/coordi");
  return (
    <View style={styles.container}>
      {/* 옷장 칸에서만 머리 줄 오른쪽에 「+ 옷 추가」 를 둔다. 누르면 옷장의 「옷을 어떻게 추가할까요?」 시트가 열린다.
          「여러 벌 옮기기」 중(moving=1)에는 숨긴다. */}
      <Tabs.Screen
        options={{
          headerShown: !inCoordi,
          headerTitleAlign: "left",
          headerTitleStyle: styles.headerTitle,
          headerTitleContainerStyle: styles.headerTitleBox,
          headerStyle: StyleSheet.flatten([styles.header, { height: HEADER_HEIGHT + insets.top }]),
          headerShadowVisible: false,
          headerRight:
            inCloset && moving !== "1"
              ? () => (
                  <Pressable
                    role="button"
                    aria-label="옷 추가"
                    hitSlop={{ top: 2, bottom: 2 }}
                    onPress={() => router.setParams({ add: "1" })}
                    style={styles.addButton}
                  >
                    <Text style={styles.addLabel}>+ 옷 추가</Text>
                  </Pressable>
                )
              : undefined,
        }}
      />
      <View
        role="tablist"
        aria-label="피팅룸 칸"
        style={[styles.cells, inCoordi && { height: 44 + insets.top, paddingTop: insets.top }]}
      >
        {CELLS.map(({ href, label }) => {
          const selected = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link key={href} href={href} replace asChild>
              <Pressable role="tab" aria-selected={selected} style={styles.cell}>
                <View style={styles.cellInner}>
                  <Text style={[styles.cellLabel, selected && styles.cellLabelSelected]}>
                    {label}
                  </Text>
                  {selected ? <View style={styles.underline} /> : null}
                </View>
              </Pressable>
            </Link>
          );
        })}
      </View>
      <Slot />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: { backgroundColor: PAPER },
  headerTitle: { fontSize: 22, fontWeight: "700", color: INK },
  headerTitleBox: { marginLeft: 16 },
  cells: {
    flexDirection: "row",
    height: 44,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    backgroundColor: PAPER,
  },
  cell: { flex: 1, alignItems: "center", justifyContent: "center" },
  cellInner: { height: "100%", justifyContent: "center" },
  cellLabel: { fontSize: 14, lineHeight: 20, fontWeight: "500", color: SUB },
  cellLabelSelected: { fontWeight: "600", color: INK },
  // 고른 칸 글자 폭만큼의 2px 밑줄. 칸 아래 1px 선 위에 겹친다.
  underline: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -1,
    height: 2,
    backgroundColor: INK,
  },
  // 높이 40 알약, 누르는 영역은 위아래로 넓혀 44 다.
  addButton: {
    marginRight: 16,
    height: 40,
    paddingHorizontal: 16,
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: INK,
  },
  addLabel: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
