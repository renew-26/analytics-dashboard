import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getPeriod, getDataAsOf } from "@/lib/period";
import { BIZ_CATEGORIES, bizCategoryOf, isBizCategory } from "@/lib/biz-category";
import {
  CARD_DEFS,
  countInstall90d,
  matchesCompany,
  perDeal,
  type CardContractRow,
} from "@/lib/company-cards";
import { getBM } from "@/lib/company-map";
import { resolveTier, TIER_META } from "@/lib/tiers";
import { diffMap, sumBy, trimLeadingGap } from "@/lib/decompose";
import Sparkline from "@/app/components/home/Sparkline";
import { deltaColor as dirColor, manwon, TAG } from "@/app/components/home/cardKit";

export const dynamic = "force-dynamic";

const EOK = 100_000_000;
const MAN = 10_000;
const PAGE = 50000;
/** 월렌탈료로 볼 수 없는 값(0·1원 등 견적 미입력 흔적)은 평균에서 뺀다 */
const MIN_VALID_FEE = 1000;

const fmt = (n: number) => Math.round(n).toLocaleString("ko-KR");
const signedInt = (n: number) =>
  n === 0 ? "0" : `${n > 0 ? "+" : "−"}${fmt(Math.abs(n))}`;

function pct(curr: number, prev: number) {
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}
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

type Row = CardContractRow & {
  product_name: string | null;
  model_name: string | null;
  monthly_fee: number | null;
};

/**
 * 카테고리 × 렌탈사 상세 — 분석의 마지막 계단.
 * "왜 이 카테고리에서 이 렌탈사의 성과가 변했는가"를 상품 단위로 설명한다.
 * /categories/{카테고리}/{렌탈사} 와 렌탈사 상세 양쪽에서 진입한다.
 */
