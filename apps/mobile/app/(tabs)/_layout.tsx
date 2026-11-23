import { Tabs } from "expo-router";

// 하단 탭은 홈, 피팅룸, 마이 셋이다. 이름은 GLOSSARY.md 「탭과 칸」 을 따른다.
// 아이콘은 아직 없다. 비워 두지 않으면 빈 아이콘 글자(⏷)가 탭 이름에 붙는다.
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarIcon: () => null }}>
      <Tabs.Screen name="home" options={{ title: "홈" }} />
      <Tabs.Screen name="fitting" options={{ title: "피팅룸" }} />
      <Tabs.Screen name="my" options={{ title: "마이" }} />
    </Tabs>
  );
}
