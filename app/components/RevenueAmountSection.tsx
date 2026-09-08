"use client";

import { useState } from "react";
import CategoryMonthlyChart, {
  type CategoryMonthPoint,
  type CategorySeries,
} from "@/app/components/CategoryMonthlyChart";
import { CAT_TABLE_ROWS } from "@/app/components/transactionCategoryLayout";
import { MAIN_RENTAL_COMPANIES } from "@/lib/company-map";

export type PeriodColumn = { key: string; label: string };
type BmAmounts = Record<"BM1" | "BM2" | "BM3", number>;

type MonthlyData = {
  columns: PeriodColumn[];
  catAmounts: Record<string, Record<string, number>>;
  bmAmounts: Record<string, BmAmounts>;
  rcAmounts: Record<string, Record<string, number>>;
  totals: Record<string, number>;
  chart: CategoryMonthPoint[];
};

type WeeklyData = {
  columns: PeriodColumn[];
  catAmounts: Record<string, Record<string, number>>;
  bmAmounts: Record<string, BmAmounts>;
  rcAmounts: Record<string, Record<string, number>>;
  totals: Record<string, number>;
  chart: CategoryMonthPoint[];
};

type Props = {
  monthly: MonthlyData;
  weekly: WeeklyData;
  waterSeries: CategorySeries[];
  categorySeries: CategorySeries[];
  categoryChartYDomainMonthly: [number, number];
  categoryChartYDomainWeekly: [number, number];
};

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

/** 전기 대비 증감 — ±1.5% 이내는 방향색 대신 회색 "—" (DESIGN: 변화가 미미할 때) */
function Delta({ curr, prev }: { curr: number; prev: number | undefined }) {
  if (prev === undefined || prev === 0) return null;
  const p = ((curr - prev) / prev) * 100;
  if (Math.abs(p) <= 1.5) return <span className="text-[var(--color-gray-400)]">—</span>;
  const up = p > 0;
  return (
    <span style={{ color: up ? "var(--color-up)" : "var(--color-down)" }}>
      {up ? "▲" : "▼"}
      {Math.abs(p).toFixed(0)}%
    </span>
  );
}

/**
 * 금액 + (비중 · 전기 대비). 첫 열은 진행중인 기간이라 완료된 전기와 비교하면
 * "달력"이 나오므로 증감을 생략하고 비중만 남긴다.
 */
function AmountCell({
  value,
  total,
  prev,
  inProgress,
  strong,
}: {
  value: number;
  total?: number;
  prev?: number;
  inProgress: boolean;
  strong?: boolean;
}) {
  if (value <= 0 && !strong) {
    return (
      <td className="px-4 py-2 text-center cell-highlight">
        <span className="text-gray-200">-</span>
      </td>
    );
  }
  const share = total && total > 0 ? (value / total) * 100 : null;
  return (
    <td className="px-4 py-2 text-center cell-highlight num">
      <div className={strong ? "font-semibold text-gray-800" : "text-gray-800"}>
        {fmt(value)}
      </div>
      <div className="mt-0.5 flex justify-center gap-1.5 text-[11px] leading-4 text-gray-400">
        {share !== null && <span>{share.toFixed(1)}%</span>}
        {!inProgress && <Delta curr={value} prev={prev} />}
      </div>
    </td>
  );
}

