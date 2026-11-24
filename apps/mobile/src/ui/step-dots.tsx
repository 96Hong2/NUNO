import { StyleSheet, View } from "react-native";

const STEPS = 4;

/** 온보딩 위쪽 점 넷. current 번째까지 채운다. 3, 4 단계 화면은 T3, T4 에 생긴다. */
export function StepDots({ current }: { current: number }) {
  return (
    <View
      role="progressbar"
      aria-label={`온보딩 ${current}단계`}
      aria-valuenow={current}
      aria-valuemax={STEPS}
      style={styles.row}
    >
      {Array.from({ length: STEPS }, (_, index) => (
        <View key={index} style={[styles.dot, index < current && styles.filled]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#d8d8d8" },
  filled: { backgroundColor: "#111" },
});
