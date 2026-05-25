"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from "recharts";

interface RankItem {
  category: string;
  count: number;
  rank: number;
  total: number;
  share: number;
}

export default function PositionChartModal({
  ranks,
  categoryAllData,
  title,
  companyLabel,
  myDbName,
}: {
  ranks: RankItem[];
  categoryAllData: Record<string, { company: string; count: number }[]>;
  title: string;
  companyLabel: string;
  myDbName: string;
}) {
  const [open, setOpen] = useState(false);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);

  const categories = ranks.map((r) => r.category);
  const activeCat = selectedCat ?? categories[0] ?? null;
  const companyData = activeCat ? (categoryAllData[activeCat] ?? []) : [];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs border rounded-md px-2.5 py-1 transition focus:outline-none"
        style={{
          color: "var(--color-accent-blue)",
          borderColor: "var(--color-accent-blue)",
          opacity: 1,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.75")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
      >
        그래프로 보기
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-bold text-gray-800">{title}</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-300 hover:text-gray-500 text-xl leading-none"
              >
                ×
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-5">
              {companyLabel} · 2026년 기준 · 주문확정
            </p>

            {/* 내 현황 요약 */}
            <div
              className={`grid gap-2 mb-6`}
              style={{ gridTemplateColumns: `repeat(${ranks.length}, 1fr)` }}
            >
              {ranks.map((r) => (
                <div
                  key={r.category}
                  className="rounded-lg border border-gray-100 py-3 text-center"
                >
                  <div className="text-[11px] text-gray-400 mb-0.5">
                    {r.category}
                  </div>
                  <div
                    className={`text-sm font-bold ${r.rank === 1 ? "text-amber-500" : r.rank > 3 ? "text-gray-500" : ""}`}
                    style={
                      r.rank > 1 && r.rank <= 3
                        ? { color: "var(--color-error)" }
                        : {}
                    }
                  >
                    {r.rank}위
                  </div>
                  <div className="text-[11px] text-gray-400">
                    {r.share.toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>

            {/* 카테고리 탭 */}
            <div className="flex gap-1.5 flex-wrap mb-4">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCat(cat)}
                  className="text-xs px-3 py-1.5 rounded-full transition focus:outline-none"
                  style={
                    activeCat === cat
                      ? { backgroundColor: "#007aff", color: "#ffffff" }
                      : { backgroundColor: "#f3f4f6", color: "#6b7280" }
                  }
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* 렌탈사 비교 차트 */}
            {activeCat && (
              <>
                <p className="text-xs font-semibold text-gray-500 mb-3">
                  {activeCat} · 렌탈사별 주문건수
                </p>
                <div className="[&_svg]:outline-none [&_svg]:focus:outline-none">
                  <ResponsiveContainer
                    width="100%"
                    height={Math.max(180, companyData.length * 38)}
                  >
                    <BarChart
                      data={companyData}
                      layout="vertical"
                      margin={{ left: 8, right: 40, top: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis
                        type="category"
                        dataKey="company"
                        width={120}
                        tick={(props) => {
                          const { x, y, payload } = props;
                          const isMe = payload.value === myDbName;
                          return (
                            <text
                              x={x}
                              y={y}
                              dy={4}
                              textAnchor="end"
                              fontSize={12}
                              fontWeight={isMe ? 700 : 400}
                              fill={isMe ? "#007aff" : "#6b7280"}
                            >
                              {payload.value}
                            </text>
                          );
                        }}
                      />
                      <Tooltip
                        formatter={(value: number) => [
                          `${value.toLocaleString("ko-KR")}건`,
                          "주문건수",
                        ]}
                        contentStyle={{
                          background: "#ffffff",
                          border: "1px solid #e3e2e0",
                          borderRadius: 8,
                          boxShadow: "none",
                        }}
                        labelStyle={{ color: "#1a1a1a", fontWeight: 600 }}
                        itemStyle={{ color: "#6b7280" }}
                        cursor={{ fill: "rgba(0,0,0,0.03)" }}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {companyData.map((d) => (
                          <Cell
                            key={d.company}
                            fill={
                              d.company === myDbName ? "#007aff" : "#e5e7eb"
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
