import { Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from "react-native";

interface TwinCardProps {
  name: string;
  source: ImageSourcePropType;
  selected: boolean;
  onPress: () => void;
}

/** 트윈 고르기 카드. 고르면 검은 테두리와 오른쪽 위 체크가 붙는다. */
export function TwinCard({ name, source, selected, onPress }: TwinCardProps) {
  return (
    <Pressable
      role="radio"
      aria-checked={selected}
      aria-label={name}
      onPress={onPress}
      style={styles.card}
    >
      <View style={[styles.frame, selected && styles.frameSelected]}>
        <Image source={source} style={styles.image} resizeMode="cover" />
        {selected ? (
          <View style={styles.check}>
            <Text style={styles.checkMark}>✓</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.name}>{name}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, gap: 6 },
  frame: {
    aspectRatio: 3 / 4,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "transparent",
    backgroundColor: "#f2f2f2",
  },
  frameSelected: { borderColor: "#111" },
  image: { width: "100%", height: "100%" },
  check: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111",
  },
  checkMark: { color: "#fff", fontSize: 13, fontWeight: "700" },
  name: { fontSize: 14, textAlign: "center" },
});
