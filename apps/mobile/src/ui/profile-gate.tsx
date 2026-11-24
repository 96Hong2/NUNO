import type { ProfileState } from "@nuno/profile";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

// 기기에 저장한 프로필을 앱 전체에 나눠 주고, 저장한 뒤 다시 읽게 한다.
// 어느 화면을 먼저 보일지는 @nuno/profile 의 nextOnboardingStep 이 정한다.

interface ProfileGate {
  profile: ProfileState;
  refresh: () => Promise<void>;
}

const ProfileContext = createContext<ProfileGate | null>(null);

interface ProfileProviderProps {
  load: () => Promise<ProfileState>;
  children: (profile: ProfileState) => ReactNode;
}

/** 프로필을 읽는 동안은 빈 화면을 보인다. 첫 화면이 잠깐 떴다 바뀌지 않게 하려고서다. */
export function ProfileProvider({ load, children }: ProfileProviderProps) {
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setProfile(await load());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [load]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (error !== null && profile === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>저장소를 열지 못했어요</Text>
        <Text style={styles.body}>
          다른 탭에서 NUNO 가 열려 있으면 그 탭을 닫고 다시 시도해 주세요.
        </Text>
        <Text style={styles.detail}>{error}</Text>
        <Pressable role="button" style={styles.button} onPress={() => void refresh()}>
          <Text style={styles.buttonLabel}>다시 시도</Text>
        </Pressable>
      </View>
    );
  }
  if (profile === null) return <View style={styles.blank} />;
  return (
    <ProfileContext.Provider value={{ profile, refresh }}>
      {children(profile)}
    </ProfileContext.Provider>
  );
}

export function useProfile(): ProfileGate {
  const gate = useContext(ProfileContext);
  if (gate === null) throw new Error("useProfile 은 ProfileProvider 안에서만 쓴다");
  return gate;
}

const styles = StyleSheet.create({
  blank: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, padding: 24, gap: 12, justifyContent: "center", backgroundColor: "#fff" },
  title: { fontSize: 18, fontWeight: "600" },
  body: { fontSize: 15 },
  detail: { fontSize: 12, color: "#999" },
  button: {
    alignSelf: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#111",
  },
  buttonLabel: { color: "#fff", fontSize: 15 },
});
