import { NextResponse } from "next/server";

export const maxDuration = 300;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  // 최근 7일. 4678이 `주문확정일 OR 계약완료일`로 필터하므로, 몇 달 전
  // 주문확정 건이라도 이 창 안에 계약완료되면 계약완료일로 걸려 들어온다.
  // 2일이 아니라 7일인 이유:
  //   · 늦게 들어오는 계약완료를 놓칠 여유가 5일 더 생긴다
  //   · 손익이 이틀 숙성분이 아니라 7일 숙성분으로 잡힌다
  //     (정산완료율 실측: 2일 77% → 4주 90% → 9주 99%)
  // 비용은 무시할 수준이다 — 3일 창이 974행이라 7일이면 2천 행대.
  const from = new Date(Date.now() - 86400000 * 6).toISOString().slice(0, 10);

  const port = process.env.PORT || 3000;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const base = `http://localhost:${port}${basePath}/api/sync`;

  const results: Record<string, unknown> = {};

  // 주문확정·계약완료 통합 — 4678 한 번 조회로 raw_prop_items를 갱신한다.
  // 4678은 주문확정일 OR 계약완료일로 조회하므로, 주문확정이 오래된 건이라도
  // 최근에 계약완료되면 이 창에 걸려 손익이 함께 갱신된다.
  //
  // 롤링 창이 원리적으로 못 잡는 것: "새 날짜가 생기지 않고 기존 값만 바뀌는"
  // 변경이다. 예) 8/19 계약완료가 나중에 취소되며 계약완료일이 회수된 건
  // (usid 6783105·6795559). 그 행의 두 날짜가 모두 과거라 어떤 창에도 안 걸린다.
  // 규모는 월 2건 수준(2026-08 계약완료 5,632건 중)이라 급하지 않으므로,
  // 정리는 월 1회 월 단위 청크 sweep 으로 따로 돈다.
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
