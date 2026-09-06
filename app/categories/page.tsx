import { fetchRows } from "@/lib/fetch-rows";
import { getPeriod, getDataAsOf } from "@/lib/period";
import { CATEGORY_GROUPS, catGroupOf } from "@/lib/biz-category";
import { buildCategoryCards } from "@/lib/category-cards";
import { perDeal, type CardContractRow } from "@/lib/company-cards";
import { EOK, fmt, pct, pctAbs, recentYmsOf } from "@/lib/format";
import CategoryCards from "@/app/components/home/CategoryCards";
import Sparkline from "@/app/components/home/Sparkline";
import { deltaColor as dirColor, manwon } from "@/app/components/home/cardKit";
import GroupTable, { type GroupRow } from "@/app/components/category/GroupTable";
import Breadcrumb from "@/app/components/Breadcrumb";
import Delta from "@/app/components/Delta";

export const dynamic = "force-dynamic";

const panel =
  "rounded-[12px] border border-[var(--color-gray-200)] bg-white shadow-[0_1px_2px_rgba(28,35,56,.04),0_2px_8px_rgba(28,35,56,.05)]";
const sectionHead = "text-[15px] font-bold tracking-[-.3px]";

// 명시 매핑된 세부 카테고리 전부 — 여기 없으면 "그 외"로 흡수한다
const MAPPED_CATS = new Set(CATEGORY_GROUPS.flatMap((g) => g.cats));

/**
 * 카테고리 메인 — "이번 달 어느 상품군이 움직였나"를 그룹 단위로 먼저 보여준다.
 * 여기서 카테고리 그룹(6그룹)을 고르면 해당 축 페이지로 내려간다.
 */
