"use client";

import { useState } from "react";
import TransactionYearToggle from "@/app/components/TransactionYearToggle";

export type PeriodColumn = { key: string; label: string };
type BmKey = "BM1" | "BM2" | "BM3";
type BmValue = Record<BmKey, number>;
type BmValueNullable = Record<BmKey, number | null>;

export type MarginPeriodData = {
  columns: PeriodColumn[];
  amount: Record<string, BmValue>;
  amountTotal: Record<string, number>;
  perTx: Record<string, BmValueNullable>;
  perTxTotal: Record<string, number | null>;
  change: Record<string, BmValueNullable>;
  changeTotal: Record<string, number | null>;
};

type Props = {
  hideOld2025: boolean;
  monthly: MarginPeriodData;
  weekly: MarginPeriodData;
};

type CellFormat = { text: string; color: string };

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

function formatAmount(v: number | null): CellFormat {
  return { text: `${fmt(v ?? 0)}원`, color: "#393939" };
}

function formatPerTx(v: number | null): CellFormat {
  if (v === null) return { text: "-", color: "#d1d5db" };
  return { text: `${fmt(Math.round(v))}원`, color: "#393939" };
}

function formatChange(v: number | null): CellFormat {
  if (v === null) return { text: "-", color: "#d1d5db" };
  const isUp = v > 0;
  return {
    text: `${isUp ? "▲" : "▼"} ${Math.abs(v).toFixed(1)}%`,
    color: isUp ? "var(--color-up)" : "var(--color-down)",
  };
}

export default function BmMarginSection({ hideOld2025, monthly, weekly }: Props) {
  const [tab, setTab] = useState<"monthly" | "weekly">("monthly");
  const data = tab === "monthly" ? monthly : weekly;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex gap-0 border-b border-gray-100">
          <TabButton label="월별" active={tab === "monthly"} onClick={() => setTab("monthly")} />
          <TabButton label="주차별" active={tab === "weekly"} onClick={() => setTab("weekly")} />
        </div>
        {tab === "monthly" && <TransactionYearToggle hidden={hideOld2025} />}
      </div>

      <PeriodBmTable
        title="BM별 공헌이익 금액"
        columns={data.columns}
        valuesByBm={data.amount}
        totals={data.amountTotal}
        formatCell={formatAmount}
      />
      <PeriodBmTable
        title="BM별 건당 공헌이익"
        columns={data.columns}
        valuesByBm={data.perTx}
        totals={data.perTxTotal}
        formatCell={formatPerTx}
      />
      <PeriodBmTable
        title="BM별 공헌이익 증감"
        columns={data.columns}
        valuesByBm={data.change}
        totals={data.changeTotal}
        formatCell={formatChange}
      />
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

function PeriodBmTable({
  title,
  columns,
  valuesByBm,
  totals,
  formatCell,
}: {
  title: string;
  columns: PeriodColumn[];
  valuesByBm: Record<string, BmValueNullable> | Record<string, BmValue>;
  totals: Record<string, number | null> | Record<string, number>;
  formatCell: (v: number | null) => CellFormat;
}) {
  function getValue(colKey: string, bm: BmKey): number | null {
    return valuesByBm[colKey]?.[bm] ?? null;
  }
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-500 mb-2">{title}</h3>
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
                {columns.map((c) => {
                  const cell = formatCell(getValue(c.key, bm));
                  return (
                    <td
                      key={c.key}
                      className="px-4 py-3 text-center cell-highlight text-sm font-bold"
                      style={{ color: cell.color }}
                    >
                      {cell.text}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t-2 border-gray-200">
              <td className="px-4 py-3 text-xs font-semibold text-gray-400 text-center sticky left-0 bg-white border-r border-gray-100">
                전체
              </td>
              {columns.map((c) => {
                const cell = formatCell(totals[c.key] ?? null);
                return (
                  <td
                    key={c.key}
                    className="px-4 py-3 text-center cell-highlight text-sm font-bold"
                    style={{ color: cell.color }}
                  >
                    {cell.text}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
