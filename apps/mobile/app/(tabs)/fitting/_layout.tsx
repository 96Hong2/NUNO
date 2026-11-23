import { Link, Slot, usePathname } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

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
  return (
    <View style={styles.container}>
      <View role="tablist" aria-label="피팅룸 칸" style={styles.cells}>
        {CELLS.map(({ href, label }) => {
          const selected = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link key={href} href={href} replace asChild>
              <Pressable
                role="tab"
                aria-selected={selected}
                style={StyleSheet.flatten([styles.cell, selected && styles.cellSelected])}
              >
                <Text style={[styles.cellLabel, selected && styles.cellLabelSelected]}>
                  {label}
                </Text>
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
  cells: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#d0d0d0",
  },
  cell: { flex: 1, alignItems: "center", paddingVertical: 12 },
  cellSelected: { borderBottomWidth: 2, borderBottomColor: "#111" },
  cellLabel: { fontSize: 15, color: "#777" },
  cellLabelSelected: { color: "#111", fontWeight: "600" },
});
