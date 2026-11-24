import { Stack } from "expo-router";
import { useProfile } from "../../src/ui/profile-gate";

// 생년월일을 저장하면 생년월일 화면을 닫는다. 새로고침이나 깊은 링크로 와도 트윈 고르기가 뜬다.
// 생년월일 화면이 닫힐 때 남은 화면 가운데 트윈 고르기가 열리게 첫 화면을 정해 둔다(4/4 가 먼저 열리지 않게).
export const unstable_settings = { initialRouteName: "twin" };

export default function OnboardingLayout() {
  const { profile } = useProfile();
  const hasBirthDate = profile.birthDate !== null;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!hasBirthDate}>
        <Stack.Screen name="birthDate" />
      </Stack.Protected>
      <Stack.Protected guard={hasBirthDate}>
        <Stack.Screen name="twin" />
        <Stack.Screen name="style" />
        <Stack.Screen name="outfit" />
        <Stack.Screen name="look" />
      </Stack.Protected>
    </Stack>
  );
}
