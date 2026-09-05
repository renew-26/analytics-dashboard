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
import { CHART_ANIM } from "@/lib/chart";

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
  companyLabel,
  myDbName,
}: {
  ranks: RankItem[];
  categoryAllData: Record<string, { company: string; count: number }[]>;
  title: string;
  companyLabel: string;
  myDbName: string;
}) {
  const categories = ranks.map((r) => r.category);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const activeCat = selectedCat ?? categories[0] ?? null;
  const companyData = activeCat ? (categoryAllData[activeCat] ?? []) : [];

  return (
    <div className="rounded-xl shadow-sm border border-[#ebebe9] bg-white px-6 py-5">
      {/* 내 현황 요약 */}
      <div
        className="grid gap-2 mb-5"
        style={{ gridTemplateColumns: `repeat(${ranks.length}, 1fr)` }}
      >
        {ranks.map((r) => (
          <div
            key={r.category}
            className="rounded-lg border border-[#ebebe9] py-3 text-center"
          >
            <div className="text-[11px] text-[#a1a5ac] mb-0.5">{r.category}</div>
            <div
              className={`text-sm font-bold ${r.rank > 3 ? "text-[#788093]" : ""}`}
              style={
                r.rank === 1
                  ? { color: "#e03131" }
                  : r.rank <= 3
                  ? { color: "var(--color-gray-900)" }
                  : {}
              }
            >
              {r.rank}위
            </div>
            <div className="text-[11px] text-[#a1a5ac]">{r.share.toFixed(1)}%</div>
          </div>
        ))}
      </div>

      {/* 카테고리 탭 */}
      <div className="flex gap-1.5 flex-wrap mb-4">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCat(cat)}
            className="press text-xs px-3 py-1.5 rounded-full transition"
            style={
              activeCat === cat
                ? { backgroundColor: "var(--color-primary-500)", color: "#ffffff" }
                : { backgroundColor: "var(--color-gray-100)", color: "var(--color-gray-500)" }
            }
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 렌탈사 비교 차트 */}
      {activeCat && (
        <>
          <p className="text-xs font-semibold text-[#788093] mb-3">
            {activeCat} · 렌탈사별 주문건수 · {companyLabel}{" "}
            <span style={{ color: "var(--color-primary-500)" }}>●</span>
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
                        fill={isMe ? "var(--color-primary-500)" : "var(--color-gray-500)"}
                      >
                        {payload.value}
                      </text>
                    );
                  }}
                />
                <Tooltip
                  formatter={(value) => [
                    `${Number(value).toLocaleString("ko-KR")}건`,
                    "주문건수",
                  ]}
                  contentStyle={{
                    background: "#ffffff",
                    border: "1px solid var(--color-gray-200)",
                    borderRadius: 8,
                    boxShadow: "none",
                  }}
                  labelStyle={{ color: "var(--color-gray-900)", fontWeight: 600 }}
                  itemStyle={{ color: "var(--color-gray-500)" }}
                  cursor={{ fill: "rgba(0,0,0,0.03)" }}
                />
                <Bar {...CHART_ANIM} dataKey="count" radius={[0, 4, 4, 0]}>
                  {companyData.map((d) => (
                    <Cell
                      key={d.company}
                      fill={d.company === myDbName ? "var(--color-primary-500)" : "var(--color-gray-200)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
