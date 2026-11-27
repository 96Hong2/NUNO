import { goldAmountLabel, goldWonLabel, ledgerDateLabel } from "@nuno/generation";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { loadAccount, type GoldSummary } from "../src/composition/account";

const INK = "#151314";
const SUB = "#5F5C56";

// 「내 골드」: 잔액, 원화 값, 사용 내역. 충전 단추는 충전이 생기면 단다.
export default function GoldScreen() {
  const router = useRouter();
  const [gold, setGold] = useState<GoldSummary | null>(null);
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void loadAccount().then((state) => {
        setGold(state.gold);
        setLoaded(true);
      });
    }, []),
  );

  const back = () => (router.canGoBack() ? router.back() : router.replace("/my"));

  return (
    <View testID="gold-screen" style={styles.screen}>
      <View style={styles.top}>
        <Pressable role="button" aria-label="뒤로" hitSlop={12} onPress={back}>
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text role="heading" aria-level={1} style={styles.title}>
          내 골드
        </Text>
        {gold ? (
          <>
            <View style={styles.balanceBlock}>
              <Text style={styles.balance}>{gold.balance}골드</Text>
              <Text style={styles.won}>{goldWonLabel(gold.balance)}</Text>
            </View>
            <Text role="heading" aria-level={2} style={styles.section}>
              사용 내역
            </Text>
            <View aria-label="사용 내역">
              {gold.entries.length === 0 ? (
                <Text style={styles.empty}>아직 사용 내역이 없어요</Text>
              ) : (
                gold.entries.map((entry, index) => (
                  <View key={`${entry.at}-${index}`} style={styles.row}>
                    <Text style={styles.date}>{ledgerDateLabel(entry.at)}</Text>
                    <Text style={styles.label}>{entry.label}</Text>
                    <Text style={[styles.amount, entry.amount > 0 ? styles.plus : styles.minus]}>
                      {goldAmountLabel(entry.amount)}
                    </Text>
                  </View>
                ))
              )}
            </View>
            <Text style={styles.foot}>1골드는 100원이에요</Text>
          </>
        ) : loaded ? (
          <Text style={styles.empty}>골드를 불러오지 못했어요</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  top: { paddingHorizontal: 16, paddingVertical: 12 },
  backIcon: { fontSize: 28, color: INK },
  body: { paddingHorizontal: 20, paddingBottom: 40, gap: 8 },
  title: { fontSize: 26, fontWeight: "800", color: INK, marginTop: 8 },
  balanceBlock: { marginTop: 20, marginBottom: 28, gap: 4 },
  balance: { fontSize: 38, fontWeight: "800", color: INK },
  won: { fontSize: 14, color: SUB },
  section: { fontSize: 17, fontWeight: "800", color: INK, marginBottom: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E7E6E3",
  },
  date: { width: 68, fontSize: 13, color: SUB },
  label: { flex: 1, fontSize: 15, color: INK },
  amount: { fontSize: 15, fontWeight: "800" },
  plus: { color: INK },
  minus: { color: SUB },
  empty: { fontSize: 14, color: SUB, paddingVertical: 16 },
  foot: { fontSize: 13, lineHeight: 20, color: SUB, marginTop: 16 },
});
