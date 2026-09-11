import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

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

  // 동기화가 캐시를 깬다 — 타이머(revalidate)는 데이터가 실제로 바뀐 시점을 모른다.
  // 데이터는 하루 한 번 통째로 바뀌므로 페이지별로 골라 깰 이유가 없다.
  //
  // 하드 퍼지는 아래 revalidatePath 가 한다 — revalidateTag 가 아니다(정정, 2026-09-11
  // 실측). unstable_cache 는 라우트의 암묵 태그를 softTags 로 등록하는데, 모든 라우트의
  // 암묵 집합에 `_N_T_/layout` 이 포함돼 있어서 profile 없이 호출되는 revalidatePath 가
  // 그 태그를 expired: now 로 무효화한다. 그래서 이 줄이 실제 무효화를 담당한다 —
  // "중복"으로 보고 지우면 무효화가 깨진다. 절대 지우지 말 것.
  revalidatePath("/", "layout");
  // 반면 revalidateTag("dashboard-data", "max") 는 벨트앤브레이스 소프트 신호일 뿐이다.
  // Next 16 타입이 두 번째 인자(profile)를 요구해서 "max" 를 채택했는데(Next 자체 경고가
  // 권하는 기본값), "max" 는 { expire: 31536000 } 로 해석된다 — stale: now 는 즉시
  // 세우지만 expired 는 365일 뒤라, unstable_cache 는 이 태그만으로는 하드 무효화 없이
  // 스테일-서빙 후 백그라운드 재검증에 그친다. 위 revalidatePath 가 없으면 각 항목은
  // 최대 revalidate(86400s) 안전망이 돌 때까지 스테일 상태로 계속 서빙된다.
  revalidateTag("dashboard-data", "max");

  return NextResponse.json(results);
}
