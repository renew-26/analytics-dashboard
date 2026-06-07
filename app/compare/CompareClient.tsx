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
import type { CompanyMonthData, CompanyOrderData } from "./page";

type CompanyMapEntry = {
  label: string;
  dbName: string;
  categoryIs?: string | string[];
  categoryNot?: string | string[];
};

type Props = {
  data: CompanyMonthData[];
  orderData: CompanyOrderData[];
  companies: string[];
  months: string[];
  companyMap: CompanyMapEntry[];
};

// 받침 여부로 조사 선택 (과/와, 을/를)
function hasBatchim(str: string): boolean {
  const code = str.charCodeAt(str.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}
function josa(str: string, withBatchim: string, withoutBatchim: string) {
  return hasBatchim(str) ? withBatchim : withoutBatchim;
}

function getEntry(
  label: string,
  companyMap: CompanyMapEntry[],
): CompanyMapEntry | null {
  return companyMap.find((c) => c.label === label) ?? null;
}

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

const COLOR_A = "#6366f1";
const COLOR_B = "#f59e0b";

export default function CompareClient({
  data,
  orderData,
  companies,
  months,
  companyMap,
}: Props) {
  const [companyA, setCompanyA] = useState<string>("");
  const [companyB, setCompanyB] = useState<string>("");
  const [showAllConversion, setShowAllConversion] = useState(false);
  const [showAllAvgFee, setShowAllAvgFee] = useState(false);
  const [showAllAvgIncentive, setShowAllAvgIncentive] = useState(false);
  const [trendFilter, setTrendFilter] = useState<"all" | "up" | "down">("all");
  const [showAllTrend, setShowAllTrend] = useState(false);

  const entryA = companyA ? getEntry(companyA, companyMap) : null;
  const entryB = companyB ? getEntry(companyB, companyMap) : null;

  // 선택된 회사의 데이터 필터 (categoryIs/categoryNot 적용)
  const dataA = useMemo(() => {
    if (!entryA) return [];
    return data.filter((d) => {
      if (d.company !== entryA.dbName) return false;
      if (entryA.categoryIs) {
        const cis = entryA.categoryIs;
        if (Array.isArray(cis) ? !cis.includes(d.category ?? "") : cis !== d.category) return false;
      }
      if (entryA.categoryNot) {
        const cnot = entryA.categoryNot;
        if (Array.isArray(cnot) ? cnot.includes(d.category ?? "") : cnot === d.category) return false;
      }
      return true;
    });
  }, [data, entryA]);
  const dataB = useMemo(() => {
    if (!entryB) return [];
    return data.filter((d) => {
      if (d.company !== entryB.dbName) return false;
      if (entryB.categoryIs) {
        const cis = entryB.categoryIs;
        if (Array.isArray(cis) ? !cis.includes(d.category ?? "") : cis !== d.category) return false;
      }
      if (entryB.categoryNot) {
        const cnot = entryB.categoryNot;
        if (Array.isArray(cnot) ? cnot.includes(d.category ?? "") : cnot === d.category) return false;
      }
      return true;
    });
  }, [data, entryB]);

  // 최근 3개월
  const last3Months = months.slice(-3);

  function sumMetrics(rows: CompanyMonthData[], monthFilter?: string[]) {
    const filtered = monthFilter
      ? rows.filter((r) => monthFilter.includes(r.month))
      : rows;
    return {
      count: filtered.reduce((s, r) => s + r.count, 0),
      totalFee: filtered.reduce((s, r) => s + r.totalRentalFee, 0),
    };
  }

  const summaryA = useMemo(
    () => sumMetrics(dataA, last3Months),
    [dataA, last3Months],
  );
  const summaryB = useMemo(
    () => sumMetrics(dataB, last3Months),
    [dataB, last3Months],
  );

  // 월별 매출 추이 차트 데이터
  const trendData = useMemo(() => {
    return months.map((month) => {
      const rowsA = dataA.filter((d) => d.month === month);
      const rowsB = dataB.filter((d) => d.month === month);
      return {
        month,
        [companyA || "A"]: rowsA.reduce((s, r) => s + r.totalRentalFee, 0),
        [companyB || "B"]: rowsB.reduce((s, r) => s + r.totalRentalFee, 0),
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

  // 전환율 비교 (카테고리별)
  const conversionData = useMemo(() => {
    if (!entryA || !entryB) return [];

    // orders 필터
    function filterOrders(entry: CompanyMapEntry) {
      return orderData.filter((d) => {
        if (d.company !== entry.dbName) return false;
        if (entry.categoryIs) {
          const cis = entry.categoryIs;
          if (Array.isArray(cis) ? !cis.includes(d.category ?? "") : cis !== d.category) return false;
        }
        if (entry.categoryNot) {
          const cnot = entry.categoryNot;
          if (Array.isArray(cnot) ? cnot.includes(d.category ?? "") : cnot === d.category) return false;
        }
        return true;
      });
    }

    const ordersA = filterOrders(entryA);
    const ordersB = filterOrders(entryB);

    // category별 집계
    const catOrderA = new Map<string, number>();
    for (const d of ordersA) catOrderA.set(d.category, (catOrderA.get(d.category) ?? 0) + d.orderCount);

    const catOrderB = new Map<string, number>();
    for (const d of ordersB) catOrderB.set(d.category, (catOrderB.get(d.category) ?? 0) + d.orderCount);

    const catContractA = new Map<string, number>();
    for (const d of dataA) catContractA.set(d.category, (catContractA.get(d.category) ?? 0) + d.count);

    const catContractB = new Map<string, number>();
    for (const d of dataB) catContractB.set(d.category, (catContractB.get(d.category) ?? 0) + d.count);

    // 공통 카테고리
    const allCats = new Set([
      ...catOrderA.keys(), ...catOrderB.keys(),
      ...catContractA.keys(), ...catContractB.keys(),
    ]);

    return [...allCats]
      .map((cat) => {
        const aoA = catOrderA.get(cat) ?? 0;
        const acA = catContractA.get(cat) ?? 0;
        const aoB = catOrderB.get(cat) ?? 0;
        const acB = catContractB.get(cat) ?? 0;
        if (aoA === 0 && aoB === 0) return null;
        return {
          cat,
          orderA: aoA,
          contractA: acA,
          rateA: aoA > 0 ? (acA / aoA) * 100 : 0,
          orderB: aoB,
          contractB: acB,
          rateB: aoB > 0 ? (acB / aoB) * 100 : 0,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b!.orderA - a!.orderA) as {
        cat: string; orderA: number; contractA: number; rateA: number;
        orderB: number; contractB: number; rateB: number;
      }[];
  }, [dataA, dataB, orderData, entryA, entryB]);

  // 평균 렌탈료 비교 (카테고리별) — A사 주문건수 기준 정렬
  const avgFeeData = useMemo(() => {
    if (!entryA || !entryB) return [];

    const catFeeA = new Map<string, { fee: number; count: number }>();
    for (const d of dataA) {
      const prev = catFeeA.get(d.category) ?? { fee: 0, count: 0 };
      catFeeA.set(d.category, { fee: prev.fee + d.totalFee, count: prev.count + d.count });
    }

    const catFeeB = new Map<string, { fee: number; count: number }>();
    for (const d of dataB) {
      const prev = catFeeB.get(d.category) ?? { fee: 0, count: 0 };
      catFeeB.set(d.category, { fee: prev.fee + d.totalFee, count: prev.count + d.count });
    }

    // A사 주문건수 (정렬용)
    const catOrderA = new Map<string, number>();
    for (const d of orderData) {
      if (d.company !== entryA.dbName) continue;
      if (entryA.categoryIs) {
        const cis = entryA.categoryIs;
        if (Array.isArray(cis) ? !cis.includes(d.category ?? "") : cis !== d.category) continue;
      }
      if (entryA.categoryNot) {
        const cnot = entryA.categoryNot;
        if (Array.isArray(cnot) ? cnot.includes(d.category ?? "") : cnot === d.category) continue;
      }
      catOrderA.set(d.category, (catOrderA.get(d.category) ?? 0) + d.orderCount);
    }

    const allCats = new Set([...catFeeA.keys(), ...catFeeB.keys()]);
    return [...allCats]
      .map((cat) => {
        const a = catFeeA.get(cat);
        const b = catFeeB.get(cat);
        if (!a && !b) return null;
        const avgA = a && a.count > 0 ? a.fee / a.count : 0;
        const avgB = b && b.count > 0 ? b.fee / b.count : 0;
        return { cat, avgA, avgB, diff: avgA - avgB, orderA: catOrderA.get(cat) ?? 0 };
      })
      .filter(Boolean)
      .sort((a, b) => b!.orderA - a!.orderA) as {
        cat: string; avgA: number; avgB: number; diff: number; orderA: number;
      }[];
  }, [dataA, dataB, orderData, entryA, entryB]);

  // 카테고리 인사이트 (최근 3개월 기준 상위 카테고리 + 상호 비교)
  const categoryInsight = useMemo(() => {
    if (!entryA || !entryB) return null;

    const catStatsA = new Map<string, { count: number; totalFee: number }>();
    for (const d of dataA.filter((r) => last3Months.includes(r.month))) {
      const s = catStatsA.get(d.category) ?? { count: 0, totalFee: 0 };
      catStatsA.set(d.category, { count: s.count + d.count, totalFee: s.totalFee + d.totalFee });
    }
    const catStatsB = new Map<string, { count: number; totalFee: number }>();
    for (const d of dataB.filter((r) => last3Months.includes(r.month))) {
      const s = catStatsB.get(d.category) ?? { count: 0, totalFee: 0 };
      catStatsB.set(d.category, { count: s.count + d.count, totalFee: s.totalFee + d.totalFee });
    }

    const totalA = [...catStatsA.values()].reduce((s, v) => s + v.count, 0);
    const totalB = [...catStatsB.values()].reduce((s, v) => s + v.count, 0);

    const topA = [...catStatsA.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3)
      .map(([cat, v]) => ({
        cat,
        count: v.count,
        share: totalA > 0 ? Math.round((v.count / totalA) * 100) : 0,
        avgFee: v.count > 0 ? Math.round(v.totalFee / v.count) : 0,
      }));
    const topB = [...catStatsB.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3)
      .map(([cat, v]) => ({
        cat,
        count: v.count,
        share: totalB > 0 ? Math.round((v.count / totalB) * 100) : 0,
        avgFee: v.count > 0 ? Math.round(v.totalFee / v.count) : 0,
      }));

    const top1A = topA[0];
    const top1B = topB[0];

    // A 1순위 카테고리에서 B의 현황
    const bInTopA = top1A ? catStatsB.get(top1A.cat) : undefined;
    const bAvgInTopA = bInTopA && bInTopA.count > 0 ? Math.round(bInTopA.totalFee / bInTopA.count) : null;
    const bShareInTopA = bInTopA && totalB > 0 ? Math.round((bInTopA.count / totalB) * 100) : 0;

    // B 1순위 카테고리에서 A의 현황
    const aInTopB = top1B ? catStatsA.get(top1B.cat) : undefined;
    const aAvgInTopB = aInTopB && aInTopB.count > 0 ? Math.round(aInTopB.totalFee / aInTopB.count) : null;
    const aShareInTopB = aInTopB && totalA > 0 ? Math.round((aInTopB.count / totalA) * 100) : 0;

    return { topA, topB, top1A, top1B, bAvgInTopA, bShareInTopA, aAvgInTopB, aShareInTopB };
  }, [dataA, dataB, last3Months, entryA, entryB]);

  // 카테고리별 거래건수 추이 (Section 4)
  const categoryTrendData = useMemo(() => {
    if (!entryA || !entryB || months.length < 2) return [];
    const lastMonth = months[months.length - 1];
    const prevMonth = months[months.length - 2];

    // 전체 시장 (data prop의 모든 행)
    const totalCatPrev = new Map<string, number>();
    const totalCatLast = new Map<string, number>();
    for (const d of data) {
      if (d.month === prevMonth)
        totalCatPrev.set(
          d.category,
          (totalCatPrev.get(d.category) ?? 0) + d.count,
        );
      if (d.month === lastMonth)
        totalCatLast.set(
          d.category,
          (totalCatLast.get(d.category) ?? 0) + d.count,
        );
    }

    // A사
    const catPrevA = new Map<string, number>();
    const catLastA = new Map<string, number>();
    for (const d of dataA) {
      if (d.month === prevMonth)
        catPrevA.set(d.category, (catPrevA.get(d.category) ?? 0) + d.count);
      if (d.month === lastMonth)
        catLastA.set(d.category, (catLastA.get(d.category) ?? 0) + d.count);
    }

    // B사
    const catPrevB = new Map<string, number>();
    const catLastB = new Map<string, number>();
    for (const d of dataB) {
      if (d.month === prevMonth)
        catPrevB.set(d.category, (catPrevB.get(d.category) ?? 0) + d.count);
      if (d.month === lastMonth)
        catLastB.set(d.category, (catLastB.get(d.category) ?? 0) + d.count);
    }

    const allCats = new Set([...totalCatLast.keys(), ...totalCatPrev.keys()]);
    return [...allCats]
      .map((cat) => ({
        cat,
        totalPrev: totalCatPrev.get(cat) ?? 0,
        totalLast: totalCatLast.get(cat) ?? 0,
        countLastA: catLastA.get(cat) ?? 0,
        deltaA: (catLastA.get(cat) ?? 0) - (catPrevA.get(cat) ?? 0),
        countLastB: catLastB.get(cat) ?? 0,
        deltaB: (catLastB.get(cat) ?? 0) - (catPrevB.get(cat) ?? 0),
      }))
      .filter((r) => r.totalLast > 0 || r.totalPrev > 0)
      .sort((a, b) => b.countLastA - a.countLastA);
  }, [data, dataA, dataB, months, entryA, entryB]);

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
          {/* 분석 기준 설명 */}
          <div className="bg-[#edf2ff] border border-[#a9b1ff] rounded-xl px-5 py-3 flex items-center gap-2">
            <span
              className="text-sm font-bold"
              style={{ color: COLOR_A }}
            >
              {companyA}
            </span>
            <span className="text-sm text-[#586177]">
              {josa(companyA, "을", "를")} 기준으로{" "}
              <span className="font-semibold text-[#393939]">{companyB}</span>
              {josa(companyB, "과", "와")} 비교합니다. 카테고리별 전환율·평균 렌탈료는{" "}
              <span className="font-semibold" style={{ color: COLOR_A }}>
                {companyA}
              </span>{" "}
              주문건수 기준으로 정렬됩니다.
            </span>
          </div>

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
                        summaryA.count > summaryB.count
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
                        summaryB.count > summaryA.count
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
                        summaryA.totalFee > summaryB.totalFee
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
                        summaryB.totalFee > summaryA.totalFee
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

          {/* Section 4: 카테고리별 거래건수 추이 */}
          <div className="bg-white border border-[#ebebe9] rounded-xl p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-semibold text-[#222222]">
                카테고리별 거래건수 추이
              </h2>
              <div className="flex gap-1">
                {(["all", "up", "down"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setTrendFilter(f)}
                    className="px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
                    style={
                      trendFilter === f
                        ? {
                            background:
                              f === "up"
                                ? COLOR_A
                                : f === "down"
                                  ? "#FF5252"
                                  : "#3531FF",
                            color: "#fff",
                          }
                        : { background: "#f3f5f9", color: "#788093" }
                    }
                  >
                    {f === "all"
                      ? "전체"
                      : f === "up"
                        ? `${companyA} ▲ 증가`
                        : `${companyA} ▼ 감소`}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-[#a1a5ac] mb-4">
              계약완료 기준 ·{" "}
              {months.length >= 2
                ? `${months[months.length - 2]} → ${months[months.length - 1]}`
                : ""}
            </p>
            {categoryTrendData.filter((r) =>
              trendFilter === "up"
                ? r.deltaA > 0
                : trendFilter === "down"
                  ? r.deltaA < 0
                  : true,
            ).length === 0 ? (
              <div className="text-sm text-[#a1a5ac] text-center py-6">
                데이터 없음
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#ebebe9]">
                      <th className="text-left py-2 pr-3 text-xs font-semibold text-[#788093] w-24">
                        카테고리
                      </th>
                      <th className="text-right py-2 px-2 text-xs font-semibold text-[#788093]">
                        전체 전월
                      </th>
                      <th className="text-right py-2 px-2 text-xs font-semibold text-[#788093]">
                        전체 이번달
                      </th>
                      <th
                        className="text-right py-2 px-2 text-xs font-semibold"
                        style={{ color: COLOR_A }}
                      >
                        {companyA}
                      </th>
                      <th
                        className="text-right py-2 px-2 text-xs font-semibold"
                        style={{ color: COLOR_A }}
                      >
                        전월대비
                      </th>
                      <th
                        className="text-right py-2 px-2 text-xs font-semibold"
                        style={{ color: COLOR_B }}
                      >
                        {companyB}
                      </th>
                      <th
                        className="text-right py-2 pl-2 text-xs font-semibold"
                        style={{ color: COLOR_B }}
                      >
                        전월대비
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryTrendData
                      .filter((r) =>
                        trendFilter === "up"
                          ? r.deltaA > 0
                          : trendFilter === "down"
                            ? r.deltaA < 0
                            : true,
                      )
                      .slice(0, showAllTrend ? undefined : 7)
                      .map((row) => (
                        <tr
                          key={row.cat}
                          className="border-b border-[#f3f5f9] hover:bg-[#f9fafb]"
                        >
                          <td className="py-2 pr-3 text-xs text-[#393939] font-medium">
                            {row.cat}
                          </td>
                          <td className="py-2 px-2 text-right text-xs text-[#a1a5ac]">
                            {row.totalPrev.toLocaleString("ko-KR")}
                          </td>
                          <td className="py-2 px-2 text-right text-xs text-[#586177] font-medium">
                            {row.totalLast.toLocaleString("ko-KR")}
                          </td>
                          <td className="py-2 px-2 text-right text-xs text-[#586177]">
                            {row.countLastA.toLocaleString("ko-KR")}
                          </td>
                          <td
                            className="py-2 px-2 text-right text-xs font-semibold"
                            style={{
                              color:
                                row.deltaA > 0
                                  ? COLOR_A
                                  : row.deltaA < 0
                                    ? "#FF5252"
                                    : "#a1a5ac",
                            }}
                          >
                            {row.deltaA > 0 ? "+" : ""}
                            {row.deltaA.toLocaleString("ko-KR")}
                          </td>
                          <td className="py-2 px-2 text-right text-xs text-[#586177]">
                            {row.countLastB.toLocaleString("ko-KR")}
                          </td>
                          <td
                            className="py-2 pl-2 text-right text-xs font-semibold"
                            style={{
                              color:
                                row.deltaB > 0
                                  ? COLOR_B
                                  : row.deltaB < 0
                                    ? "#FF5252"
                                    : "#a1a5ac",
                            }}
                          >
                            {row.deltaB > 0 ? "+" : ""}
                            {row.deltaB.toLocaleString("ko-KR")}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {(() => {
                  const filtered = categoryTrendData.filter((r) =>
                    trendFilter === "up"
                      ? r.deltaA > 0
                      : trendFilter === "down"
                        ? r.deltaA < 0
                        : true,
                  );
                  if (filtered.length <= 7) return null;
                  return (
                    <button
                      onClick={() => setShowAllTrend((v) => !v)}
                      className="mt-3 w-full text-xs text-[#788093] hover:text-[#393939] transition-colors"
                    >
                      {showAllTrend
                        ? "▲ 접기"
                        : `▼ 더 보기 (${filtered.length - 7}개 더)`}
                    </button>
                  );
                })()}
              </div>
            )}
          </div>

          {/* 카테고리별 전환율 비교 */}
          <div className="bg-white border border-[#ebebe9] rounded-xl p-5">
            <h2 className="text-base font-semibold text-[#222222] mb-1">
              카테고리별 전환율 비교
            </h2>
            <p className="text-xs text-[#a1a5ac] mb-4">
              주문확정 → 계약완료 · 전환율이 낮을수록 심사 기준이 높거나 처리
              속도가 느린 경향
            </p>
            {conversionData.length === 0 ? (
              <div className="text-sm text-[#a1a5ac] text-center py-6">
                데이터 없음
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#ebebe9]">
                      <th className="text-left py-2 pr-3 text-xs font-semibold text-[#788093] w-28">
                        카테고리
                      </th>
                      <th
                        className="text-right py-2 px-2 text-xs font-semibold"
                        style={{ color: COLOR_A }}
                      >
                        {companyA} 주문확정
                      </th>
                      <th
                        className="text-right py-2 px-2 text-xs font-semibold"
                        style={{ color: COLOR_A }}
                      >
                        {companyA} 계약완료
                      </th>
                      <th
                        className="text-right py-2 px-2 text-xs font-semibold"
                        style={{ color: COLOR_A }}
                      >
                        {companyA} 전환율
                      </th>
                      <th
                        className="text-right py-2 px-2 text-xs font-semibold"
                        style={{ color: COLOR_B }}
                      >
                        {companyB} 주문확정
                      </th>
                      <th
                        className="text-right py-2 px-2 text-xs font-semibold"
                        style={{ color: COLOR_B }}
                      >
                        {companyB} 계약완료
                      </th>
                      <th
                        className="text-right py-2 pl-2 text-xs font-semibold"
                        style={{ color: COLOR_B }}
                      >
                        {companyB} 전환율
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(showAllConversion
                      ? conversionData
                      : conversionData.slice(0, 7)
                    ).map((row) => (
                      <tr
                        key={row.cat}
                        className="border-b border-[#f3f5f9] hover:bg-[#f9fafb]"
                      >
                        <td className="py-2 pr-3 text-xs text-[#393939] font-medium">
                          {row.cat}
                        </td>
                        <td className="py-2 px-2 text-right text-xs text-[#586177]">
                          {fmt(row.orderA)}
                        </td>
                        <td className="py-2 px-2 text-right text-xs text-[#586177]">
                          {fmt(row.contractA)}
                        </td>
                        <td
                          className="py-2 px-2 text-right text-xs font-semibold"
                          style={{
                            color: row.rateA > row.rateB ? COLOR_A : "#a1a5ac",
                          }}
                        >
                          {row.rateA.toFixed(1)}%
                        </td>
                        <td className="py-2 px-2 text-right text-xs text-[#586177]">
                          {fmt(row.orderB)}
                        </td>
                        <td className="py-2 px-2 text-right text-xs text-[#586177]">
                          {fmt(row.contractB)}
                        </td>
                        <td
                          className="py-2 pl-2 text-right text-xs font-semibold"
                          style={{
                            color: row.rateB > row.rateA ? COLOR_B : "#a1a5ac",
                          }}
                        >
                          {row.rateB.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {conversionData.length > 7 && (
                  <button
                    onClick={() => setShowAllConversion((v) => !v)}
                    className="mt-3 w-full text-xs text-[#788093] hover:text-[#393939] py-2 border-t border-[#f3f5f9] transition-colors"
                  >
                    {showAllConversion
                      ? `▲ 접기`
                      : `▼ 더 보기 (${conversionData.length - 7}개 더)`}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 카테고리별 평균 렌탈료 비교 */}
          <div className="bg-white border border-[#ebebe9] rounded-xl p-5">
            <h2 className="text-base font-semibold text-[#222222] mb-1">
              카테고리별 평균 렌탈료 비교
            </h2>
            <p className="text-xs text-[#a1a5ac] mb-4">
              계약완료 기준 · 평균 렌탈료 = 총 렌탈료 합계 ÷ 계약건수
            </p>
            {avgFeeData.length === 0 ? (
              <div className="text-sm text-[#a1a5ac] text-center py-6">데이터 없음</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#ebebe9]">
                      <th className="text-left py-2 pr-3 text-xs font-semibold text-[#788093] w-28">카테고리</th>
                      <th className="text-right py-2 px-2 text-xs font-semibold" style={{ color: COLOR_A }}>{companyA} 평균</th>
                      <th className="text-right py-2 px-2 text-xs font-semibold" style={{ color: COLOR_B }}>{companyB} 평균</th>
                      <th className="text-right py-2 pl-2 text-xs font-semibold text-[#788093]">차이</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(showAllAvgFee ? avgFeeData : avgFeeData.slice(0, 7)).map((row) => (
                      <tr key={row.cat} className="border-b border-[#f3f5f9] hover:bg-[#f9fafb]">
                        <td className="py-2 pr-3 text-xs text-[#393939] font-medium">{row.cat}</td>
                        <td className="py-2 px-2 text-right text-xs font-semibold"
                          style={{ color: row.avgA > row.avgB ? COLOR_A : "#a1a5ac" }}>
                          {fmt(Math.round(row.avgA))}원
                        </td>
                        <td className="py-2 px-2 text-right text-xs font-semibold"
                          style={{ color: row.avgB > row.avgA ? COLOR_B : "#a1a5ac" }}>
                          {fmt(Math.round(row.avgB))}원
                        </td>
                        <td className="py-2 pl-2 text-right text-xs text-[#586177]">
                          {row.diff > 0 ? "+" : ""}{fmt(Math.round(row.diff))}원
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {avgFeeData.length > 7 && (
                  <button
                    onClick={() => setShowAllAvgFee((v) => !v)}
                    className="mt-3 w-full text-xs text-[#788093] hover:text-[#393939] py-2 border-t border-[#f3f5f9] transition-colors"
                  >
                    {showAllAvgFee
                      ? `▲ 접기`
                      : `▼ 더 보기 (${avgFeeData.length - 7}개 더)`}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Section 4: 카테고리별 거래건수 추이 */}
          <div className="bg-white border border-[#ebebe9] rounded-xl p-5">
            <h2 className="text-base font-semibold text-[#222222] mb-1">카테고리별 거래건수 추이</h2>
            <p className="text-xs text-[#a1a5ac] mb-4">
              계약완료 기준 · {months.length >= 2 ? `${months[months.length - 2]} → ${months[months.length - 1]}` : ""}
            </p>
            {categoryTrendData.length === 0 ? (
              <div className="text-sm text-[#a1a5ac] text-center py-6">데이터 없음</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#ebebe9]">
                      <th className="text-left py-2 pr-3 text-xs font-semibold text-[#788093] w-24">카테고리</th>
                      <th className="text-right py-2 px-2 text-xs font-semibold text-[#788093]">전체 전월</th>
                      <th className="text-right py-2 px-2 text-xs font-semibold text-[#788093]">전체 이번달</th>
                      <th className="text-right py-2 px-2 text-xs font-semibold" style={{ color: COLOR_A }}>{companyA}</th>
                      <th className="text-right py-2 px-2 text-xs font-semibold" style={{ color: COLOR_A }}>전월대비</th>
                      <th className="text-right py-2 px-2 text-xs font-semibold" style={{ color: COLOR_B }}>{companyB}</th>
                      <th className="text-right py-2 pl-2 text-xs font-semibold" style={{ color: COLOR_B }}>전월대비</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryTrendData.map((row) => (
                      <tr key={row.cat} className="border-b border-[#f3f5f9] hover:bg-[#f9fafb]">
                        <td className="py-2 pr-3 text-xs text-[#393939] font-medium">{row.cat}</td>
                        <td className="py-2 px-2 text-right text-xs text-[#a1a5ac]">{row.totalPrev.toLocaleString("ko-KR")}</td>
                        <td className="py-2 px-2 text-right text-xs text-[#586177] font-medium">{row.totalLast.toLocaleString("ko-KR")}</td>
                        <td className="py-2 px-2 text-right text-xs text-[#586177]">{row.countLastA.toLocaleString("ko-KR")}</td>
                        <td className="py-2 px-2 text-right text-xs font-semibold"
                          style={{ color: row.deltaA > 0 ? COLOR_A : row.deltaA < 0 ? "#FF5252" : "#a1a5ac" }}>
                          {row.deltaA > 0 ? "+" : ""}{row.deltaA.toLocaleString("ko-KR")}
                        </td>
                        <td className="py-2 px-2 text-right text-xs text-[#586177]">{row.countLastB.toLocaleString("ko-KR")}</td>
                        <td className="py-2 pl-2 text-right text-xs font-semibold"
                          style={{ color: row.deltaB > 0 ? COLOR_B : row.deltaB < 0 ? "#FF5252" : "#a1a5ac" }}>
                          {row.deltaB > 0 ? "+" : ""}{row.deltaB.toLocaleString("ko-KR")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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

          {/* 카테고리 인사이트 요약 */}
          {categoryInsight && categoryInsight.top1A && categoryInsight.top1B && (
            <div className="bg-[#f9fafb] border border-[#ebebe9] rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-semibold text-[#393939]">카테고리 인사이트</h2>
              {/* A사 1순위 */}
              <div className="text-sm text-[#393939] leading-relaxed">
                <span className="font-bold" style={{ color: COLOR_A }}>{companyA}</span>
                {josa(companyA, "은", "는")} 1순위 카테고리가{" "}
                <span className="font-semibold">
                  {categoryInsight.top1A.cat}
                </span>
                {josa(categoryInsight.top1A.cat, "으로", "로")} 전체 계약의{" "}
                <span className="font-semibold">{categoryInsight.top1A.share}%</span>를 차지하며,
                평균 렌탈료는{" "}
                <span className="font-semibold">{fmt(categoryInsight.top1A.avgFee)}원</span>입니다.{" "}
                {categoryInsight.top1A.cat === categoryInsight.top1B.cat ? (
                  // 같은 1순위 카테고리
                  categoryInsight.bAvgInTopA !== null ? (
                    <>
                      <span className="font-bold" style={{ color: COLOR_B }}>{companyB}</span>
                      도 동일 카테고리{" "}
                      <span className="font-semibold">{categoryInsight.top1B.cat}</span>이 1순위
                      ({categoryInsight.top1B.share}%, 평균{" "}
                      <span className="font-semibold">{fmt(categoryInsight.bAvgInTopA)}원</span>)로,{" "}
                      {companyA} 대비 평균 렌탈료가{" "}
                      <span className="font-semibold" style={{
                        color: categoryInsight.top1A.avgFee > categoryInsight.bAvgInTopA
                          ? COLOR_A : COLOR_B,
                      }}>
                        {fmt(Math.abs(categoryInsight.top1A.avgFee - categoryInsight.bAvgInTopA))}원{" "}
                        {categoryInsight.top1A.avgFee > categoryInsight.bAvgInTopA ? "낮습니다" : "높습니다"}.
                      </span>
                    </>
                  ) : null
                ) : (
                  // 다른 1순위
                  categoryInsight.bAvgInTopA !== null ? (
                    <>
                      <span className="font-bold" style={{ color: COLOR_B }}>{companyB}</span>
                      {josa(companyB, "은", "는")} 같은{" "}
                      <span className="font-semibold">{categoryInsight.top1A.cat}</span> 항목 비중이{" "}
                      <span className="font-semibold">{categoryInsight.bShareInTopA}%</span>로,
                      평균 렌탈료 <span className="font-semibold">{fmt(categoryInsight.bAvgInTopA)}원</span>이며{" "}
                      {companyA} 대비{" "}
                      <span className="font-semibold" style={{
                        color: categoryInsight.top1A.avgFee > categoryInsight.bAvgInTopA
                          ? COLOR_A : COLOR_B,
                      }}>
                        {fmt(Math.abs(categoryInsight.top1A.avgFee - categoryInsight.bAvgInTopA))}원{" "}
                        {categoryInsight.top1A.avgFee > categoryInsight.bAvgInTopA ? "낮습니다" : "높습니다"}.
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="font-bold" style={{ color: COLOR_B }}>{companyB}</span>
                      {josa(companyB, "은", "는")} 해당 카테고리 데이터가 없습니다.
                    </>
                  )
                )}
              </div>

              {/* B사 1순위가 A사와 다를 때만 추가 문장 */}
              {categoryInsight.top1A.cat !== categoryInsight.top1B.cat && (
                <div className="text-sm text-[#393939] leading-relaxed">
                  <span className="font-bold" style={{ color: COLOR_B }}>{companyB}</span>
                  {josa(companyB, "은", "는")} 1순위가{" "}
                  <span className="font-semibold">{categoryInsight.top1B.cat}</span>
                  {josa(categoryInsight.top1B.cat, "으로", "로")} 전체의{" "}
                  <span className="font-semibold">{categoryInsight.top1B.share}%</span>,
                  평균 <span className="font-semibold">{fmt(categoryInsight.top1B.avgFee)}원</span>입니다.{" "}
                  {categoryInsight.aAvgInTopB !== null ? (
                    <>
                      <span className="font-bold" style={{ color: COLOR_A }}>{companyA}</span>
                      {josa(companyA, "은", "는")} 동일 항목 비중{" "}
                      <span className="font-semibold">{categoryInsight.aShareInTopB}%</span>,
                      평균 <span className="font-semibold">{fmt(categoryInsight.aAvgInTopB)}원</span>으로{" "}
                      {companyB} 대비{" "}
                      <span className="font-semibold" style={{
                        color: categoryInsight.aAvgInTopB > categoryInsight.top1B.avgFee
                          ? COLOR_A : COLOR_B,
                      }}>
                        {fmt(Math.abs(categoryInsight.aAvgInTopB - categoryInsight.top1B.avgFee))}원{" "}
                        {categoryInsight.aAvgInTopB > categoryInsight.top1B.avgFee ? "높습니다" : "낮습니다"}.
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="font-bold" style={{ color: COLOR_A }}>{companyA}</span>
                      {josa(companyA, "은", "는")} 해당 카테고리 데이터가 없습니다.
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
