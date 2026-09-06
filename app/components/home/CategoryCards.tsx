"use client";

import { useState } from "react";
import Link from "next/link";
import Sparkline from "./Sparkline";
import { judgeState, paceColor } from "@/lib/status";
import {
  CARD_GRID,
  CARD_SHELL,
  STATE_PILL,
  TAG,
  deltaArrow,
  deltaColor,
  filterChip,
  paceFraction,
  manwon,
} from "./cardKit";

export type CategoryCard = {
  /** 상품 카테고리 (정수기, 로봇청소기 …) */
  label: string;
  /** 대카테고리 — 그룹 필터 단위 */
  group: string;
  /** 매출 (억) */
  sales: number;
  salesPrev: number;
  /** 최근 3개월 같은 기간(1일~기준일) 매출 평균 = "평소 페이스" (억) */
  pace: number;
  count: number;
  countPrev: number;
  /** 거래액 GMV (억) */
  amount: number;
  /** 건당 공헌이익 (원) */
  cpu: number;
  /** 주력 렌탈사와 그 비중 */
  topCompany: string;
  topShare: number;
  rank: number;
  prevRank: number;
  /** 12개월 매출 추이 (억) */
  spark: number[];
};

const SORTS = [
  { key: "change", label: "매출 변화폭 큰 순" },
  { key: "sales", label: "매출 순" },
  { key: "count", label: "거래건수 순" },
  { key: "cpu", label: "건당 공헌이익 순" },
] as const;

/**
 * 매출 변화를 물량 효과와 단가 효과로 쪼갠다.
 *
 *   매출 = 건수 × 건당매출
 *   물량효과 = Δ건수 × 전월 건당매출
 *   단가효과 = Δ건당매출 × 이번달 건수
 *
 * 두 항의 합은 매출 Δ와 정확히 일치한다. "건수가 빠져서 매출이 빠진 것"과
 * "건수는 그대로인데 단가가 빠진 것"은 원인도 대응 부서도 다르다.
 */
function decompose(c: CategoryCard) {
  const deltaSales = c.sales - c.salesPrev;
  if (c.count <= 0 || c.countPrev <= 0) return null;
  const unitPrev = c.salesPrev / c.countPrev;
  const unitCurr = c.sales / c.count;
  const volume = (c.count - c.countPrev) * unitPrev;
  const price = (unitCurr - unitPrev) * c.count;
  const countChg = (c.count / c.countPrev - 1) * 100;
  const unitChg = (unitCurr / unitPrev - 1) * 100;
  return {
    deltaSales,
    volume,
    price,
    countChg,
    unitChg,
    // 어느 쪽이 더 크게 움직였나 — 부호가 아니라 절대 크기로 정한다
    driver: Math.abs(volume) >= Math.abs(price) ? "물량" : "단가",
  };
}

/**
 * 억 단위 값을 자릿수에 맞춰 표기한다.
 *
 * 카테고리별 매출은 정수기 2.7억부터 타이어 40만원까지 두 자릿수 이상
 * 벌어진다. 억으로 통일하면 작은 카테고리가 전부 "0.0억"이 되어 카드가
 * 아무 말도 하지 않는다.
 */
function money(v: number): { num: string; unit: string } {
  if (Math.abs(v) >= 1) return { num: v.toFixed(1), unit: "억" };
  return { num: Math.round(v * 10_000).toLocaleString("ko-KR"), unit: "만원" };
}

function moneyText(v: number) {
  const m = money(v);
  return `${m.num}${m.unit}`;
}

