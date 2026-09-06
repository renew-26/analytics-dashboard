"use client";

import { useState } from "react";
import Link from "next/link";
import Sparkline from "./Sparkline";
import { TIER_META, type Tier } from "@/lib/tiers";
import { judgeState, paceColor } from "@/lib/status";
import {
  CARD_SHELL,
  CAT_COLORS,
  STATE_PILL,
  TAG,
  deltaArrow,
  deltaColor,
  filterChip,
  paceFraction,
  manwon,
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

/** 티어 필터 탭 — T3와 미판정을 "기타"로 묶는다 (스펙: 전체/T1/T2/기타) */
const TIER_TABS = [
  { key: "all", label: "전체" },
  { key: "T1", label: "T1" },
  { key: "T2", label: "T2" },
  { key: "etc", label: "기타" },
] as const;

type Judged = { c: CompanyCard; st: ReturnType<typeof judgeState> };

/** 강조 카드 한 장 — 이상 징후·상위 성과만 카드로 세운다 */
function HighlightCard({ c, st }: Judged) {
  const chg = c.prev > 0 ? (c.curr / c.prev - 1) * 100 : 0;
  const dirCol = deltaColor(chg);
  const arrow = deltaArrow(chg);
  const rankMove = c.prevRank - c.rank;
  const heatSum = c.heat.reduce((a, b) => a + b, 0) || 1;
  const paceFrac = paceFraction(st.idx);

  return (
    <Link
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
                      rankMove > 0 ? "var(--color-up)" : "var(--color-down)",
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
        <span
          className={STATE_PILL}
          style={{ color: st.color, background: st.background }}
        >
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
          최근 3개월 같은 기간 평균 {Math.round(c.pace).toLocaleString("ko-KR")}
          건
        </div>
      </div>

      <Sparkline values={c.spark} color={dirCol} width={250} height={34} />

      <div className="space-y-2 border-t border-[var(--color-line-2)] pt-[9px]">
        <div className="flex items-end justify-between gap-2">
          {[
            { k: "거래액", v: `${c.amount.toFixed(1)}억` },
            { k: "매출", v: `${c.sales.toFixed(1)}억` },
            { k: "건당 공헌이익", v: manwon(c.cpu) },
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
          카테고리·상품 상세
        </span>
      </div>
    </Link>
  );
}

/**
 * 전체 렌탈사 탐색 — 테이블이 기본이고, 카드는 "지금 봐야 하는 곳"
 * (이상·확인 필요)과 증가 기여 상위만 강조로 세운다. 전 렌탈사를 카드로
 * 나열하면 훑는 데 오래 걸리고 비교가 안 된다.
 */
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

  const list: Judged[] = companies
    .filter((c) => group === "all" || c.group === group)
    .filter((c) => {
      if (tier === "all") return true;
      if (tier === "etc") return !c.tier || c.tier === "T3";
      return c.tier === tier;
    })
    .map((c) => ({ c, st: judgeState(c.curr, c.pace) }))
    .sort((a, b) => {
      if (sort === "volume") return b.c.curr - a.c.curr;
      if (sort === "sales") return b.c.sales - a.c.sales;
      if (sort === "cpu") return b.c.cpu - a.c.cpu;
      const da = a.c.prev > 0 ? Math.abs(a.c.curr / a.c.prev - 1) : 0;
      const db = b.c.prev > 0 ? Math.abs(b.c.curr / b.c.prev - 1) : 0;
      return db - da;
    });

  // 강조 카드 — 이상(우선)·확인 필요 최대 4장 + 증가 기여 상위 2장
  const anomalies = list
    .filter((x) => x.st.state !== "ok" && x.c.pace >= 5)
    .sort((a, b) => {
      if (a.st.state !== b.st.state) return a.st.state === "crit" ? -1 : 1;
      return Math.abs(b.st.idx - 100) - Math.abs(a.st.idx - 100);
    })
    .slice(0, 4);
  const anomalySet = new Set(anomalies.map((x) => x.c.label));
  const topGainers = list
    .filter((x) => !anomalySet.has(x.c.label) && x.c.curr - x.c.prev > 0)
    .sort((a, b) => b.c.curr - b.c.prev - (a.c.curr - a.c.prev))
    .slice(0, 2);
  const highlights = [...anomalies, ...topGainers];

  const chip = filterChip;
  const th =
    "bg-[var(--color-gray-25)] p-[9px_10px] text-right text-[11px] font-bold whitespace-nowrap text-[var(--color-gray-400)]";
  const td = "p-[8px_10px] text-right whitespace-nowrap";

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-[7px]">
        {/* 티어 탭 — 화면 안 필터다. T1/T2를 별도 페이지로 만들지 않는다 */}
        {hasTiers && (
          <>
            <span className="mr-0.5 text-[11px] font-bold text-[var(--color-gray-400)]">
              티어
            </span>
            {TIER_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                aria-pressed={tier === t.key}
                onClick={() => setTier(t.key)}
                className={chip(tier === t.key)}
                title={
                  t.key === "T1" || t.key === "T2"
                    ? TIER_META[t.key as Tier].desc
                    : t.key === "etc"
                      ? "T3 및 티어 미판정"
                      : undefined
                }
              >
                {t.label}
              </button>
            ))}
            <span className="w-3" />
          </>
        )}
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
        <span className="w-3" />
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
      </div>

      {/* 지금 봐야 하는 곳 — 카드는 여기까지만 */}
      {highlights.length > 0 && (
        <div className="mb-4">
          <div className="mb-2 text-[12px] font-bold text-[var(--color-gray-600)]">
            지금 봐야 하는 곳
            <span className="ml-2 text-[11px] font-medium text-[var(--color-gray-400)]">
              이상·확인 필요 + 증가 기여 상위 — 나머지는 아래 표에서
            </span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(272px,1fr))] gap-[13px]">
            {highlights.map((x) => (
              <HighlightCard key={x.c.label} c={x.c} st={x.st} />
            ))}
          </div>
        </div>
      )}

      {/* 전체 목록 — 테이블이 기본이다 */}
      <div className="overflow-hidden rounded-[12px] border border-[var(--color-gray-200)] bg-white shadow-[0_1px_2px_rgba(28,35,56,.04),0_2px_8px_rgba(28,35,56,.05)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-[12px]">
            <thead>
              <tr className="border-b border-[var(--color-gray-200)]">
                <th className={`${th} text-left`}>렌탈사</th>
                <th className={`${th} text-left`}>상태</th>
                <th className={th}>계약완료</th>
                <th className={th}>전월</th>
                <th className={th}>증감</th>
                <th className={th}>평소 대비</th>
                <th className={th}>거래액</th>
                <th className={th}>매출</th>
                <th className={th}>건당 공헌이익</th>
                <th className={`${th} text-left`}>12개월</th>
              </tr>
            </thead>
            <tbody>
              {list.map(({ c, st }) => {
                const chg = c.prev > 0 ? (c.curr / c.prev - 1) * 100 : null;
                return (
                  <tr
                    key={c.label}
                    className="border-t border-[var(--color-line-2)] hover:bg-[var(--color-gray-25)]"
                  >
                    <td className={`${td} text-left`}>
                      <Link
                        href={`/company/${encodeURIComponent(c.label)}`}
                        className="group/co flex items-center gap-[7px]"
                      >
                        <span className="font-bold text-[var(--color-gray-700)] group-hover/co:text-[var(--color-primary)] group-hover/co:underline">
                          {c.label}
                        </span>
                        {c.tier && (
                          <span
                            className="rounded-[4px] px-[5px] py-0.5 text-[10px] font-bold"
                            style={TIER_META[c.tier].chip}
                            title={TIER_META[c.tier].desc}
                          >
                            {c.tier}
                          </span>
                        )}
                        <span className={TAG}>{c.group}</span>
                      </Link>
                    </td>
                    <td className={`${td} text-left`}>
                      <span
                        className="rounded-[4px] px-1.5 py-[3px] text-[10px] font-bold whitespace-nowrap"
                        style={{ color: st.color, background: st.background }}
                      >
                        {st.text}
                      </span>
                    </td>
                    <td className={`${td} num font-bold`}>
                      {c.curr.toLocaleString("ko-KR")}
                    </td>
                    <td className={`${td} num text-[var(--color-gray-500)]`}>
                      {c.prev.toLocaleString("ko-KR")}
                    </td>
                    <td
                      className={`${td} num font-bold`}
                      style={{ color: deltaColor(chg ?? 0) }}
                    >
                      {chg === null
                        ? "—"
                        : `${deltaArrow(chg)} ${Math.abs(chg).toFixed(1)}%`}
                    </td>
                    <td
                      className={`${td} num font-bold`}
                      style={{ color: paceColor(st.idx) }}
                    >
                      {c.pace > 0 ? `${st.idx.toFixed(0)}%` : "—"}
                    </td>
                    <td className={`${td} num`}>{c.amount.toFixed(1)}억</td>
                    <td className={`${td} num`}>{c.sales.toFixed(1)}억</td>
                    <td className={`${td} num`}>{manwon(c.cpu)}</td>
                    <td className={`${td} text-left`}>
                      <Sparkline
                        values={c.spark}
                        color={deltaColor(chg ?? 0)}
                        width={84}
                        height={20}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-[var(--color-line-2)] p-[9px_16px] text-[11px] text-[var(--color-gray-500)]">
          렌탈사명 클릭 → 렌탈사 상세(
          <span className="font-mono text-[10px]">/company/렌탈사</span>) · 평소
          대비 = 최근 3개월 같은 기간 평균 대비 이번 달 계약완료
        </p>
      </div>
    </>
  );
}
