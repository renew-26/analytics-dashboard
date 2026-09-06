import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getPeriod, getDataAsOf } from "@/lib/period";
import { catGroupOf, isCategoryGroup } from "@/lib/biz-category";
import {
  CARD_DEFS,
  matchesCompany,
  perDeal,
  type CardContractRow,
} from "@/lib/company-cards";
import { volumePriceDecompose, trimLeadingGap } from "@/lib/decompose";
import { fmt, pct, pctAbs, recentYmsOf, EOK } from "@/lib/format";
import Sparkline from "@/app/components/home/Sparkline";
import { deltaColor as dirColor, manwon, TAG } from "@/app/components/home/cardKit";
import Breadcrumb from "@/app/components/Breadcrumb";
import Bridge from "@/app/components/Bridge";
import Delta from "@/app/components/Delta";

export const dynamic = "force-dynamic";

const PAGE = 50000;
/** 월렌탈료로 볼 수 없는 값(0·1원 등 견적 미입력 흔적)은 평균에서 뺀다 */
const MIN_VALID_FEE = 1000;

const panel =
  "rounded-[12px] border border-[var(--color-gray-200)] bg-white shadow-[0_1px_2px_rgba(28,35,56,.04),0_2px_8px_rgba(28,35,56,.05)]";
const sectionHead = "text-[15px] font-bold tracking-[-.3px]";

type Row = CardContractRow & {
  product_name: string | null;
  model_name: string | null;
  monthly_fee: number | null;
  sales_incentive: number | null;
  promotion: number | null;
  bad_debt: number | null;
  cost_of_goods: number | null;
  financial_cost: number | null;
  management_type: string | null;
  contract_months: number | null;
};

/**
 * 상품 상세 — 분석 경로의 최종 depth.
 * "결국 이 상품에서 무엇이 변했는가"를 가격·수수료·프로모션·믹스·수익성
 * 구성까지 내려가 설명한다. 여기서 더 내려갈 곳은 없다.
 */
