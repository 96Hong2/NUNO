import { Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from "react-native";

const CHERRY = "#B8233F";

interface TwinCardProps {
  name: string;
  source: ImageSourcePropType;
  selected: boolean;
  onPress: () => void;
}

/** 트윈 고르기 카드(169×212 사진과 이름). 고르면 2px 체리 테두리와 오른쪽 위 체크 원이 붙는다. */
export function TwinCard({ name, source, selected, onPress }: TwinCardProps) {
  return (
    <Pressable
      role="radio"
      aria-checked={selected}
      aria-label={name}
      onPress={onPress}
      style={styles.card}
    >
      <View style={styles.frame}>
        <Image source={source} style={styles.image} resizeMode="cover" />
        {selected ? (
          <>
            <View style={styles.ring} />
            <View style={styles.check}>
              <View style={styles.checkMark} />
            </View>
          </>
        ) : null}
      </View>
      <Text style={styles.name}>{name}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 두 열 사이 12 는 부모 줄의 space-between 이 남긴다(169 + 12 + 169 = 350).
  card: { width: "48.28%", gap: 4 },
  frame: {
    aspectRatio: 169 / 212,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#EFEDEA",
  },
  image: { width: "100%", height: "100%" },
  ring: {
    ...StyleSheet.absoluteFill,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: CHERRY,
  },
  check: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CHERRY,
  },
  checkMark: {
    width: 10,
    height: 5.5,
    marginTop: -2,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: "#fff",
    transform: [{ rotate: "-45deg" }],
  },
  name: { fontSize: 15, lineHeight: 24, fontWeight: "600", textAlign: "center", color: "#151314" },
});
