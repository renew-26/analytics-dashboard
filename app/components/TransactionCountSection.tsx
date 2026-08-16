"use client";

import { useState } from "react";
import CategoryMonthlyChart, {
  type CategoryMonthPoint,
  type CategorySeries,
} from "@/app/components/CategoryMonthlyChart";
import TransactionYearToggle from "@/app/components/TransactionYearToggle";
import { CAT_TABLE_ROWS } from "@/app/components/transactionCategoryLayout";
import { MAIN_RENTAL_COMPANIES } from "@/lib/company-map";

export type PeriodColumn = { key: string; label: string };
type BmCounts = Record<"BM1" | "BM2" | "BM3", number>;

type MonthlyData = {
  columns: PeriodColumn[];
  catCounts: Record<string, Record<string, number>>;
  bmCounts: Record<string, BmCounts>;
  rcCounts: Record<string, Record<string, number>>;
  totals: Record<string, number>;
  chart2026: CategoryMonthPoint[];
  chart2025: CategoryMonthPoint[];
};

type WeeklyData = {
  columns: PeriodColumn[];
  catCounts: Record<string, Record<string, number>>;
  bmCounts: Record<string, BmCounts>;
  rcCounts: Record<string, Record<string, number>>;
  totals: Record<string, number>;
  chart: CategoryMonthPoint[];
};

