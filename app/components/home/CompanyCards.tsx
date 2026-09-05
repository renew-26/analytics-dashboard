"use client";

import { useState } from "react";
import Link from "next/link";
import Sparkline from "./Sparkline";
import { TIER_META, TIER_ORDER, type Tier } from "@/lib/tiers";
import {
  CARD_GRID,
  CARD_SHELL,
  CAT_COLORS,
  STATE_PILL,
  TAG,
  deltaArrow,
  deltaColor,
  filterChip,
  judgePace,
  paceColor,
  paceFraction,
  manwon,
  stateStyle,
} from "./cardKit";

export type CompanyCard = {
  label: string;
  bm: string;
  group: string;
  curr: number;
  prev: number;
  /** 최근 3개월 같은 기간(1일~기준일) 평균 = "평소 페이스" */
  pace: number;
  /** 거래액 GMV (억) */
  amount: number;
  /** 매출 (억) */
  sales: number;
  /** 전월 동기간 매출 (억) — 홈 매출 급증/급감 신호 판정에 쓴다 */
  salesPrev: number;
  /** 건당 공헌이익 (원) */
  cpu: number;
  topCategory: string;
  topShare: number;
  rank: number;
  prevRank: number;
  spark: number[];
  /** 상위 5개 카테고리 비중 */
  heat: number[];
  /** 렌탈사 티어 — /companies에서만 채워 넣는다 (lib/tiers.ts) */
  tier?: Tier;
};

const SORTS = [
  { key: "change", label: "변화폭 큰 순" },
  { key: "volume", label: "거래건수 순" },
  { key: "sales", label: "매출 순" },
  { key: "cpu", label: "건당 공헌이익 순" },
] as const;

