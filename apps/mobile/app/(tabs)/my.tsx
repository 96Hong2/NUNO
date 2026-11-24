import { DISPLAY_NAME_MAX } from "@nuno/profile";
import { Link } from "expo-router";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { submitDisplayName } from "../../src/composition/profile";
import { EmptyScreen } from "../../src/ui/empty-screen";
import { useProfile } from "../../src/ui/profile-gate";

// 마이 프로필: 이름과 스타일 태그만 보인다. 생년월일은 보이지 않는다.
export default function MyScreen() {
  const { profile, refresh } = useProfile();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const open = () => {
    setName(profile.displayName ?? "");
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    try {
      await submitDisplayName(name);
      await refresh();
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <EmptyScreen title="마이">
      <Pressable role="button" onPress={open} style={styles.nameRow}>
        <Text style={profile.displayName ? styles.name : styles.namePlaceholder}>
          {profile.displayName ?? "이름 정하기"}
        </Text>
      </Pressable>

      <View aria-label="스타일 해시태그" style={styles.tags}>
        {profile.styleTags.length === 0 ? (
          <Text style={styles.empty}>아직 고른 해시태그가 없어요</Text>
        ) : (
          profile.styleTags.map((tag) => (
            <Text key={tag} style={styles.tag}>
              #{tag}
            </Text>
          ))
        )}
      </View>

      {__DEV__ ? (
        <Link href="/dev/storage" asChild>
          <Pressable role="link" style={styles.devRow}>
            <Text style={styles.devLabel}>저장소 보기</Text>
            <Text style={styles.devHint}>개발 빌드에서만 보인다</Text>
          </Pressable>
        </Link>
      ) : null}

      <Modal
        visible={editing}
        transparent
        animationType="slide"
        onRequestClose={() => setEditing(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text role="heading" aria-level={3} style={styles.sheetTitle}>
              이름
            </Text>
            <TextInput
              aria-label="이름"
              value={name}
              onChangeText={setName}
              placeholder={`${DISPLAY_NAME_MAX}자까지 쓸 수 있어요`}
              autoFocus
              style={styles.input}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.sheetActions}>
              <Pressable role="button" onPress={() => setEditing(false)} style={styles.cancel}>
                <Text style={styles.cancelLabel}>닫기</Text>
              </Pressable>
              <Pressable role="button" onPress={() => void save()} style={styles.save}>
                <Text style={styles.saveLabel}>저장</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </EmptyScreen>
  );
}

const styles = StyleSheet.create({
  nameRow: { paddingVertical: 4 },
  name: { fontSize: 22, fontWeight: "700" },
  namePlaceholder: { fontSize: 22, fontWeight: "700", color: "#999" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: {
    fontSize: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "#f2f2f2",
  },
  empty: { fontSize: 14, color: "#777" },
  devRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d0d0d0",
    gap: 2,
  },
  devLabel: { fontSize: 16 },
  devHint: { fontSize: 12, color: "#777" },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    padding: 24,
    gap: 12,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: "#fff",
  },
  sheetTitle: { fontSize: 18, fontWeight: "600" },
  input: {
    fontSize: 17,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d0d0d0",
  },
  error: { fontSize: 13, color: "#c62828" },
  sheetActions: { flexDirection: "row", gap: 8, justifyContent: "flex-end" },
  cancel: { paddingVertical: 12, paddingHorizontal: 18 },
  cancelLabel: { fontSize: 16, color: "#555" },
  save: { paddingVertical: 12, paddingHorizontal: 22, borderRadius: 10, backgroundColor: "#111" },
  saveLabel: { fontSize: 16, color: "#fff", fontWeight: "600" },
});
