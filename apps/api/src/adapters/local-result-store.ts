import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type { ResultStore } from "../generation/ports.ts";
import { isSafeKey, signFileUrl } from "../generation/signed-url.ts";

export interface LocalResultStoreConfig {
  /** 결과 사진 폴더. API 와 worker 가 같은 폴더를 쓴다. */
  dir: string;
  /** 서명 주소 HMAC 키. API 와 worker 가 같은 값을 쓴다. */
  secret: string;
  /** 앱이 여는 API 주소의 앞부분(`http://localhost:8787` 등). */
  publicUrl: string;
}

/** 로컬 디스크 결과 저장. 파일은 API 의 `/v1/files` 서명 주소로만 내보낸다. */
export type LocalResultStore = ResultStore;

const missing = (error: unknown) => (error as { code?: string }).code === "ENOENT";

export function createLocalResultStore(config: LocalResultStoreConfig): LocalResultStore {
  const root = resolve(config.dir);
  const pathOf = (key: string) => {
    const path = resolve(root, key);
    if (!isSafeKey(key) || !path.startsWith(root + sep)) {
      throw new Error(`결과 폴더 밖을 가리키는 키다: ${key}`);
    }
    return path;
  };

  return {
    async put(key, bytes) {
      const path = pathOf(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
    },
    async copy(fromKey, toKey) {
      const to = pathOf(toKey);
      await mkdir(dirname(to), { recursive: true });
      await copyFile(pathOf(fromKey), to);
    },
    async remove(key) {
      await rm(pathOf(key), { force: true });
    },
    signedUrl: (key, now, notAfter) =>
      Promise.resolve(signFileUrl(config.publicUrl, config.secret, key, now, notAfter)),
    async read(key) {
      try {
        return await readFile(pathOf(key));
      } catch (error) {
        if (missing(error)) return null;
        throw error;
      }
    },
  };
}