export default async function CategoriesPage() {
  const { curr, prev, month, day: dayCut } = getPeriod(await getDataAsOf());

  // 최근 12개월 창 — KPI 스파크라인·카드 페이스까지 이 한 번으로 충분
  const recentYms = recentYmsOf(curr.end);

  const rows12 = await fetchRows<CardContractRow>({
    select:
      "contract_date, rental_company, category, partner_company, total_rental_fee, contribution_margin, sales",
    start: `${recentYms[0]}-01`,
    end: curr.end,
    orderBy: "prop_item_usid",
  });

  const currRows = rows12.filter(
    (r) => r.contract_date >= curr.start && r.contract_date <= curr.end,
  );
  const prevRows = rows12.filter(
    (r) => r.contract_date >= prev.start && r.contract_date <= prev.end,
  );

  // ── KPI (전체) ─────────────────────────────────────────
  const sum = (rows: CardContractRow[], of: (r: CardContractRow) => number) =>
    rows.reduce((s, r) => s + of(r), 0);
  const cnt = currRows.length;
  const cntPrev = prevRows.length;
  const amt = sum(currRows, (r) => r.total_rental_fee ?? 0) / EOK;
  const amtPrev = sum(prevRows, (r) => r.total_rental_fee ?? 0) / EOK;
  const sales = sum(currRows, (r) => r.sales ?? 0) / EOK;
  const salesPrev = sum(prevRows, (r) => r.sales ?? 0) / EOK;
  const cpu = perDeal(
    sum(currRows, (r) => r.contribution_margin ?? 0),
    cnt,
  );
  const cpuPrev = perDeal(
    sum(prevRows, (r) => r.contribution_margin ?? 0),
    cntPrev,
  );

  // KPI 스파크라인 — 매월 1~dayCut일 같은 기간 기준
  const byYm = (of: (r: CardContractRow) => number) => {
    const m = new Map<string, number>();
    for (const r of rows12) {
      if (Number(r.contract_date.slice(8, 10)) > dayCut) continue;
      const ym = r.contract_date.slice(0, 7);
      m.set(ym, (m.get(ym) ?? 0) + of(r));
    }
    return recentYms.map((ym) => m.get(ym) ?? 0);
  };
  const cntSpark = byYm(() => 1);
  const amtSpark = byYm((r) => (r.total_rental_fee ?? 0) / EOK);
  const salesSpark = byYm((r) => (r.sales ?? 0) / EOK);

  // ── 카테고리 그룹(6그룹) 성과 ──────────────────────────
  type GroupAgg = {
    cnt: number;
    cntPrev: number;
    amount: number;
    sales: number;
    salesPrev: number;
    margin: number;
  };
  const emptyGroup = (): GroupAgg => ({
    cnt: 0,
    cntPrev: 0,
    amount: 0,
    sales: 0,
    salesPrev: 0,
    margin: 0,
  });
  const groupAgg = new Map<string, GroupAgg>();
  const groupOf = (key: string) => {
    let a = groupAgg.get(key);
    if (!a) {
      a = emptyGroup();
      groupAgg.set(key, a);
    }
    return a;
  };
  for (const r of currRows) {
    const a = groupOf(catGroupOf(r.category));
    a.cnt += 1;
    a.amount += r.total_rental_fee ?? 0;
    a.sales += r.sales ?? 0;
    a.margin += r.contribution_margin ?? 0;
  }
  for (const r of prevRows) {
    const a = groupOf(catGroupOf(r.category));
    a.cntPrev += 1;
    a.salesPrev += r.sales ?? 0;
  }
  const groupRows: GroupRow[] = CATEGORY_GROUPS.map((g) => ({
    key: g.key,
    axis: g.axis,
    note: g.note,
    ...(groupAgg.get(g.key) ?? emptyGroup()),
  })).filter((g) => g.cnt > 0 || g.cntPrev > 0);

  // ── 세부 카테고리 카드 ─────────────────────────────────
  const catKeyOf = (r: CardContractRow) => {
    const c = r.category ?? "";
    return MAPPED_CATS.has(c) ? c : "그 외";
  };
  const catKeys = [...MAPPED_CATS, "그 외"];
  const categoryCards = buildCategoryCards({
    windowRows: rows12,
    currRows,
    prevRows,
    recentYms,
    dayCut,
    catKeyOf,
    catKeys,
  });
  const visibleCatCards = categoryCards.filter(
    (c) => c.count > 0 || c.countPrev > 0,
  );
  const catCardGroups = CATEGORY_GROUPS.map((g) => g.key).filter((gk) =>
    visibleCatCards.some((c) => c.group === gk),
  );

  return (
    <div className="min-h-screen space-y-[24px] bg-[var(--color-page)] px-10 pt-8 pb-16">
      {/* 제목·기준 배지는 상단 헤더(Header.tsx)가 담당한다 */}
      <Breadcrumb items={[{ label: "카테고리" }]} />

      {/* ── ① 이번 달 요약 ──────────────────────────── */}
      <section>
        <h2 className={`mb-[11px] ${sectionHead}`}>
          {month}월 전체 카테고리 한눈에 보기
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
                spark: cntSpark,
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
            타일의 선 = 최근 12개월 추이 (매월 1–{dayCut}일 같은 기간)
          </div>
        </div>
      </section>

      {/* ── ② 카테고리 그룹 ─────────────────────────── */}
      <section>
        <div className="mb-[11px] flex flex-wrap items-baseline gap-2.5">
          <h2 className={sectionHead}>카테고리 그룹</h2>
          <span className="text-[12px] text-[var(--color-gray-500)]">
            이번 달 성장을 어느 카테고리가 만들었나 · 행 클릭 시 해당 카테고리
            상세로 내려간다
          </span>
        </div>
        <div className={panel}>
          <div className="px-[17px] pt-[16px] pb-[16px]">
            <GroupTable rows={groupRows} totalCount={cnt} />
            <p className="mt-[10px] text-[11px] leading-[1.7] text-[var(--color-gray-500)]">
              {groupRows.map((g, i) => (
                <span key={g.key}>
                  {i > 0 && <span className="mx-1.5">·</span>}
                  <b className="font-bold text-[var(--color-gray-600)]">
                    {g.key}
                  </b>{" "}
                  {g.note}
                </span>
              ))}
            </p>
          </div>
        </div>
      </section>

      {/* ── ③ 세부 카테고리 ─────────────────────────── */}
      <section>
        <div className="mb-[11px] flex flex-wrap items-baseline gap-2.5">
          <h2 className={sectionHead}>세부 카테고리</h2>
          <span className="text-[12px] text-[var(--color-gray-500)]">
            그룹 칩으로 6그룹을 좁혀 본다 · 카드 클릭 시 모델·가격 상세
          </span>
        </div>
        <CategoryCards categories={visibleCatCards} groups={catCardGroups} />
      </section>

      <p className="text-[11px] leading-[1.7] text-[var(--color-gray-400)]">
        출처: <code>raw_contracts</code>(계약완료) · 기준 구간은 홈·헤더와 동일한{" "}
        <code>getPeriod()</code> · 카테고리 매핑은{" "}
        <code>lib/biz-category.ts</code> 하나만 쓴다.
      </p>
    </div>
  );
}
