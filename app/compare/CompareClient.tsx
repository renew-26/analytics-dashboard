"use client";

import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import type { CompanyMonthData } from "./page";

type CompanyMapEntry = { label: string; dbName: string };

type Props = {
  data: CompanyMonthData[];
  companies: string[];
  months: string[];
  companyMap: CompanyMapEntry[];
};

function getDbName(label: string, companyMap: CompanyMapEntry[]): string | null {
  const entry = companyMap.find((c) => c.label === label);
  return entry ? entry.dbName : null;
}

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

const COLOR_A = "#6366f1";
const COLOR_B = "#f59e0b";

export default function CompareClient({
  data,
  companies,
  months,
  companyMap,
}: Props) {
  const [companyA, setCompanyA] = useState<string>("");
  const [companyB, setCompanyB] = useState<string>("");

  const dbNameA = companyA ? getDbName(companyA, companyMap) : null;
  const dbNameB = companyB ? getDbName(companyB, companyMap) : null;

  // 선택된 회사의 데이터 필터
  const dataA = useMemo(
    () => (dbNameA ? data.filter((d) => d.company === dbNameA) : []),
    [data, dbNameA],
  );
  const dataB = useMemo(
    () => (dbNameB ? data.filter((d) => d.company === dbNameB) : []),
    [data, dbNameB],
  );

  // 최근 3개월
  const last3Months = months.slice(-3);

  function sumMetrics(rows: CompanyMonthData[], monthFilter?: string[]) {
    const filtered = monthFilter
      ? rows.filter((r) => monthFilter.includes(r.month))
      : rows;
    return {
      count: filtered.reduce((s, r) => s + r.count, 0),
      totalFee: filtered.reduce((s, r) => s + r.totalFee, 0),
    };
  }

  const summaryA = useMemo(() => sumMetrics(dataA, last3Months), [dataA, last3Months]);
  const summaryB = useMemo(() => sumMetrics(dataB, last3Months), [dataB, last3Months]);

  // 월별 매출 추이 차트 데이터
  const trendData = useMemo(() => {
    return months.map((month) => {
      const rowsA = dataA.filter((d) => d.month === month);
      const rowsB = dataB.filter((d) => d.month === month);
      return {
        month,
        [companyA || "A"]: rowsA.reduce((s, r) => s + r.totalFee, 0),
        [companyB || "B"]: rowsB.reduce((s, r) => s + r.totalFee, 0),
      };
    });
  }, [dataA, dataB, months, companyA, companyB]);

  // 카테고리 비중 비교 (최근 3개월)
  const catDataA = useMemo(() => {
    const map = new Map<string, number>();
    dataA
      .filter((d) => last3Months.includes(d.month))
      .forEach((d) => map.set(d.category, (map.get(d.category) ?? 0) + d.count));
    const total = [...map.values()].reduce((s, v) => s + v, 0);
    return [...map.entries()]
      .map(([cat, count]) => ({
        cat,
        pct: total > 0 ? parseFloat(((count / total) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 8);
  }, [dataA, last3Months]);

  const catDataB = useMemo(() => {
    const map = new Map<string, number>();
    dataB
      .filter((d) => last3Months.includes(d.month))
      .forEach((d) => map.set(d.category, (map.get(d.category) ?? 0) + d.count));
    const total = [...map.values()].reduce((s, v) => s + v, 0);
    return [...map.entries()]
      .map(([cat, count]) => ({
        cat,
        pct: total > 0 ? parseFloat(((count / total) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 8);
  }, [dataB, last3Months]);

  const bothSelected = companyA && companyB;

  return (
    <div className="space-y-6">
      {/* 회사 선택 */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-semibold"
            style={{ color: COLOR_A }}
          >
            렌탈사 A
          </span>
          <select
            value={companyA}
            onChange={(e) => setCompanyA(e.target.value)}
            className="border border-[#ebebe9] rounded-lg px-3 py-1.5 text-sm text-[#393939] bg-white focus:outline-none focus:border-[#6366f1] min-w-36"
          >
            <option value="">선택...</option>
            {companies.map((c) => (
              <option key={c} value={c} disabled={c === companyB}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <span className="text-[#a1a5ac] text-lg font-light">vs</span>
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-semibold"
            style={{ color: COLOR_B }}
          >
            렌탈사 B
          </span>
          <select
            value={companyB}
            onChange={(e) => setCompanyB(e.target.value)}
            className="border border-[#ebebe9] rounded-lg px-3 py-1.5 text-sm text-[#393939] bg-white focus:outline-none focus:border-[#6366f1] min-w-36"
          >
            <option value="">선택...</option>
            {companies.map((c) => (
              <option key={c} value={c} disabled={c === companyA}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!bothSelected && (
        <div className="bg-[#f9fafb] border border-[#ebebe9] rounded-xl px-6 py-12 text-center text-[#a1a5ac] text-sm">
          비교할 렌탈사를 선택해주세요
        </div>
      )}

      {bothSelected && (
        <>
          {/* 지표 카드 */}
          <div className="grid grid-cols-2 gap-4">
            {/* 계약건수 */}
            <div className="bg-white border border-[#ebebe9] rounded-xl p-5">
              <div className="text-xs font-semibold text-[#788093] mb-3">
                최근 3개월 계약건수
              </div>
              <div className="flex justify-between items-end gap-2">
                <div>
                  <div
                    className="text-xs font-medium mb-1"
                    style={{ color: COLOR_A }}
                  >
                    {companyA}
                  </div>
                  <div
                    className="text-2xl font-bold"
                    style={{
                      color:
                        summaryA.count >= summaryB.count
                          ? COLOR_A
                          : "#222222",
                    }}
                  >
                    {fmt(summaryA.count)}건
                  </div>
                </div>
                <div className="text-[#babab7] text-lg">vs</div>
                <div className="text-right">
                  <div
                    className="text-xs font-medium mb-1"
                    style={{ color: COLOR_B }}
                  >
                    {companyB}
                  </div>
                  <div
                    className="text-2xl font-bold"
                    style={{
                      color:
                        summaryB.count >= summaryA.count
                          ? COLOR_B
                          : "#222222",
                    }}
                  >
                    {fmt(summaryB.count)}건
                  </div>
                </div>
              </div>
              <div className="mt-3 text-xs text-[#a1a5ac]">
                차이:{" "}
                <span className="font-medium text-[#586177]">
                  {fmt(Math.abs(summaryA.count - summaryB.count))}건
                </span>{" "}
                ({summaryA.count >= summaryB.count ? companyA : companyB} 우세)
              </div>
            </div>

            {/* 총 렌탈료 */}
            <div className="bg-white border border-[#ebebe9] rounded-xl p-5">
              <div className="text-xs font-semibold text-[#788093] mb-3">
                최근 3개월 총 렌탈료
              </div>
              <div className="flex justify-between items-end gap-2">
                <div>
                  <div
                    className="text-xs font-medium mb-1"
                    style={{ color: COLOR_A }}
                  >
                    {companyA}
                  </div>
                  <div
                    className="text-2xl font-bold"
                    style={{
                      color:
                        summaryA.totalFee >= summaryB.totalFee
                          ? COLOR_A
                          : "#222222",
                    }}
                  >
                    {fmt(Math.round(summaryA.totalFee))}원
                  </div>
                </div>
                <div className="text-[#babab7] text-lg">vs</div>
                <div className="text-right">
                  <div
                    className="text-xs font-medium mb-1"
                    style={{ color: COLOR_B }}
                  >
                    {companyB}
                  </div>
                  <div
                    className="text-2xl font-bold"
                    style={{
                      color:
                        summaryB.totalFee >= summaryA.totalFee
                          ? COLOR_B
                          : "#222222",
                    }}
                  >
                    {fmt(Math.round(summaryB.totalFee))}원
                  </div>
                </div>
              </div>
              <div className="mt-3 text-xs text-[#a1a5ac]">
                차이:{" "}
                <span className="font-medium text-[#586177]">
                  {fmt(Math.round(Math.abs(summaryA.totalFee - summaryB.totalFee)))}원
                </span>{" "}
                ({summaryA.totalFee >= summaryB.totalFee ? companyA : companyB} 우세)
              </div>
            </div>
          </div>

          {/* 월별 매출 추이 */}
          <div className="bg-white border border-[#ebebe9] rounded-xl p-5">
            <h2 className="text-base font-semibold text-[#222222] mb-4">
              월별 총 렌탈료 추이
            </h2>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart
                data={trendData}
                margin={{ top: 4, right: 24, left: 0, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#ebebe9" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: "#788093" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#788093" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`}
                />
                <Tooltip
                  formatter={(v, name) => [
                    `${fmt(Math.round(Number(v)))}원`,
                    name,
                  ]}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #ebebe9",
                    fontSize: 13,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey={companyA}
                  stroke={COLOR_A}
                  strokeWidth={2}
                  dot={{ r: 4, fill: COLOR_A }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey={companyB}
                  stroke={COLOR_B}
                  strokeWidth={2}
                  dot={{ r: 4, fill: COLOR_B }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 카테고리 비중 비교 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-[#ebebe9] rounded-xl p-5">
              <h2 className="text-sm font-semibold text-[#222222] mb-4">
                <span style={{ color: COLOR_A }}>{companyA}</span> 카테고리 비중
                <span className="text-xs font-normal text-[#a1a5ac] ml-1">
                  (최근 3개월)
                </span>
              </h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={catDataA}
                  layout="vertical"
                  margin={{ top: 0, right: 32, left: 8, bottom: 0 }}
                >
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: "#788093" }}
                    axisLine={false}
                    tickLine={false}
                    unit="%"
                    domain={[0, 100]}
                  />
                  <YAxis
                    type="category"
                    dataKey="cat"
                    tick={{ fontSize: 11, fill: "#393939" }}
                    axisLine={false}
                    tickLine={false}
                    width={70}
                  />
                  <Tooltip
                    formatter={(v) => [`${v}%`, "비중"]}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #ebebe9",
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="pct" fill={COLOR_A} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white border border-[#ebebe9] rounded-xl p-5">
              <h2 className="text-sm font-semibold text-[#222222] mb-4">
                <span style={{ color: COLOR_B }}>{companyB}</span> 카테고리 비중
                <span className="text-xs font-normal text-[#a1a5ac] ml-1">
                  (최근 3개월)
                </span>
              </h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={catDataB}
                  layout="vertical"
                  margin={{ top: 0, right: 32, left: 8, bottom: 0 }}
                >
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: "#788093" }}
                    axisLine={false}
                    tickLine={false}
                    unit="%"
                    domain={[0, 100]}
                  />
                  <YAxis
                    type="category"
                    dataKey="cat"
                    tick={{ fontSize: 11, fill: "#393939" }}
                    axisLine={false}
                    tickLine={false}
                    width={70}
                  />
                  <Tooltip
                    formatter={(v) => [`${v}%`, "비중"]}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #ebebe9",
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="pct" fill={COLOR_B} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
