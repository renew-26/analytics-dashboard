import { NextResponse } from "next/server";

export const maxDuration = 300;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  // 2일 전부터 오늘까지 fetch (혹시 모를 누락 방지, upsert로 중복 무해)
  const from = new Date(Date.now() - 86400000 * 2).toISOString().slice(0, 10);

  const port = process.env.PORT || 3000;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const base = `http://localhost:${port}${basePath}/api/sync`;

  const results: Record<string, unknown> = {};

  // 날짜 범위가 필요한 타입
  for (const type of ["contract", "order"] as const) {
    const res = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, startDate: from, endDate: today }),
    });
    results[type] = await res.json();
  }

  // 날짜 범위 없이 전체 동기화
  for (const type of ["auto_quote", "auto_quote_typea"] as const) {
    const res = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });
    results[type] = await res.json();
  }

  return NextResponse.json(results);
}