export default function RevenueAmountSection({
  monthly,
  weekly,
  waterSeries,
  categorySeries,
  categoryChartYDomainMonthly,
  categoryChartYDomainWeekly,
}: Props) {
  // 페이지 상단이 월 단위(이번달·전월 동기간)로 말하므로 여기도 월별로 시작한다
  const [tab, setTab] = useState<"monthly" | "weekly">("monthly");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-0 border-b border-gray-100">
          <TabButton
            label="월별"
            active={tab === "monthly"}
            onClick={() => setTab("monthly")}
          />
          <TabButton
            label="주차별"
            active={tab === "weekly"}
            onClick={() => setTab("weekly")}
          />
        </div>
        <p className="text-[11px] text-gray-400">
          셀 아래 = 열 합계 대비 비중 · 전기 대비 증감 (첫 열은 진행중이라 증감 생략)
        </p>
      </div>

      {tab === "monthly" && (
        <>
          {/* 카테고리별 매출액 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 mb-2">
              카테고리별 매출액
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <CategoryMonthlyChart
                title="정수기 매출액"
                data={monthly.chart}
                series={waterSeries}
                unit=""
              />
              <CategoryMonthlyChart
                title="대카테고리별 매출액 (정수기 제외)"
                data={monthly.chart}
                series={categorySeries}
                yDomain={categoryChartYDomainMonthly}
                unit=""
              />
            </div>
            <CategoryAmountTable
              columns={monthly.columns}
              catAmounts={monthly.catAmounts}
              totals={monthly.totals}
            />
          </div>

          {/* BM별 매출액 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 mb-2">
              BM별 매출액
            </h3>
            <BmAmountTable
              columns={monthly.columns}
              bmAmounts={monthly.bmAmounts}
              totals={monthly.totals}
            />
          </div>

          {/* 주요 렌탈사별 매출액 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 mb-2">
              주요 렌탈사별 매출액
            </h3>
            <RcAmountTable
              columns={monthly.columns}
              rcAmounts={monthly.rcAmounts}
              totals={monthly.totals}
            />
          </div>
        </>
      )}

      {tab === "weekly" && (
        <>
          {/* 카테고리별 매출액 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 mb-2">
              카테고리별 매출액
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <CategoryMonthlyChart
                title="정수기 매출액 (주차별)"
                data={weekly.chart}
                series={waterSeries}
                unit=""
              />
              <CategoryMonthlyChart
                title="대카테고리별 매출액 (주차별, 정수기 제외)"
                data={weekly.chart}
                series={categorySeries}
                yDomain={categoryChartYDomainWeekly}
                unit=""
              />
            </div>
            <CategoryAmountTable
              columns={weekly.columns}
              catAmounts={weekly.catAmounts}
              totals={weekly.totals}
            />
          </div>

          {/* BM별 매출액 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 mb-2">
              BM별 매출액
            </h3>
            <BmAmountTable
              columns={weekly.columns}
              bmAmounts={weekly.bmAmounts}
              totals={weekly.totals}
            />
          </div>

          {/* 주요 렌탈사별 매출액 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 mb-2">
              주요 렌탈사별 매출액
            </h3>
            <RcAmountTable
              columns={weekly.columns}
              rcAmounts={weekly.rcAmounts}
              totals={weekly.totals}
            />
          </div>
        </>
      )}
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`press px-3 py-1.5 text-sm font-medium border-b-2 transition -mb-px ${
        active
          ? "border-[var(--color-primary)] text-[var(--color-primary)]"
          : "border-transparent text-gray-400 hover:text-gray-600"
      }`}
    >
      {label}
    </button>
  );
}

function CategoryAmountTable({
  columns,
  catAmounts,
  totals,
}: {
  columns: PeriodColumn[];
  catAmounts: Record<string, Record<string, number>>;
  totals: Record<string, number>;
}) {
  function getAmount(colKey: string, cat: string | null): number {
    return catAmounts[colKey]?.[cat === null ? "그 외" : cat] ?? 0;
  }
  return (
    <div className="rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
      <table className="text-sm bg-white border-collapse w-full">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 min-w-[120px] sticky left-0 bg-white z-10 border-r border-gray-100">
              대카테고리
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 min-w-[130px] border-r border-gray-100">
              상품 카테고리
            </th>
            {columns.map((c, i) => (
              <th
                key={c.key}
                className="px-4 py-3 text-center text-xs font-semibold text-gray-400 min-w-[110px] cell-highlight"
              >
                {c.label}
                {i === 0 && <span className="ml-1 font-medium text-gray-300">진행중</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CAT_TABLE_ROWS.map((row) => (
            <tr key={row.cat ?? "그 외"} className="border-t border-gray-50">
              {row.largeSpan > 0 && (
                <td
                  rowSpan={row.largeSpan}
                  className="px-4 py-3 text-xs font-semibold text-gray-500 text-center sticky left-0 bg-white border-r border-gray-100 align-middle"
                >
                  {row.large}
                </td>
              )}
              <td className="px-4 py-3 text-xs text-gray-600 text-center border-r border-gray-100">
                {row.cat ?? "그 외"}
              </td>
              {columns.map((c, i) => (
                <AmountCell
                  key={c.key}
                  value={getAmount(c.key, row.cat)}
                  total={totals[c.key]}
                  prev={columns[i + 1] ? getAmount(columns[i + 1].key, row.cat) : undefined}
                  inProgress={i === 0}
                />
              ))}
            </tr>
          ))}
          <tr className="border-t-2 border-gray-200">
            <td
              colSpan={2}
              className="px-4 py-3 text-xs font-semibold text-gray-400 text-center sticky left-0 bg-white border-r border-gray-100"
            >
              전체
            </td>
            {columns.map((c, i) => (
              <AmountCell
                key={c.key}
                value={totals[c.key] ?? 0}
                prev={columns[i + 1] ? totals[columns[i + 1].key] : undefined}
                inProgress={i === 0}
                strong
              />
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function BmAmountTable({
  columns,
  bmAmounts,
  totals,
}: {
  columns: PeriodColumn[];
  bmAmounts: Record<string, BmAmounts>;
  totals: Record<string, number>;
}) {
  function getAmount(colKey: string, bm: "BM1" | "BM2" | "BM3"): number {
    return bmAmounts[colKey]?.[bm] ?? 0;
  }
  return (
    <div className="rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
      <table className="text-sm bg-white border-collapse w-full">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 min-w-[100px] sticky left-0 bg-white z-10 border-r border-gray-100">
              BM
            </th>
            {columns.map((c, i) => (
              <th
                key={c.key}
                className="px-4 py-3 text-center text-xs font-semibold text-gray-400 min-w-[110px] cell-highlight"
              >
                {c.label}
                {i === 0 && <span className="ml-1 font-medium text-gray-300">진행중</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(["BM1", "BM2", "BM3"] as const).map((bm) => (
            <tr key={bm} className="border-t border-gray-50">
              <td className="px-4 py-3 text-xs font-semibold text-gray-600 text-center sticky left-0 bg-white border-r border-gray-100">
                {bm}
              </td>
              {columns.map((c, i) => (
                <AmountCell
                  key={c.key}
                  value={getAmount(c.key, bm)}
                  total={totals[c.key]}
                  prev={columns[i + 1] ? getAmount(columns[i + 1].key, bm) : undefined}
                  inProgress={i === 0}
                />
              ))}
            </tr>
          ))}
          <tr className="border-t-2 border-gray-200">
            <td className="px-4 py-3 text-xs font-semibold text-gray-400 text-center sticky left-0 bg-white border-r border-gray-100">
              전체
            </td>
            {columns.map((c, i) => (
              <AmountCell
                key={c.key}
                value={totals[c.key] ?? 0}
                prev={columns[i + 1] ? totals[columns[i + 1].key] : undefined}
                inProgress={i === 0}
                strong
              />
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function RcAmountTable({
  columns,
  rcAmounts,
  totals,
}: {
  columns: PeriodColumn[];
  rcAmounts: Record<string, Record<string, number>>;
  totals: Record<string, number>;
}) {
  function getAmount(colKey: string, dbName: string): number {
    return rcAmounts[colKey]?.[dbName] ?? 0;
  }
  return (
    <div className="rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
      <table className="text-sm bg-white border-collapse w-full">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 min-w-[160px] sticky left-0 bg-white z-10 border-r border-gray-100">
              렌탈사
            </th>
            {columns.map((c, i) => (
              <th
                key={c.key}
                className="px-4 py-3 text-center text-xs font-semibold text-gray-400 min-w-[110px] cell-highlight"
              >
                {c.label}
                {i === 0 && <span className="ml-1 font-medium text-gray-300">진행중</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MAIN_RENTAL_COMPANIES.map((rc) => (
            <tr key={rc.dbName} className="border-t border-gray-50">
              <td className="px-4 py-3 text-xs font-semibold text-gray-600 text-center sticky left-0 bg-white border-r border-gray-100">
                {rc.label}
              </td>
              {columns.map((c, i) => (
                <AmountCell
                  key={c.key}
                  value={getAmount(c.key, rc.dbName)}
                  total={totals[c.key]}
                  prev={columns[i + 1] ? getAmount(columns[i + 1].key, rc.dbName) : undefined}
                  inProgress={i === 0}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
