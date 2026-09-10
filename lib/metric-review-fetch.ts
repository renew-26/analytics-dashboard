import { createClient } from "@supabase/supabase-js";
import { SOURCE, type Basis, type ReviewRow } from "@/lib/metric-review";

/**
 * Supabase 페치 — READ ONLY. select 외 어떤 쓰기 메서드도 이 파일에 두지 않는다.
 */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// 손익 컬럼까지 넓게 당기는 쿼리는 5만 행 한 문장이 Supabase statement timeout 에
// 걸린다(실측: app/revenue-analysis/page.tsx, 병렬 4쿼리 상황에서 간헐적
// "canceling statement due to statement timeout").
const WIDE_PAGE = 10000;
const COHORT_PAGE = 50000;

/**
 * 인메모리 페치 캐시 — basis/start/end 가 같으면 BM 필터(전체/BM1/BM2/BM3)를
 * 바꿔도 DB 왕복이 없다. BM 필터는 페치 결과를 각 page.tsx 에서 메모리 중에
 * 걸러내므로(byBm) 페치 자체는 bm 을 모른다 — 그래서 캐시 키에도 bm 이 없다.
 *
 * 원천은 하루 한 번(05:00 KST) 동기화되므로 몇 분의 TTL은 화면상 보이지 않는다.
 * lastSyncedAt(데이터 기준 표기)을 rows 와 분리해서 캐싱하면 한쪽만 만료됐을 때
 * "데이터 기준"과 실제로 보이는 행이 어긋날 수 있어, 한 캐시 엔트리에 묶어 함께
 * 갱신되게 한다.
 *
 * Next 16 이 이 프로젝트에 stable 로 제공하는 캐시 API("use cache" 지시어)는
 * next.config.js 에 dynamicIO/cacheComponents 를 켜야 동작하는 실험 기능이라
 * 이 브랜치에는 없다. force-dynamic 라우트에서 unstable_cache 가 Data Cache 와
 * 어떻게 상호작용하는지도 배포 환경마다 달라 예측이 어렵다 — 그래서 예측 가능한
 * 모듈 레벨 Map + TTL 을 쓴다. 크기는 상한을 두어(LRU) 무한정 자라지 않는다.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 30;

function makeCache<T>() {
  const store = new Map<string, { value: T; ts: number }>();
  return {
    get(key: string): T | undefined {
      const hit = store.get(key);
      if (!hit) return undefined;
      if (Date.now() - hit.ts > CACHE_TTL_MS) {
        store.delete(key);
        return undefined;
      }
      // LRU touch — 최근 쓴 키를 맨 뒤로 옮겨 다음에 밀려날 후보에서 뺀다.
      store.delete(key);
      store.set(key, hit);
      return hit.value;
    },
    set(key: string, value: T) {
      if (!store.has(key) && store.size >= CACHE_MAX_ENTRIES) {
        const oldestKey = store.keys().next().value;
        if (oldestKey !== undefined) store.delete(oldestKey);
      }
      store.set(key, { value, ts: Date.now() });
    },
  };
}

const reviewRowsCache = makeCache<{ rows: ReviewRow[]; lastSyncedAt: string | null }>();
const cohortRowsCache = makeCache<ReviewRow[]>();

// synced_at 은 여기서 빠졌다 — lib/metric-review.ts 의 어떤 집계도 참조하지
// 않는다(2026-09-10 grep 확인: 오직 "데이터 기준" 표기용 lastSyncedAt 계산에만
// 쓰였다). 30,126행 전체에서 매번 끌어올 이유가 없어 아래 fetchLastSyncedAt 로
// 뺐다 — 행 1개짜리 별도 쿼리.
const PNL_COLS =
  "category, brand, partner_company, rental_company, " +
  "total_rental_fee, sales, sales_incentive, bad_debt, promotion, cost_of_goods, financial_cost, contribution_margin";

type WideRawRow = {
  order_confirmed_at?: string | null;
  contract_date?: string | null;
  category: string | null;
  brand: string | null;
  partner_company: string | null;
  rental_company: string | null;
  total_rental_fee: number | null;
  sales: number | null;
  sales_incentive: number | null;
  bad_debt: number | null;
  promotion: number | null;
  cost_of_goods: number | null;
  financial_cost: number | null;
  contribution_margin: number | null;
};

function toReviewRow(r: WideRawRow, dateCol: "order_confirmed_at" | "contract_date"): ReviewRow {
  const date = (dateCol === "order_confirmed_at" ? r.order_confirmed_at : r.contract_date) ?? "";
  return {
    date,
    // quote_date/order_confirmed_at 은 이 와이드 페치에서 더 이상 셀렉트하지
    // 않는다 — buildCohort/buildLeadTime/buildFunnel(lib/metric-review.ts)은
    // 이 값을 코호트 전용 좁은 페치(fetchCohortRows)로만 받고, 본문 페치
    // (fetchReviewRows) 결과의 이 두 필드는 어디서도 읽지 않는다(2026-09-10
    // grep 확인). basis="order" 일 때 order_confirmed_at 은 dateCol 자체라
    // 어차피 공짜로 있지만, 안 쓰이는 값이니 굳이 채우지 않는다.
    quote_date: null,
    order_confirmed_at: null,
    category: r.category ?? null,
    brand: r.brand ?? null,
    partner_company: r.partner_company ?? null,
    rental_company: r.rental_company ?? null,
    sales: r.sales ?? null,
    contribution_margin: r.contribution_margin ?? null,
    total_rental_fee: r.total_rental_fee ?? null,
    sales_incentive: r.sales_incentive ?? null,
    bad_debt: r.bad_debt ?? null,
    promotion: r.promotion ?? null,
    cost_of_goods: r.cost_of_goods ?? null,
    financial_cost: r.financial_cost ?? null,
  };
}

/** 해당 테이블의 최신 synced_at 한 행만 — 집계와 무관, "데이터 기준" 표기 전용 */
async function fetchLastSyncedAt(table: string): Promise<string | null> {
  const { data, error } = await supabase
    .from(table)
    .select("synced_at")
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error(`[metric-review] ${table} synced_at fetch failed:`, error.message);
    return null;
  }
  return (data as { synced_at: string | null } | null)?.synced_at ?? null;
}

