import type { PushSender } from "../generation/ports.ts";

/** 로그만 남기는 푸시. Expo 푸시 어댑터는 APNs 와 EAS 가 갖춰지면 더한다. */
export function createLogPushSender(): PushSender {
  return {
    send(message) {
      console.log(`푸시(로그): 사용자 ${message.userId} 작업 ${message.jobId} ${message.status}`);
      return Promise.resolve();
    },
  };
}
