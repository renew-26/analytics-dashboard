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

  // 주문확정·계약완료 통합 — 4678 한 번 조회로 raw_prop_items를 갱신한다.
  // 4678은 주문확정일 OR 계약완료일로 조회하므로, 주문확정이 오래된 건이라도
  // 최근에 계약완료되면 이 창에 걸려 손익이 함께 갱신된다.
  {
    const res = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "prop_items", startDate: from, endDate: today }),
    });
    results["prop_items"] = await res.json();
  }

  // tps_pnl: 올해 전체 기준 upsert
  {
    const yearStart = `${new Date().getFullYear()}-01-01`;
    const res = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "tps_pnl", startDate: yearStart, endDate: today }),
    });
    results["tps_pnl"] = await res.json();
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