/**
 * basis 기준 창(본문 4개월)을 손익 컬럼까지 전부 당긴다.
 *
 * 행 수를 먼저 저렴하게(count-only) 받아 페이지 수를 정하고, 그 다음 모든
 * 페이지를 병렬로 쏜다 — 코호트 쿼리가 47,015행을 단일 왕복 440ms에 돌려주는
 * 것에서 보듯 병목은 행 수가 아니라 4번의 순차 왕복이었다. WIDE_PAGE(10,000)는
 * 그대로 둔다 — 5만 행 한 문장은 병렬 상황에서 timeout 이 실측된 값이라
 * 늘리지 않는다. count 조회가 실패하면(네트워크 등) 기존 순차 루프로 되돌아간다.
 *
 * order(dateCol) 뒤에 prop_item_usid 를 2차 정렬키로 반드시 붙인다 — dateCol
 * (order_confirmed_at/contract_date)은 시각 없는 날짜 값이라 하루에 수백 행이
 * 동률로 묶인다. 동률 안에서의 순서는 Postgres 쿼리 플랜(스캔 방식)에 좌우되고,
 * 플랜은 select 하는 컬럼 목록이 바뀌면 함께 바뀔 수 있다 — 즉 select 절만 다른
 * 두 쿼리가 "같은 행 30,126개"를 반환하면서도 range() 페이지 경계에서 동률 행의
 * 일부가 뒤바뀌어 합계가 미세하게 달라질 수 있다(2026-09-10 실측: 이 화면의
 * 3개월 기준선 합계가 select 컬럼을 synced_at/quote_date 포함 여부만 바꿔도
 * 6,719,092,293원 ↔ 6,719,322,145원으로 갈렸다 — 동일 스크립트로 직접 재현·
 * 고정 확인). 2차 키를 붙이면 정렬이 유일해져 페이지 경계가 select 절이나
 * 병렬/순차 여부와 무관하게 항상 같은 행 집합으로 갈린다.
 */