export default async function ProductPage({
  params,
}: {
  params: Promise<{ category: string; company: string; product: string }>;
}) {
  const p = await params;
  const key = decodeURIComponent(p.category);
  const label = decodeURIComponent(p.company);
  const product = decodeURIComponent(p.product);
  if (!isCategoryGroup(key)) notFound();
  const def = CARD_DEFS.find((d) => d.label === label);
  if (!def) notFound();

  const { curr, prev, month, day: dayCut } = getPeriod(await getDataAsOf());
  const recentYms = recentYmsOf(curr.end);

  // 이 렌탈사 × 이 상품의 12개월 행 — 단일 상품이라 양이 작다
  const all: Row[] = [];
  {
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("raw_contracts")
        .select(
          "contract_date, rental_company, category, partner_company, total_rental_fee, contribution_margin, sales, product_name, model_name, monthly_fee, sales_incentive, promotion, bad_debt, cost_of_goods, financial_cost, management_type, contract_months",
        )
        .eq("rental_company", def.dbName)
        .eq("product_name", product)
        .gte("contract_date", `${recentYms[0]}-01`)
        .lte("contract_date", curr.end)
        .order("prop_item_usid", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error || !data || data.length === 0) break;
      all.push(...(data as unknown as Row[]));
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }

  const rows = all.filter(
    (r) => matchesCompany(def, r) && catGroupOf(r.category) === key,
  );
  if (rows.length === 0) notFound();

  const currRows = rows.filter(
    (r) => r.contract_date >= curr.start && r.contract_date <= curr.end,
  );
  const prevRows = rows.filter(
    (r) => r.contract_date >= prev.start && r.contract_date <= prev.end,
  );
  const category = rows[rows.length - 1].category ?? "기타";
  const models = Array.from(
    new Set(rows.map((r) => r.model_name).filter(Boolean)),
  ) as string[];

  // ── KPI ────────────────────────────────────────────────
  const sum = (rs: Row[], of: (r: Row) => number) =>
    rs.reduce((s, r) => s + of(r), 0);
  const cnt = currRows.length;
  const cntPrev = prevRows.length;
  const amt = sum(currRows, (r) => r.total_rental_fee ?? 0) / EOK;
  const amtPrev = sum(prevRows, (r) => r.total_rental_fee ?? 0) / EOK;
  const salesSum = sum(currRows, (r) => r.sales ?? 0);
  const salesSumPrev = sum(prevRows, (r) => r.sales ?? 0);
  const margin = sum(currRows, (r) => r.contribution_margin ?? 0);
  const marginPrev = sum(prevRows, (r) => r.contribution_margin ?? 0);
  const cpu = perDeal(margin, cnt);
  const cpuPrev = perDeal(marginPrev, cntPrev);

  // 12개월 스파크 (매월 1~dayCut일 같은 기간)
  const cntByYm = new Map<string, number>();
  const salesByYm = new Map<string, number>();
  const mgByYm = new Map<string, number>();
  const amtByYm = new Map<string, number>();
  for (const r of rows) {
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

  // ── 매출 분해 (판매량 × 단가) ───────────────────────────
  const salesBridge = volumePriceDecompose(
    cnt,
    salesSum,
    cntPrev,
    salesSumPrev,
  );

  // ── 가격·수수료·프로모션·믹스 ──────────────────────────
  const avgFee = (rs: Row[]) => {
    const v = rs.filter((r) => (r.monthly_fee ?? 0) >= MIN_VALID_FEE);
    return v.length
      ? v.reduce((s, r) => s + (r.monthly_fee ?? 0), 0) / v.length
      : 0;
  };
  const fee = avgFee(currRows);
  const feePrev = avgFee(prevRows);

  const perDealOf = (rs: Row[], of: (r: Row) => number) =>
    rs.length > 0 ? sum(rs, of) / rs.length : 0;
  const salesPer = perDealOf(currRows, (r) => r.sales ?? 0);
  const salesPerPrev = perDealOf(prevRows, (r) => r.sales ?? 0);
  const incPer = perDealOf(currRows, (r) => r.sales_incentive ?? 0);
  const incPerPrev = perDealOf(prevRows, (r) => r.sales_incentive ?? 0);

  const promoShare = (rs: Row[]) =>
    rs.length > 0
      ? (rs.filter((r) => (r.promotion ?? 0) > 0).length / rs.length) * 100
      : 0;
  const promoAvg = (rs: Row[]) => {
    const v = rs.filter((r) => (r.promotion ?? 0) > 0);
    return v.length
      ? v.reduce((s, r) => s + (r.promotion ?? 0), 0) / v.length
      : 0;
  };
  const hasPromo =
    currRows.some((r) => (r.promotion ?? 0) > 0) ||
    prevRows.some((r) => (r.promotion ?? 0) > 0);

  const mixOf = (rs: Row[], of: (r: Row) => string) => {
    const m = new Map<string, number>();
    for (const r of rs) m.set(of(r), (m.get(of(r)) ?? 0) + 1);
    return Array.from(m.entries())
      .map(([k, v]) => ({ key: k, share: rs.length ? (v / rs.length) * 100 : 0 }))
      .sort((a, b) => b.share - a.share);
  };
  const mgmtMix = mixOf(currRows, (r) => r.management_type ?? "미입력");
  const mgmtMixPrev = new Map(
    mixOf(prevRows, (r) => r.management_type ?? "미입력").map((x) => [
      x.key,
      x.share,
    ]),
  );
  const termMix = mixOf(currRows, (r) =>
    r.contract_months ? `${r.contract_months}개월` : "미입력",
  );
  const termMixPrev = new Map(
    mixOf(prevRows, (r) =>
      r.contract_months ? `${r.contract_months}개월` : "미입력",
    ).map((x) => [x.key, x.share]),
  );

  // ── 수익성 구성 — CM = 매출 − 인센티브 − 프로모션 − 대손 − 원가 − 금융비 ──
  const costRows = [
    { label: "매출(수수료)", of: (r: Row) => r.sales ?? 0, sign: 1 },
    { label: "판매 인센티브", of: (r: Row) => r.sales_incentive ?? 0, sign: -1 },
    { label: "프로모션", of: (r: Row) => r.promotion ?? 0, sign: -1 },
    { label: "대손", of: (r: Row) => r.bad_debt ?? 0, sign: -1 },
    {
      label: "상품 원가·금융비",
      of: (r: Row) => (r.cost_of_goods ?? 0) + (r.financial_cost ?? 0),
      sign: -1,
    },
  ]
    .map((c) => ({
      label: c.label,
      sign: c.sign,
      curr: perDealOf(currRows, c.of),
      prev: perDealOf(prevRows, c.of),
    }))
    .filter((c) => c.curr !== 0 || c.prev !== 0);

  const th =
    "bg-[var(--color-gray-25)] p-[9px_12px] text-right text-[11px] font-bold whitespace-nowrap text-[var(--color-gray-400)]";
  const td = "p-[9px_12px] text-right whitespace-nowrap";
  const miniLabel =
    "mb-[6px] flex items-baseline justify-between text-[11px] font-bold text-[var(--color-gray-500)]";

  return (
    <div className="min-h-screen space-y-[24px] bg-[var(--color-page)] px-10 pt-8 pb-16">
      <div className="flex flex-wrap items-center gap-x-[14px] gap-y-[8px]">
        <Breadcrumb
          items={[
            { label: "카테고리", href: "/categories" },
            { label: key, href: `/categories/${encodeURIComponent(key)}` },
            {
              label,
              href: `/categories/${encodeURIComponent(key)}/${encodeURIComponent(label)}`,
            },
            { label: product },
          ]}
        />
        <span className={TAG}>{category}</span>
        {models.length > 0 && (
          <span className="font-mono text-[10px] text-[var(--color-gray-400)]">
            {models.slice(0, 3).join(" · ")}
            {models.length > 3 && ` 외 ${models.length - 3}`}
          </span>
        )}
      </div>

      {/* ── ① KPI ───────────────────────────────────── */}
      <section>
        <h2 className={`mb-[11px] ${sectionHead}`}>
          {month}월 {label}의 {product}
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
                value: amt.toFixed(2),
                unit: "억",
                prev: `${amtPrev.toFixed(2)}억`,
                delta: pct(amt, amtPrev),
                spark: amtSpark,
              },
              {
                label: "매출",
                value: (salesSum / EOK).toFixed(2),
                unit: "억",
                prev: `${(salesSumPrev / EOK).toFixed(2)}억`,
                delta: pct(salesSum, salesSumPrev),
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
          <div className="flex flex-wrap items-center gap-x-[18px] gap-y-1 border-t border-[var(--color-gray-200)] bg-[var(--color-gray-25)] p-[9px_17px] text-[11px] text-[var(--color-gray-400)]">
            <span>
              타일의 선 = 최근 12개월 추이 (매월 1–{dayCut}일 같은 기간)
            </span>
          </div>
        </div>
      </section>

      {/* ── ② 매출 분해 ─────────────────────────────── */}
      <section>
        <div className="mb-[11px] flex flex-wrap items-baseline gap-2.5">
          <h2 className={sectionHead}>매출은 왜 변했나</h2>
          <span className="text-[12px] text-[var(--color-gray-500)]">
            더 많이 팔았나(판매량), 한 건이 더 커졌나(단가) — 두 항의 합이
            변화량과 일치
          </span>
        </div>
        <div className={`${panel} p-[16px_17px_13px]`}>
          <Bridge
            parts={[
              { label: "판매량 효과", value: salesBridge.volume },
              { label: "건당 매출 효과", value: salesBridge.price },
            ]}
            total={salesBridge.total}
            totalLabel="Δ매출"
          />
        </div>
      </section>

      {/* ── ③ 가격·수수료·프로모션·믹스 ───────────────── */}
      <section>
        <div className="mb-[11px] flex flex-wrap items-baseline gap-2.5">
          <h2 className={sectionHead}>무엇이 움직였나</h2>
          <span className="text-[12px] text-[var(--color-gray-500)]">
            전월 동기간 대비 · 건당 기준
          </span>
        </div>
        <div className="grid grid-cols-1 gap-[13px] md:grid-cols-2">
          <div className={`${panel} p-[13px_15px_12px]`}>
            <div className={miniLabel}>
              가격 <span className="font-mono font-normal">monthly_fee</span>
            </div>
            <div className="num text-[18px] font-bold">
              {fee > 0 ? `${fmt(fee)}` : "—"}
              <i className="ml-0.5 text-[11px] font-semibold not-italic text-[var(--color-gray-500)]">
                원/월 평균
              </i>
            </div>
            <div className="mt-[3px] text-[11px] text-[var(--color-gray-600)]">
              <Delta value={fee && feePrev ? pct(fee, feePrev) : null} />{" "}
              <span className="num text-[var(--color-gray-400)]">
                전월 {feePrev > 0 ? `${fmt(feePrev)}원` : "—"}
              </span>
            </div>
          </div>
          <div className={`${panel} p-[13px_15px_12px]`}>
            <div className={miniLabel}>
              수수료{" "}
              <span className="font-mono font-normal">
                sales · sales_incentive
              </span>
            </div>
            <div className="num text-[18px] font-bold">
              {fmt(salesPer)}
              <i className="ml-0.5 text-[11px] font-semibold not-italic text-[var(--color-gray-500)]">
                원/건
              </i>
            </div>
            <div className="mt-[3px] text-[11px] text-[var(--color-gray-600)]">
              <Delta value={pctAbs(salesPer, salesPerPrev)} />{" "}
              <span className="num text-[var(--color-gray-400)]">
                전월 {fmt(salesPerPrev)}원
              </span>
              <span className="num ml-[10px]">
                인센티브 {fmt(incPer)}원/건{" "}
                <span className="text-[var(--color-gray-400)]">
                  (전월 {fmt(incPerPrev)}원)
                </span>
              </span>
            </div>
          </div>
          {hasPromo && (
            <div className={`${panel} p-[13px_15px_12px]`}>
              <div className={miniLabel}>
                프로모션 <span className="font-mono font-normal">promotion</span>
              </div>
              <div className="num text-[18px] font-bold">
                {promoShare(currRows).toFixed(0)}
                <i className="ml-0.5 text-[11px] font-semibold not-italic text-[var(--color-gray-500)]">
                  % 적용
                </i>
              </div>
              <div className="mt-[3px] text-[11px] text-[var(--color-gray-600)]">
                <span className="num">
                  적용 건 평균 {fmt(promoAvg(currRows))}원
                </span>{" "}
                <span className="num text-[var(--color-gray-400)]">
                  · 전월 적용률 {promoShare(prevRows).toFixed(0)}% · 평균{" "}
                  {fmt(promoAvg(prevRows))}원
                </span>
              </div>
            </div>
          )}
          <div className={`${panel} p-[13px_15px_12px]`}>
            <div className={miniLabel}>
              믹스{" "}
              <span className="font-mono font-normal">
                management_type · contract_months
              </span>
            </div>
            <div className="space-y-[5px] text-[11px]">
              {[
                { mix: mgmtMix, prevMap: mgmtMixPrev },
                { mix: termMix, prevMap: termMixPrev },
              ].map(({ mix, prevMap }, gi) => (
                <div key={gi} className="flex flex-wrap gap-x-[12px] gap-y-[2px]">
                  {mix.slice(0, 3).map((x) => {
                    const d = x.share - (prevMap.get(x.key) ?? 0);
                    return (
                      <span key={x.key} className="num whitespace-nowrap">
                        <b>{x.key}</b> {x.share.toFixed(0)}%
                        <span
                          className="ml-[3px]"
                          style={{
                            color:
                              Math.abs(d) < 3
                                ? "var(--color-gray-400)"
                                : dirColor(d, 0),
                          }}
                        >
                          ({d > 0 ? "+" : ""}
                          {d.toFixed(0)}%p)
                        </span>
                      </span>
                    );
                  })}
                </div>
              ))}
              {currRows.length === 0 && (
                <span className="text-[var(--color-gray-400)]">
                  이번 달 계약이 없습니다.
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── ④ 수익성 구성 ───────────────────────────── */}
      <section>
        <div className="mb-[11px] flex flex-wrap items-baseline gap-2.5">
          <h2 className={sectionHead}>수익성은 어떻게 변했나</h2>
          <span className="text-[12px] text-[var(--color-gray-500)]">
            건당 공헌이익 = 매출 − 인센티브 − 프로모션 − 대손 − 원가·금융비
          </span>
        </div>
        <div className={`${panel} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] bg-white text-[12px]">
              <thead>
                <tr className="border-b border-[var(--color-gray-200)]">
                  <th className={`${th} text-left`}>항목</th>
                  <th className={th}>이번 달 /건</th>
                  <th className={th}>전월 동기간 /건</th>
                  <th className={th}>변화</th>
                </tr>
              </thead>
              <tbody>
                {costRows.map((c) => {
                  // 비용 항목은 줄어드는 게 이익에 +. 방향색은 이익 기여 방향으로.
                  const d = (c.curr - c.prev) * c.sign;
                  return (
                    <tr
                      key={c.label}
                      className="border-t border-[var(--color-line-2)]"
                    >
                      <td className={`${td} text-left font-semibold`}>
                        {c.sign < 0 && (
                          <span className="mr-[4px] text-[var(--color-gray-400)]">
                            −
                          </span>
                        )}
                        {c.label}
                      </td>
                      <td className={`${td} num`}>{fmt(c.curr)}원</td>
                      <td className={`${td} num text-[var(--color-gray-500)]`}>
                        {fmt(c.prev)}원
                      </td>
                      <td
                        className={`${td} num font-bold`}
                        style={{ color: dirColor(d, 0) }}
                      >
                        {d > 0 ? "▲" : d < 0 ? "▼" : "—"}{" "}
                        {fmt(Math.abs(c.curr - c.prev))}원
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t border-[var(--color-gray-200)] bg-[var(--color-gray-25)]">
                  <td className={`${td} text-left font-bold`}>건당 공헌이익</td>
                  <td className={`${td} num font-bold`}>{fmt(cpu)}원</td>
                  <td className={`${td} num text-[var(--color-gray-500)]`}>
                    {fmt(cpuPrev)}원
                  </td>
                  <td
                    className={`${td} num font-bold`}
                    style={{ color: dirColor(cpu - cpuPrev, 0) }}
                  >
                    {cpu - cpuPrev > 0 ? "▲" : cpu - cpuPrev < 0 ? "▼" : "—"}{" "}
                    {fmt(Math.abs(cpu - cpuPrev))}원
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="border-t border-[var(--color-line-2)] p-[9px_16px] text-[11px] text-[var(--color-gray-500)]">
            변화 화살표는 이익 기여 방향입니다 — 비용 항목은 줄어들면 ▲(개선).
            값이 두 기간 모두 0인 항목은 표시하지 않습니다.
          </p>
        </div>
      </section>

      {/* 다음 depth가 없는 최종 화면 — 대신 옆으로 갈 길을 안내 */}
      <div className="flex flex-wrap items-center gap-[8px]">
        <Link
          href={`/categories/${encodeURIComponent(key)}/${encodeURIComponent(label)}`}
          className="inline-flex items-center gap-[6px] rounded-[8px] border border-[var(--color-gray-200)] bg-white p-[6px_11px] text-[12px] font-semibold text-[var(--color-gray-600)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          {label}의 다른 {key} 상품
          <span className="font-mono text-[10px] text-[var(--color-gray-400)]">
            /categories/{key}/{label}
          </span>
        </Link>
        <Link
          href={`/company/${encodeURIComponent(label)}`}
          className="inline-flex items-center gap-[6px] rounded-[8px] border border-[var(--color-gray-200)] bg-white p-[6px_11px] text-[12px] font-semibold text-[var(--color-gray-600)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          {label} 전체 상세
          <span className="font-mono text-[10px] text-[var(--color-gray-400)]">
            /company/{label}
          </span>
        </Link>
      </div>
    </div>
  );
}
