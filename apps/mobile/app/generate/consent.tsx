import { PROVIDER_RETENTION_DAYS } from "@nuno/generation";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { agreeConsent, loadConsentProvider } from "../../src/composition/account";
import { useAppToast } from "../../src/ui/app-toast";

const INK = "#151314";
const SUB = "#5F5C56";

// 첫 사용 동의: 「이대로 입히기」 전에 한 번. 체크 줄 셋을 다 골라야 「동의하고 만들기」 가 된다.
// 받는 곳(공급사 이름과 나라)은 서버가 켜 둔 공급사 줄에서 읽는다. 못 읽으면 동의를 받지 않는다.

type ReceiverLoad =
  | { kind: "loading" }
  | { kind: "ready"; provider: string; country: string | null }
  | { kind: "missing" };

export default function ConsentScreen() {
  const router = useRouter();
  const toast = useAppToast();
  // 설정에서 열면 동의한 뒤 설정으로 돌아간다. 「이대로 입히기」 에서 열면 「완성 룩 만들기」 시트로 간다.
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [load, setLoad] = useState<ReceiverLoad>({ kind: "loading" });
  const [checked, setChecked] = useState([false, false, false]);
  const [busy, setBusy] = useState(false);

  const loadReceiver = useCallback(() => {
    setLoad({ kind: "loading" });
    void loadConsentProvider().then(
      (found) =>
        setLoad(
          found?.provider
            ? { kind: "ready", provider: found.provider, country: found.country }
            : { kind: "missing" },
        ),
      () => setLoad({ kind: "missing" }),
    );
  }, []);
  useEffect(loadReceiver, [loadReceiver]);

  const ready = load.kind === "ready";
  const receiver = ready ? `${load.provider}${load.country ? `(${load.country})` : ""}` : "AI 업체";
  const rows = [
    {
      title: "트윈 그림과 고른 옷 사진을 AI 업체로 보내요",
      sub: "보내는 것은 트윈 그림, 옷 사진, 만들기 지시문이에요",
    },
    {
      title: `받는 곳은 ${receiver}예요`,
      sub: `받은 자료는 ${PROVIDER_RETENTION_DAYS}일 두고 지워요`,
    },
    { title: "AI 업체는 보낸 자료를 학습에 쓰지 않아요", sub: null },
  ];
  const all = checked.every(Boolean);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/fitting/coordi"));

  const submit = async () => {
    if (!ready) return;
    if (!all) {
      setChecked([true, true, true]);
      return;
    }
    if (busy) return;
    setBusy(true);
    const result = await agreeConsent();
    setBusy(false);
    if (result === "agreed" && from === "settings") {
      toast.show("동의했어요");
      back();
    } else if (result === "agreed") {
      if (router.canDismiss()) router.dismissAll();
      router.navigate({ pathname: "/fitting/coordi", params: { make: "1" } });
    } else if (result === "outdated") {
      toast.show("앱을 업데이트해 주세요");
    } else if (result === "unavailable") {
      setLoad({ kind: "missing" });
    } else {
      toast.show("동의를 보내지 못했어요. 잠시 뒤에 다시 해 주세요");
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.top}>
        <Pressable role="button" aria-label="뒤로" hitSlop={12} onPress={back}>
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text role="heading" aria-level={1} style={styles.title}>
          완성 룩을 만들기 전에 확인해 주세요
        </Text>
        {load.kind === "missing" ? (
          <View style={styles.missing}>
            <Text style={styles.missingText}>받는 곳을 불러오지 못했어요</Text>
            <Pressable role="button" onPress={loadReceiver} style={styles.retry}>
              <Text style={styles.retryLabel}>다시 불러오기</Text>
            </Pressable>
          </View>
        ) : null}
        {rows.map((row, index) => (
          <Pressable
            key={row.title}
            role="checkbox"
            aria-checked={checked[index]}
            aria-label={row.title}
            aria-disabled={!ready}
            disabled={!ready}
            onPress={() => setChecked(checked.map((value, at) => (at === index ? !value : value)))}
            style={[styles.row, !ready && styles.busy]}
          >
            <View style={[styles.box, checked[index] && styles.boxOn]}>
              {checked[index] ? <Text style={styles.mark}>✓</Text> : null}
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{row.title}</Text>
              {row.sub ? <Text style={styles.rowSub}>{row.sub}</Text> : null}
            </View>
          </Pressable>
        ))}
        <Text style={styles.note}>
          동의하지 않아도 무대에서 겹쳐 보기는 그대로 써요. 「이대로 입히기」 만 쓸 수 없어요
        </Text>
      </ScrollView>
      <View style={styles.bar}>
        <Pressable
          role="button"
          aria-disabled={busy || !ready}
          disabled={busy || !ready}
          onPress={() => void submit()}
          style={[styles.primary, (busy || !ready) && styles.busy]}
        >
          <Text style={styles.primaryLabel}>{all ? "동의하고 만들기" : "모두 동의하기"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  top: { paddingHorizontal: 16, paddingVertical: 12 },
  backIcon: { fontSize: 28, color: INK },
  body: { paddingHorizontal: 20, paddingBottom: 120, gap: 18 },
  title: { fontSize: 22, lineHeight: 30, fontWeight: "800", color: INK, marginBottom: 6 },
  row: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  box: {
    width: 24,
    height: 24,
    marginTop: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#C9C6C0",
  },
  boxOn: { borderColor: INK, backgroundColor: INK },
  mark: { color: "#fff", fontSize: 13, fontWeight: "800" },
  rowText: { flex: 1, gap: 4 },
  rowTitle: { fontSize: 16, lineHeight: 22, fontWeight: "700", color: INK },
  rowSub: { fontSize: 13, lineHeight: 19, color: SUB },
  note: {
    fontSize: 13,
    lineHeight: 19,
    color: SUB,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#F4F3F1",
  },
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
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, backgroundColor: "#fff" },
  primary: {
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    borderRadius: 12,
    backgroundColor: INK,
  },
  busy: { opacity: 0.6 },
  primaryLabel: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
