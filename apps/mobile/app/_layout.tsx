import { nextOnboardingStep } from "@nuno/profile";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { loadProfile } from "../src/composition/profile";
import { AppToastProvider } from "../src/ui/app-toast";
import { ProfileProvider } from "../src/ui/profile-gate";

// 온보딩을 마치기 전에는 onboarding 만, 마친 뒤에는 (tabs) 만 열린다.
// 깊은 링크(/home)로 들어와도 Stack.Protected 가 막는다. 「저장소 보기」 는 두 쪽 모두에서 열린다.
const GARMENT_SCREENS = [
  "garment/new/shoot",
  "garment/new/crop",
  "garment/new/cutout",
  "garment/new/info",
  "garment/new/fit",
  "garment/[id]",
];

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <AppToastProvider>
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
                  {/* 옷 넣기 네 단계와 옷 상세는 탭 위로 덮어 연다. 화면마다 자기 위 줄을 그린다. */}
                  {GARMENT_SCREENS.map((name) => (
                    <Stack.Screen key={name} name={name} options={{ headerShown: false }} />
                  ))}
                </Stack.Protected>
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="dev/storage" options={{ title: "저장소 보기" }} />
              </Stack>
            );
          }}
        </ProfileProvider>
      </AppToastProvider>
    </>
  );
}
