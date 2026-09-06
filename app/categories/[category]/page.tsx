import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { fetchRows } from "@/lib/fetch-rows";
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
  countInstall90d,
  perDeal,
  type CardContractRow,
} from "@/lib/company-cards";
import { getBM } from "@/lib/company-map";
import { resolveTier, TIER_META } from "@/lib/tiers";
import { cpuContribution, diffMap, sumBy, trimLeadingGap } from "@/lib/decompose";
import { EOK, MAN, fmt, pct, pctAbs, recentYmsOf, signedInt } from "@/lib/format";
import { topic } from "@/lib/korean";
import WaterfallPanel, {
  type WaterfallMetric,
} from "@/app/components/home/WaterfallPanel";
import BMMixBar from "@/app/components/home/BMMixBar";
import CategoryCards from "@/app/components/home/CategoryCards";
import Sparkline from "@/app/components/home/Sparkline";
import { deltaColor as dirColor, manwon } from "@/app/components/home/cardKit";
import Breadcrumb from "@/app/components/Breadcrumb";
import Delta from "@/app/components/Delta";

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

type Row = CardContractRow & { product_name: string | null };

/**
 * 개별 카테고리 — 카테고리 그룹(6그룹) 하나만 분석하는 상세 대시보드.
 * 현황 → 변화 → 세부 카테고리 → 렌탈사 → 상품 → BM 순으로 원인을 좁힌다.
 */
