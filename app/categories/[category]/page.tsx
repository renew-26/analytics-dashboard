import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchRows } from "@/lib/fetch-rows";
import { getPeriod, getDataAsOf } from "@/lib/period";
import {
  BIZ_CATEGORIES,
  BIZ_CATEGORY_KEYS,
  bizCategoryOf,
  catGroupOf,
  groupsOfAxis,
  isBizCategory,
} from "@/lib/biz-category";
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
import WaterfallPanel, {
  type WaterfallMetric,
} from "@/app/components/home/WaterfallPanel";
import BMMixBar from "@/app/components/home/BMMixBar";
import CategoryCards, {
  type CategoryCard,
} from "@/app/components/home/CategoryCards";
import Sparkline from "@/app/components/home/Sparkline";
import { deltaColor as dirColor, manwon } from "@/app/components/home/cardKit";

export const dynamic = "force-dynamic";

const EOK = 100_000_000;
const MAN = 10_000;

const fmt = (n: number) => Math.round(n).toLocaleString("ko-KR");

function pct(curr: number, prev: number) {
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}
/** 기준값이 음수일 수 있는 지표(공헌이익)의 증감률 */
function pctAbs(curr: number, prev: number) {
  if (prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function Delta({ value, unit = "%" }: { value: number | null; unit?: string }) {
  if (value === null || !Number.isFinite(value))
    return <span className="text-[var(--color-gray-400)]">—</span>;
  const arrow = value > 1.5 ? "▲" : value < -1.5 ? "▼" : "—";
  return (
    <span className="num" style={{ color: dirColor(value) }}>
      {arrow} {Math.abs(value).toFixed(1)}
      {unit}
    </span>
  );
}

const panel =
  "rounded-[12px] border border-[var(--color-gray-200)] bg-white shadow-[0_1px_2px_rgba(28,35,56,.04),0_2px_8px_rgba(28,35,56,.05)]";
const sectionHead = "text-[15px] font-bold tracking-[-.3px]";

const BM_COLORS: Record<string, string> = {
  BM1: "var(--color-cat-1)",
  BM2: "var(--color-cat-2)",
  BM3: "var(--color-cat-3)",
};

/**
 * 상위 카테고리 페이지 — "어떤 상품군에서 변화가 발생했나?"
 * 전체 변화 → 세부 카테고리 → 렌탈사 순으로 원인을 추적한다.
 */
export default async function BizCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const key = decodeURIComponent((await params).category);
  if (!isBizCategory(key)) notFound();
  const axis = BIZ_CATEGORIES.find((b) => b.key === key)!;

  const { curr, prev, month, day: dayCut } = getPeriod(await getDataAsOf());

  // 최근 12개월 창 — KPI 스파크라인·세부 카테고리 카드 페이스·티어(90일)까지 겸한다
  const currYm = curr.end.slice(0, 7);
  const recentYms: string[] = [];
  {
    const [y, mo] = currYm.split("-").map(Number);
    for (let i = 11; i >= 0; i--) {
      const d = new Date(y, mo - 1 - i, 1);
      recentYms.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      );
    }
  }

  // 티어는 렌탈사의 "전체 실적" 기준이라 축 필터 전에 전 카테고리로 받는다
  const rows12 = await fetchRows<CardContractRow>({
    select:
      "contract_date, rental_company, category, partner_company, total_rental_fee, contribution_margin, sales",
    start: `${recentYms[0]}-01`,
    end: curr.end,
    orderBy: "prop_item_usid",
  });
  const install90 = countInstall90d(rows12, curr.end);

  const axisRows = rows12.filter((r) => bizCategoryOf(r.category) === key);
  const currRows = axisRows.filter(
    (r) => r.contract_date >= curr.start && r.contract_date <= curr.end,
  );
  const prevRows = axisRows.filter(
    (r) => r.contract_date >= prev.start && r.contract_date <= prev.end,
  );

  // 3축 탭에 이번 달 건수를 붙인다 — 어느 축이 큰지 이동 전에 보이게
  const axisCurrCount = new Map<string, number>();
  for (const r of rows12) {
    if (r.contract_date < curr.start || r.contract_date > curr.end) continue;
    const k = bizCategoryOf(r.category);
    axisCurrCount.set(k, (axisCurrCount.get(k) ?? 0) + 1);
  }

  // ── KPI ────────────────────────────────────────────────
  const cnt = currRows.length;
  const cntPrev = prevRows.length;
  const sum = (rows: CardContractRow[], of: (r: CardContractRow) => number) =>
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
  for (const r of axisRows) {
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
  const catKeyOf = (r: CardContractRow) => {
    const c = r.category ?? "";
    return axis.cats.includes(c) ? c : "그 외";
  };
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
    of: (r: CardContractRow) => number;
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

  // ── 세부 카테고리 카드 (홈과 같은 카드 UI 재사용) ───────
  const catKeys = axis.rest ? [...axis.cats, "그 외"] : axis.cats;
  const catSalesWindow = new Map<string, Map<string, number>>();
  for (const r of axisRows) {
    if (Number(r.contract_date.slice(8, 10)) > dayCut) continue;
    const k = catKeyOf(r);
    const ym = r.contract_date.slice(0, 7);
    if (!catSalesWindow.has(k)) catSalesWindow.set(k, new Map());
    const wm = catSalesWindow.get(k)!;
    wm.set(ym, (wm.get(ym) ?? 0) + (r.sales ?? 0));
  }
  type CatAcc = {
    count: number;
    sales: number;
    amount: number;
    margin: number;
    companies: Map<string, number>;
  };
  const emptyAcc = (): CatAcc => ({
    count: 0,
    sales: 0,
    amount: 0,
    margin: 0,
    companies: new Map(),
  });
  const accBy = (rows: CardContractRow[], withCompanies: boolean) => {
    const m = new Map<string, CatAcc>();
    for (const r of rows) {
      const k = catKeyOf(r);
      if (!m.has(k)) m.set(k, emptyAcc());
      const a = m.get(k)!;
      a.count += 1;
      a.sales += r.sales ?? 0;
      a.amount += r.total_rental_fee ?? 0;
      a.margin += r.contribution_margin ?? 0;
      if (withCompanies) {
        const label = companyLabelOf(r);
        a.companies.set(label, (a.companies.get(label) ?? 0) + 1);
      }
    }
    return m;
  };
  const catCurrAcc = accBy(currRows, true);
  const catPrevAcc = accBy(prevRows, false);

  const categoryCards: CategoryCard[] = catKeys.map((k) => {
    const c = catCurrAcc.get(k) ?? emptyAcc();
    const p = catPrevAcc.get(k) ?? emptyAcc();
    const paceVals = recentYms
      .slice(-4, -1)
      .map((ym) => (catSalesWindow.get(k)?.get(ym) ?? 0) / EOK);
    const pace = paceVals.length
      ? paceVals.reduce((s, v) => s + v, 0) / paceVals.length
      : 0;
    const topCompany = Array.from(c.companies.entries()).sort(
      (a, b) => b[1] - a[1],
    )[0];
    return {
      label: k,
      // 카드의 그룹 = 카테고리 그룹(6그룹) — 카드 그리드의 필터 축이 된다
      group: k === "그 외" ? "기타" : catGroupOf(k),
      sales: c.sales / EOK,
      salesPrev: p.sales / EOK,
      pace,
      count: c.count,
      countPrev: p.count,
      amount: c.amount / EOK,
      cpu: perDeal(c.margin, c.count),
      topCompany: topCompany?.[0] ?? "-",
      topShare: c.count > 0 ? ((topCompany?.[1] ?? 0) / c.count) * 100 : 0,
      rank: 0,
      prevRank: 0,
      spark: recentYms.map((ym) => (catSalesWindow.get(k)?.get(ym) ?? 0) / EOK),
    };
  });
  [...categoryCards]
    .sort((a, b) => b.sales - a.sales)
    .forEach((c, i) => (c.rank = i + 1));
  [...categoryCards]
    .sort((a, b) => b.salesPrev - a.salesPrev)
    .forEach((c, i) => (c.prevRank = i + 1));
  const visibleCatCards = categoryCards.filter(
    (c) => c.count > 0 || c.countPrev > 0,
  );
  // 카테고리 그룹(6그룹) 필터 — 그룹이 하나뿐인 축(인터넷)에서는 세우지 않는다
  const axisGroups = groupsOfAxis(key);
  const catCardGroups = axisGroups
    .map((g) => g.key)
    .filter((gk) => visibleCatCards.some((c) => c.group === gk));

  // 세부 카테고리 인사이트 — "이번 달 증가분의 X%가 여기서 발생"
  const netDelta = cnt - cntPrev;
  const catCountDiff = diffMap(
    sumBy(currRows, catKeyOf, () => 1),
    sumBy(prevRows, catKeyOf, () => 1),
  );
  const topPosCat = catCountDiff.find((g) => g.value > 0);
  const topNegCat = catCountDiff.find((g) => g.value < 0);

  // ── BM 구성 ────────────────────────────────────────────
  const bmAgg = (rows: CardContractRow[]) => {
    const m = { BM1: { cnt: 0, amt: 0 }, BM2: { cnt: 0, amt: 0 }, BM3: { cnt: 0, amt: 0 } };
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
      {/* 제목·기준 배지는 상단 헤더(Header.tsx)가 담당한다 — 본문에서 반복하지 않는다 */}

      {/* 3축 전환 탭 */}
      <nav className="flex flex-wrap gap-[6px]">
        {BIZ_CATEGORY_KEYS.map((k) => {
          const on = k === key;
          return (
            <Link
              key={k}
              href={`/categories/${encodeURIComponent(k)}`}
              aria-current={on ? "page" : undefined}
              className={`press flex items-center gap-2 rounded-[8px] border px-4 py-2 text-[13px] font-bold transition-colors ${
                on
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                  : "border-[var(--color-gray-200)] bg-white text-[var(--color-gray-500)] hover:border-[var(--color-gray-400)] hover:text-[var(--color-gray-900)]"
              }`}
            >
              {k}
              <span className="num text-[11px] font-semibold opacity-75">
                {fmt(axisCurrCount.get(k) ?? 0)}건
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
            타일의 선 = 최근 12개월 추이 (매월 1–{dayCut}일 같은 기간 · 값이
            잡히는 달부터)
          </div>
        </div>
      </section>

      {/* ── ② 왜 변했나 ─────────────────────────────── */}
      <section>
        <div className="mb-[11px] flex flex-wrap items-baseline gap-2.5">
          <h2 className={sectionHead}>이번 달 {key}는 왜 변했나</h2>
          <span className="text-[12px] text-[var(--color-gray-500)]">
            전체 변화 → 세부 카테고리 → 렌탈사 순으로 내려간다 · 렌탈사 클릭 시{" "}
            {key} × 렌탈사 상세
          </span>
        </div>
        <WaterfallPanel metrics={waterfallMetrics} panelClass={panel} />
      </section>

      {/* ── ③ 렌탈사별 성과 ─────────────────────────── */}
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
                          {diff > 0 ? "+" : diff < 0 ? "−" : ""}
                          {fmt(Math.abs(diff))}
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

      {/* ── ④ 세부 카테고리 ─────────────────────────── */}
      <section>
        <div className="mb-[11px] flex flex-wrap items-baseline gap-2.5">
          <h2 className={sectionHead}>세부 카테고리</h2>
          <span className="text-[12px] text-[var(--color-gray-500)]">
            {topPosCat && netDelta > 0 && topPosCat.value > 0 ? (
              <>
                이번 달 증가분의{" "}
                <b className="num text-[var(--color-gray-700)]">
                  {Math.min(100, (topPosCat.value / netDelta) * 100).toFixed(0)}
                  %
                </b>
                가 <b className="text-[var(--color-gray-700)]">{topPosCat.key}</b>
                에서 발생
              </>
            ) : topNegCat && netDelta < 0 ? (
              <>
                이번 달 감소의 최대 출처는{" "}
                <b className="text-[var(--color-gray-700)]">{topNegCat.key}</b>{" "}
                <b className="num" style={{ color: dirColor(topNegCat.value, 0) }}>
                  {fmt(topNegCat.value)}건
                </b>
              </>
            ) : (
              "전월 동기간과 큰 차이가 없습니다"
            )}
          </span>
        </div>
        {/* 카테고리 그룹(6그룹) 성격 — 현행 체계(임시 6그룹) 실측 요약 */}
        {axisGroups.length > 1 && (
          <p className="mb-[11px] text-[11px] leading-[1.7] text-[var(--color-gray-400)]">
            {axisGroups.map((g, i) => (
              <span key={g.key}>
                {i > 0 && <span className="mx-1.5">·</span>}
                <b className="font-bold text-[var(--color-gray-600)]">
                  {g.key}
                </b>{" "}
                {g.note}
              </span>
            ))}
          </p>
        )}
        <CategoryCards
          categories={visibleCatCards}
          groups={catCardGroups.length > 1 ? catCardGroups : []}
        />
      </section>

      {/* ── ⑤ BM 구성 ───────────────────────────────── */}
      <section>
        <div className="mb-[11px] flex flex-wrap items-baseline gap-2.5">
          <h2 className={sectionHead}>BM(판매 채널) 구성</h2>
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
        <code>getPeriod()</code> · 상위 카테고리 매핑은{" "}
        <code>lib/biz-category.ts</code> 하나만 쓴다.
      </p>
    </div>
  );
}
