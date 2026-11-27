import { useRouter, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BackIcon } from "./line-icon";
import { StepDots } from "./step-dots";

interface OnboardingHeadProps {
  step: number;
  /** 앞 단계 경로. 쌓인 화면이 없을 때(새로고침, 깊은 링크) 이리로 간다 */
  previous: Href;
  onSkip: () => void;
}

/**
 * 온보딩 2~4단계 머리 줄. 왼쪽 「‹」 와 점 넷, 「n / 4」, 오른쪽 「건너뛰기」.
 * 「‹」 는 쌓인 앞 화면으로 돌아가 그 화면에서 고른 값을 그대로 보인다.
 * 화면 좌우 여백 20 안에 두고, 「‹」 누르는 영역 44 의 왼쪽을 화면 끝 8 에 맞춘다.
 */
export function OnboardingHead({ step, previous, onSkip }: OnboardingHeadProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace(previous);
  };
  return (
    <View style={[styles.row, { marginTop: insets.top }]}>
      <Pressable role="button" aria-label="이전 단계" onPress={back} style={styles.back}>
        <BackIcon color="#151314" />
      </Pressable>
      <StepDots current={step} />
      <Pressable role="button" onPress={onSkip} style={styles.skip}>
        <Text style={styles.skipLabel}>건너뛰기</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { height: 44, flexDirection: "row", alignItems: "center", gap: 4 },
  back: { width: 44, height: 44, marginLeft: -12, alignItems: "center", justifyContent: "center" },
  skip: { height: 44, marginLeft: "auto", justifyContent: "center" },
  skipLabel: { fontSize: 15, fontWeight: "500", color: "#5F5C56" },
});