export default function CompanyCards({
  companies,
  groups,
}: {
  companies: CompanyCard[];
  groups: string[];
}) {
  // 기본 정렬이 "변화폭 큰 순"인 이유: 1위가 누구인지는 매달 같은 사실이라
  // 정보가 없다. 이번 달 뭐가 달라졌는지가 정보다.
  const [sort, setSort] = useState<string>("change");
  const [group, setGroup] = useState<string>("all");
  const [tier, setTier] = useState<string>("all");

  const hasTiers = companies.some((c) => c.tier);

  const list = companies
    .filter((c) => group === "all" || c.group === group)
    .filter((c) => tier === "all" || c.tier === tier)
    .slice()
    .sort((a, b) => {
      if (sort === "volume") return b.curr - a.curr;
      if (sort === "sales") return b.sales - a.sales;
      if (sort === "cpu") return b.cpu - a.cpu;
      const da = a.prev > 0 ? Math.abs(a.curr / a.prev - 1) : 0;
      const db = b.prev > 0 ? Math.abs(b.curr / b.prev - 1) : 0;
      return db - da;
    });

  const chip = filterChip;

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
            className={chip(sort === s.key)}
          >
            {s.label}
          </button>
        ))}
        <span className="w-3" />
        <span className="mr-0.5 text-[11px] font-bold text-[var(--color-gray-400)]">
          그룹
        </span>
        <button
          type="button"
          aria-pressed={group === "all"}
          onClick={() => setGroup("all")}
          className={chip(group === "all")}
        >
          전체
        </button>
        {groups.map((g) => (
          <button
            key={g}
            type="button"
            aria-pressed={group === g}
            onClick={() => setGroup(g)}
            className={chip(group === g)}
          >
            {g}
          </button>
        ))}
        {/* 티어 필터 — 티어가 채워진 화면(/companies)에서만 */}
        {hasTiers && (
          <>
            <span className="w-3" />
            <span className="mr-0.5 text-[11px] font-bold text-[var(--color-gray-400)]">
              티어
            </span>
            <button
              type="button"
              aria-pressed={tier === "all"}
              onClick={() => setTier("all")}
              className={chip(tier === "all")}
            >
              전체
            </button>
            {TIER_ORDER.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tier === t}
                onClick={() => setTier(t)}
                className={chip(tier === t)}
                title={TIER_META[t].desc}
              >
                {t}
              </button>
            ))}
          </>
        )}
      </div>

      <div className={CARD_GRID}>
        {list.map((c) => {
          const st = judgePace(c.curr, c.pace);
          const chg = c.prev > 0 ? (c.curr / c.prev - 1) * 100 : 0;
          const dirCol = deltaColor(chg);
          const arrow = deltaArrow(chg);
          const rankMove = c.prevRank - c.rank;
          const heatSum = c.heat.reduce((a, b) => a + b, 0) || 1;
          const paceFrac = paceFraction(st.idx);

          return (
            <Link
              key={c.label}
              href={`/company/${c.label}`}
              aria-label={`${c.label} ${c.curr.toLocaleString("ko-KR")}건, ${st.text}`}
              className={CARD_SHELL}
            >
              <div className="flex items-start justify-between gap-[9px]">
                <div>
                  <div className="text-[14px] font-bold leading-[1.25] tracking-[-.3px]">
                    {c.label}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-[5px]">
                    {c.tier && (
                      <span
                        className="rounded-[4px] px-[5px] py-0.5 text-[10px] font-bold"
                        style={TIER_META[c.tier].chip}
                        title={TIER_META[c.tier].desc}
                      >
                        {c.tier}
                      </span>
                    )}
                    <span className={TAG}>{c.bm}</span>
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
                {/* 색 단독 금지 — 점 + 텍스트 병기 */}
                <span className={STATE_PILL} style={stateStyle(st.cls)}>
                  {st.text}
                </span>
              </div>

              <div className="flex items-end justify-between gap-2.5">
                <div className="num text-[27px] font-bold leading-none tracking-[-1px]">
                  {c.curr.toLocaleString("ko-KR")}
                  <i className="ml-0.5 text-[12px] font-semibold not-italic tracking-normal text-[var(--color-gray-500)]">
                    건
                  </i>
                </div>
                <div
                  className="num text-right text-[12px] font-bold leading-[1.35]"
                  style={{ color: dirCol }}
                >
                  {arrow} {Math.abs(chg).toFixed(1)}%
                  <small className="block text-[10px] font-medium text-[var(--color-gray-400)]">
                    전월 동기간 {c.prev.toLocaleString("ko-KR")}건
                  </small>
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-baseline justify-between text-[11px] text-[var(--color-gray-500)]">
                  <span>평소 페이스 대비</span>
                  <b className="num font-bold" style={{ color: paceColor(st.idx) }}>
                    {st.idx.toFixed(0)}%
                  </b>
                </div>
                {/* 100% 지점에 기준선을 둔 불릿 바 */}
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
                  최근 3개월 같은 기간 평균 {Math.round(c.pace).toLocaleString("ko-KR")}건
                </div>
              </div>

              <Sparkline values={c.spark} color={dirCol} width={250} height={34} />

              <div className="space-y-2 border-t border-[var(--color-line-2)] pt-[9px]">
                <div className="flex items-end justify-between gap-2">
                  {[
                    { k: "거래액", v: `${c.amount.toFixed(1)}억` },
                    { k: "매출", v: `${c.sales.toFixed(1)}억` },
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
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[10px] font-semibold text-[var(--color-gray-400)]">
                    주력 {c.topCategory} {c.topShare.toFixed(0)}%
                  </span>
                  <span className="flex flex-none gap-0.5">
                    {c.heat.map((v, i) => (
                      <i
                        key={i}
                        className="block h-1.5 flex-none rounded-[1px]"
                        style={{
                          width: `${Math.max(3, (v / heatSum) * 62)}px`,
                          background: CAT_COLORS[i],
                          opacity: 0.35 + (v / 100) * 0.65,
                        }}
                      />
                    ))}
                  </span>
                </div>
              </div>

              {/* 목적지를 숨기지 않는다 */}
              <div className="flex items-center justify-between gap-1.5 border-t border-dashed border-[var(--color-gray-200)] pt-2">
                <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold tracking-[-.2px] text-[var(--color-gray-400)] before:text-[9px] before:content-['↗'] group-hover:text-[var(--color-primary)]">
                  <b className="font-semibold text-[var(--color-gray-500)] group-hover:text-[var(--color-primary)]">
                    /company/
                  </b>
                  <q className="font-bold text-[var(--color-primary)] [quotes:none]">
                    {c.label}
                  </q>
                </span>
                <span className="text-[10px] text-[var(--color-gray-400)]">
                  월별·카테고리 상세
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
