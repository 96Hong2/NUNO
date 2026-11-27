import { StyleSheet, Text, View } from "react-native";

const STEPS = 4;

/** 온보딩 머리 줄의 점 넷과 「n / 4」. current 번째 점까지 채운다. */
export function StepDots({ current }: { current: number }) {
  return (
    <View style={styles.row}>
      <View
        role="progressbar"
        aria-label={`온보딩 ${current}단계`}
        aria-valuenow={current}
        aria-valuemax={STEPS}
        style={styles.dots}
      >
        {Array.from({ length: STEPS }, (_, index) => (
          <View key={index} style={[styles.dot, index < current && styles.filled]} />
        ))}
      </View>
      <Text style={styles.count}>
        {current} / {STEPS}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  dots: { flexDirection: "row", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#E7E6E3" },
  filled: { backgroundColor: "#151314" },
  count: { fontSize: 13, lineHeight: 18, fontWeight: "500", color: "#5F5C56" },
});
