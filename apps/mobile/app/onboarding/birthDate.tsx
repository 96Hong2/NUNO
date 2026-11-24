import { BIRTH_DATE_DEFAULT, BIRTH_DATE_MIN, isValidBirthDate } from "@nuno/profile";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { submitBirthDate, todayKst } from "../../src/composition/profile";
import { BirthDateField } from "../../src/ui/birth-date-field";
import { useProfile } from "../../src/ui/profile-gate";

// 첫 실행 화면. 날짜가 골라진 채 열려 「다음」 이 바로 눌린다.
// 저장하면 프로필을 다시 읽고, 루트의 Stack.Protected 가 다음 화면으로 보낸다.
export default function BirthDateScreen() {
  const { refresh } = useProfile();
  const [value, setValue] = useState(BIRTH_DATE_DEFAULT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = todayKst();
  const disabled = saving || !isValidBirthDate(value, today);

  const next = async () => {
    setSaving(true);
    try {
      await submitBirthDate(value);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.body}>
        <Text role="heading" aria-level={1} style={styles.title}>
          생년월일을 알려 주세요
        </Text>
        <Text style={styles.subtitle}>생년월일은 프로필에 보이지 않아요.</Text>
        <BirthDateField value={value} min={BIRTH_DATE_MIN} max={today} onChange={setValue} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
      <Pressable
        role="button"
        aria-disabled={disabled}
        disabled={disabled}
        onPress={() => void next()}
        style={StyleSheet.flatten([styles.button, disabled && styles.buttonDisabled])}
      >
        <Text style={styles.buttonLabel}>다음</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24, justifyContent: "space-between", backgroundColor: "#fff" },
  body: { gap: 16, paddingTop: 48 },
  title: { fontSize: 26, fontWeight: "700" },
  subtitle: { fontSize: 15, color: "#777" },
  error: { fontSize: 13, color: "#c62828" },
  button: { paddingVertical: 16, borderRadius: 12, alignItems: "center", backgroundColor: "#111" },
  buttonDisabled: { backgroundColor: "#c8c8c8" },
  buttonLabel: { color: "#fff", fontSize: 17, fontWeight: "600" },
});
