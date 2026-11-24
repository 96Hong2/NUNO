import { Asset } from "expo-asset";

/**
 * 설치 파일 그림(require 한 모듈)을 파일로 읽을 수 있는 주소로 바꾼다.
 * 웹은 개발 서버 주소, 아이폰은 앱 안으로 내려받은 파일 주소다.
 */
export async function assetFileUri(module: unknown): Promise<string> {
  const asset = Asset.fromModule(module as number);
  await asset.downloadAsync();
  return asset.localUri ?? asset.uri;
}
