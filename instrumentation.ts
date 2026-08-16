export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // dev 서버에서도 NEXT_RUNTIME === "nodejs"이므로 플래그 없이는 로컬 실행분까지 스케줄이 등록된다.
  // .env.local이 실서비스 Supabase를 가리키므로, 명시적으로 켠 경우에만 등록한다.
  if (process.env.ENABLE_CRON !== "true") {
    console.log("[cron] ENABLE_CRON=true 아님 — 자동 동기화 스케줄을 등록하지 않습니다.");
    return;
  }

  const cron = await import("node-cron");

  // 매일 새벽 5시 (KST) = UTC 20:00 (전날)
  cron.default.schedule("0 20 * * *", async () => {
    const port = process.env.PORT || 3000;
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const secret = process.env.CRON_SECRET;

    if (!secret) {
      console.error("[cron] CRON_SECRET 환경변수가 설정되지 않았습니다.");
      return;
    }

    try {
      const res = await fetch(
        `http://localhost:${port}${basePath}/api/sync/cron`,
        { headers: { authorization: `Bearer ${secret}` } },
      );
      const result = await res.json();
      console.log("[cron] Redash 동기화 완료:", result);
    } catch (err) {
      console.error("[cron] Redash 동기화 실패:", err);
    }
  });

  console.log("[cron] Redash 자동 동기화 스케줄 등록 완료 (매일 새벽 5시 KST)");
}
