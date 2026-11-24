import { nextOnboardingStep } from "@nuno/profile";
import { Redirect } from "expo-router";
import { useProfile } from "../src/ui/profile-gate";

const FIRST_ROUTE = {
  birthDate: "/onboarding/birthDate",
  twin: "/onboarding/twin",
  done: "/home",
} as const;

export default function Index() {
  const { profile } = useProfile();
  return <Redirect href={FIRST_ROUTE[nextOnboardingStep(profile)]} />;
}
