import { Stack } from "expo-router";
import { useProfile } from "../../src/ui/profile-gate";

// 생년월일을 저장하면 생년월일 화면을 닫는다. 새로고침이나 깊은 링크로 와도 트윈 고르기가 뜬다.
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
      </Stack.Protected>
    </Stack>
  );
}
