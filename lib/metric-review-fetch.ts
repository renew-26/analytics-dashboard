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

const PNL_COLS =
  "category, brand, partner_company, rental_company, synced_at, " +
  "total_rental_fee, sales, sales_incentive, bad_debt, promotion, cost_of_goods, financial_cost, contribution_margin";

type WideRawRow = {
  order_confirmed_at?: string | null;
  contract_date?: string | null;
  quote_date?: string | null;
  category: string | null;
  brand: string | null;
  partner_company: string | null;
  rental_company: string | null;
  synced_at: string | null;
  total_rental_fee: number | null;
  sales: number | null;
  sales_incentive: number | null;
  bad_debt: number | null;
  promotion: number | null;
  cost_of_goods: number | null;
  financial_cost: number | null;
  contribution_margin: number | null;
};

/**
 * basis 기준 창(본문 4개월)을 손익 컬럼까지 전부 당긴다.
 *
 * quote_date 는 basis="order" 일 때만 셀렉트한다. app/revenue-analysis/page.tsx
 * 의 기존 와이드 쿼리와 코호트 쿼리(CohortContractRow = Omit<CohortOrderRow,
 * "quote_date">) 둘 다 raw_contracts 에서는 quote_date 를 셀렉트하지 않는다 —
 * 실측으로 검증된 그 패턴을 따른다. 없는 컬럼을 셀렉트하면 계약 기준 조회 전체가
 * 에러로 죽는데, 그건 "행이 줄어드는 것"이 아니라 "완전히 빈 화면"이라 이 파일의
 * 요구사항(죽지 않는다)을 어긴다.
 */
export async function fetchReviewRows(
  basis: Basis,
  start: string,
  end: string,
): Promise<{ rows: ReviewRow[]; lastSyncedAt: string | null }> {
  const { table, dateCol } = SOURCE[basis];
  const extraDateCol = dateCol === "order_confirmed_at" ? "" : "order_confirmed_at, ";
  const quoteCol = basis === "order" ? "quote_date, " : "";
  const select = `${dateCol}, ${extraDateCol}${quoteCol}${PNL_COLS}`;

  const rows: ReviewRow[] = [];
  let lastSyncedAt: string | null = null;

  for (let from = 0; ; from += WIDE_PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .gte(dateCol, start)
      .lte(dateCol, end)
      .order(dateCol, { ascending: true })
      .range(from, from + WIDE_PAGE - 1);

    if (error) {
      console.error(`[metric-review] ${table} fetch failed:`, error.message);
      break;
    }
    if (!data?.length) break;

    for (const r of data as unknown as WideRawRow[]) {
      const date = (dateCol === "order_confirmed_at" ? r.order_confirmed_at : r.contract_date) ?? "";
      if (r.synced_at && (!lastSyncedAt || r.synced_at > lastSyncedAt)) lastSyncedAt = r.synced_at;
      rows.push({
        date,
        quote_date: r.quote_date ?? null,
        order_confirmed_at: r.order_confirmed_at ?? null,
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
      });
    }
    if (data.length < WIDE_PAGE) break;
  }

  return { rows, lastSyncedAt };
}

type CohortRawRow = {
  quote_date?: string | null;
  order_confirmed_at: string;
  sales: number | null;
};

/**
 * 코호트용 좁은 컬럼 페치 — 본문 창(4개월)보다 긴 6개월치를 최소 컬럼으로 당긴다.
 *
 * 두 테이블 모두 "order_confirmed_at" 으로 필터·정렬한다. raw_contracts 도
 * contract_date 가 아니다 — buildCohort(lib/metric-review.ts)의 주석과
 * pv.cohort(lib/metric-provenance.ts)의 source 문자열
 * (`${SOURCE.contract.table}.order_confirmed_at`, contract_date 가 아님)이
 * 이미 "계약완료를 계약일이 아니라 주문일로 묶는다"를 못박아 두었다. 계약 쪽을
 * contract_date 로 걸면 호출부(Task 10)가 두 테이블에 같은 6개월 창을 넘기는
 * 전제가 깨져 전환율이 아니라 달력이 된다.
 */
export async function fetchCohortRows(
  table: "raw_orders" | "raw_contracts",
  start: string,
  end: string,
): Promise<ReviewRow[]> {
  const dateCol = "order_confirmed_at";
  const select = table === "raw_orders" ? "quote_date, order_confirmed_at, sales" : "order_confirmed_at, sales";

  const rows: ReviewRow[] = [];
  for (let from = 0; ; from += COHORT_PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .gte(dateCol, start)
      .lte(dateCol, end)
      .order(dateCol, { ascending: true })
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
        partner_company: null,
        rental_company: null,
        sales: r.sales ?? null,
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