export default async function CategoryGroupPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const key = decodeURIComponent((await params).category);
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

  // 티어는 렌탈사의 "전체 실적" 기준이라 그룹 필터 전에 전 카테고리로 받는다
  const rows12 = await fetchRows<Row>({
    select:
      "contract_date, rental_company, category, partner_company, total_rental_fee, contribution_margin, sales, product_name",
    start: `${recentYms[0]}-01`,
    end: curr.end,
    orderBy: "prop_item_usid",
  });
  const install90 = countInstall90d(rows12, curr.end);

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

  // ── 왜 변했나 — 세부 카테고리(막대) × 렌탈사(기여) 분해 ──
  const catKeyOf = (r: Row) => detailCatOf(group, r.category);
  const COMPANY_LABELS = new Set(CARD_DEFS.map((d) => d.label));
  const coHref = (label: string) =>
    COMPANY_LABELS.has(label)
      ? `/categories/${encodeURIComponent(key)}/${encodeURIComponent(label)}`
      : undefined;
  const catHref = (label: string) =>
    label === "그 외" ? undefined : `/category/${encodeURIComponent(label)}`;

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
    const c = sumBy(currRows, catKeyOf, def.of);
    const p = sumBy(prevRows, catKeyOf, def.of);
    const currTotal = sum(currRows, def.of);
    const prevTotal = sum(prevRows, def.of);
    return {
      key: def.key,
      label: def.label,
      unit: def.unit,
      decimals: def.decimals,
      changePct: pctAbs(currTotal, prevTotal),
      items: [
        { label: "전월 동기간", type: "total" as const, value: prevTotal },
        ...diffMap(c, p).map((g) => ({
          label: g.key,
          type: "delta" as const,
          value: g.value,
          href: catHref(g.key),
        })),
        { label: "이번 달", type: "total" as const, value: currTotal },
      ],
      movers: diffMap(
        sumBy(currRows, companyLabelOf, def.of),
        sumBy(prevRows, companyLabelOf, def.of),
      ).map((x) => ({ label: x.key, value: x.value, href: coHref(x.key) })),
    };
  });
  waterfallMetrics.push({
    key: "cpu",
    label: "건당 공헌이익",
    unit: "원",
    decimals: 0,
    changePct: pctAbs(cpu, cpuPrev),
    items: [
      { label: "전월 동기간", type: "total" as const, value: cpuPrev },
      ...cpuContribution(
        currRows,
        prevRows,
        catKeyOf,
        (r) => r.contribution_margin ?? 0,
      ).map((g) => ({
        label: g.key,
        type: "delta" as const,
        value: g.value,
        href: catHref(g.key),
      })),
      { label: "이번 달", type: "total" as const, value: cpu },
    ],
    movers: cpuContribution(
      currRows,
      prevRows,
      companyLabelOf,
      (r) => r.contribution_margin ?? 0,
    ).map((x) => ({ label: x.key, value: x.value, href: coHref(x.key) })),
  });

  // ── 렌탈사별 성과 ──────────────────────────────────────
  type CoAgg = {
    label: string;
    cnt: number;
    cntPrev: number;
    amount: number;
    sales: number;
    margin: number;
  };
  const coMap = new Map<string, CoAgg>();
  const coOf = (label: string) => {
    let a = coMap.get(label);
    if (!a) {
      a = { label, cnt: 0, cntPrev: 0, amount: 0, sales: 0, margin: 0 };
      coMap.set(label, a);
    }
    return a;
  };
  for (const r of currRows) {
    const a = coOf(companyLabelOf(r));
    a.cnt += 1;
    a.amount += r.total_rental_fee ?? 0;
    a.sales += r.sales ?? 0;
    a.margin += r.contribution_margin ?? 0;
  }
  for (const r of prevRows) coOf(companyLabelOf(r)).cntPrev += 1;
  const companies = Array.from(coMap.values())
    .filter((a) => a.cnt > 0 || a.cntPrev > 0)
    .sort((a, b) => b.cnt - a.cnt || b.cntPrev - a.cntPrev);

  // ── 상품·모델별 성과 ───────────────────────────────────
  // "이 카테고리가 움직였는데 정확히 어떤 상품이 움직였나"에 답한다.
  type ProdAgg = {
    product: string;
    company: string;
    cnt: number;
    cntPrev: number;
    amount: number;
    sales: number;
    margin: number;
  };
  const prodMap = new Map<string, ProdAgg>();
  const prodOf = (r: Row) => {
    const product = r.product_name?.trim() || "(상품명 없음)";
    const company = companyLabelOf(r);
    const k = `${company} ${product}`;
    let a = prodMap.get(k);
    if (!a) {
      a = {
        product,
        company,
        cnt: 0,
        cntPrev: 0,
        amount: 0,
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
    a.amount += r.total_rental_fee ?? 0;
    a.sales += r.sales ?? 0;
    a.margin += r.contribution_margin ?? 0;
  }
  for (const r of prevRows) prodOf(r).cntPrev += 1;
  const prodAll = Array.from(prodMap.values());
  const prodUp = prodAll
    .filter((p) => p.cnt - p.cntPrev > 0)
    .sort((a, b) => b.cnt - b.cntPrev - (a.cnt - a.cntPrev))
    .slice(0, PRODUCT_LIMIT);
  const prodDown = prodAll
    .filter((p) => p.cnt - p.cntPrev < 0)
    .sort((a, b) => a.cnt - a.cntPrev - (b.cnt - b.cntPrev))
    .slice(0, PRODUCT_LIMIT);
  const prodHref = (p: ProdAgg) =>
    COMPANY_LABELS.has(p.company) && p.product !== "(상품명 없음)"
      ? `/categories/${encodeURIComponent(key)}/${encodeURIComponent(p.company)}/${encodeURIComponent(p.product)}`
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

  const th =
    "bg-[var(--color-gray-25)] p-[9px_12px] text-right text-[11px] font-bold whitespace-nowrap text-[var(--color-gray-400)]";
  const td = "p-[9px_12px] text-right whitespace-nowrap";

  return (
    <div className="min-h-screen space-y-[24px] bg-[var(--color-page)] px-10 pt-8 pb-16">
      <Breadcrumb
        items={[{ label: "카테고리", href: "/categories" }, { label: key }]}
      />

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
          <dl className="grid grid-cols-2 gap-px bg-[var(--color-line-2)] lg:grid-cols-4">
            {[
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
            ].map((k) => (
              <div key={k.label} className="bg-white p-[13px_15px_11px]">
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

      {/* ── ② 왜 변했나 ─────────────────────────────── */}
      <section>
        <div className="mb-[11px] flex flex-wrap items-baseline gap-2.5">
          <h2 className={sectionHead}>이번 달 {topic(key)} 왜 변했나</h2>
          <span className="text-[12px] text-[var(--color-gray-500)]">
            전체 변화 → 세부 카테고리 → 렌탈사 순으로 내려간다 · 렌탈사 클릭 시{" "}
            {key} × 렌탈사 상세
          </span>
        </div>
        <WaterfallPanel metrics={waterfallMetrics} panelClass={panel} />
      </section>

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

      {/* ── ④ 렌탈사별 성과 ─────────────────────────── */}
      <section>
        <div className="mb-[11px] flex flex-wrap items-baseline gap-2.5">
          <h2 className={sectionHead}>렌탈사별 성과</h2>
          <span className="text-[12px] text-[var(--color-gray-500)]">
            {key} 안에서의 실적만 집계 · 행 클릭 시 {key} × 렌탈사 상세
          </span>
        </div>
        <div className={panel}>
          <div className="px-[17px] pt-[16px] pb-[16px]">
            <div className="overflow-x-auto rounded-[8px] border border-[var(--color-gray-200)]">
              <table className="w-full min-w-[860px] bg-white text-[12px]">
                <thead>
                  <tr className="border-b border-[var(--color-gray-200)]">
                    <th className={`${th} text-left`}>렌탈사</th>
                    <th className={`${th} text-left`}>티어</th>
                    <th className={th}>계약건수</th>
                    <th className={th}>전월 동기간</th>
                    <th className={th}>증감</th>
                    <th className={th}>점유율</th>
                    <th className={th}>거래액</th>
                    <th className={th}>매출</th>
                    <th className={th}>건당 공헌이익</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((c) => {
                    const diff = c.cnt - c.cntPrev;
                    const share = cnt > 0 ? (c.cnt / cnt) * 100 : 0;
                    const mapped = COMPANY_LABELS.has(c.label);
                    const tier = mapped
                      ? resolveTier(c.label, install90.get(c.label) ?? 0).tier
                      : null;
                    const href = coHref(c.label);
                    const name = href ? (
                      <Link
                        href={href}
                        className="font-bold text-[var(--color-gray-600)] group-hover:text-[var(--color-primary)]"
                      >
                        {c.label}
                      </Link>
                    ) : (
                      <span className="font-bold text-[var(--color-gray-600)]">
                        {c.label}
                      </span>
                    );
                    return (
                      <tr
                        key={c.label}
                        className="group border-t border-[var(--color-line-2)] hover:bg-[var(--color-primary-50)]"
                      >
                        <td className={`${td} text-left`}>{name}</td>
                        <td className={`${td} text-left`}>
                          {tier ? (
                            <span
                              className="rounded-[4px] px-[5px] py-0.5 text-[10px] font-bold"
                              style={TIER_META[tier].chip}
                              title={TIER_META[tier].desc}
                            >
                              {tier}
                            </span>
                          ) : (
                            <span className="text-[var(--color-gray-400)]">
                              —
                            </span>
                          )}
                        </td>
                        <td className={`${td} num font-bold`}>{fmt(c.cnt)}</td>
                        <td className={`${td} num text-[var(--color-gray-500)]`}>
                          {fmt(c.cntPrev)}
                        </td>
                        <td
                          className={`${td} num font-bold`}
                          style={{ color: dirColor(diff, 0) }}
                        >
                          {signedInt(diff)}
                        </td>
                        <td className={`${td} num`}>{share.toFixed(1)}%</td>
                        <td className={`${td} num`}>
                          {(c.amount / EOK).toFixed(1)}억
                        </td>
                        <td className={`${td} num`}>
                          {(c.sales / EOK).toFixed(2)}억
                        </td>
                        <td className={`${td} num`}>
                          {manwon(perDeal(c.margin, c.cnt))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-[10px] text-[11px] text-[var(--color-gray-500)]">
              티어는 렌탈사의 전체 실적 기준(문서 스냅샷 우선, 미명시는 직전
              90일 설치량 폴백) · 점유율은 {key} 계약건수 기준입니다.
            </p>
          </div>
        </div>
      </section>

      {/* ── ⑤ 상품·모델별 성과 ──────────────────────── */}
      <section>
        <div className="mb-[11px] flex flex-wrap items-baseline gap-2.5">
          <h2 className={sectionHead}>상품·모델별 성과</h2>
          <span className="text-[12px] text-[var(--color-gray-500)]">
            {key}가 움직인 이유를 상품 단위까지 좁힌다 · 행 클릭 시 상품 상세
          </span>
        </div>
        <div className="grid grid-cols-1 gap-[18px] xl:grid-cols-2">
          {[
            { title: `증가 TOP ${PRODUCT_LIMIT}`, rows: prodUp, up: true },
            { title: `감소 TOP ${PRODUCT_LIMIT}`, rows: prodDown, up: false },
          ].map((blk) => (
            <div key={blk.title} className={panel}>
              <div className="border-b border-[var(--color-gray-200)] p-[14px_17px_11px]">
                <h3 className="text-[14px] font-semibold tracking-[-.2px]">
                  {blk.title}
                </h3>
              </div>
              <div className="px-[17px] pt-[13px] pb-[15px]">
                {blk.rows.length === 0 ? (
                  <p className="py-6 text-center text-[12px] text-[var(--color-gray-400)]">
                    해당하는 상품이 없습니다
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-[8px] border border-[var(--color-gray-200)]">
                    <table className="w-full min-w-[600px] bg-white text-[12px]">
                      <thead>
                        <tr className="border-b border-[var(--color-gray-200)]">
                          <th className={`${th} text-left`}>상품</th>
                          <th className={`${th} text-left`}>렌탈사</th>
                          <th className={th}>건수</th>
                          <th className={th}>전월</th>
                          <th className={th}>증감</th>
                          <th className={th}>거래액</th>
                          <th className={th}>매출</th>
                          <th className={th}>건당 공헌이익</th>
                        </tr>
                      </thead>
                      <tbody>
                        {blk.rows.map((p) => {
                          const diff = p.cnt - p.cntPrev;
                          const href = prodHref(p);
                          return (
                            <tr
                              key={`${p.company}-${p.product}`}
                              className="group border-t border-[var(--color-line-2)] hover:bg-[var(--color-primary-50)]"
                            >
                              <td
                                className={`${td} max-w-[220px] truncate text-left`}
                              >
                                {href ? (
                                  <Link
                                    href={href}
                                    className="font-bold text-[var(--color-gray-600)] group-hover:text-[var(--color-primary)]"
                                    title={p.product}
                                  >
                                    {p.product}
                                  </Link>
                                ) : (
                                  <span
                                    className="font-bold text-[var(--color-gray-600)]"
                                    title={p.product}
                                  >
                                    {p.product}
                                  </span>
                                )}
                              </td>
                              <td
                                className={`${td} text-left text-[var(--color-gray-500)]`}
                              >
                                {p.company}
                              </td>
                              <td className={`${td} num font-bold`}>
                                {fmt(p.cnt)}
                              </td>
                              <td
                                className={`${td} num text-[var(--color-gray-500)]`}
                              >
                                {fmt(p.cntPrev)}
                              </td>
                              <td
                                className={`${td} num font-bold`}
                                style={{ color: dirColor(diff, 0) }}
                              >
                                {signedInt(diff)}
                              </td>
                              <td className={`${td} num`}>
                                {(p.amount / MAN).toFixed(0)}만
                              </td>
                              <td className={`${td} num`}>
                                {(p.sales / MAN).toFixed(0)}만
                              </td>
                              <td className={`${td} num`}>
                                {manwon(perDeal(p.margin, p.cnt))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

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
        출처: <code>raw_contracts</code>(계약완료) · 기준 구간은 홈·헤더와 동일한{" "}
        <code>getPeriod()</code> · 카테고리 매핑은{" "}
        <code>lib/biz-category.ts</code> 하나만 쓴다.
      </p>
    </div>
  );
}