async function fetchReviewRowsUncached(
  basis: Basis,
  start: string,
  end: string,
): Promise<{ rows: ReviewRow[]; lastSyncedAt: string | null }> {
  const { table, dateCol } = SOURCE[basis];
  const select = `${dateCol}, ${PNL_COLS}`;

  const [{ count, error: countError }, lastSyncedAt] = await Promise.all([
    supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .gte(dateCol, start)
      .lte(dateCol, end),
    fetchLastSyncedAt(table),
  ]);

  const rows: ReviewRow[] = [];

  if (!countError && typeof count === "number" && count > 0) {
    const pageCount = Math.ceil(count / WIDE_PAGE);
    const pages = await Promise.all(
      Array.from({ length: pageCount }, (_, i) => {
        const from = i * WIDE_PAGE;
        return supabase
          .from(table)
          .select(select)
          .gte(dateCol, start)
          .lte(dateCol, end)
          .order(dateCol, { ascending: true })
          .order("prop_item_usid", { ascending: true })
          .range(from, from + WIDE_PAGE - 1);
      }),
    );
    for (const { data, error } of pages) {
      if (error) {
        console.error(`[metric-review] ${table} fetch failed:`, error.message);
        continue;
      }
      for (const r of (data ?? []) as unknown as WideRawRow[]) rows.push(toReviewRow(r, dateCol));
    }
  } else {
    if (countError) {
      console.error(`[metric-review] ${table} count fetch failed, falling back to sequential:`, countError.message);
    }
    for (let from = 0; ; from += WIDE_PAGE) {
      const { data, error } = await supabase
        .from(table)
        .select(select)
        .gte(dateCol, start)
        .lte(dateCol, end)
        .order(dateCol, { ascending: true })
        .order("prop_item_usid", { ascending: true })
        .range(from, from + WIDE_PAGE - 1);

      if (error) {
        console.error(`[metric-review] ${table} fetch failed:`, error.message);
        break;
      }
      if (!data?.length) break;

      for (const r of data as unknown as WideRawRow[]) rows.push(toReviewRow(r, dateCol));
      if (data.length < WIDE_PAGE) break;
    }
  }

  return { rows, lastSyncedAt };
}

export async function fetchReviewRows(
  basis: Basis,
  start: string,
  end: string,
): Promise<{ rows: ReviewRow[]; lastSyncedAt: string | null }> {
  const key = `${basis}|${start}|${end}`;
  const cached = reviewRowsCache.get(key);
  if (cached) return cached;
  const result = await fetchReviewRowsUncached(basis, start, end);
  reviewRowsCache.set(key, result);
  return result;
}

type CohortRawRow = {
  quote_date?: string | null;
  order_confirmed_at: string;
  partner_company: string | null;
  sales: number | null;
  prop_item_usid: string | number | null;
};

/**
 * 코호트용 좁은 컬럼 페치 — 본문 창(4개월)보다 긴 6개월치를 최소 컬럼으로 당긴다.
 *
 * 테이블명은 SOURCE[basis].table 로만 정한다 — 리터럴로 박아넣지 않는다(원천
 * 이관 시 SOURCE 한 곳만 바꾸면 되게 하려는 원칙).
 *
 * 두 테이블 모두 "order_confirmed_at" 으로 필터·정렬한다. basis="contract" 여도
 * contract_date 가 아니다 — buildCohort(lib/metric-review.ts)의 주석이 이미
 * "계약완료를 계약일이 아니라 주문일로 묶는다"를 못박아 두었다. 계약 쪽을
 * contract_date 로 걸면 호출부가 두 basis에 같은 6개월 창을 넘기는 전제가 깨져
 * 전환율이 아니라 달력이 된다.
 */
async function fetchCohortRowsUncached(
  basis: Basis,
  start: string,
  end: string,
): Promise<ReviewRow[]> {
  const table = SOURCE[basis].table;
  const dateCol = "order_confirmed_at";
  const select = basis === "order"
    ? "quote_date, order_confirmed_at, partner_company, sales, prop_item_usid"
    : "order_confirmed_at, partner_company, sales, prop_item_usid";

  const rows: ReviewRow[] = [];
  for (let from = 0; ; from += COHORT_PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .gte(dateCol, start)
      .lte(dateCol, end)
      .order(dateCol, { ascending: true })
      .order("prop_item_usid", { ascending: true })
      .range(from, from + COHORT_PAGE - 1);

    if (error) {
      console.error(`[metric-review] ${table} cohort fetch failed:`, error.message);
      break;
    }
    if (!data?.length) break;

    for (const r of data as unknown as CohortRawRow[]) {
      rows.push({
        date: r.order_confirmed_at,
        quote_date: r.quote_date ?? null,
        order_confirmed_at: r.order_confirmed_at,
        category: null,
        brand: null,
        partner_company: r.partner_company ?? null,
        rental_company: null,
        sales: r.sales ?? null,
        prop_item_usid: r.prop_item_usid ?? null,
        contribution_margin: null,
        total_rental_fee: null,
        sales_incentive: null,
        bad_debt: null,
        promotion: null,
        cost_of_goods: null,
        financial_cost: null,
      });
    }
    if (data.length < COHORT_PAGE) break;
  }
  return rows;
}

export async function fetchCohortRows(
  basis: Basis,
  start: string,
  end: string,
): Promise<ReviewRow[]> {
  const key = `${basis}|${start}|${end}`;
  const cached = cohortRowsCache.get(key);
  if (cached) return cached;
  const result = await fetchCohortRowsUncached(basis, start, end);
  cohortRowsCache.set(key, result);
  return result;
}
