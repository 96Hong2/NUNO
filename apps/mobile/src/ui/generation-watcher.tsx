import { usePathname, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { markJobSeen, pollWatchedJobs } from "../composition/generation";
import { useAppToast } from "./app-toast";

/** 끝나지 않은 작업을 묻는 간격 */
const POLL_MS = 2000;

/**
 * 작업 감시: 앱 최상위 한 곳에서 기기 생성 요청 가운데 끝나지 않은 작업을 2초마다 묻는다.
 * 그 작업 화면을 보고 있지 않을 때 끝나면 알림과 「보기」 를 띄우고, 한 번 띄운 작업은 다시 띄우지 않는다.
 * 봤다고 적으면 markJobSeen 이 끝남 이벤트를 내고, 무대가 「다 된 완성 룩 보기」 를 다시 읽는다.
 */
export function GenerationWatcher() {
  const router = useRouter();
  const toast = useAppToast();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        for (const job of await pollWatchedJobs()) {
          await markJobSeen(job.jobId);
          if (pathRef.current === `/generate/${job.jobId}`) continue;
          toast.show(
            job.status === "succeeded" ? "완성 룩이 다 됐어요" : "완성 룩을 만들지 못했어요",
            [{ label: "보기", onPress: () => router.push(`/generate/${job.jobId}`) }],
          );
        }
      } catch {
        // 기기 DB 를 열지 못했거나 서버에 닿지 못했다. 다음 차례에 다시 묻는다.
      } finally {
        running = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void tick();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [router, toast]);

  return null;
}