function moneySigned(v: number) {
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${moneyText(Math.abs(v))}`;
}

export default function CategoryCards({
  categories,
  groups,
}: {
  categories: CategoryCard[];
  groups: string[];
}) {
  // 기본 정렬이 "매출 변화폭 큰 순"인 이유: 1위가 정수기인 건 매달 같은
  // 사실이라 정보가 없다. 이번 달 뭐가 달라졌는지가 정보다.
  const [sort, setSort] = useState<string>("change");
  const [group, setGroup] = useState<string>("all");

  const list = categories
    .filter((c) => group === "all" || c.group === group)
    .slice()
    .sort((a, b) => {
      if (sort === "sales") return b.sales - a.sales;
      if (sort === "count") return b.count - a.count;
      if (sort === "cpu") return b.cpu - a.cpu;
      const da = a.salesPrev > 0 ? Math.abs(a.sales / a.salesPrev - 1) : 0;
      const db = b.salesPrev > 0 ? Math.abs(b.sales / b.salesPrev - 1) : 0;
      return db - da;
    });

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-[7px]">
        <span className="mr-0.5 text-[11px] font-bold text-[var(--color-gray-400)]">
          정렬
        </span>
        {SORTS.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={sort === s.key}
            onClick={() => setSort(s.key)}
            className={filterChip(sort === s.key)}
          >
            {s.label}
          </button>
        ))}
        {/* 그룹이 하나뿐인 화면(카테고리 상세)에서는 필터가 정보가 아니다 */}
        {groups.length > 0 && (
          <>
            <span className="w-3" />
            <span className="mr-0.5 text-[11px] font-bold text-[var(--color-gray-400)]">
              그룹
            </span>
            <button
              type="button"
              aria-pressed={group === "all"}
              onClick={() => setGroup("all")}
              className={filterChip(group === "all")}
            >
              전체
            </button>
            {groups.map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={group === g}
                onClick={() => setGroup(g)}
                className={filterChip(group === g)}
              >
                {g}
              </button>
            ))}
          </>
        )}
      </div>

      <div className={CARD_GRID}>
        {list.map((c) => {
          const st = judgeState(c.sales, c.pace);
          const chg =
            c.salesPrev > 0 ? (c.sales / c.salesPrev - 1) * 100 : 0;
          const dirCol = deltaColor(chg);
          const arrow = deltaArrow(chg);
          const rankMove = c.prevRank - c.rank;
          const paceFrac = paceFraction(st.idx);
          const dec = decompose(c);
          // 카드는 세부 카테고리 상세로 내려간다 — 새 IA의 드릴다운 흐름.
          // "그 외"는 상세 페이지가 없으므로 트렌드 화면으로 보낸다.
          const isRest = c.label === "그 외";
          const href = isRest
            ? `/category-trends?group=${encodeURIComponent(c.group)}`
            : `/category/${encodeURIComponent(c.label)}`;

          return (
            <Link
              key={c.label}
              href={href}
              aria-label={`${c.label} 매출 ${moneyText(c.sales)}, ${st.text}`}
              className={CARD_SHELL}
            >
              <div className="flex items-start justify-between gap-[9px]">
                <div>
                  <div className="text-[14px] font-bold leading-[1.25] tracking-[-.3px]">
                    {c.label}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-[5px]">
                    <span className={TAG}>{c.group}</span>
                    <span className="num rounded-[4px] bg-[var(--color-gray-100)] px-[5px] py-0.5 font-mono text-[10px] font-bold text-[var(--color-gray-500)]">
                      #{c.rank}
                      {rankMove !== 0 && (
                        <em
                          className="not-italic"
                          style={{
                            color:
                              rankMove > 0
                                ? "var(--color-up)"
                                : "var(--color-down)",
                          }}
                        >
                          {" "}
                          {rankMove > 0 ? "▲" : "▼"}
                          {Math.abs(rankMove)}
                        </em>
                      )}
                    </span>
                  </div>
                </div>
                <span
                  className={STATE_PILL}
                  style={{ color: st.color, background: st.background }}
                >
                  {st.text}
                </span>
              </div>

              <div className="flex items-end justify-between gap-2.5">
                <div className="num text-[27px] font-bold leading-none tracking-[-1px]">
                  {money(c.sales).num}
                  <i className="ml-0.5 text-[12px] font-semibold not-italic tracking-normal text-[var(--color-gray-500)]">
                    {money(c.sales).unit}
                  </i>
                </div>
                <div
                  className="num text-right text-[12px] font-bold leading-[1.35]"
                  style={{ color: dirCol }}
                >
                  {arrow} {Math.abs(chg).toFixed(1)}%
                  <small className="block text-[10px] font-medium text-[var(--color-gray-400)]">
                    전월 동기간 {moneyText(c.salesPrev)}
                  </small>
                </div>
              </div>

              {/* 매출이 왜 움직였나 — 물량이냐 단가냐 */}
              {dec && (
                <div className="rounded-[6px] bg-[var(--color-gray-25)] px-2 py-[7px]">
                  <div className="flex items-baseline justify-between gap-2 text-[11px]">
                    <span className="text-[var(--color-gray-500)]">건수</span>
                    <b
                      className="num font-bold"
                      style={{ color: deltaColor(dec.countChg) }}
                    >
                      {deltaArrow(dec.countChg)}{" "}
                      {Math.abs(dec.countChg).toFixed(1)}%
                    </b>
                    <span className="text-[var(--color-gray-300)]">·</span>
                    <span className="text-[var(--color-gray-500)]">
                      건당단가
                    </span>
                    <b
                      className="num font-bold"
                      style={{ color: deltaColor(dec.unitChg) }}
                    >
                      {deltaArrow(dec.unitChg)}{" "}
                      {Math.abs(dec.unitChg).toFixed(1)}%
                    </b>
                  </div>
                  <div className="mt-1 text-[10px] text-[var(--color-gray-400)]">
                    <b className="font-bold text-[var(--color-gray-600)]">
                      {dec.driver}
                    </b>{" "}
                    쪽이 더 크게 움직임 · 물량{" "}
                    <span className="num">{moneySigned(dec.volume)}</span> / 단가{" "}
                    <span className="num">{moneySigned(dec.price)}</span>
                  </div>
                </div>
              )}

              <div>
                <div className="mb-1 flex items-baseline justify-between text-[11px] text-[var(--color-gray-500)]">
                  <span>평소 페이스 대비</span>
                  <b className="num font-bold" style={{ color: paceColor(st.idx) }}>
                    {st.idx.toFixed(0)}%
                  </b>
                </div>
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-[var(--color-gray-100)]">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${Math.max(1.5, paceFrac * 100)}%`,
                      background: paceColor(st.idx),
                    }}
                  />
                  <div
                    className="absolute inset-y-0 w-0.5 bg-[var(--color-gray-900)]/55"
                    style={{ left: `${(100 / 130) * 100}%` }}
                  />
                </div>
                <div className="mt-1 text-[10px] text-[var(--color-gray-400)]">
                  최근 3개월 같은 기간 평균 {moneyText(c.pace)}
                </div>
              </div>

              <Sparkline values={c.spark} color={dirCol} width={250} height={34} />

              <div className="space-y-2 border-t border-[var(--color-line-2)] pt-[9px]">
                <div className="flex items-end justify-between gap-2">
                  {[
                    { k: "거래건수", v: `${c.count.toLocaleString("ko-KR")}건` },
                    { k: "거래액", v: moneyText(c.amount) },
                    {
                      k: "건당 공헌이익",
                      v: manwon(c.cpu),
                    },
                  ].map((m, i) => (
                    <div
                      key={m.k}
                      className={`flex min-w-0 flex-col gap-0.5 ${i === 2 ? "items-end" : ""}`}
                    >
                      <span className="truncate text-[10px] font-semibold text-[var(--color-gray-400)]">
                        {m.k}
                      </span>
                      <b className="num text-[12px] font-bold tracking-[-.2px]">
                        {m.v}
                      </b>
                    </div>
                  ))}
                </div>
                <span className="block truncate text-[10px] font-semibold text-[var(--color-gray-400)]">
                  주력 렌탈사 {c.topCompany} {c.topShare.toFixed(0)}%
                </span>
              </div>

              {/* 목적지를 숨기지 않는다 */}
              <div className="flex items-center justify-between gap-1.5 border-t border-dashed border-[var(--color-gray-200)] pt-2">
                <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold tracking-[-.2px] text-[var(--color-gray-400)] before:text-[9px] before:content-['↗'] group-hover:text-[var(--color-primary)]">
                  <b className="font-semibold text-[var(--color-gray-500)] group-hover:text-[var(--color-primary)]">
                    {isRest ? "/category-trends" : "/category/"}
                  </b>
                  <q className="font-bold text-[var(--color-primary)] [quotes:none]">
                    {isRest ? `?group=${c.group}` : c.label}
                  </q>
                </span>
                <span className="text-[10px] text-[var(--color-gray-400)]">
                  {isRest ? "월별·주차별 상세" : "모델·가격 상세"}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
