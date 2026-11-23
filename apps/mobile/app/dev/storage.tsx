import { Redirect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  checkDevProbeConstraints,
  readDevStorage,
  writeDevProbe,
  type ConstraintCheck,
  type DevStorageSnapshot,
} from "../../src/composition/dev-storage";

export default function DevStorageScreen() {
  if (!__DEV__) return <Redirect href="/my" />;
  return <DevStorage />;
}

function DevStorage() {
  const [snapshot, setSnapshot] = useState<DevStorageSnapshot | null>(null);
  const [checks, setChecks] = useState<ConstraintCheck[]>([]);
  const [error, setError] = useState<string | null>(null);

  const guard = useCallback(async (task: () => Promise<void>) => {
    try {
      setError(null);
      await task();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, []);

  const refresh = useCallback(
    () => guard(async () => setSnapshot(await readDevStorage())),
    [guard],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const write = () =>
    guard(async () => {
      await writeDevProbe();
      setSnapshot(await readDevStorage());
    });

  const check = () =>
    guard(async () => {
      setChecks(await checkDevProbeConstraints());
      setSnapshot(await readDevStorage());
    });

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.row}>어댑터: {snapshot?.adapterName ?? "여는 중"}</Text>

      <View style={styles.actions}>
        <Pressable role="button" style={styles.button} onPress={() => void write()}>
          <Text style={styles.buttonLabel}>시험 값 쓰기</Text>
        </Pressable>
        <Pressable role="button" style={styles.button} onPress={() => void check()}>
          <Text style={styles.buttonLabel}>제약 확인</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>오류: {error}</Text> : null}

      {checks.length > 0 ? (
        <View aria-label="제약 확인 결과" style={styles.section}>
          {checks.map((item) => (
            <Text key={item.label} style={styles.row}>
              {item.label}: {item.blocked ? "막힘" : "들어감"} ({item.message})
            </Text>
          ))}
        </View>
      ) : null}

      <Text role="heading" aria-level={2} style={styles.heading}>
        dev_probe
      </Text>
      <View aria-label="dev_probe 값" style={styles.section}>
        {snapshot && snapshot.probes.length === 0 ? <Text style={styles.row}>값 없음</Text> : null}
        {snapshot?.probes.map((probe) => (
          <Text key={probe.key} style={styles.row}>
            {probe.key} = {probe.value}
          </Text>
        ))}
      </View>

      <Text role="heading" aria-level={2} style={styles.heading}>
        표마다 행 수
      </Text>
      <View aria-label="표마다 행 수" style={styles.section}>
        {snapshot && snapshot.tables.length === 0 ? <Text style={styles.row}>표 없음</Text> : null}
        {snapshot?.tables.map((table) => (
          <Text key={table.name} style={styles.row}>
            {table.name}: {table.rows}행
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 12, backgroundColor: "#fff", flexGrow: 1 },
  actions: { flexDirection: "row", gap: 8 },
  button: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, backgroundColor: "#111" },
  buttonLabel: { color: "#fff", fontSize: 15 },
  heading: { fontSize: 16, fontWeight: "600", marginTop: 8 },
  section: { gap: 4 },
  row: { fontSize: 14 },
  error: { fontSize: 14, color: "#b00020" },
});
