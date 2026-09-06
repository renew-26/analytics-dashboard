"use client";

import { useState } from "react";
import Link from "next/link";
import { filterChip, deltaColor as dirColor, manwon } from "@/app/components/home/cardKit";
import { EOK, fmt, signedInt } from "@/lib/format";

export type GroupRow = {
  key: string;
  axis: string;
  note: string;
  cnt: number;
  cntPrev: number;
  amount: number;
  sales: number;
  salesPrev: number;
  margin: number;
};

/**
 * 카테고리 그룹 성과 표 — "이번 달 전체 성장을 어느 카테고리가 만들었나".
 * 기본 정렬이 매출 변화폭인 이유: 1위가 정수기인 건 매달 같은 사실이라
 * 정보가 없다. 이번 달 무엇이 달라졌는지가 정보다.
 */
const SORTS = [
  { key: "change", label: "매출 변화폭" },
  { key: "sales", label: "매출" },
  { key: "count", label: "거래건수" },
  { key: "cpu", label: "건당 공헌이익" },
] as const;

const th =
  "bg-[var(--color-gray-25)] p-[9px_12px] text-right text-[11px] font-bold whitespace-nowrap text-[var(--color-gray-400)]";
const td = "p-[9px_12px] text-right whitespace-nowrap";

const cpuOf = (r: GroupRow) => (r.cnt > 0 ? r.margin / r.cnt : 0);

export default function GroupTable({
  rows,
  totalCount,
}: {
  rows: GroupRow[];
  totalCount: number;
}) {
  const [sort, setSort] = useState<string>("change");

  const sorted = rows.slice().sort((a, b) => {
    if (sort === "sales") return b.sales - a.sales;
    if (sort === "count") return b.cnt - a.cnt;
    if (sort === "cpu") return cpuOf(b) - cpuOf(a);
    // 변화폭은 절대 크기로 — 크게 빠진 카테고리도 크게 는 것만큼 급하다
    return Math.abs(b.sales - b.salesPrev) - Math.abs(a.sales - a.salesPrev);
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
      </div>

      <div className="overflow-x-auto rounded-[8px] border border-[var(--color-gray-200)]">
        <table className="w-full min-w-[900px] bg-white text-[12px]">
          <thead>
            <tr className="border-b border-[var(--color-gray-200)]">
              <th className={`${th} text-left`}>카테고리</th>
              <th className={`${th} text-left`}>상위 카테고리</th>
              <th className={th}>계약건수</th>
              <th className={th}>전월 동기간</th>
              <th className={th}>증감</th>
              <th className={th}>비중</th>
              <th className={th}>거래액</th>
              <th className={th}>매출</th>
              <th className={th}>매출 증감</th>
              <th className={th}>건당 공헌이익</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((g) => {
              const diff = g.cnt - g.cntPrev;
              const salesDiff = g.sales - g.salesPrev;
              const share = totalCount > 0 ? (g.cnt / totalCount) * 100 : 0;
              return (
                <tr
                  key={g.key}
                  className="group border-t border-[var(--color-line-2)] hover:bg-[var(--color-primary-50)]"
                >
                  <td className={`${td} text-left`}>
                    <Link
                      href={`/categories/${encodeURIComponent(g.key)}`}
                      className="font-bold text-[var(--color-gray-600)] group-hover:text-[var(--color-primary)]"
                      title={g.note}
                    >
                      {g.key}
                    </Link>
                  </td>
                  <td className={`${td} text-left text-[var(--color-gray-500)]`}>
                    {g.axis}
                  </td>
                  <td className={`${td} num font-bold`}>{fmt(g.cnt)}</td>
                  <td className={`${td} num text-[var(--color-gray-500)]`}>
                    {fmt(g.cntPrev)}
                  </td>
                  <td
                    className={`${td} num font-bold`}
                    style={{ color: dirColor(diff, 0) }}
                  >
                    {signedInt(diff)}
                  </td>
                  <td className={`${td} num`}>{share.toFixed(1)}%</td>
                  <td className={`${td} num`}>{(g.amount / EOK).toFixed(1)}억</td>
                  <td className={`${td} num`}>{(g.sales / EOK).toFixed(2)}억</td>
                  <td
                    className={`${td} num font-bold`}
                    style={{ color: dirColor(salesDiff, 0) }}
                  >
                    {salesDiff > 0 ? "+" : salesDiff < 0 ? "−" : ""}
                    {(Math.abs(salesDiff) / EOK).toFixed(2)}억
                  </td>
                  <td className={`${td} num`}>{manwon(cpuOf(g))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
