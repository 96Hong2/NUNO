import { StyleSheet, View, type ColorValue } from "react-native";

// 24 칸 선 아이콘(선 굵기 1.75). 그림 라이브러리 없이 View 테두리로 그려 글자 기호가 접근 이름에 섞이지 않는다.
const SIZE = 24;
const STROKE = 1.75;

interface LineIconProps {
  color: ColorValue;
  testID?: string;
}

/** 하단 탭 「홈」 의 집 */
export function HomeIcon({ color, testID }: LineIconProps) {
  return (
    <View testID={testID} style={styles.box} aria-hidden>
      <View style={[styles.roof, { borderColor: color }]} />
      <View style={[styles.house, { borderColor: color }]} />
    </View>
  );
}

/** 하단 탭 「마이」 의 사람 */
export function PersonIcon({ color, testID }: LineIconProps) {
  return (
    <View testID={testID} style={styles.box} aria-hidden>
      <View style={[styles.head, { borderColor: color }]} />
      <View style={[styles.shoulders, { borderColor: color }]} />
    </View>
  );
}

/** 시트 머리와 트윈 고르기의 닫기 X */
export function CloseIcon({ color, testID }: LineIconProps) {
  return (
    <View testID={testID} style={styles.box} aria-hidden>
      <View style={[styles.bar, styles.barDown, { backgroundColor: color }]} />
      <View style={[styles.bar, styles.barUp, { backgroundColor: color }]} />
    </View>
  );
}

/** 온보딩 2~4단계의 앞 단계로 가기 「‹」 */
export function BackIcon({ color, testID }: LineIconProps) {
  return (
    <View testID={testID} style={styles.box} aria-hidden>
      <View style={[styles.chevron, { borderColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: SIZE, height: SIZE },
  roof: {
    position: "absolute",
    left: 6,
    top: 5.5,
    width: 12,
    height: 12,
    borderTopWidth: STROKE,
    borderLeftWidth: STROKE,
    borderTopLeftRadius: 1.5,
    transform: [{ rotate: "45deg" }],
  },
  house: {
    position: "absolute",
    left: 5,
    top: 10.5,
    width: 14,
    height: 10.5,
    borderWidth: STROKE,
    borderTopWidth: 0,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  head: {
    position: "absolute",
    left: 7.5,
    top: 3,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: STROKE,
  },
  shoulders: {
    position: "absolute",
    left: 4,
    top: 14,
    width: 16,
    height: 8,
    borderWidth: STROKE,
    borderBottomWidth: 0,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  bar: {
    position: "absolute",
    left: 4,
    top: (SIZE - STROKE) / 2,
    width: 16,
    height: STROKE,
    borderRadius: STROKE / 2,
  },
  barDown: { transform: [{ rotate: "45deg" }] },
  barUp: { transform: [{ rotate: "-45deg" }] },
  chevron: {
    position: "absolute",
    left: 9,
    top: 7,
    width: 10,
    height: 10,
    borderLeftWidth: STROKE,
    borderBottomWidth: STROKE,
    transform: [{ rotate: "45deg" }],
  },
});
