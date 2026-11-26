import type { PresetTwinKey } from "@nuno/twin";
import { Tabs, usePathname } from "expo-router";
import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { loadCurrentTwin } from "../../src/composition/twin";
import { HomeIcon, PersonIcon } from "../../src/ui/line-icon";
import { TWIN_ASSETS } from "../../src/ui/twin-assets";

const INK = "#151314";
const SUB = "#5F5C56";
const LINE = "#E7E6E3";

/** 피팅룸 얼굴 원 지름과 탭 막대 위로 솟는 높이 */
const FACE = 52;
const RISE = 20;
/** 탭 단추 위 안쪽 여백(탭 단추 기본 5)과 아이콘 칸 폭(기본 31) */
const ITEM_PAD = 5;
const ICON_WIDTH = 31;
const CLIP = FACE - 6;

// 하단 탭은 홈, 피팅룸, 마이 셋이다. 이름은 GLOSSARY.md 「탭과 칸」 을 따른다.
// 홈과 마이는 선 아이콘, 피팅룸은 고른 트윈의 얼굴 원이다. 트윈은 화면을 옮길 때마다 다시 읽는다.
// 아이콘을 비워 두면 빈 아이콘 글자(⏷)가 탭 이름에 붙으므로 세 탭 모두 아이콘을 준다.
export default function TabsLayout() {
  const pathname = usePathname();
  const [twin, setTwin] = useState<PresetTwinKey | null>(null);

  useEffect(() => {
    loadCurrentTwin().then(setTwin, () => undefined);
  }, [pathname]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: INK,
        tabBarInactiveTintColor: SUB,
        tabBarStyle: styles.bar,
        tabBarLabel: ({ focused, children }) => (
          <Text style={[styles.label, focused && styles.labelOn]}>{children}</Text>
        ),
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: "홈", tabBarIcon: ({ color }) => <HomeIcon color={color} testID="홈 아이콘" /> }}
      />
      <Tabs.Screen
        name="fitting"
        options={{
          title: "피팅룸",
          tabBarIcon: () => (
            <View testID="피팅룸 트윈 얼굴" style={styles.face}>
              <View style={styles.faceClip}>
                {twin ? <Image source={TWIN_ASSETS[twin].base} style={styles.faceImage} /> : null}
              </View>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="my"
        options={{ title: "마이", tabBarIcon: ({ color }) => <PersonIcon color={color} testID="마이 아이콘" /> }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: "#fff", borderTopColor: LINE, overflow: "visible" },
  label: { marginTop: 2, fontSize: 11, lineHeight: 14, fontWeight: "500", color: SUB },
  labelOn: { fontWeight: "600", color: INK },
  // 흰 2px 한 겹과 바깥 line 1px 테두리. 원 윗변이 탭 막대 위로 RISE 만큼 나온다.
  face: {
    position: "absolute",
    top: -(RISE + ITEM_PAD),
    left: (ICON_WIDTH - FACE) / 2,
    width: FACE,
    height: FACE,
    padding: 2,
    borderRadius: FACE / 2,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: "#fff",
  },
  faceClip: { flex: 1, overflow: "hidden", borderRadius: CLIP / 2, backgroundColor: "#EFEDEA" },
  // 기본 사진의 얼굴이 원 가운데 오도록 크게 키워 위쪽을 보인다.
  faceImage: {
    width: CLIP * 4.48,
    height: CLIP * 6,
    marginLeft: -CLIP * 1.74,
    marginTop: -CLIP * 0.32,
  },
});
