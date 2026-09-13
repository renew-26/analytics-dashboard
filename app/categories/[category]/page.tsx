import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { fetchRows } from "@/lib/fetch-rows";
import { BASIS_LABEL, DATE_COL } from "@/lib/date-basis";
import { getPeriod, getDataAsOf } from "@/lib/period";
import {
  CATEGORY_GROUPS,
  catGroupOf,
  categoryGroup,
  detailCatKeys,
  detailCatOf,
  isBizCategory,
  isCategoryGroup,
} from "@/lib/biz-category";
import { buildCategoryCards } from "@/lib/category-cards";
import {
  CARD_DEFS,
  companyLabelOf,
  perDeal,
  type CardContractRow,
} from "@/lib/company-cards";
import { getBM } from "@/lib/company-map";
import { aggregateAxis } from "@/lib/category-aggregate";
import { completionRate, conversionStats, type ConvStats } from "@/lib/conversion";
import { diffMap, sumBy, trimLeadingGap } from "@/lib/decompose";
import { EOK, MAN, fmt, pct, pctAbs, recentYmsOf } from "@/lib/format";
import {
  type Mover,
  type WaterfallMetric,
} from "@/app/components/home/WaterfallPanel";
import { type CategoryMonthPoint } from "@/app/components/CategoryMonthlyChart";
import CategoryDrilldown, {
  type BrandGroup,
  type BrandRest,
  type TrendChart,
} from "./CategoryDrilldown";
import { REST_ANCHOR_ID, brandAnchorId } from "./brand-anchor";
import BMMixBar from "@/app/components/home/BMMixBar";
import CategoryCards, {
  type CardLink,
} from "@/app/components/home/CategoryCards";
import Sparkline from "@/app/components/home/Sparkline";
import { deltaColor as dirColor, manwon } from "@/app/components/home/cardKit";
import Delta from "@/app/components/Delta";

// 형제 페이지 4개(app/category/[category] 등)는 revalidate 를 받았는데 이 파일만
// force-dynamic 그대로라 실수처럼 보일 수 있다 — 의도적이다. 이 페이지도 동적
// 세그먼트(category)라 revalidate 를 달아도 generateStaticParams 없이는 무동작인
// 건 형제들과 같지만, 이 페이지는 추가로 카테고리 전건을 훑는 무거운 조회가 있어
// unstable_cache(트랙 2)로도 못 고친다(항목당 2MB 한도 — 스펙의 B안 절 참고).
// force-dynamic 을 남겨 "캐싱이 안 된다"는 사실을 명시적으로 드러낸다.
export const dynamic = "force-dynamic";

const panel =
  "rounded-[12px] border border-[var(--color-gray-200)] bg-white shadow-[0_1px_2px_rgba(28,35,56,.04),0_2px_8px_rgba(28,35,56,.05)]";
const sectionHead = "text-[15px] font-bold tracking-[-.3px]";

const BM_COLORS: Record<string, string> = {
  BM1: "var(--color-cat-1)",
  BM2: "var(--color-cat-2)",
  BM3: "var(--color-cat-3)",
};

/** ⑤ 브랜드 묶음 하나에 세울 상품 수 (당월 계약완료 상위) */
const BRAND_PRODUCT_LIMIT = 5;

/** ⑤ 표에 세울 브랜드 묶음 수 — 나머지는 "그 외"로 접는다 */
const BRAND_GROUP_LIMIT = 10;

type Row = CardContractRow & {
  product_name: string | null;
  brand: string | null;
};

/**
 * 개별 카테고리 — 카테고리 그룹(6그룹) 하나만 분석하는 상세 대시보드.
 * 현황 → 변화 → 세부 카테고리 → 렌탈사 → 상품 → BM 순으로 원인을 좁힌다.
 */
