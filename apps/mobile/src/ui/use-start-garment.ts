import type { ClosetKey, GarmentMethod } from "@nuno/wardrobe";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Linking } from "react-native";
import { startGarmentDraft } from "../composition/wardrobe";
import { useAppToast } from "./app-toast";

/**
 * 사진을 고르고 누끼를 만들어 다음 단계(사람이 든 사진은 자르기, 아니면 2 / 4)를 연다.
 * from 은 넣기를 시작한 칸이다. 「이 옷을 가지고 있나요?」 의 처음 답과 담은 뒤 돌아갈 칸을 정한다.
 * 옷장 시트의 「앨범에서 고르기」 와 1 / 4 의 셔터, 「앨범」 이 함께 쓴다.
 */
export function useStartGarment(from: ClosetKey) {
  const router = useRouter();
  const toast = useAppToast();
  const [busy, setBusy] = useState(false);

  const start = useCallback(
    async (method: GarmentMethod) => {
      setBusy(true);
      try {
        const result = await startGarmentDraft(method);
        if (result.kind === "canceled") return;
        if (result.kind === "denied") {
          toast.show(
            method === "camera" ? "카메라 접근을 허용해 주세요" : "사진 접근을 허용해 주세요",
            [{ label: "설정 열기", onPress: () => void Linking.openSettings() }],
          );
          return;
        }
        const next = result.draft.photo.hadPerson ? "/garment/new/crop" : "/garment/new/cutout";
        router.push({ pathname: next, params: { from } });
      } catch {
        toast.show("이 사진은 열 수 없어요. 다른 사진을 골라 주세요");
      } finally {
        setBusy(false);
      }
    },
    [from, router, toast],
  );

  return { start, busy };
}
