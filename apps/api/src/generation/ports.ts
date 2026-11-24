/** 결과 사진을 두는 곳. 지금은 로컬 디스크, 버킷과 키가 오면 R2 어댑터가 같은 꼴을 구현한다. */
export interface ResultStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  copy(fromKey: string, toKey: string): Promise<void>;
  /** 없는 키를 지워도 오류가 아니다. */
  remove(key: string): Promise<void>;
  /** 앱이 결과를 여는 주소. 기한은 `RESULT_URL_TTL_SECONDS` 다. */
  signedUrl(key: string, now: Date): Promise<{ url: string; expiresAt: string }>;
}

/** 출력 검사. 검사 회사가 정해지면 진짜 어댑터를 더한다. */
export interface ImageCheck {
  check(image: Uint8Array): Promise<"pass" | "fail">;
}

export interface PushMessage {
  userId: string;
  jobId: string;
  status: "succeeded" | "failed";
}

/** 작업이 끝나면 그 사용자 기기로 알린다. 지금 어댑터는 로그만 남긴다. */
export interface PushSender {
  send(message: PushMessage): Promise<void>;
}
