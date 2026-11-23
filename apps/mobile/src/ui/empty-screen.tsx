import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

/** 아직 기능이 없는 화면. 본문 맨 위에 화면 이름을 보인다. */
export function EmptyScreen({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <View style={styles.container}>
      <Text role="heading" aria-level={2} style={styles.title}>
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 16, backgroundColor: "#fff" },
  title: { fontSize: 20, fontWeight: "600" },
});