type Props = {
  hideOld2025: boolean;
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

export default function TransactionCountSection({
  hideOld2025,
  monthly,
  weekly,
  waterSeries,
  categorySeries,
  categoryChartYDomainMonthly,
  categoryChartYDomainWeekly,
}: Props) {
  const [tab, setTab] = useState<"monthly" | "weekly">("monthly");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-700">2. 거래건수</h2>
        <div className="flex gap-0 ml-2 border-b border-gray-100">
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
        {tab === "monthly" && <TransactionYearToggle hidden={hideOld2025} />}
      </div>

      {tab === "monthly" && (
        <>
          {/* 2-1. 카테고리 거래건수 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 mb-2">
              2-1. 카테고리 거래건수
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {[
                { year: "26", data: monthly.chart2026 },
                { year: "25", data: monthly.chart2025 },
              ].map(({ year, data }) => (
                <div key={year} className="space-y-3">
                  <CategoryMonthlyChart
                    title={`${year}년 정수기 거래건수`}
                    data={data}
                    series={waterSeries}
                  />
                  <CategoryMonthlyChart
                    title={`${year}년 대카테고리별 거래건수 (정수기 제외)`}
                    data={data}
                    series={categorySeries}
                    yDomain={categoryChartYDomainMonthly}
                  />
                </div>
              ))}
            </div>
            <CategoryCountTable
              columns={monthly.columns}
              catCounts={monthly.catCounts}
              totals={monthly.totals}
            />
          </div>

          {/* 2-2. BM별 거래건수 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 mb-2">
              2-2. BM별 거래건수
            </h3>
            <BmCountTable
              columns={monthly.columns}
              bmCounts={monthly.bmCounts}
              totals={monthly.totals}
            />
          </div>

          {/* 2-3. 주요 렌탈사별 거래건수 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 mb-2">
              2-3. 주요 렌탈사별 거래건수
            </h3>
            <RcCountTable
              columns={monthly.columns}
              rcCounts={monthly.rcCounts}
            />
          </div>
        </>
      )}

      {tab === "weekly" && (
        <>
          {/* 2-1. 카테고리 거래건수 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 mb-2">
              2-1. 카테고리 거래건수
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <CategoryMonthlyChart
                title="정수기 거래건수 (주차별)"
                data={weekly.chart}
                series={waterSeries}
              />
              <CategoryMonthlyChart
                title="대카테고리별 거래건수 (주차별, 정수기 제외)"
                data={weekly.chart}
                series={categorySeries}
                yDomain={categoryChartYDomainWeekly}
              />
            </div>
            <CategoryCountTable
              columns={weekly.columns}
              catCounts={weekly.catCounts}
              totals={weekly.totals}
            />
          </div>

          {/* 2-2. BM별 거래건수 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 mb-2">
              2-2. BM별 거래건수
            </h3>
            <BmCountTable
              columns={weekly.columns}
              bmCounts={weekly.bmCounts}
              totals={weekly.totals}
            />
          </div>

          {/* 2-3. 주요 렌탈사별 거래건수 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 mb-2">
              2-3. 주요 렌탈사별 거래건수
            </h3>
            <RcCountTable
              columns={weekly.columns}
              rcCounts={weekly.rcCounts}
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
      className={`px-3 py-1.5 text-sm font-medium border-b-2 transition -mb-px ${
        active
          ? "border-[#3531FF] text-[#3531FF]"
          : "border-transparent text-gray-400 hover:text-gray-600"
      }`}
    >
      {label}
    </button>
  );
}

function CategoryCountTable({
  columns,
  catCounts,
  totals,
}: {
  columns: PeriodColumn[];
  catCounts: Record<string, Record<string, number>>;
  totals: Record<string, number>;
}) {
  function getCount(colKey: string, cat: string | null): number {
    return catCounts[colKey]?.[cat === null ? "그 외" : cat] ?? 0;
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
            {columns.map((c) => (
              <th
                key={c.key}
                className="px-4 py-3 text-center text-xs font-semibold text-gray-400 min-w-[90px] cell-highlight"
              >
                {c.label}
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
              {columns.map((c) => (
                <td
                  key={c.key}
                  className="px-4 py-3 text-center text-gray-800 cell-highlight"
                >
                  {getCount(c.key, row.cat) > 0 ? (
                    fmt(getCount(c.key, row.cat))
                  ) : (
                    <span className="text-gray-200">-</span>
                  )}
                </td>
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
            {columns.map((c) => (
              <td
                key={c.key}
                className="px-4 py-3 text-center font-semibold text-gray-800 cell-highlight"
              >
                {fmt(totals[c.key] ?? 0)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function BmCountTable({
  columns,
  bmCounts,
  totals,
}: {
  columns: PeriodColumn[];
  bmCounts: Record<string, BmCounts>;
  totals: Record<string, number>;
}) {
  function getCount(colKey: string, bm: "BM1" | "BM2" | "BM3"): number {
    return bmCounts[colKey]?.[bm] ?? 0;
  }
  return (
    <div className="rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
      <table className="text-sm bg-white border-collapse w-full">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 min-w-[100px] sticky left-0 bg-white z-10 border-r border-gray-100">
              BM
            </th>
            {columns.map((c) => (
              <th
                key={c.key}
                className="px-4 py-3 text-center text-xs font-semibold text-gray-400 min-w-[90px] cell-highlight"
              >
                {c.label}
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
              {columns.map((c) => (
                <td
                  key={c.key}
                  className="px-4 py-3 text-center text-gray-800 cell-highlight"
                >
                  {getCount(c.key, bm) > 0 ? (
                    fmt(getCount(c.key, bm))
                  ) : (
                    <span className="text-gray-200">-</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
          <tr className="border-t-2 border-gray-200">
            <td className="px-4 py-3 text-xs font-semibold text-gray-400 text-center sticky left-0 bg-white border-r border-gray-100">
              전체
            </td>
            {columns.map((c) => (
              <td
                key={c.key}
                className="px-4 py-3 text-center font-semibold text-gray-800 cell-highlight"
              >
                {fmt(totals[c.key] ?? 0)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function RcCountTable({
  columns,
  rcCounts,
}: {
  columns: PeriodColumn[];
  rcCounts: Record<string, Record<string, number>>;
}) {
  function getCount(colKey: string, dbName: string): number {
    return rcCounts[colKey]?.[dbName] ?? 0;
  }
  return (
    <div className="rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
      <table className="text-sm bg-white border-collapse w-full">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 min-w-[160px] sticky left-0 bg-white z-10 border-r border-gray-100">
              렌탈사
            </th>
            {columns.map((c) => (
              <th
                key={c.key}
                className="px-4 py-3 text-center text-xs font-semibold text-gray-400 min-w-[90px] cell-highlight"
              >
                {c.label}
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
              {columns.map((c) => (
                <td
                  key={c.key}
                  className="px-4 py-3 text-center text-gray-800 cell-highlight"
                >
                  {getCount(c.key, rc.dbName) > 0 ? (
                    fmt(getCount(c.key, rc.dbName))
                  ) : (
                    <span className="text-gray-200">-</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
