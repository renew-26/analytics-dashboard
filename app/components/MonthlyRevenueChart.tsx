"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

export interface MonthStat {
  month: string;
  totalRentalFee: number;
  mom: number | null;
}

export interface RevenueTarget {
  id: number;
  label: string;
  amount: number; // 원 단위
}

const TARGET_COLORS = [
  "var(--color-accent-purple)",
  "var(--color-accent-orange)",
  "var(--color-warning-500)",
  "var(--color-accent-yellow)",
];

const VIEW_LABELS: Record<"order" | "contract", string> = {
  order: "주문확정",
  contract: "계약완료",
};

const BM_LABELS: Record<"all" | "bm1" | "bm2" | "bm3", string> = {
  all: "전체",
  bm1: "BM1",
  bm2: "BM2",
  bm3: "BM3",
};

function storageKey(companyDbName: string, view: string, bm: string): string {
  return `revenue-targets:${companyDbName}:${view}:${bm}`;
}

function loadTargets(companyDbName: string, view: string, bm: string): RevenueTarget[] {
  try {
    const raw = localStorage.getItem(storageKey(companyDbName, view, bm));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTargets(
  companyDbName: string,
  view: string,
  bm: string,
  targets: RevenueTarget[],
) {
  localStorage.setItem(storageKey(companyDbName, view, bm), JSON.stringify(targets));
}

function fmtAxis(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`;
  return n.toLocaleString("ko-KR");
}

function fmtEok(amountWon: number): string {
  return `${Number((amountWon / 100_000_000).toFixed(2))}억`;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; payload: MonthStat }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid var(--color-gray-200)",
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 600, color: "var(--color-gray-900)", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ color: "var(--color-gray-500)" }}>
        총렌탈료{" "}
        <span style={{ fontWeight: 600, color: "var(--color-gray-900)" }}>
          {d.totalRentalFee.toLocaleString("ko-KR")}원
        </span>
      </div>
      {d.mom !== null && (
        <div
          style={{
            marginTop: 2,
            color:
              d.mom >= 0 ? "var(--color-error)" : "var(--color-down)",
            fontWeight: 600,
          }}
        >
          {d.mom >= 0 ? "▲" : "▼"} 전월 대비 {Math.abs(d.mom).toFixed(1)}%
        </div>
      )}
    </div>
  );
}

export default function MonthlyRevenueChart({
  data,
  color = "var(--color-primary-500)",
  companyDbName,
  view = "order",
  bm = "all",
}: {
  data: MonthStat[];
  color?: string;
  companyDbName?: string;
  view?: "order" | "contract";
  bm?: "all" | "bm1" | "bm2" | "bm3";
}) {
  const [targets, setTargets] = useState<RevenueTarget[]>([]);
  const [label, setLabel] = useState("");
  const [amountEok, setAmountEok] = useState("");

  useEffect(() => {
    if (companyDbName) setTargets(loadTargets(companyDbName, view, bm));
  }, [companyDbName, view, bm]);

  if (data.length === 0) return null;

  const editable = !!companyDbName;

  function handleAdd() {
    if (!companyDbName) return;
    const trimmedLabel = label.trim();
    const parsedEok = Number(amountEok);
    if (!trimmedLabel || !amountEok || isNaN(parsedEok) || parsedEok <= 0) return;

    const next = [
      ...targets,
      {
        id: Date.now(),
        label: trimmedLabel,
        amount: Math.round(parsedEok * 100_000_000),
      },
    ];
    setTargets(next);
    saveTargets(companyDbName, view, bm, next);
    setLabel("");
    setAmountEok("");
  }

  function handleRemove(id: number) {
    if (!companyDbName) return;
    const next = targets.filter((t) => t.id !== id);
    setTargets(next);
    saveTargets(companyDbName, view, bm, next);
  }

  return (
    <div className="[&_svg]:outline-none [&_svg]:focus:outline-none">
      <ResponsiveContainer width="100%" height={200}>
        <LineChart
          data={data}
          margin={{ left: 8, right: 24, top: 8, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="4 4"
            vertical={false}
            stroke="var(--color-gray-150)"
          />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 12, fill: "var(--color-gray-400)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={fmtAxis}
            tick={{ fontSize: 11, fill: "var(--color-gray-400)" }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: "var(--color-gray-200)" }} />
          <Line
            type="monotone"
            dataKey="totalRentalFee"
            stroke={color}
            strokeWidth={2.5}
            dot={{ r: 4, fill: color, strokeWidth: 2, stroke: "#fff" }}
            activeDot={{ r: 5.5, fill: color, strokeWidth: 2, stroke: "#fff" }}
          />
          {targets.map((t, i) => (
            <ReferenceLine
              key={t.id}
              y={t.amount}
              ifOverflow="extendDomain"
              stroke={TARGET_COLORS[i % TARGET_COLORS.length]}
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{
                value: `${t.label} ${fmtEok(t.amount)}`,
                position: "insideTopLeft",
                fontSize: 11,
                fill: TARGET_COLORS[i % TARGET_COLORS.length],
              }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* MOM 요약 배지 */}
      <div className="flex gap-2 flex-wrap mt-3">
        {data.map(
          (d) =>
            d.mom !== null && (
              <div
                key={d.month}
                className="flex items-center gap-1 text-[11px]"
              >
                <span className="text-[#a1a5ac]">{d.month}</span>
                <span
                  className="font-semibold"
                  style={{
                    color:
                      d.mom >= 0
                        ? "var(--color-error)"
                        : "var(--color-down)",
                  }}
                >
                  {d.mom >= 0 ? "▲" : "▼"} {Math.abs(d.mom).toFixed(1)}%
                </span>
              </div>
            )
        )}
      </div>

      {editable && (
        <div className="mt-4 pt-4 border-t border-[var(--color-gray-150)]">
          <p className="text-xs text-[var(--color-gray-500)] mb-2">
            {VIEW_LABELS[view]} · {BM_LABELS[bm]} 기준선
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="라벨 (예: 2026 목표)"
              className="px-3 py-1.5 text-xs rounded-md border border-[var(--color-gray-200)] w-36"
            />
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={amountEok}
                onChange={(e) => setAmountEok(e.target.value)}
                placeholder="금액"
                className="px-3 py-1.5 text-xs rounded-md border border-[var(--color-gray-200)] w-20"
              />
              <span className="text-xs text-[var(--color-gray-500)]">억원</span>
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!label.trim() || !amountEok}
              className="px-3 py-1.5 text-xs font-semibold rounded-md bg-[var(--color-primary)] text-white disabled:opacity-40"
            >
              기준선 추가
            </button>
          </div>
          {targets.length > 0 && (
            <div className="flex gap-2 flex-wrap mt-2">
              {targets.map((t, i) => (
                <div
                  key={t.id}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
                  style={{
                    backgroundColor: "var(--color-gray-100)",
                    color: TARGET_COLORS[i % TARGET_COLORS.length],
                  }}
                >
                  <span className="font-medium">
                    {t.label} {fmtEok(t.amount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemove(t.id)}
                    className="text-[var(--color-gray-400)] hover:text-[var(--color-gray-700)]"
                    aria-label={`${t.label} 삭제`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
