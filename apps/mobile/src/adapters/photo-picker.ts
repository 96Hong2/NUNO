import type { GarmentMethod } from "@nuno/wardrobe";
import {
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
} from "expo-image-picker";

export type PickedPhoto =
  { kind: "picked"; uri: string } | { kind: "canceled" } | { kind: "denied" };

/**
 * 옷 사진 고르기. 웹은 파일 고르기 창(사진 찍기는 capture 속성)을 연다.
 * 앨범은 아이폰 사진 고르기 창이라 권한을 묻지 않는다. 카메라는 권한이 없으면 "denied" 를 낸다.
 * exif 를 받지 않는다. 웹은 저장할 때 canvas 로 다시 구워 위치 정보가 남지 않는다.
 */
export async function pickPhoto(method: GarmentMethod): Promise<PickedPhoto> {
  if (method === "camera") {
    const permission = await requestCameraPermissionsAsync();
    if (!permission.granted) return { kind: "denied" };
  }
  const options = { mediaTypes: ["images" as const], quality: 1, exif: false };
  const result =
    method === "camera" ? await launchCameraAsync(options) : await launchImageLibraryAsync(options);
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? { kind: "picked", uri: asset.uri } : { kind: "canceled" };
}