export default async function CategoryGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ company?: string }>;
}) {
  const key = decodeURIComponent((await params).category);
  const initialCompany = (await searchParams).company;
  // 이 라우트는 3축(가전&상조 등)이었다가 6그룹으로 바뀌었다. 그룹 판정을
  // 먼저 한다 — "정수기"·"인터넷"은 축 이름이자 그룹 이름이라, 축을 먼저
  // 물으면 멀쩡한 그룹 페이지가 인덱스로 튕긴다.
  if (!isCategoryGroup(key)) {
    // 옛 링크·북마크(가전&상조)가 빈 404로 떨어지지 않게 인덱스로 보낸다
    if (isBizCategory(key)) redirect("/categories");
    notFound();
  }
  const group = categoryGroup(key)!;

  const { curr, prev, month, day: dayCut } = getPeriod(await getDataAsOf());
  const recentYms = recentYmsOf(curr.end);

  // 그룹 탭의 건수가 전 그룹을 세야 하므로 그룹 필터 전에 전 카테고리로 받는다
  const rows12 = await fetchRows<Row>({
    select:
      "contract_date, rental_company, category, partner_company, gmv, contribution_margin, sales, product_name, brand",
    start: `${recentYms[0]}-01`,
    end: curr.end,
    orderBy: "prop_item_usid",
  });

  // 주문확정 레인 — 계약완료(rows12)와 별도로 주문확정 기준을 최소 컬럼만 받는다
  type OrderRow = {
    order_confirmed_at: string;
    contract_date: string | null;
    status: string | null;
    rental_company: string | null;
    brand: string | null;
    category: string | null;
  };

  const orderRows = await fetchRows<OrderRow>({
    basis: "order",
    select: "order_confirmed_at, contract_date, status, rental_company, brand, category",
    start: `${recentYms[0]}-01`,
    end: curr.end,
    orderBy: "prop_item_usid",
  });
  const orderGroupRows = orderRows.filter((r) => catGroupOf(r.category) === key);
  const orderCurr = orderGroupRows.filter(
    (r) => r.order_confirmed_at >= curr.start && r.order_confirmed_at <= curr.end,
  );
  const orderPrev = orderGroupRows.filter(
    (r) => r.order_confirmed_at >= prev.start && r.order_confirmed_at <= prev.end,
  );
  const convCurr = conversionStats(orderCurr);
  const convPrev = conversionStats(orderPrev);

  const groupRows = rows12.filter((r) => catGroupOf(r.category) === key);
  const currRows = groupRows.filter(
    (r) => r.contract_date >= curr.start && r.contract_date <= curr.end,
  );
  const prevRows = groupRows.filter(
    (r) => r.contract_date >= prev.start && r.contract_date <= prev.end,
  );

  // 그룹 탭에 이번 달 건수를 붙인다 — 어느 그룹이 큰지 이동 전에 보이게
  const groupCurrCount = new Map<string, number>();
  for (const r of rows12) {
    if (r.contract_date < curr.start || r.contract_date > curr.end) continue;
    const k = catGroupOf(r.category);
    groupCurrCount.set(k, (groupCurrCount.get(k) ?? 0) + 1);
  }

  // ── KPI ────────────────────────────────────────────────
  const cnt = currRows.length;
  const cntPrev = prevRows.length;
  // 계약완료율은 기간 방식 — 분자는 이 구간에 계약완료된 건(cnt), 분모는 순주문확정.
  // conversionStats 는 분모(취소 제외)와 리드타임(avgDays)만 빌려 쓴다.
  const compRate = completionRate(cnt, convCurr.orders);
  const compRatePrev = completionRate(cntPrev, convPrev.orders);
  const sum = (rows: Row[], of: (r: Row) => number) =>
    rows.reduce((s, r) => s + of(r), 0);
  const amt = sum(currRows, (r) => r.gmv ?? 0) / EOK;
  const amtPrev = sum(prevRows, (r) => r.gmv ?? 0) / EOK;
  const sales = sum(currRows, (r) => r.sales ?? 0) / EOK;
  const salesPrev = sum(prevRows, (r) => r.sales ?? 0) / EOK;
  const margin = sum(currRows, (r) => r.contribution_margin ?? 0);
  const marginPrev = sum(prevRows, (r) => r.contribution_margin ?? 0);
  const cpu = perDeal(margin, cnt);
  const cpuPrev = perDeal(marginPrev, cntPrev);

  // KPI 스파크라인 — 매월 1~dayCut일 같은 기간 기준 (진행 중인 달과 공정 비교)
  const cntByYm = new Map<string, number>();
  const amtByYm = new Map<string, number>();
  const salesByYm = new Map<string, number>();
  const mgByYm = new Map<string, number>();
  for (const r of groupRows) {
    if (Number(r.contract_date.slice(8, 10)) > dayCut) continue;
    const ym = r.contract_date.slice(0, 7);
    cntByYm.set(ym, (cntByYm.get(ym) ?? 0) + 1);
    amtByYm.set(ym, (amtByYm.get(ym) ?? 0) + (r.gmv ?? 0));
    salesByYm.set(ym, (salesByYm.get(ym) ?? 0) + (r.sales ?? 0));
    mgByYm.set(ym, (mgByYm.get(ym) ?? 0) + (r.contribution_margin ?? 0));
  }
  const cntSpark = trimLeadingGap(recentYms.map((ym) => cntByYm.get(ym) ?? 0));
  const amtSpark = trimLeadingGap(
    recentYms.map((ym) => (amtByYm.get(ym) ?? 0) / EOK),
  );
  const salesSpark = trimLeadingGap(
    recentYms.map((ym) => (salesByYm.get(ym) ?? 0) / EOK),
  );
  const cpuSpark = trimLeadingGap(
    recentYms.map((ym) => {
      const c = cntByYm.get(ym) ?? 0;
      return c > 0 ? (mgByYm.get(ym) ?? 0) / c : 0;
    }),
  );

  const ordByYm = new Map<string, number>();
  for (const r of orderGroupRows) {
    if (Number(r.order_confirmed_at.slice(8, 10)) > dayCut) continue;
    const ym = r.order_confirmed_at.slice(0, 7);
    ordByYm.set(ym, (ordByYm.get(ym) ?? 0) + 1);
  }
  const ordSpark = trimLeadingGap(recentYms.map((ym) => ordByYm.get(ym) ?? 0));

  // ── 왜 변했나 — 렌탈사(막대) × 렌탈사별 브랜드(기여) 분해 ──
  const catKeyOf = (r: Row) => detailCatOf(group, r.category);
  const COMPANY_LABELS = new Set(CARD_DEFS.map((d) => d.label));
  const coHref = (label: string) =>
    COMPANY_LABELS.has(label)
      ? `/categories/${encodeURIComponent(key)}/${encodeURIComponent(label)}`
      : undefined;

  // ── 축 집계 — 렌탈사(1차) · 렌탈사별 브랜드(2차) ────────
  // 렌탈사별 행 버킷을 한 번만 만들어 돌려 쓴다. 지표 3개 × 렌탈사 N곳마다
  // currRows/prevRows 를 다시 훑으면 큰 그룹(수천 행)에서 곱으로 늘어난다.
  const brandOf = (r: Row) => r.brand?.trim() || "(브랜드 없음)";
  const bucketBy = <T,>(rows: T[], keyOf: (r: T) => string) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const k = keyOf(r);
      const a = m.get(k);
      if (a) a.push(r);
      else m.set(k, [r]);
    }
    return m;
  };
  const NO_ROWS: Row[] = [];
  const currByCo = bucketBy(currRows, companyLabelOf);
  const prevByCo = bucketBy(prevRows, companyLabelOf);
  const orderCurrByCo = bucketBy(orderCurr, companyLabelOf);

  const companies = aggregateAxis(currRows, prevRows, companyLabelOf);
  // 주문은 있는데 당월·전월 모두 계약이 0건인 렌탈사 — ②의 분모에는 들어가는데
  // ④에는 행이 없어 두 섹션이 안 맞는다. 0건 행으로 세워 전환율이 보이게 한다.
  const seenCo = new Set(companies.map((c) => c.label));
  for (const label of orderCurrByCo.keys()) {
    if (seenCo.has(label)) continue;
    companies.push({ label, cnt: 0, cntPrev: 0, amount: 0, sales: 0, margin: 0 });
  }

  // ④의 렌탈사 이름은 ⑤의 브랜드 묶음으로 가는 앵커다. 한 렌탈사가 여러
  // 브랜드를 달고 있으면 당월 계약완료가 가장 많은 브랜드로 보낸다.
  const topBrandByCompany: Record<string, string> = {};
  const convByCompany: Record<string, ConvStats> = {};
  // 렌탈사 상세로 가는 경로 — ④의 이름은 ⑤로 가는 앵커라 상세 링크를 따로 건다
  const coHrefByCompany: Record<string, string> = {};
  for (const co of companies) {
    const href = coHref(co.label);
    if (href) coHrefByCompany[co.label] = href;
    const topBrand = aggregateAxis(
      currByCo.get(co.label) ?? NO_ROWS,
      prevByCo.get(co.label) ?? NO_ROWS,
      brandOf,
    )[0];
    if (topBrand) topBrandByCompany[co.label] = topBrand.label;
    convByCompany[co.label] = conversionStats(
      orderCurrByCo.get(co.label) ?? [],
    );
  }

  // ── 워터폴 축 롤업 — 상위 6 + 기타 (④ 표의 companies는 원본 그대로 둔다) ──
  // 사용자 확정(2026-09-13). companies는 이미 당월 계약건수(cnt) 내림차순이라
  // 앞 6개가 곧 상위 6이다. 접는 건 차트 가독성 문제이지 표에서 숨기는 게
  // 아니므로 ④(companies)는 이 아래에서 건드리지 않는다.
  const TOP_N = 6;
  const topCompanyLabels = new Set(companies.slice(0, TOP_N).map((c) => c.label));
  const rollupRemainder = companies.slice(TOP_N);
  // 남는 게 한 곳뿐이면 접어도 "기타(1곳)"일 뿐이라 그 회사 이름을 그대로 쓴다
  const rollup = rollupRemainder.length >= 2;
  const OTHER_LABEL = "기타";
  const axisBucketOf = (label: string) =>
    !rollup || topCompanyLabels.has(label) ? label : OTHER_LABEL;
  const axisKeyOf = (r: Row) => axisBucketOf(companyLabelOf(r));
  const currByAxis = bucketBy(currRows, axisKeyOf);
  const prevByAxis = bucketBy(prevRows, axisKeyOf);

  const METRIC_DEFS: {
    key: string;
    label: string;
    unit: string;
    decimals: number;
    of: (r: Row) => number;
  }[] = [
    { key: "count", label: "계약완료", unit: "건", decimals: 0, of: () => 1 },
    {
      key: "amount",
      label: "거래액",
      unit: "억",
      decimals: 1,
      of: (r) => (r.gmv ?? 0) / EOK,
    },
    {
      key: "sales",
      label: "매출",
      unit: "만원",
      decimals: 0,
      of: (r) => (r.sales ?? 0) / MAN,
    },
  ];

  // 워터폴 막대는 증가를 먼저(큰 것부터) · 감소를 나중(큰 폭부터) 보여준다 —
  // 사용자 확정(2026-09-13). diffMap 자체는 홈 ②도 쓰므로 건드리지 않고
  // 이 호출부에서만 재정렬한다. movers 리스트는 |값| 내림차순 그대로 둔다 — 별개 관심사.
  const sortIncreasesFirst = (gaps: { key: string; value: number }[]) => {
    const inc = gaps.filter((g) => g.value > 0).sort((a, b) => b.value - a.value);
    const dec = gaps.filter((g) => g.value < 0).sort((a, b) => a.value - b.value);
    return [...inc, ...dec];
  };

  const waterfallMetrics: WaterfallMetric[] = METRIC_DEFS.map((def) => {
    const c = sumBy(currRows, axisKeyOf, def.of);
    const p = sumBy(prevRows, axisKeyOf, def.of);
    const currTotal = sum(currRows, def.of);
    const prevTotal = sum(prevRows, def.of);
    const gaps = diffMap(c, p);
    const barGaps = sortIncreasesFirst(gaps);
    const subMovers: Record<string, Mover[]> = {};
    for (const label of new Set([...c.keys(), ...p.keys()])) {
      subMovers[label] = diffMap(
        sumBy(currByAxis.get(label) ?? NO_ROWS, brandOf, def.of),
        sumBy(prevByAxis.get(label) ?? NO_ROWS, brandOf, def.of),
      ).map((x) => ({ label: x.key, value: x.value }));
    }
    return {
      key: def.key,
      label: def.label,
      unit: def.unit,
      decimals: def.decimals,
      changePct: pctAbs(currTotal, prevTotal),
      items: [
        { label: "전월 동기간", type: "total" as const, value: prevTotal },
        ...barGaps.map((g) => ({
          label: g.key,
          type: "delta" as const,
          value: g.value,
          href: coHref(g.key),
        })),
        { label: "이번 달", type: "total" as const, value: currTotal },
      ],
      movers: gaps.map((x) => ({
        label: x.key,
        value: x.value,
        href: coHref(x.key),
      })),
      subMovers,
    };
  });

  // ── ③ 12개월 추이 — 거래건수·매출 ───────────────────────
  // 워터폴 4번째 탭(건당 공헌이익)을 걷어낸 자리. "왜 변했나"보다 "1년 동안 어떤
  // 모양이었나"가 낫다는 사용자 판단(2026-09-13).
  //
  // ①의 스파크라인은 달마다 1~dayCut 으로 잘라 같은 기간끼리 비교하지만, 여기는
  // 한 해의 모양을 보는 자리라 지난달까지는 달을 통째로 쓴다. 마지막 달만 진행
  // 중이라 낮게 찍히므로 부제에 적고, 마지막 점은 속 빈 원으로 그린다.
  const trendCntByYm = new Map<string, number>();
  const trendSalesByYm = new Map<string, number>();
  for (const r of groupRows) {
    const ym = r.contract_date.slice(0, 7);
    trendCntByYm.set(ym, (trendCntByYm.get(ym) ?? 0) + 1);
    trendSalesByYm.set(ym, (trendSalesByYm.get(ym) ?? 0) + (r.sales ?? 0));
  }
  // 매출은 그룹 크기와 무관하게 만원으로 그린다. 억으로 고정하면 타이어(월
  // 40~60만원)가 열두 달 내내 0.00~0.01 로 접혀 반올림이 모양을 지우고, 그렇다고
  // "1억 넘으면 억"으로 가르면 12개월 최대가 경계에 걸친 그룹(대형가전 1.20억)이
  // 그 달이 창 밖으로 굴러가는 순간 축이 10,000배로 조용히 바뀐다. 만원 하나로
  // 두면 여섯 그룹의 차트가 서로 비교되기도 한다.
  const trendSeries = [
    {
      // 계약완료 — 데이터레이크 정본 용어에 맞춘다(2026-09-13 사용자 확정).
      // DW fact_settle_pnl.contract_complete_ts 를 "계약완료일시"라 부르고 그것이
      // 손익원장 기간 필터의 정본 축이다. 이전에는 홈 월별 차트가 "거래건수"라
      // 불러서 화면 간 일치를 위해 따라갔지만 이제 양쪽 다 계약완료라 그 절충이
      // 필요 없다 — 화면 간·화면 내 일치가 동시에 성립한다.
      key: "계약완료",
      color: "var(--color-cat-1)",
      unit: "건",
      titleUnit: "",
      values: recentYms.map((ym) => trendCntByYm.get(ym) ?? 0),
    },
    {
      // Y축에 단위 라벨이 없으므로 제목에 적는다
      key: "매출",
      color: "var(--color-cat-2)",
      unit: "만원",
      titleUnit: " (만원)",
      values: recentYms.map((ym) =>
        Math.round((trendSalesByYm.get(ym) ?? 0) / MAN),
      ),
    },
  ];
  // 두 차트는 나란히 선다. 계열마다 앞을 잘라내면 같은 가로 위치가 서로 다른
  // 달을 가리켜 "건수는 늘었는데 매출은 줄었다"가 딴 달끼리의 비교가 된다 —
  // 시작 월은 먼저 값이 잡히는 계열 하나로 맞춘다.
  const firstOf = (vals: number[]) => vals.findIndex((v) => v !== 0);
  const trendFirsts = trendSeries
    .map((s) => firstOf(s.values))
    .filter((i) => i >= 0);
  const trendStart = trendFirsts.length > 0 ? Math.min(...trendFirsts) : -1;
  const trendSubtitle = `최근 12개월 · ${month}월은 ${dayCut}일까지 (진행중)`;
  const trendCharts: TrendChart[] =
    trendStart < 0
      ? []
      : trendSeries
          .filter((s) => firstOf(s.values) >= 0)
          .map((s) => {
            const own = firstOf(s.values);
            const vals = s.values.slice(trendStart);
            return {
              title: `${key} 월별 ${s.key}${s.titleUnit}`,
              subtitle: trendSubtitle,
              seriesKey: s.key,
              color: s.color,
              unit: s.unit,
              // 값이 잡히기 전 구간은 null 이다 — 0 으로 그리면 "그때는 0이었다"는
              // 거짓말이 되고(손익은 2026-01부터 채워진다), null 은 선이 끊긴다.
              data: recentYms.slice(trendStart).map(
                (ym, i): CategoryMonthPoint => ({
                  month: `${ym.slice(2, 4)}.${ym.slice(5, 7)}`,
                  [s.key]: i + trendStart < own ? null : vals[i],
                }),
              ),
              // 0 에서 시작하지 않는 축은 밑동을 속인다 — 밑동을 0 으로 못박는다
              yDomain: [0, Math.ceil(Math.max(...vals) * 1.12)] as [
                number,
                number,
              ],
            };
          });

  // ── ⑤ 브랜드별 상품 성과 ────────────────────────────────
  // "SK·쿠쿠 각 렌탈사마다 잘나가는 상품"을 한 화면에서 훑는 표 — ④에서 고른
  // 렌탈사로 좁히지 않고 카테고리 전체를 브랜드로 세운다.
  //
  // 상품 키는 product_name 만 쓴다(2026-09-13 확정). model_name 은 순전히
  // 표시용인데 이 페이지에서 가장 무거운 조회에 컬럼을 하나 더 얹어야 하고,
  // product_name 만으로도 6그룹 전체에서 정규화 충돌이 사실상 0이다.
  type ProdAgg = {
    product: string;
    company: string;
    brand: string;
    cnt: number;
    cntPrev: number;
    sales: number;
    margin: number;
  };
  const prodMap = new Map<string, ProdAgg>();
  const prodOf = (r: Row) => {
    const product = r.product_name?.trim() || "(상품명 없음)";
    const brand = brandOf(r);
    // 구분자는 NUL — 브랜드명·상품명에 절대 들어가지 않는다
    const k = `${brand}\u0000${product}`;
    let a = prodMap.get(k);
    if (!a) {
      a = {
        product,
        // 상품 상세 경로는 렌탈사를 요구한다. 브랜드→렌탈사는 사실상 1:1이라
        // 그 상품을 처음 세운 행(당월이 먼저 돈다)의 렌탈사를 대표로 쓴다.
        company: companyLabelOf(r),
        brand,
        cnt: 0,
        cntPrev: 0,
        sales: 0,
        margin: 0,
      };
      prodMap.set(k, a);
    }
    return a;
  };
  for (const r of currRows) {
    const a = prodOf(r);
    a.cnt += 1;
    a.sales += r.sales ?? 0;
    a.margin += r.contribution_margin ?? 0;
  }
  for (const r of prevRows) prodOf(r).cntPrev += 1;

  const prodHref = (p: ProdAgg) =>
    COMPANY_LABELS.has(p.company) && p.product !== "(상품명 없음)"
      ? `/categories/${encodeURIComponent(key)}/${encodeURIComponent(p.company)}/${encodeURIComponent(p.product)}`
      : undefined;

  const prodByBrand = bucketBy(Array.from(prodMap.values()), (p) => p.brand);
  // 브랜드 묶음은 당월 계약완료 내림차순. 당월 0건이라도 전월에 있었으면 남긴다
  // — "이 브랜드가 통째로 빠졌다"도 이 표가 답해야 할 것 중 하나다.
  const allBrandGroups: BrandGroup[] = aggregateAxis(
    currRows,
    prevRows,
    brandOf,
  ).map((b) => {
    const sold = (prodByBrand.get(b.label) ?? []).filter((p) => p.cnt > 0);
    return {
      label: b.label,
      cnt: b.cnt,
      cntPrev: b.cntPrev,
      sales: b.sales,
      margin: b.margin,
      // 머리줄 합계가 아래 다섯 줄보다 큰 이유를 그 줄에서 바로 대게 한다
      moreProducts: Math.max(0, sold.length - BRAND_PRODUCT_LIMIT),
      products: sold
        .sort((x, y) => y.cnt - x.cnt || y.cntPrev - x.cntPrev)
        .slice(0, BRAND_PRODUCT_LIMIT)
        .map((p) => ({
          product: p.product,
          cnt: p.cnt,
          cntPrev: p.cntPrev,
          sales: p.sales,
          margin: p.margin,
          href: prodHref(p),
        })),
    };
  });
  // 기타 그룹은 브랜드 묶음이 28개(≈5,500px)라 표가 화면이 아니라 두루마리가
  // 된다. 상위 N만 세우고 나머지는 한 줄로 접되, 합계를 실어 열이 카테고리
  // 합계와 그대로 맞게 둔다 — 접는 건 가독성 문제이지 숨기는 게 아니다.
  // 접힐 게 하나뿐이면 "그 외 1개 브랜드"일 뿐이라 그냥 그 브랜드를 세운다
  // (위 워터폴 축 롤업과 같은 판단).
  const rollupBrands = allBrandGroups.length - BRAND_GROUP_LIMIT >= 2;
  const brandGroups = rollupBrands
    ? allBrandGroups.slice(0, BRAND_GROUP_LIMIT)
    : allBrandGroups;
  const restBrandGroups = rollupBrands
    ? allBrandGroups.slice(BRAND_GROUP_LIMIT)
    : [];
  const restTotal = (of: (g: BrandGroup) => number) =>
    restBrandGroups.reduce((s, g) => s + of(g), 0);
  const brandRest: BrandRest | undefined = rollupBrands
    ? {
        brands: restBrandGroups.length,
        cnt: restTotal((g) => g.cnt),
        cntPrev: restTotal((g) => g.cntPrev),
        sales: restTotal((g) => g.sales),
        margin: restTotal((g) => g.margin),
      }
    : undefined;

  // ── 세부 카테고리 카드 ─────────────────────────────────
  // 그룹 안에 세부가 하나뿐이면(정수기·타이어·인터넷) 카드가 KPI의 복사본이라 세우지 않는다
  const categoryCards = buildCategoryCards({
    windowRows: groupRows,
    currRows,
    prevRows,
    recentYms,
    dayCut,
    catKeyOf,
    catKeys: detailCatKeys(group),
  });
  const visibleCatCards = categoryCards.filter(
    (c) => c.count > 0 || c.countPrev > 0,
  );

  // 세부 카테고리 인사이트 — "이번 달 증가분의 X%가 여기서 발생"
  const netDelta = cnt - cntPrev;
  const catCountDiff = diffMap(
    sumBy(currRows, catKeyOf, () => 1),
    sumBy(prevRows, catKeyOf, () => 1),
  );
  const topPosCat = catCountDiff.find((g) => g.value > 0);
  const topNegCat = catCountDiff.find((g) => g.value < 0);

  // ── 브랜드 카드 ────────────────────────────────────────
  // 세부 카테고리 카드와 같은 틀을 브랜드 축으로 한 번 더 돌린다. 세부가
  // 하나뿐인 그룹(정수기·타이어·인터넷)은 위 카드가 아예 안 서므로, 이
  // 화면에서 "누가 움직였나"를 카드로 보는 유일한 자리이기도 하다.
  const brandKeys = allBrandGroups.map((g) => g.label);
  // 태그 자리에는 그 브랜드의 주력 세부 카테고리를 건다. 세부가 하나뿐인
  // 그룹에서는 전부 같은 값이라 정보가 아니므로 태그를 비운다.
  const detailKeys = detailCatKeys(group);
  const topDetailByBrand = new Map<string, string>();
  if (detailKeys.length > 1) {
    for (const [brand, rows] of bucketBy(currRows, brandOf)) {
      const m = new Map<string, number>();
      for (const r of rows) {
        const k = catKeyOf(r);
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      const top = Array.from(m.entries()).sort((a, b) => b[1] - a[1])[0];
      if (top) topDetailByBrand.set(brand, top[0]);
    }
  }
  // 브랜드에는 전용 라우트가 없다(브랜드 분석 화면은 걷어냈다) — ⑤ 표의
  // 그 브랜드 묶음으로 보낸다. 상위 N 밖으로 접힌 브랜드는 그것을 삼킨
  // "그 외" 줄로 보낸다. CategoryDrilldown 의 anchorOf 와 같은 규칙이다.
  const shownBrandLabels = new Set(brandGroups.map((g) => g.label));
  const brandLinkOf = (label: string): CardLink => {
    const shown = shownBrandLabels.has(label);
    return {
      href: `#${shown ? brandAnchorId(label) : REST_ANCHOR_ID}`,
      base: "#brand-",
      query: shown ? label : "rest",
      hint: "상품별 상세",
    };
  };
  const brandCards = buildCategoryCards({
    windowRows: groupRows,
    currRows,
    prevRows,
    recentYms,
    dayCut,
    catKeyOf: brandOf,
    catKeys: brandKeys,
  }).map((c) => ({
    ...c,
    group: topDetailByBrand.get(c.label) ?? "",
    link: brandLinkOf(c.label),
  }));

  const brandCountDiff = diffMap(
    sumBy(currRows, brandOf, () => 1),
    sumBy(prevRows, brandOf, () => 1),
  );
  const topPosBrand = brandCountDiff.find((g) => g.value > 0);
  const topNegBrand = brandCountDiff.find((g) => g.value < 0);

  // ── BM 구성 ────────────────────────────────────────────
  const bmAgg = (rows: Row[]) => {
    const m = {
      BM1: { cnt: 0, amt: 0 },
      BM2: { cnt: 0, amt: 0 },
      BM3: { cnt: 0, amt: 0 },
    };
    for (const r of rows) {
      const b = m[getBM(r.partner_company)];
      b.cnt += 1;
      b.amt += (r.gmv ?? 0) / EOK;
    }
    return m;
  };
  const bmCurr = bmAgg(currRows);
  const bmPrev = bmAgg(prevRows);

  return (
    <div className="min-h-screen space-y-[24px] bg-[var(--color-page)] px-10 pt-8 pb-16">
      {/* 카테고리 그룹 전환 탭 */}
      <nav className="flex flex-wrap gap-[6px]">
        {CATEGORY_GROUPS.map((g) => {
          const on = g.key === key;
          return (
            <Link
              key={g.key}
              href={`/categories/${encodeURIComponent(g.key)}`}
              aria-current={on ? "page" : undefined}
              className={`press flex items-center gap-2 rounded-[8px] border px-4 py-2 text-[13px] font-bold transition-colors ${
                on
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                  : "border-[var(--color-gray-200)] bg-white text-[var(--color-gray-500)] hover:border-[var(--color-gray-400)] hover:text-[var(--color-gray-900)]"
              }`}
            >
              {g.key}
              <span className="num text-[11px] font-semibold opacity-75">
                {fmt(groupCurrCount.get(g.key) ?? 0)}건
              </span>
            </Link>
          );
        })}
      </nav>

      {/* ── ① 이번 달 요약 ──────────────────────────── */}
      <section>
        <h2 className={`mb-[11px] ${sectionHead}`}>
          {month}월 {key} 한눈에 보기
        </h2>
        <div className={`${panel} overflow-hidden`}>
          <dl className="grid grid-cols-2 gap-px bg-[var(--color-line-2)] lg:grid-cols-5">
            {[
              {
                label: "주문확정",
                value: fmt(orderCurr.length),
                unit: "건",
                prev: `${fmt(orderPrev.length)}건`,
                delta: pct(orderCurr.length, orderPrev.length),
                spark: ordSpark,
              },
              {
                label: "계약완료",
                value: fmt(cnt),
                unit: "건",
                prev: `${fmt(cntPrev)}건`,
                delta: pct(cnt, cntPrev),
                spark: cntSpark,
              },
              {
                label: "거래액",
                value: amt.toFixed(1),
                unit: "억",
                prev: `${amtPrev.toFixed(1)}억`,
                delta: pct(amt, amtPrev),
                spark: amtSpark,
              },
              {
                label: "매출",
                value: sales.toFixed(2),
                unit: "억",
                prev: `${salesPrev.toFixed(2)}억`,
                delta: pct(sales, salesPrev),
                spark: salesSpark,
              },
              {
                label: "건당 공헌이익",
                value: manwon(cpu),
                unit: "",
                prev: manwon(cpuPrev),
                delta: pctAbs(cpu, cpuPrev),
                spark: cpuSpark,
              },
            ].map((k, i, arr) => (
              <div
                key={k.label}
                className={`bg-white p-[13px_15px_11px] ${
                  i === arr.length - 1 ? "col-span-2 lg:col-span-1" : ""
                }`}
              >
                <dt className="mb-[5px] text-[11px] font-semibold text-[var(--color-gray-500)]">
                  {k.label}
                </dt>
                <div className="flex items-end justify-between gap-2">
                  <div className="num text-[24px] font-bold leading-[28px] tracking-[-.6px]">
                    {k.value}
                    {k.unit && (
                      <i className="ml-0.5 text-[12px] font-semibold not-italic tracking-normal text-[var(--color-gray-500)]">
                        {k.unit}
                      </i>
                    )}
                  </div>
                  <div className="text-right whitespace-nowrap">
                    <div className="text-[12px] font-bold">
                      <Delta value={k.delta} />
                    </div>
                    <div className="num mt-px text-[10px] text-[var(--color-gray-400)]">
                      전월 {k.prev}
                    </div>
                  </div>
                </div>
                <div className="mt-[6px]">
                  <Sparkline
                    values={k.spark}
                    color={dirColor(
                      k.spark[0] !== 0
                        ? ((k.spark[k.spark.length - 1] - k.spark[0]) /
                            Math.abs(k.spark[0])) *
                            100
                        : 0,
                      1.5,
                    )}
                    width={132}
                    height={26}
                  />
                </div>
              </div>
            ))}
          </dl>
          <div className="border-t border-[var(--color-gray-200)] bg-[var(--color-gray-25)] p-[9px_17px] text-[11px] text-[var(--color-gray-400)]">
            {group.note} · 타일의 선 = 최근 12개월 추이 (매월 1–{dayCut}일 같은
            기간 · 값이 잡히는 달부터)
          </div>
        </div>
      </section>

      {/* ── ② 전환·리드타임 ─────────────────────────── */}
      <section>
        <h2 className={`mb-[11px] ${sectionHead}`}>전환·리드타임</h2>
        <div className={`${panel} overflow-hidden`}>
          <dl className="grid grid-cols-2 gap-px bg-[var(--color-line-2)]">
            {[
              {
                label: "계약완료율",
                value: compRate === null ? "—" : (compRate * 100).toFixed(1),
                unit: compRate === null ? "" : "%",
                sub: `${fmt(cnt)} / ${fmt(convCurr.orders)}건`,
                delta:
                  compRate !== null && compRatePrev !== null
                    ? (compRate - compRatePrev) * 100
                    : null,
                deltaUnit: "%p",
                // 퍼센트포인트의 "미미함"은 기반값에 따라 다르다. 5.3%에서 1.2%p는
                // 큰 움직임이고 45%에서 1.4%p는 노이즈다 — DESIGN.md의 ±1.5%를
                // 상대 기준으로 되돌려 적용한다.
                deltaBand:
                  compRatePrev !== null
                    ? Math.max(0.5, Math.abs(compRatePrev * 100) * 0.015)
                    : undefined,
              },
              {
                label: "리드타임",
                value: convCurr.avgDays === null ? "—" : convCurr.avgDays.toFixed(1),
                unit: convCurr.avgDays === null ? "" : "일",
                sub:
                  convPrev.avgDays === null
                    ? "전월 동기간 —"
                    : `전월 동기간 ${convPrev.avgDays.toFixed(1)}일`,
                delta:
                  convCurr.avgDays !== null && convPrev.avgDays !== null
                    ? pctAbs(convCurr.avgDays, convPrev.avgDays)
                    : null,
                deltaUnit: "%",
                // 일수는 절대량이라 상대%의 기본 데드존(1.5)이 이미 맞는다
                deltaBand: undefined,
              },
            ].map((k) => (
              <div key={k.label} className="bg-white p-[13px_15px_11px]">
                <dt className="mb-[5px] text-[11px] font-semibold text-[var(--color-gray-500)]">
                  {k.label}
                </dt>
                <div className="flex items-end gap-2">
                  <span className="num text-[24px] font-bold leading-[28px] tracking-[-.6px]">
                    {k.value}
                    {k.unit && (
                      <i className="ml-0.5 text-[12px] font-semibold not-italic tracking-normal text-[var(--color-gray-500)]">
                        {k.unit}
                      </i>
                    )}
                  </span>
                  {k.delta !== null && (
                    <Delta value={k.delta} unit={k.deltaUnit} flatBand={k.deltaBand} />
                  )}
                </div>
                <p className="num mt-[4px] text-[11px] text-[var(--color-gray-500)]">
                  {k.sub}
                </p>
              </div>
            ))}
          </dl>
          <p className="border-t border-[var(--color-line-2)] bg-[var(--color-gray-25)] p-[8px_15px] text-[11px] text-[var(--color-gray-500)]">
            리드타임 = 주문확정 → 계약완료 평균 소요일(전환된 건만). 진행 중인 달은
            아직 전환할 시간이 지나지 않은 최근 주문이 분모에 포함돼 전환율이 실제보다
            낮게 나온다 — 전환은 주문확정 후 30일까지 이어진다.
          </p>
        </div>
      </section>

      {/* ── ③④⑤ 왜 변했나 · 추이 · 렌탈사별 · 브랜드별 상품 ── */}
      <CategoryDrilldown
        groupKey={key}
        metrics={waterfallMetrics}
        trendCharts={trendCharts}
        companies={companies}
        coHref={coHrefByCompany}
        topBrandByCompany={topBrandByCompany}
        convByCompany={convByCompany}
        brandGroups={brandGroups}
        brandRest={brandRest}
        productLimit={BRAND_PRODUCT_LIMIT}
        initialCompany={initialCompany}
        panelClass={panel}
        sectionHead={sectionHead}
      />

      {/* ── ③ 세부 카테고리 ─────────────────────────── */}
      {visibleCatCards.length > 1 && (
        <section>
          <div className="mb-[11px] flex flex-wrap items-baseline gap-2.5">
            <h2 className={sectionHead}>세부 카테고리</h2>
            <span className="text-[12px] text-[var(--color-gray-500)]">
              {topPosCat && netDelta > 0 && topPosCat.value > 0 ? (
                <>
                  이번 달 증가분의{" "}
                  <b className="num text-[var(--color-gray-700)]">
                    {Math.min(100, (topPosCat.value / netDelta) * 100).toFixed(
                      0,
                    )}
                    %
                  </b>
                  가{" "}
                  <b className="text-[var(--color-gray-700)]">
                    {topPosCat.key}
                  </b>
                  에서 발생
                </>
              ) : topNegCat && netDelta < 0 ? (
                <>
                  이번 달 감소의 최대 출처는{" "}
                  <b className="text-[var(--color-gray-700)]">
                    {topNegCat.key}
                  </b>{" "}
                  <b
                    className="num"
                    style={{ color: dirColor(topNegCat.value, 0) }}
                  >
                    {fmt(topNegCat.value)}건
                  </b>
                </>
              ) : (
                "전월 동기간과 큰 차이가 없습니다"
              )}
            </span>
          </div>
          <CategoryCards categories={visibleCatCards} groups={[]} />
        </section>
      )}

      {/* ── ⑥ 브랜드 ────────────────────────────────── */}
      {brandCards.length > 1 && (
        <section>
          <div className="mb-[11px] flex flex-wrap items-baseline gap-2.5">
            <h2 className={sectionHead}>브랜드</h2>
            <span className="text-[12px] text-[var(--color-gray-500)]">
              {topPosBrand && netDelta > 0 && topPosBrand.value > 0 ? (
                <>
                  이번 달 증가분의{" "}
                  <b className="num text-[var(--color-gray-700)]">
                    {Math.min(
                      100,
                      (topPosBrand.value / netDelta) * 100,
                    ).toFixed(0)}
                    %
                  </b>
                  가{" "}
                  <b className="text-[var(--color-gray-700)]">
                    {topPosBrand.key}
                  </b>
                  에서 발생
                </>
              ) : topNegBrand && netDelta < 0 ? (
                <>
                  이번 달 감소의 최대 출처는{" "}
                  <b className="text-[var(--color-gray-700)]">
                    {topNegBrand.key}
                  </b>{" "}
                  <b
                    className="num"
                    style={{ color: dirColor(topNegBrand.value, 0) }}
                  >
                    {fmt(topNegBrand.value)}건
                  </b>
                </>
              ) : (
                "전월 동기간과 큰 차이가 없습니다"
              )}
            </span>
          </div>
          <CategoryCards categories={brandCards} groups={[]} />
        </section>
      )}

      {/* ── ⑦ BM 구성 ───────────────────────────────── */}
      <section>
        <div className="mb-[11px] flex flex-wrap items-baseline gap-2.5">
          <h2 className={sectionHead}>BM(판매 채널)별 성과</h2>
          <span className="text-[12px] text-[var(--color-gray-500)]">
            굵은 바 = 이번 달 · 아래 얇은 바 = 전월 동기간 · 100% 기준
          </span>
        </div>
        <div className={panel}>
          <div className="grid grid-cols-1 gap-x-7 px-[17px] pt-[14px] pb-[14px] lg:grid-cols-2">
            <BMMixBar
              title="계약완료"
              unit="건"
              segments={(["BM1", "BM2", "BM3"] as const).map((b) => ({
                key: b,
                color: BM_COLORS[b],
                curr: bmCurr[b].cnt,
                prev: bmPrev[b].cnt,
              }))}
            />
            <BMMixBar
              title="거래액"
              unit="억"
              decimals={1}
              segments={(["BM1", "BM2", "BM3"] as const).map((b) => ({
                key: b,
                color: BM_COLORS[b],
                curr: bmCurr[b].amt,
                prev: bmPrev[b].amt,
              }))}
            />
          </div>
        </div>
      </section>

      <p className="text-[11px] leading-[1.7] text-[var(--color-gray-400)]">
        기준: {BASIS_LABEL.contract}(<code>{DATE_COL.contract}</code>) · 기준 구간은
        홈·헤더와 동일한{" "}
        <code>getPeriod()</code> · 카테고리 매핑은{" "}
        <code>lib/biz-category.ts</code> 하나만 쓴다.
      </p>
    </div>
  );
}
