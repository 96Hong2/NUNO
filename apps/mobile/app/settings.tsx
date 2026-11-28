import { consentNeeded } from "@nuno/generation";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  loadAccount,
  loadPhotoRetention,
  onAccountChange,
  signOut,
  withdrawConsent,
  type AccountState,
} from "../src/composition/account";
import { useAppToast } from "../src/ui/app-toast";
import { ConfirmSheet } from "../src/ui/generate-sheets";
import { OverlaySheet } from "../src/ui/overlay-sheet";

const INK = "#151314";
const SUB = "#5F5C56";

type RetentionLoad = { kind: "loading" } | { kind: "ready"; days: number } | { kind: "failed" };

// 설정: 「개인정보와 안전」 의 완성 룩 만들기 동의와 사진 보관 안내, 「계정」 의 로그아웃.
// 가입 전에는 두 칸 모두 숨긴다.
export default function SettingsScreen() {
  const router = useRouter();
  const toast = useAppToast();
  const [account, setAccount] = useState<AccountState | null>(null);
  const [sheet, setSheet] = useState<"withdraw" | "signOut" | "retention" | null>(null);
  const [busy, setBusy] = useState(false);
  const [retention, setRetention] = useState<RetentionLoad>({ kind: "loading" });

  const reload = useCallback(() => void loadAccount().then(setAccount), []);
  useFocusEffect(reload);
  useEffect(() => onAccountChange(reload), [reload]);

  // 「사진 보관 안내」 는 열 때마다 서버 값을 다시 읽는다. 서버가 보관 기간을 바꾸면 다음에 열 때 바뀐다.
  const loadRetention = useCallback(() => {
    setRetention({ kind: "loading" });
    void loadPhotoRetention().then(
      (days) => setRetention(days === null ? { kind: "failed" } : { kind: "ready", days }),
      () => setRetention({ kind: "failed" }),
    );
  }, []);
  const openRetention = () => {
    loadRetention();
    setSheet("retention");
  };

  const agreed = account?.signedIn ? !consentNeeded(account.consent) : false;
  const back = () => (router.canGoBack() ? router.back() : router.replace("/my"));

  // 성공일 때만 시트를 닫고 성공 알림을 띄운다. 실패하면 시트를 열어 둔 채 실패 알림이다.
  const confirm = async (task: () => Promise<boolean>, ok: string, fail: string) => {
    if (busy) return;
    setBusy(true);
    let done: boolean;
    try {
      done = await task();
    } catch {
      done = false;
    } finally {
      setBusy(false);
    }
    if (!done) {
      toast.show(fail);
      return;
    }
    setSheet(null);
    toast.show(ok);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable role="button" aria-label="뒤로" hitSlop={12} onPress={back} style={styles.side}>
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <Text role="heading" aria-level={1} style={styles.headerTitle}>
          설정
        </Text>
        <View style={styles.side} />
      </View>
      {account?.signedIn ? (
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.section}>개인정보와 안전</Text>
          <View style={styles.card}>
            <Pressable
              role="button"
              onPress={() =>
                agreed
                  ? setSheet("withdraw")
                  : router.push({ pathname: "/generate/consent", params: { from: "settings" } })
              }
              style={styles.row}
            >
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>완성 룩 만들기 동의</Text>
                <Text style={styles.rowSub}>{agreed ? "동의함" : "동의 안 함"}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
            <Pressable role="button" onPress={openRetention} style={[styles.row, styles.divider]}>
              <Text style={[styles.rowTitle, styles.rowText]}>사진 보관 안내</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          </View>
          {account.signedIn ? (
            <>
              <Text style={styles.section}>계정</Text>
              <View style={styles.card}>
                <Pressable role="button" onPress={() => setSheet("signOut")} style={styles.row}>
                  <Text style={styles.rowTitle}>로그아웃</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </ScrollView>
      ) : null}

      <ConfirmSheet
        visible={sheet === "withdraw"}
        title="동의를 거둘까요?"
        body="거두면 다음 「이대로 입히기」 때 다시 물어요. 이미 만든 완성 룩은 그대로예요"
        action="동의 거두기"
        busy={busy}
        onConfirm={() =>
          void confirm(
            withdrawConsent,
            "동의를 거뒀어요",
            "동의를 거두지 못했어요. 잠시 후 다시 시도해 주세요",
          )
        }
        onClose={() => setSheet(null)}
      />
      <OverlaySheet
        visible={sheet === "retention"}
        title="사진 보관 안내"
        onClose={() => setSheet(null)}
      >
        {retention.kind === "ready" ? (
          <Text style={styles.sheetText}>
            {`완성 룩을 만들 때 보내는 트윈 그림과 옷 사진은 AI 업체 서버에 ${retention.days}일 보관돼요.`}
          </Text>
        ) : null}
        {retention.kind === "loading" ? (
          <ActivityIndicator aria-label="보관 기간을 불러오는 중" color={INK} />
        ) : null}
        {retention.kind === "failed" ? (
          <View style={styles.missing}>
            <Text style={styles.missingText}>보관 기간을 불러오지 못했어요</Text>
            <Pressable role="button" onPress={loadRetention} style={styles.retry}>
              <Text style={styles.retryLabel}>다시 불러오기</Text>
            </Pressable>
          </View>
        ) : null}
        <Text style={styles.sheetText}>옷 추가에 쓴 원본 사진은 이 기기에만 남아요.</Text>
      </OverlaySheet>
      <ConfirmSheet
        visible={sheet === "signOut"}
        title="로그아웃할까요?"
        body="옷장과 「내 코디」 는 이 휴대폰에 남아요"
        action="로그아웃"
        busy={busy}
        onConfirm={() =>
          void confirm(
            signOut,
            "로그아웃했어요",
            "로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요",
          )
        }
        onClose={() => setSheet(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  side: { width: 40, alignItems: "flex-start" },
  backIcon: { fontSize: 28, color: INK },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: INK },
  body: { paddingHorizontal: 20, paddingBottom: 40, gap: 10 },
  section: { fontSize: 13, fontWeight: "700", color: SUB, marginTop: 14 },
  card: { paddingHorizontal: 16, borderRadius: 16, borderWidth: 1, borderColor: "#EDECEA" },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 16, gap: 12 },
  rowText: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 16, fontWeight: "600", color: INK },
  rowSub: { fontSize: 13, color: SUB },
  chevron: { fontSize: 22, color: "#B5B2AC" },
  divider: { borderTopWidth: 1, borderTopColor: "#EDECEA" },
  sheetText: { fontSize: 14, lineHeight: 22, color: INK },
  missing: {
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EDECEA",
  },
  missingText: { fontSize: 15, lineHeight: 21, fontWeight: "700", color: INK },
  retry: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#F4F3F1",
  },
  retryLabel: { fontSize: 14, fontWeight: "700", color: INK },
});
