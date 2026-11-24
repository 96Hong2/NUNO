import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

/** 화면 아래에 잠깐 떴다 사라지는 알림 띠의 상태. */
export function useToast(durationMs = 2000) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback(
    (text: string) => {
      setMessage(text);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setMessage(null), durationMs);
    },
    [durationMs],
  );
  useEffect(() => () => clearTimeout(timer.current), []);
  return { message, show };
}

export function Toast({ message }: { message: string | null }) {
  if (message === null) return null;
  return (
    <View role="alert" style={styles.toast}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 96,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "rgba(17,17,17,0.9)",
  },
  text: { color: "#fff", fontSize: 14, textAlign: "center" },
});
