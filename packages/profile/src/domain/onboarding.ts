/** 기기에 저장한 프로필 한 줄. */
export interface ProfileState {
  birthDate: string | null;
  displayName: string | null;
  styleTags: string[];
  onboardingDone: boolean;
  tourSeen: boolean;
}

/** 앱을 켰을 때 먼저 보일 자리. 루트 레이아웃과 첫 경로가 이 값 하나로 가른다. */
export type OnboardingStep = "birthDate" | "done";

export function nextOnboardingStep(profile: ProfileState): OnboardingStep {
  return profile.birthDate === null ? "birthDate" : "done";
}
