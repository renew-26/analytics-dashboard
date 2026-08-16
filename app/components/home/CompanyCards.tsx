"use client";

import { useState } from "react";
import Link from "next/link";
import Sparkline from "./Sparkline";

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
  /** 건당 공헌이익 (원) */
  cpu: number;
  topCategory: string;
  topShare: number;
  rank: number;
  prevRank: number;
  spark: number[];
  /** 상위 5개 카테고리 비중 */
  heat: number[];
};

const CAT_COLORS = [
  "var(--color-cat-1)",
  "var(--color-cat-2)",
  "var(--color-cat-3)",
  "var(--color-cat-4)",
  "var(--color-cat-5)",
];

/** 자기 과거 대비 판정 — 렌탈사별 목표를 새로 입력받지 않아도 성립한다 */
function judge(c: CompanyCard) {
  const idx = c.pace > 0 ? (c.curr / c.pace) * 100 : 100;
  if (idx >= 110) return { cls: "s-hot", text: "호조", idx };
  if (idx >= 90) return { cls: "s-ok", text: "정상", idx };
  if (idx >= 80) return { cls: "s-warn", text: "주의", idx };
  return { cls: "s-crit", text: "이상", idx };
}

function stateStyle(cls: string) {
  switch (cls) {
    case "s-hot":
      return { color: "var(--color-up)", background: "var(--color-up-100)" };
    case "s-warn":
      return {
        color: "var(--color-sev-warn)",
        background: "var(--color-sev-warn-100)",
      };
    case "s-crit":
      return {
        color: "var(--color-sev-crit)",
        background: "var(--color-sev-crit-100)",
      };
    default:
      return {
        color: "var(--color-gray-600)",
        background: "var(--color-gray-100)",
      };
  }
}

function paceColor(idx: number) {
  if (idx >= 110) return "var(--color-up)";
  if (idx >= 90) return "var(--color-gray-600)";
  if (idx >= 80) return "var(--color-sev-warn)";
  return "var(--color-sev-crit)";
}

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

  const list = companies
    .filter((c) => group === "all" || c.group === group)
    .slice()
    .sort((a, b) => {
      if (sort === "volume") return b.curr - a.curr;
      if (sort === "sales") return b.sales - a.sales;
      if (sort === "cpu") return b.cpu - a.cpu;
      const da = a.prev > 0 ? Math.abs(a.curr / a.prev - 1) : 0;
      const db = b.prev > 0 ? Math.abs(b.curr / b.prev - 1) : 0;
      return db - da;
    });

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-[5px] text-[11.5px] font-semibold transition-colors ${
      active
        ? "border-[var(--color-gray-900)] bg-[var(--color-gray-900)] text-white"
        : "border-[var(--color-gray-200)] bg-white text-[var(--color-gray-600)] hover:border-[var(--color-gray-400)] hover:text-[var(--color-gray-900)]"
    }`;

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
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(272px,1fr))] gap-[13px]">
        {list.map((c) => {
          const st = judge(c);
          const chg = c.prev > 0 ? (c.curr / c.prev - 1) * 100 : 0;
          const dirCol =
            chg > 1.5
              ? "var(--color-up)"
              : chg < -1.5
                ? "var(--color-down)"
                : "var(--color-gray-400)";
          const arrow = chg > 1.5 ? "▲" : chg < -1.5 ? "▼" : "—";
          const rankMove = c.prevRank - c.rank;
          const heatSum = c.heat.reduce((a, b) => a + b, 0) || 1;
          const paceFrac =
            Math.max(0, Math.min(1.3, st.idx / 100)) / 1.3;

          return (
            <Link
              key={c.label}
              href={`/company/${c.label}`}
              aria-label={`${c.label} ${c.curr.toLocaleString("ko-KR")}건, ${st.text}`}
              className="group flex flex-col gap-[11px] rounded-[12px] border border-[var(--color-gray-200)] bg-white p-[14px_15px_12px] shadow-[0_1px_2px_rgba(28,35,56,.04),0_2px_8px_rgba(28,35,56,.05)] transition-[border-color,box-shadow,transform] duration-[120ms] hover:-translate-y-px hover:border-[var(--color-primary-500)] hover:shadow-[0_2px_4px_rgba(67,56,202,.06),0_8px_20px_rgba(67,56,202,.10)] motion-reduce:transform-none motion-reduce:transition-none"
            >
              <div className="flex items-start justify-between gap-[9px]">
                <div>
                  <div className="text-[14px] font-extrabold leading-[1.25] tracking-[-.3px]">
                    {c.label}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-[5px]">
                    <span className="rounded-[4px] bg-[var(--color-gray-100)] px-[5px] py-0.5 text-[9.5px] font-bold text-[var(--color-gray-500)]">
                      {c.bm}
                    </span>
                    <span className="rounded-[4px] bg-[var(--color-gray-100)] px-[5px] py-0.5 text-[9.5px] font-bold text-[var(--color-gray-500)]">
                      {c.group}
                    </span>
                    <span className="num rounded-[4px] bg-[var(--color-gray-100)] px-[5px] py-0.5 font-mono text-[9.5px] font-bold text-[var(--color-gray-500)]">
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
                <span
                  className="inline-flex flex-none items-center gap-[5px] rounded-full px-[9px] py-[3px] text-[10.5px] font-extrabold whitespace-nowrap before:h-[5px] before:w-[5px] before:rounded-full before:bg-current before:content-['']"
                  style={stateStyle(st.cls)}
                >
                  {st.text}
                </span>
              </div>

              <div className="flex items-end justify-between gap-2.5">
                <div className="num text-[27px] font-extrabold leading-none tracking-[-1px]">
                  {c.curr.toLocaleString("ko-KR")}
                  <i className="ml-0.5 text-[12px] font-semibold not-italic tracking-normal text-[var(--color-gray-500)]">
                    건
                  </i>
                </div>
                <div
                  className="num text-right text-[11.5px] font-bold leading-[1.35]"
                  style={{ color: dirCol }}
                >
                  {arrow} {Math.abs(chg).toFixed(1)}%
                  <small className="block text-[10px] font-medium text-[var(--color-gray-400)]">
                    전월 동기간 {c.prev.toLocaleString("ko-KR")}건
                  </small>
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-baseline justify-between text-[10.5px] text-[var(--color-gray-500)]">
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
                      v: `${Math.round(c.cpu).toLocaleString("ko-KR")}원`,
                    },
                  ].map((m, i) => (
                    <div
                      key={m.k}
                      className={`flex min-w-0 flex-col gap-0.5 ${i === 2 ? "items-end" : ""}`}
                    >
                      <span className="truncate text-[9.5px] font-semibold text-[var(--color-gray-400)]">
                        {m.k}
                      </span>
                      <b className="num text-[12.5px] font-bold tracking-[-.2px]">
                        {m.v}
                      </b>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[9.5px] font-semibold text-[var(--color-gray-400)]">
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
