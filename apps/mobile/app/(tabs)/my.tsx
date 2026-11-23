import { Link } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import { EmptyScreen } from "../../src/ui/empty-screen";

export default function MyScreen() {
  return (
    <EmptyScreen title="마이">
      {__DEV__ ? (
        <Link href="/dev/storage" asChild>
          <Pressable role="link" style={styles.devRow}>
            <Text style={styles.devLabel}>저장소 보기</Text>
            <Text style={styles.devHint}>개발 빌드에서만 보인다</Text>
          </Pressable>
        </Link>
      ) : null}
    </EmptyScreen>
  );
}

const styles = StyleSheet.create({
  devRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d0d0d0",
    gap: 2,
  },
  devLabel: { fontSize: 16 },
  devHint: { fontSize: 12, color: "#777" },
});
