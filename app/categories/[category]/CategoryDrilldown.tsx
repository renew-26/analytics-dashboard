"use client";

import { useState } from "react";
import Link from "next/link";
import WaterfallPanel, {
  type WaterfallMetric,
} from "@/app/components/home/WaterfallPanel";

/**
 * 이 화면에서는 막대와 기여 목록이 같은 렌탈사 축이다(대카테고리 → 렌탈사
 * 2단계가 아니라, 렌탈사 1축을 차트와 top-N으로 두 번 보여줄 뿐) — 홈의
 * "1단계/2단계" 문구를 그대로 쓰면 거짓이 되므로 이 화면 전용 문구로 바꾼다.
 */
const WATERFALL_LABELS = {
  axisBadge: "렌탈사",
  moversTitle: "가장 크게 움직인 렌탈사",
  moversSubtitle: "펼치면 브랜드별로 갈라집니다",
  moversHintTail: "상품은 아래 표에서",
};
import CategoryMonthlyChart, {
  type CategoryMonthPoint,
} from "@/app/components/CategoryMonthlyChart";
import { type AxisAgg } from "@/lib/category-aggregate";
import { type ConvStats } from "@/lib/conversion";
import { EOK, MAN, fmt, signedInt } from "@/lib/format";
import { topic } from "@/lib/korean";
import { manwon, deltaColor } from "@/app/components/home/cardKit";

export type ProductDelta = {
  product: string;
  cnt: number;
  cntPrev: number;
  /** 원 단위 — 표시할 때 만원으로 나눈다 */
  sales: number;
  margin: number;
  href?: string;
};

/** 브랜드 하나 + 그 브랜드의 당월 계약완료 상위 상품 */
export type BrandGroup = {
  label: string;
  cnt: number;
  cntPrev: number;
  sales: number;
  margin: number;
  /** 상위 N 밖으로 밀린 상품 수 — 머리줄 합계가 아래 줄 합보다 큰 이유 */
  moreProducts: number;
  products: ProductDelta[];
};

/** 상위 N 밖으로 접힌 브랜드 묶음들의 합계 — 열이 카테고리 합계와 맞게 */
export type BrandRest = {
  brands: number;
  cnt: number;
  cntPrev: number;
  sales: number;
  margin: number;
};

/** ③ 아래에 세우는 월별 추이 차트 한 장 */
export type TrendChart = {
  title: string;
  subtitle: string;
  seriesKey: string;
  color: string;
  unit: string;
  data: CategoryMonthPoint[];
  /** 밑동을 0 으로 못박은 축 범위 */
  yDomain: [number, number];
};

/** 브랜드 묶음의 스크롤 앵커 — ④의 렌탈사 이름이 여기로 보낸다 */
import { REST_ANCHOR_ID, brandAnchorId } from "./brand-anchor";

/**
 * 건수 증감 — 비율이 아니라 절대 건수라 데드존(±1.5)을 쓰지 않는다.
 * `Delta` 는 증감률 전용이라 `+1건` 을 넘기면 회색 `—` 로 죽는다.
 */
function DeltaCount({ value }: { value: number }) {
  if (value === 0)
    return <span className="num text-[var(--color-gray-400)]">—</span>;
  return (
    <span className="num font-semibold" style={{ color: deltaColor(value, 0) }}>
      {signedInt(value)}
      <i className="ml-0.5 text-[10px] font-medium not-italic text-[var(--color-gray-500)]">
        건
      </i>
    </span>
  );
}

/** 만원 금액 — 단위는 값보다 작고 흐리게 (DESIGN.md 타이포그래피) */
function Manwon({ won }: { won: number }) {
  return (
    <>
      {fmt(won / MAN)}
      <i className="ml-0.5 text-[10px] font-medium not-italic text-[var(--color-gray-500)]">
        만원
      </i>
    </>
  );
}

/**
 * 렌탈사(1차) → 브랜드(2차) → 상품(3차) 드릴다운.
 *
 * ④ 렌탈사 표의 행 클릭이 ⑤ 브랜드 묶음으로 스크롤하는 상호작용을 가지고
 * 있어 서버 컴포넌트로는 못 나눈다 — 그 부분만 여기로 내렸다.
 */