export default async function CategoryCompanyPage({
  params,
}: {
  params: Promise<{ category: string; company: string }>;
}) {
  const p = await params;
  const key = decodeURIComponent(p.category);
  const label = decodeURIComponent(p.company);
  if (!isBizCategory(key)) notFound();
  const def = CARD_DEFS.find((d) => d.label === label);
  if (!def) notFound();
  const axis = BIZ_CATEGORIES.find((b) => b.key === key)!;

  const { curr, prev, month, day: dayCut } = getPeriod(await getDataAsOf());

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

  // 이 렌탈사의 12개월 전체 행 — 티어(전체 실적)와 축 필터 양쪽에 쓴다
  const all: Row[] = [];
  {
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("raw_contracts")
        .select(
          "contract_date, rental_company, category, partner_company, total_rental_fee, contribution_margin, sales, product_name, model_name, monthly_fee",
        )
        .eq("rental_company", def.dbName)
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

  // dbName 하나가 여러 label로 나뉘는 경우(LG, KT, BS렌탈)를 카테고리 조건으로 가른다
  const labelRows = all.filter((r) => matchesCompany(def, r));
  const install90 = countInstall90d(labelRows, curr.end);
  const tier = resolveTier(label, install90.get(label) ?? 0).tier;

  const axisRows = labelRows.filter((r) => bizCategoryOf(r.category) === key);
  const currRows = axisRows.filter(
    (r) => r.contract_date >= curr.start && r.contract_date <= curr.end,
  );
  const prevRows = axisRows.filter(
    (r) => r.contract_date >= prev.start && r.contract_date <= prev.end,
  );

  // ── KPI ────────────────────────────────────────────────
  const sum = (rows: Row[], of: (r: Row) => number) =>
    rows.reduce((s, r) => s + of(r), 0);
  const cnt = currRows.length;
  const cntPrev = prevRows.length;
  const amt = sum(currRows, (r) => r.total_rental_fee ?? 0) / EOK;
  const amtPrev = sum(prevRows, (r) => r.total_rental_fee ?? 0) / EOK;
  const sales = sum(currRows, (r) => r.sales ?? 0) / EOK;
  const salesPrev = sum(prevRows, (r) => r.sales ?? 0) / EOK;
  const margin = sum(currRows, (r) => r.contribution_margin ?? 0);
  const marginPrev = sum(prevRows, (r) => r.contribution_margin ?? 0);
  const cpu = perDeal(margin, cnt);
  const cpuPrev = perDeal(marginPrev, cntPrev);

  // 12개월 스파크 (매월 1~dayCut일 같은 기간)
  const cntByYm = new Map<string, number>();
  const salesByYm = new Map<string, number>();
  const mgByYm = new Map<string, number>();
  const amtByYm = new Map<string, number>();
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

  // ── 상품별 성과 (이번 달 기준, 전월과 비교) ────────────
  const prodKeyOf = (r: Row) =>
    `${r.product_name ?? ""}|${r.model_name ?? ""}`;
  const prodNameOf = (k: string) => {
    const [productName, modelName] = k.split("|");
    return { productName: productName || "(상품명 없음)", modelName };
  };

  type ProdAgg = {
    key: string;
    category: string;
    cnt: number;
    cntPrev: number;
    feeSum: number;
    feeN: number;
    sales: number;
    margin: number;
  };
  const prodMap = new Map<string, ProdAgg>();
  const prodOf = (r: Row) => {
    const k = prodKeyOf(r);
    let a = prodMap.get(k);
    if (!a) {
      a = {
        key: k,
        category: r.category ?? "기타",
        cnt: 0,
        cntPrev: 0,
        feeSum: 0,
        feeN: 0,
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
    if (r.monthly_fee && r.monthly_fee >= MIN_VALID_FEE) {
      a.feeSum += r.monthly_fee;
      a.feeN += 1;
    }
  }
  for (const r of prevRows) prodOf(r).cntPrev += 1;

  const products = Array.from(prodMap.values())
    .filter((a) => a.cnt > 0 || a.cntPrev > 0)
    .sort((a, b) => b.cnt - a.cnt || b.cntPrev - a.cntPrev);
  const topProducts = products.slice(0, 15);

  // ── 변화 원인 — 계약건수·매출 기여 상위 상품 ───────────
  const countDiff = diffMap(
    sumBy(currRows, prodKeyOf, () => 1),
    sumBy(prevRows, prodKeyOf, () => 1),
  );
  const salesDiff = diffMap(
    sumBy(currRows, prodKeyOf, (r) => (r.sales ?? 0) / MAN),
    sumBy(prevRows, prodKeyOf, (r) => (r.sales ?? 0) / MAN),
  );

  // BM 구성 (이번 달)
  const bmCnt = { BM1: 0, BM2: 0, BM3: 0 };
  for (const r of currRows) bmCnt[getBM(r.partner_company)] += 1;

  const multiCat = axis.cats.length > 1;

  const th =
    "bg-[var(--color-gray-25)] p-[9px_12px] text-right text-[11px] font-bold whitespace-nowrap text-[var(--color-gray-400)]";
  const td = "p-[9px_12px] text-right whitespace-nowrap";

  return (
    <div className="min-h-screen space-y-[24px] bg-[var(--color-page)] px-10 pt-8 pb-16">
      {/* 제목·기준 배지는 상단 헤더(Header.tsx)가 담당 — 본문은 티어와 이동 경로만 */}
      <div className="flex flex-wrap items-center gap-[8px]">
        <span
          className="rounded-[4px] px-[6px] py-[2px] text-[11px] font-bold"
          style={TIER_META[tier].chip}
          title={TIER_META[tier].desc}
        >
          {tier}
        </span>
        <span className={TAG}>{def.group}</span>
        <span className="w-1" />
        {/* 다른 축으로 갈아탈 길을 숨기지 않는다 */}
        <Link
          href={`/company/${encodeURIComponent(label)}`}
          className="inline-flex items-center gap-[6px] rounded-[8px] border border-[var(--color-gray-200)] bg-white p-[6px_11px] text-[12px] font-semibold text-[var(--color-gray-600)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          {label} 전체 상세
          <span className="font-mono text-[10px] text-[var(--color-gray-400)]">
            /company/{label}
          </span>
        </Link>
        <Link
          href={`/categories/${encodeURIComponent(key)}`}
          className="inline-flex items-center gap-[6px] rounded-[8px] border border-[var(--color-gray-200)] bg-white p-[6px_11px] text-[12px] font-semibold text-[var(--color-gray-600)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          {key} 전체
          <span className="font-mono text-[10px] text-[var(--color-gray-400)]">
            /categories/{key}
          </span>
        </Link>
      </div>

      {/* ── ① KPI ───────────────────────────────────── */}
      <section>
        <h2 className={`mb-[11px] ${sectionHead}`}>
          {month}월 {key} 안에서의 {label}
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
          <div className="flex flex-wrap items-center gap-x-[18px] gap-y-1 border-t border-[var(--color-gray-200)] bg-[var(--color-gray-25)] p-[9px_17px] text-[11px] text-[var(--color-gray-400)]">
            <span>
              BM 구성 (계약건수):{" "}
              {(["BM1", "BM2", "BM3"] as const)
                .filter((b) => bmCnt[b] > 0)
                .map((b) => `${b} ${fmt(bmCnt[b])}건`)
                .join(" · ") || "—"}
            </span>
            <span>
              타일의 선 = 최근 12개월 추이 (매월 1–{dayCut}일 같은 기간)
            </span>
          </div>
        </div>
      </section>

      {/* ── ② 변화 원인 ─────────────────────────────── */}
      <section>
        <div className="mb-[11px] flex flex-wrap items-baseline gap-2.5">
          <h2 className={sectionHead}>무엇 때문에 변했나</h2>
          <span className="text-[12px] text-[var(--color-gray-500)]">
            전월 동기간 대비 상품별 기여 · 증가와 감소를 따로 본다
          </span>
        </div>
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          {[
            {
              title: "계약건수 기여",
              unit: "건",
              decimals: 0,
              diff: countDiff,
            },
            { title: "매출 기여", unit: "만원", decimals: 0, diff: salesDiff },
          ].map((m) => {
            const ups = m.diff.filter((x) => x.value > 0).slice(0, 4);
            const downs = m.diff.filter((x) => x.value < 0).slice(0, 4);
            const renderRow = (x: { key: string; value: number }) => {
              const { productName, modelName } = prodNameOf(x.key);
              return (
                <li
                  key={x.key}
                  className="flex items-baseline gap-[9px] border-t border-[var(--color-line-2)] py-[8px] first:border-t-0"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-bold">
                      {productName}
                    </span>
                    {modelName && (
                      <span className="block truncate font-mono text-[10px] text-[var(--color-gray-400)]">
                        {modelName}
                      </span>
                    )}
                  </span>
                  <b
                    className="num flex-none text-[12px] font-bold"
                    style={{ color: dirColor(x.value, 0) }}
                  >
                    {x.value > 0 ? "+" : "−"}
                    {fmt(Math.abs(x.value))}
                    <i className="ml-px text-[10px] font-semibold not-italic opacity-70">
                      {m.unit}
                    </i>
                  </b>
                </li>
              );
            };
            return (
              <div key={m.title} className={panel}>
                <div className="flex items-baseline justify-between gap-2.5 p-[14px_17px_11px]">
                  <h3 className="text-[14px] font-bold tracking-[-.2px]">
                    {m.title}
                  </h3>
                  <span className="text-[11px] text-[var(--color-gray-400)]">
                    증가·감소 각 상위 {Math.max(ups.length, downs.length)}개
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-x-6 border-t border-[var(--color-line-2)] px-[17px] pt-[6px] pb-[13px] md:grid-cols-2">
                  <div>
                    <div className="pt-[6px] pb-[2px] text-[11px] font-bold text-[var(--color-gray-500)]">
                      끌어올린 상품
                    </div>
                    {ups.length ? (
                      <ul>{ups.map(renderRow)}</ul>
                    ) : (
                      <p className="py-3 text-[12px] text-[var(--color-gray-400)]">
                        증가 기여 상품이 없습니다.
                      </p>
                    )}
                  </div>
                  <div>
                    <div className="pt-[6px] pb-[2px] text-[11px] font-bold text-[var(--color-gray-500)]">
                      끌어내린 상품
                    </div>
                    {downs.length ? (
                      <ul>{downs.map(renderRow)}</ul>
                    ) : (
                      <p className="py-3 text-[12px] text-[var(--color-gray-400)]">
                        감소 기여 상품이 없습니다.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── ③ 상품별 성과 ───────────────────────────── */}
      <section>
        <div className="mb-[11px] flex flex-wrap items-baseline gap-2.5">
          <h2 className={sectionHead}>상품별 성과</h2>
          <span className="text-[12px] text-[var(--color-gray-500)]">
            이번 달 계약건수 상위 {topProducts.length}개 · 전월 동기간과 비교
          </span>
        </div>
        <div className={panel}>
          <div className="px-[17px] pt-[16px] pb-[16px]">
            {topProducts.length === 0 ? (
              <p className="py-6 text-center text-[12px] text-[var(--color-gray-400)]">
                이번 달과 전월 동기간 모두 {key}에서 {label}의 계약완료가
                없습니다.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-[8px] border border-[var(--color-gray-200)]">
                <table className="w-full min-w-[820px] bg-white text-[12px]">
                  <thead>
                    <tr className="border-b border-[var(--color-gray-200)]">
                      <th className={`${th} text-left`}>상품</th>
                      {multiCat && <th className={`${th} text-left`}>카테고리</th>}
                      <th className={th}>계약건수</th>
                      <th className={th}>전월 동기간</th>
                      <th className={th}>증감</th>
                      <th className={th}>평균 월렌탈료</th>
                      <th className={th}>매출</th>
                      <th className={th}>건당 공헌이익</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.map((a) => {
                      const { productName, modelName } = prodNameOf(a.key);
                      const diff = a.cnt - a.cntPrev;
                      return (
                        <tr
                          key={a.key}
                          className="border-t border-[var(--color-line-2)] hover:bg-[var(--color-gray-25)]"
                        >
                          <td className={`${td} max-w-[320px] text-left`}>
                            <span className="block truncate font-bold text-[var(--color-gray-700)]">
                              {productName}
                            </span>
                            {modelName && (
                              <span className="block truncate font-mono text-[10px] text-[var(--color-gray-400)]">
                                {modelName}
                              </span>
                            )}
                          </td>
                          {multiCat && (
                            <td
                              className={`${td} text-left text-[var(--color-gray-500)]`}
                            >
                              {a.category}
                            </td>
                          )}
                          <td className={`${td} num font-bold`}>{fmt(a.cnt)}</td>
                          <td
                            className={`${td} num text-[var(--color-gray-500)]`}
                          >
                            {fmt(a.cntPrev)}
                          </td>
                          <td
                            className={`${td} num font-bold`}
                            style={{ color: dirColor(diff, 0) }}
                          >
                            {signedInt(diff)}
                          </td>
                          <td className={`${td} num`}>
                            {a.feeN > 0 ? `${fmt(a.feeSum / a.feeN)}원` : "—"}
                          </td>
                          <td className={`${td} num`}>
                            {fmt(a.sales / MAN)}만원
                          </td>
                          <td className={`${td} num`}>
                            {manwon(perDeal(a.margin, a.cnt))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-[10px] text-[11px] text-[var(--color-gray-500)]">
              평균 월렌탈료는 1,000원 미만(견적 미입력 흔적)을 제외한 평균 ·
              매출·공헌이익은 이번 달 기준 구간 합계입니다.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
