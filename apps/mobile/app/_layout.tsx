import { nextOnboardingStep } from "@nuno/profile";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { loadProfile } from "../src/composition/profile";
import { ProfileProvider } from "../src/ui/profile-gate";

// 온보딩을 마치기 전에는 onboarding 만, 마친 뒤에는 (tabs) 만 열린다.
// 깊은 링크(/home)로 들어와도 Stack.Protected 가 막는다. 「저장소 보기」 는 두 쪽 모두에서 열린다.
export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <ProfileProvider load={loadProfile}>
        {(profile) => {
          const done = nextOnboardingStep(profile) === "done";
          return (
            <Stack>
              <Stack.Protected guard={!done}>
                <Stack.Screen name="onboarding" options={{ headerShown: false }} />
              </Stack.Protected>
              <Stack.Protected guard={done}>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              </Stack.Protected>
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="dev/storage" options={{ title: "저장소 보기" }} />
            </Stack>
          );
        }}
      </ProfileProvider>
    </>
  );
}
