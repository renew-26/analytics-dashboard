export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
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
}