export default function CategoryDrilldown({
  groupKey,
  metrics,
  trendCharts,
  companies,
  coHref,
  topBrandByCompany,
  convByCompany,
  brandGroups,
  brandRest,
  productLimit,
  initialCompany,
  panelClass,
  sectionHead,
}: {
  groupKey: string;
  metrics: WaterfallMetric[];
  trendCharts: TrendChart[];
  companies: AxisAgg[];
  /** 렌탈사 → 상세 경로. COMPANY_LABELS 에 없는 이름은 키가 없다. */
  coHref: Record<string, string>;
  /** 렌탈사 → ⑤에서 스크롤해 갈 브랜드. 당월 계약이 0건이면 키가 없다. */
  topBrandByCompany: Record<string, string>;
  convByCompany: Record<string, ConvStats>;
  brandGroups: BrandGroup[];
  /** 상위 N 밖으로 접힌 묶음들. 접을 게 없으면 없다. */
  brandRest?: BrandRest;
  productLimit: number;
  /** ?company= 딥링크. 목록에 없으면 무시하고 1위 렌탈사를 연다. */
  initialCompany?: string;
  panelClass: string;
  sectionHead: string;
}) {
  const valid = companies.some((c) => c.label === initialCompany);
  const [selected, setSelected] = useState<string>(
    valid ? initialCompany! : (companies[0]?.label ?? ""),
  );
  const totalCnt = companies.reduce((s, c) => s + c.cnt, 0);

  // ④ → ⑤ 이동 대상. 당월 계약이 0건인 렌탈사(주문만 있는 곳)는 브랜드 묶음이
  // 없으므로 앵커도 없다 — 죽은 링크 대신 링크를 안 건다. 상위 N 밖으로 접힌
  // 브랜드면 그 브랜드를 삼킨 "그 외" 줄로 보낸다.
  const shownBrands = new Set(brandGroups.map((g) => g.label));
  const anchorOf = (company: string) => {
    const brand = topBrandByCompany[company];
    if (!brand) return undefined;
    if (shownBrands.has(brand)) return brandAnchorId(brand);
    return brandRest ? REST_ANCHOR_ID : undefined;
  };

  // ⑤는 더 이상 렌탈사로 걸러지지 않는다 — 행 클릭은 필터가 아니라 이동이다.
  // 이름 자체는 진짜 링크(<a href="#...">)라 키보드·JS 없이도 간다. 이 핸들러는
  // 행 아무 데나 누른 마우스용이고, 링크 쪽은 stopPropagation 으로 갈라 둘이
  // 같은 스크롤을 두 번 시키지 않게 한다.
  const goToBrand = (company: string) => {
    setSelected(company);
    const id = anchorOf(company);
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  const th =
    "bg-[var(--color-gray-25)] p-[8px_12px] text-right text-[11px] font-bold whitespace-nowrap text-[var(--color-gray-400)]";
  const td = "p-[8px_12px] text-right whitespace-nowrap";

  return (
    <>
      {/* ── ③ 왜 변했나 ─────────────────────────────── */}
      <section>
        <h2 className={`mb-[11px] ${sectionHead}`}>
          이번 달 {topic(groupKey)} 왜 변했나
        </h2>
        <WaterfallPanel
          metrics={metrics}
          panelClass={panelClass}
          labels={WATERFALL_LABELS}
        />
        {trendCharts.length > 0 && (
          <div className="mt-[11px] grid grid-cols-1 gap-[11px] xl:grid-cols-2">
            {trendCharts.map((c) => (
              <CategoryMonthlyChart
                key={c.seriesKey}
                title={c.title}
                subtitle={c.subtitle}
                data={c.data}
                series={[{ key: c.seriesKey, color: c.color }]}
                yDomain={c.yDomain}
                unit={c.unit}
                hollowLast
              />
            ))}
          </div>
        )}
      </section>

      {/* ── ④ 렌탈사별 성과 ─────────────────────────── */}
      <section>
        <h2 className={`mb-[11px] ${sectionHead}`}>렌탈사별 성과</h2>
        <div className={`${panelClass} overflow-x-auto`}>
          <table className="w-full min-w-[900px] bg-white text-[12px]">
            <thead>
              <tr>
                <th className={`${th} text-left`}>렌탈사</th>
                <th className={th}>계약</th>
                <th className={th}>전월</th>
                <th className={th}>증감</th>
                <th className={th}>점유율</th>
                <th className={th}>전환율</th>
                <th className={th}>리드타임</th>
                <th className={th}>거래액(억)</th>
                <th className={th}>매출(억)</th>
                <th className={th}>건당 공헌이익</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => {
                const cv = convByCompany[c.label];
                const on = c.label === selected;
                const anchor = anchorOf(c.label);
                return (
                  <tr
                    key={c.label}
                    onClick={() => goToBrand(c.label)}
                    className={`border-t border-[var(--color-line-2)] ${
                      anchor ? "cursor-pointer" : ""
                    } ${
                      on
                        ? "bg-[var(--color-primary-50)]"
                        : "hover:bg-[var(--color-gray-25)]"
                    }`}
                  >
                    <td className="p-[8px_12px] text-left">
                      {/* 행 전체 클릭(마우스)은 그대로 두고, 이동 자체는 이
                          앵커에 둔다 — 진짜 링크라야 포커스가 목적지로 따라가고
                          JS 없이도 간다. 셀 안에 이미 Link 가 있어 행을 통째로
                          감쌀 수는 없다(인터랙티브 요소 중첩 금지). */}
                      {anchor ? (
                        <a
                          href={`#${anchor}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(c.label);
                          }}
                          className="press rounded-[4px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
                        >
                          {c.label}
                        </a>
                      ) : (
                        <span className="font-semibold">{c.label}</span>
                      )}
                      {/* 이름은 ⑤로 가는 앵커라 상세로 가는 길이 따로 필요하다.
                          경로를 병기하고, 클릭이 이동까지 발동하지 않게 막는다. */}
                      {coHref[c.label] && (
                        <Link
                          href={coHref[c.label]}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-px block font-mono text-[10px] text-[var(--color-gray-400)] hover:text-[var(--color-primary)] hover:underline"
                        >
                          {decodeURIComponent(coHref[c.label])}
                          <span aria-hidden> ↗</span>
                        </Link>
                      )}
                    </td>
                    <td className={`${td} num`}>{fmt(c.cnt)}</td>
                    <td className={`${td} num text-[var(--color-gray-500)]`}>
                      {fmt(c.cntPrev)}
                    </td>
                    <td className={td}>
                      <DeltaCount value={c.cnt - c.cntPrev} />
                    </td>
                    <td className={`${td} num`}>
                      {totalCnt > 0
                        ? `${((c.cnt / totalCnt) * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                    <td className={`${td} num`}>
                      {cv?.rate == null
                        ? "—"
                        : `${(cv.rate * 100).toFixed(0)}%`}
                    </td>
                    <td className={`${td} num`}>
                      {cv?.avgDays == null ? "—" : `${cv.avgDays.toFixed(1)}일`}
                    </td>
                    <td className={`${td} num`}>{(c.amount / EOK).toFixed(2)}</td>
                    <td className={`${td} num`}>{(c.sales / EOK).toFixed(2)}</td>
                    <td className={`${td} num`}>
                      {manwon(c.cnt > 0 ? c.margin / c.cnt : 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-[6px] text-[11px] text-[var(--color-gray-500)]">
          행을 누르면 아래 브랜드별 상품 성과에서 그 렌탈사의 브랜드 묶음으로
          이동한다.
        </p>
      </section>

      {/* ── ⑤ 브랜드별 상품 성과 ───────────────────── */}
      <section>
        <div className="mb-[11px] flex flex-wrap items-baseline gap-2.5">
          <h2 className={sectionHead}>브랜드별 상품 성과</h2>
          <span className="text-[12px] text-[var(--color-gray-500)]">
            카테고리 전체 · 브랜드마다 계약완료 상위{" "}
            <b className="num text-[var(--color-gray-700)]">{productLimit}</b>개
            {brandRest && (
              <>
                {" "}
                · 브랜드 묶음은 상위{" "}
                <b className="num text-[var(--color-gray-700)]">
                  {brandGroups.length}
                </b>
                개 (나머지는 마지막 한 줄에 합계)
              </>
            )}
          </span>
        </div>
        {/* 세로 스크롤을 이 상자가 가져가야 머리줄이 붙어 있는다 — 페이지가
            스크롤하면 sticky 가 걸릴 스크롤 컨테이너가 없다. */}
        <div className={`${panelClass} max-h-[70vh] overflow-auto`}>
          <table className="w-full min-w-[760px] bg-white text-[12px]">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className={`${th} text-left`}>상품</th>
                <th className={th}>계약완료</th>
                <th className={th}>전월</th>
                <th className={th}>증감</th>
                <th className={th}>매출</th>
                <th className={th}>건당 공헌이익</th>
              </tr>
            </thead>
            {brandGroups.map((g) => (
              <tbody
                key={g.label}
                id={brandAnchorId(g.label)}
                className="scroll-mt-[16px]"
              >
                <tr className="border-t border-[var(--color-gray-250)] bg-[var(--color-gray-25)]">
                  <th
                    scope="rowgroup"
                    className="p-[8px_12px] text-left font-bold text-[var(--color-gray-900)]"
                  >
                    {g.label}
                    {/* 머리줄 합계가 아래 다섯 줄의 합보다 큰 이유를 그 자리에서
                        댄다 — 섹션 머리의 "상위 5개"는 22번째 묶음까지 내려오면
                        이미 화면 밖이다. */}
                    {g.moreProducts > 0 && (
                      <span className="ml-1.5 text-[11px] font-medium text-[var(--color-gray-500)]">
                        외 <span className="num">{fmt(g.moreProducts)}</span>개
                        상품
                      </span>
                    )}
                  </th>
                  <td className={`${td} num font-bold`}>{fmt(g.cnt)}</td>
                  <td className={`${td} num text-[var(--color-gray-500)]`}>
                    {fmt(g.cntPrev)}
                  </td>
                  <td className={td}>
                    <DeltaCount value={g.cnt - g.cntPrev} />
                  </td>
                  <td className={`${td} num`}>
                    <Manwon won={g.sales} />
                  </td>
                  <td className={`${td} num`}>
                    {manwon(g.cnt > 0 ? g.margin / g.cnt : 0)}
                  </td>
                </tr>
                {g.products.length === 0 ? (
                  <tr className="border-t border-[var(--color-line-2)]">
                    <td
                      colSpan={6}
                      className="p-[8px_12px] pl-[26px] text-left text-[var(--color-gray-400)]"
                    >
                      당월 계약완료 없음
                    </td>
                  </tr>
                ) : (
                  g.products.map((p) => (
                    <tr
                      key={p.product}
                      className="border-t border-[var(--color-line-2)] hover:bg-[var(--color-gray-25)]"
                    >
                      <td className="max-w-[360px] p-[8px_12px] pl-[26px] text-left">
                        {p.href ? (
                          <Link href={p.href} className="group/prod block">
                            <span className="block truncate font-medium text-[var(--color-gray-900)] group-hover/prod:text-[var(--color-primary)] group-hover/prod:underline">
                              {p.product}
                            </span>
                          </Link>
                        ) : (
                          <span className="block truncate font-medium text-[var(--color-gray-900)]">
                            {p.product}
                          </span>
                        )}
                      </td>
                      <td className={`${td} num`}>{fmt(p.cnt)}</td>
                      <td className={`${td} num text-[var(--color-gray-500)]`}>
                        {fmt(p.cntPrev)}
                      </td>
                      <td className={td}>
                        <DeltaCount value={p.cnt - p.cntPrev} />
                      </td>
                      <td className={`${td} num`}>
                        <Manwon won={p.sales} />
                      </td>
                      <td className={`${td} num`}>
                        {manwon(p.cnt > 0 ? p.margin / p.cnt : 0)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            ))}
            {/* 접힌 묶음 한 줄 — 합계를 실어 열이 카테고리 합계와 맞게 둔다 */}
            {brandRest && (
              <tbody id={REST_ANCHOR_ID} className="scroll-mt-[16px]">
                <tr className="border-t border-[var(--color-gray-250)] bg-[var(--color-gray-25)]">
                  <th
                    scope="rowgroup"
                    className="p-[8px_12px] text-left font-bold text-[var(--color-gray-600)]"
                  >
                    그 외 <span className="num">{fmt(brandRest.brands)}</span>개
                    브랜드
                  </th>
                  <td className={`${td} num font-bold`}>{fmt(brandRest.cnt)}</td>
                  <td className={`${td} num text-[var(--color-gray-500)]`}>
                    {fmt(brandRest.cntPrev)}
                  </td>
                  <td className={td}>
                    <DeltaCount value={brandRest.cnt - brandRest.cntPrev} />
                  </td>
                  <td className={`${td} num`}>
                    <Manwon won={brandRest.sales} />
                  </td>
                  <td className={`${td} num`}>
                    {manwon(
                      brandRest.cnt > 0 ? brandRest.margin / brandRest.cnt : 0,
                    )}
                  </td>
                </tr>
              </tbody>
            )}
          </table>
        </div>
        <p className="mt-[6px] text-[11px] text-[var(--color-gray-500)]">
          매출·공헌이익은 이번 달 기준 구간 합계 · 상품명 클릭 → 상품 상세
        </p>
      </section>
    </>
  );
}
