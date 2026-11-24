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
import { GARMENT_CATEGORIES } from "@nuno/wardrobe";
import { setDevStage, showLandmarks, stageHidden } from "../../src/ui/stage-config";

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
      <Text style={styles.row}>판 번호: {snapshot?.schemaVersion ?? "여는 중"}</Text>

      <Text role="heading" aria-level={2} style={styles.heading}>
        저장한 값
      </Text>
      <View aria-label="저장한 값" style={styles.section}>
        {snapshot?.saved.map((item) => (
          <Text key={item.label} style={styles.row}>
            {item.label}: {item.value ?? "없음"}
          </Text>
        ))}
      </View>

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

      <StageSwitches />

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

/** 코디 무대 시험: 점 겹쳐 보기와 무대에 겹치지 않을 분류. 앱을 켠 동안만 남는다. */
function StageSwitches() {
  const [, setTick] = useState(0);
  const rerender = () => setTick((value) => value + 1);
  const hidden = new Set(GARMENT_CATEGORIES.map((c) => c.key).filter(stageHidden));
  return (
    <>
      <Text role="heading" aria-level={2} style={styles.heading}>
        코디 무대 시험
      </Text>
      <Pressable
        role="switch"
        aria-checked={showLandmarks()}
        onPress={() => {
          setDevStage({ landmarks: !showLandmarks() });
          rerender();
        }}
        style={styles.toggle}
      >
        <Text style={styles.row}>점 겹쳐 보기: {showLandmarks() ? "켬" : "끔"}</Text>
      </Pressable>
      <View role="group" aria-label="무대에 겹치지 않는 분류" style={styles.actions}>
        {GARMENT_CATEGORIES.map((category) => {
          const on = hidden.has(category.key);
          return (
            <Pressable
              key={category.key}
              role="checkbox"
              aria-checked={on}
              onPress={() => {
                const next = new Set(hidden);
                if (on) next.delete(category.key);
                else next.add(category.key);
                setDevStage({ hidden: next });
                rerender();
              }}
              style={[styles.toggle, on && styles.toggleOn]}
            >
              <Text style={styles.row}>{category.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  toggle: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#f1f1f1",
  },
  toggleOn: { backgroundColor: "#ffd7de" },
  container: { padding: 24, gap: 12, backgroundColor: "#fff", flexGrow: 1 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, backgroundColor: "#111" },
  buttonLabel: { color: "#fff", fontSize: 15 },
  heading: { fontSize: 16, fontWeight: "600", marginTop: 8 },
  section: { gap: 4 },
  row: { fontSize: 14 },
  error: { fontSize: 14, color: "#b00020" },
});
