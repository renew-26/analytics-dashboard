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
import { aggregateAxis, type AxisAgg } from "@/lib/category-aggregate";
import { conversionStats, type ConvStats } from "@/lib/conversion";
import { cpuContribution, diffMap, sumBy, trimLeadingGap } from "@/lib/decompose";
import { EOK, MAN, fmt, pct, pctAbs, recentYmsOf } from "@/lib/format";
import {
  type Mover,
  type WaterfallMetric,
} from "@/app/components/home/WaterfallPanel";
import CategoryDrilldown, { type ProductDelta } from "./CategoryDrilldown";
import BMMixBar from "@/app/components/home/BMMixBar";
import CategoryCards from "@/app/components/home/CategoryCards";
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

/** 상품·모델 표에 세울 증가·감소 상품 수 */
const PRODUCT_LIMIT = 10;

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
      "contract_date, rental_company, category, partner_company, total_rental_fee, contribution_margin, sales, product_name, brand",
    start: `${recentYms[0]}-01`,
    end: curr.end,
    orderBy: "prop_item_usid",
  });

  // 주문확정 레인 — 계약완료(rows12)와 별도로 주문확정 기준을 최소 컬럼만 받는다
  type OrderRow = {
    order_confirmed_at: string;
    contract_date: string | null;
    rental_company: string | null;
    brand: string | null;
    category: string | null;
  };

  const orderRows = await fetchRows<OrderRow>({
    basis: "order",
    select: "order_confirmed_at, contract_date, rental_company, brand, category",
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
  const sum = (rows: Row[], of: (r: Row) => number) =>
    rows.reduce((s, r) => s + of(r), 0);
  const amt = sum(currRows, (r) => r.total_rental_fee ?? 0) / EOK;
  const amtPrev = sum(prevRows, (r) => r.total_rental_fee ?? 0) / EOK;
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
    amtByYm.set(ym, (amtByYm.get(ym) ?? 0) + (r.total_rental_fee ?? 0));
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
  const catHref = (label: string) =>
    label === "그 외" ? undefined : `/category/${encodeURIComponent(label)}`;

  // ── 축 집계 — 렌탈사(1차) · 렌탈사별 브랜드(2차) ────────
  // 렌탈사별 행 버킷을 한 번만 만들어 돌려 쓴다. 지표 4개 × 렌탈사 N곳마다
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

  const brandByCompany: Record<string, AxisAgg[]> = {};
  const convByCompany: Record<string, ConvStats> = {};
  for (const co of companies) {
    brandByCompany[co.label] = aggregateAxis(
      currByCo.get(co.label) ?? NO_ROWS,
      prevByCo.get(co.label) ?? NO_ROWS,
      brandOf,
    );
    convByCompany[co.label] = conversionStats(
      orderCurrByCo.get(co.label) ?? [],
    );
  }

  const METRIC_DEFS: {
    key: string;
    label: string;
    unit: string;
    decimals: number;
    of: (r: Row) => number;
  }[] = [
    { key: "count", label: "계약건수", unit: "건", decimals: 0, of: () => 1 },
    {
      key: "amount",
      label: "거래액",
      unit: "억",
      decimals: 1,
      of: (r) => (r.total_rental_fee ?? 0) / EOK,
    },
    {
      key: "sales",
      label: "매출",
      unit: "만원",
      decimals: 0,
      of: (r) => (r.sales ?? 0) / MAN,
    },
  ];

  const waterfallMetrics: WaterfallMetric[] = METRIC_DEFS.map((def) => {
    const c = sumBy(currRows, companyLabelOf, def.of);
    const p = sumBy(prevRows, companyLabelOf, def.of);
    const currTotal = sum(currRows, def.of);
    const prevTotal = sum(prevRows, def.of);
    const gaps = diffMap(c, p);
    const subMovers: Record<string, Mover[]> = {};
    for (const co of companies) {
      subMovers[co.label] = diffMap(
        sumBy(currByCo.get(co.label) ?? NO_ROWS, brandOf, def.of),
        sumBy(prevByCo.get(co.label) ?? NO_ROWS, brandOf, def.of),
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
        ...gaps.map((g) => ({
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

  // 건당 공헌이익만 diffMap 이 아니라 cpuContribution 을 쓴다 — 건당은 비율이라
  // 축별 값을 그냥 더해도 전체 건당이 안 나온다. 가법 분해라야 워터폴이 닫힌다.
  const marginOf = (r: Row) => r.contribution_margin ?? 0;
  const cpuGaps = cpuContribution(currRows, prevRows, companyLabelOf, marginOf);
  const cpuSubMovers: Record<string, Mover[]> = {};
  for (const co of companies) {
    cpuSubMovers[co.label] = cpuContribution(
      currByCo.get(co.label) ?? NO_ROWS,
      prevByCo.get(co.label) ?? NO_ROWS,
      brandOf,
      marginOf,
    ).map((x) => ({ label: x.key, value: x.value }));
  }
  waterfallMetrics.push({
    key: "cpu",
    label: "건당 공헌이익",
    unit: "원",
    decimals: 0,
    changePct: pctAbs(cpu, cpuPrev),
    items: [
      { label: "전월 동기간", type: "total" as const, value: cpuPrev },
      ...cpuGaps.map((g) => ({
        label: g.key,
        type: "delta" as const,
        value: g.value,
        href: coHref(g.key),
      })),
      { label: "이번 달", type: "total" as const, value: cpu },
    ],
    movers: cpuGaps.map((x) => ({
      label: x.key,
      value: x.value,
      href: coHref(x.key),
    })),
    subMovers: cpuSubMovers,
  });

  // ── 상품 증감 ──────────────────────────────────────────
  // "이 카테고리가 움직였는데 정확히 어떤 상품이 움직였나"에 답한다.
  type ProdAgg = {
    product: string;
    company: string;
    brand: string;
    cnt: number;
    cntPrev: number;
  };
  const prodMap = new Map<string, ProdAgg>();
  const prodOf = (r: Row) => {
    const product = r.product_name?.trim() || "(상품명 없음)";
    const company = companyLabelOf(r);
    // 키에 리터럴 NUL 바이트(\0)를 구분자로 쓴다 — BSD grep(macOS 기본)은
    // NUL이 섞인 파일을 바이너리로 보고 통째로 건너뛴다. 이 파일을 grep할 땐 -a를 쓸 것.
    const k = `${company} ${product}`;
    let a = prodMap.get(k);
    if (!a) {
      a = { product, company, brand: brandOf(r), cnt: 0, cntPrev: 0 };
      prodMap.set(k, a);
    }
    return a;
  };
  for (const r of currRows) prodOf(r).cnt += 1;
  for (const r of prevRows) prodOf(r).cntPrev += 1;
  const prodAll = Array.from(prodMap.values());
  const prodHref = (p: ProdAgg) =>
    COMPANY_LABELS.has(p.company) && p.product !== "(상품명 없음)"
      ? `/categories/${encodeURIComponent(key)}/${encodeURIComponent(p.company)}/${encodeURIComponent(p.product)}`
      : undefined;
  const withHref = (list: ProdAgg[]): ProductDelta[] =>
    list.map((p) => ({ ...p, href: prodHref(p) }));
  const prodUp = withHref(
    prodAll
      .filter((p) => p.cnt - p.cntPrev > 0)
      .sort((a, b) => b.cnt - b.cntPrev - (a.cnt - a.cntPrev))
      .slice(0, PRODUCT_LIMIT),
  );
  const prodDown = withHref(
    prodAll
      .filter((p) => p.cnt - p.cntPrev < 0)
      .sort((a, b) => a.cnt - a.cntPrev - (b.cnt - b.cntPrev))
      .slice(0, PRODUCT_LIMIT),
  );

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
      b.amt += (r.total_rental_fee ?? 0) / EOK;
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
                label: "계약건수",
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
                label: "주문 → 계약완료 전환율",
                value: convCurr.rate === null ? "—" : (convCurr.rate * 100).toFixed(1),
                unit: convCurr.rate === null ? "" : "%",
                sub: `${fmt(convCurr.converted)} / ${fmt(convCurr.orders)}건`,
                delta:
                  convCurr.rate !== null && convPrev.rate !== null
                    ? (convCurr.rate - convPrev.rate) * 100
                    : null,
                deltaUnit: "%p",
                // 퍼센트포인트의 "미미함"은 기반값에 따라 다르다. 5.3%에서 1.2%p는
                // 큰 움직임이고 45%에서 1.4%p는 노이즈다 — DESIGN.md의 ±1.5%를
                // 상대 기준으로 되돌려 적용한다.
                deltaBand:
                  convPrev.rate !== null
                    ? Math.max(0.5, Math.abs(convPrev.rate * 100) * 0.015)
                    : undefined,
              },
              {
                label: "주문 → 계약완료 평균 소요",
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
            진행 중인 달은 아직 전환할 시간이 지나지 않은 최근 주문이 분모에 포함돼 값이
            실제보다 낮게 나온다. 전환은 주문확정 후 30일까지 이어진다.
          </p>
        </div>
      </section>

      {/* ── ③④⑤ 왜 변했나 · 렌탈사별 · 브랜드별 (렌탈사 선택 공유) ── */}
      <CategoryDrilldown
        groupKey={key}
        metrics={waterfallMetrics}
        companies={companies}
        brandByCompany={brandByCompany}
        convByCompany={convByCompany}
        prodUp={prodUp}
        prodDown={prodDown}
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

      {/* ── ⑥ BM 구성 ───────────────────────────────── */}
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
              title="거래건수"
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
