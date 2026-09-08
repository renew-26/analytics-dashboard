"use client";

import { useState, type ReactNode } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { CHART_ANIM } from "@/lib/chart";
import Waterfall, { type WaterfallItem } from "@/app/components/home/Waterfall";
import type {
  KpiData,
  DataBasis,
  PnlLadder,
  TrendPoint,
  TrendSeries,
  CohortMonthRow,
  LeadTime,
  RankItem,
  FunnelCategoryRow,
} from "./page";

type Props = {
  basisLabel: string;
  kpi: KpiData;
  dataBasis: DataBasis;
  pnl: { curr: PnlLadder; prev: PnlLadder };
  waterfall: { byCategory: WaterfallItem[]; byRental: WaterfallItem[] };
  trend: {
    daily: { byCat: TrendPoint[]; byBm: TrendPoint[] };
    weekly: { byCat: TrendPoint[]; byBm: TrendPoint[] };
    catSeries: TrendSeries[];
    bmSeries: TrendSeries[];
  };
  cohortRows: CohortMonthRow[];
  leadTime: LeadTime;
  top5: { categories: RankItem[]; brands: RankItem[]; partners: RankItem[] };
  funnelCategories: FunnelCategoryRow[];
};

function fmtEok(won: number): string {
  return `${(won / 100_000_000).toFixed(2)}억`;
}

function fmtWon(won: number): string {
  return `${Math.round(won).toLocaleString("ko-KR")}원`;
}

function fmtAxis(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`;
  return n.toLocaleString("ko-KR");
}

function fmtPct(v: number | null, digits = 1) {
  return v === null ? "-" : `${v.toFixed(digits)}%`;
}

function MoMBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-gray-400">-</span>;
  const isUp = value >= 0;
  return (
    <span
      className="text-xs font-semibold num"
      style={{ color: isUp ? "var(--color-up)" : "var(--color-down)" }}
    >
      {isUp ? "▲" : "▼"} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function KpiCard({
  title,
  value,
  sub,
  badge,
}: {
  title: string;
  value: string;
  sub?: string;
  badge?: ReactNode;
}) {
  return (
    <div className="rounded-xl shadow-sm border border-gray-100 bg-white p-5">
      <h3 className="text-xs font-semibold text-gray-500 mb-2">{title}</h3>
      <div className="text-xl font-bold text-gray-900 num">{value}</div>
      <div className="mt-2 flex items-center gap-2">
        {sub && <span className="text-xs text-gray-400">{sub}</span>}
        {badge}
      </div>
    </div>
  );
}

function SegToggle<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-0.5 p-0.5 bg-[#f3f5f9] rounded-md">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`press px-2.5 py-1 text-xs rounded font-medium transition-colors ${
            value === o.value
              ? "bg-white shadow-sm text-[#222222]"
              : "text-[#788093] hover:text-[#393939]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── 데이터 기준 ── */

function DataBasisLine({ basis, basisLabel }: { basis: DataBasis; basisLabel: string }) {
  const synced = basis.lastSyncedAt
    ? new Date(basis.lastSyncedAt).toLocaleString("ko-KR", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "알 수 없음";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
      <span>
        데이터 기준{" "}
        <span className="font-semibold text-gray-700 num">{synced}</span>
      </span>
      <span className="num">
        {basisLabel} {basis.rows.toLocaleString("ko-KR")}행 (전월 1일~전일)
      </span>
      <span
        className="rounded px-1.5 py-0.5 font-semibold"
        style={{
          color: "var(--color-sev-warn)",
          background: "var(--color-sev-warn-100)",
        }}
      >
        주의 · 취소 미반영 (삭제·취소 건이 그대로 남는 동기화 구조)
      </span>
    </div>
  );
}

/* ── 손익 계층 ── */

const PNL_ROWS: {
  key: keyof Pick<
    PnlLadder,
    "gmv" | "sales" | "incentive" | "badDebt" | "other" | "cm"
  >;
  label: string;
  note?: string;
  /** 수수료 매출에서 빼는 항목 — 값은 DB 원값(양수) 그대로, 라벨에만 (−) */
  deduct?: boolean;
  strong?: boolean;
}[] = [
  { key: "gmv", label: "거래액 (GMV)", note: "월렌탈료 × 기간 · 엑셀 '거래액'", strong: true },
  { key: "sales", label: "수수료 매출", note: "이 페이지의 '매출'", strong: true },
  { key: "incentive", label: "판매장려금", deduct: true },
  { key: "badDebt", label: "대손충당", note: "가정치 0·5·10% — 실제 손실 아님", deduct: true },
  { key: "other", label: "기타 원가", note: "프로모션·매입·금융", deduct: true },
  { key: "cm", label: "공헌이익", note: "홈·NSM 이 쓰는 값", strong: true },
];

function PnlColumn({ title, sub, l }: { title: string; sub: string; l: PnlLadder }) {
  const takeRate = l.gmv > 0 ? (l.sales / l.gmv) * 100 : null;
  const marginRate = l.sales > 0 ? (l.cm / l.sales) * 100 : null;
  return (
    <div className="rounded-xl shadow-sm border border-gray-100 bg-white p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        <span className="text-xs text-gray-400 num">
          {sub} · {l.count.toLocaleString("ko-KR")}건
        </span>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {PNL_ROWS.map((r) => {
            const v = l[r.key];
            const w = l.gmv > 0 ? Math.min(100, (Math.abs(v) / l.gmv) * 100) : 0;
            const rate =
              r.key === "sales" ? takeRate : r.key === "cm" ? marginRate : null;
            return (
              <tr key={r.key} className="border-t border-[var(--color-line-2)]">
                <td className="py-2 pr-3 align-top">
                  <div className={r.strong ? "font-semibold text-gray-800" : "text-gray-600"}>
                    {r.deduct && (
                      <span className="mr-1 text-gray-400 num">(−)</span>
                    )}
                    {r.label}
                  </div>
                  {r.note && (
                    <div className="text-[11px] text-gray-400">{r.note}</div>
                  )}
                </td>
                <td className="py-2 w-[38%] align-middle">
                  <div className="h-2 rounded bg-[var(--color-gray-100)]">
                    <div
                      className="h-2 rounded"
                      style={{
                        width: `${w}%`,
                        background: r.strong
                          ? "var(--color-gray-600)"
                          : "var(--color-gray-250)",
                      }}
                    />
                  </div>
                </td>
                <td className="py-2 pl-3 text-right align-top num whitespace-nowrap">
                  <div className={r.strong ? "font-semibold text-gray-900" : "text-gray-700"}>
                    {fmtEok(v)}
                  </div>
                  {rate !== null && (
                    <div className="text-[11px] text-gray-400">
                      {r.key === "sales" ? "take rate" : "마진율"} {fmtPct(rate)}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {Math.abs(l.residual) >= 1 && (
        <p className="mt-2 text-[11px] text-gray-400 num">
          정합 차이 {fmtWon(l.residual)} — 수수료 − 장려금 − 대손 − 기타원가와
          공헌이익 컬럼이 이만큼 어긋남
        </p>
      )}
    </div>
  );
}

/* ── 매출 추이 (스택) ── */

function StackTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid var(--color-gray-200)",
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 12,
        minWidth: 180,
      }}
    >
      <div style={{ fontWeight: 600, color: "var(--color-gray-900)", marginBottom: 6 }}>
        {label}{" "}
        <span style={{ color: "var(--color-gray-500)", fontWeight: 500 }}>
          합계 {fmtEok(total)}
        </span>
      </div>
      {[...payload].reverse().map((p) =>
        p.value ? (
          <div
            key={p.name}
            style={{ display: "flex", justifyContent: "space-between", gap: 12, color: "var(--color-gray-600)" }}
          >
            <span>
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: p.color,
                  marginRight: 6,
                }}
              />
              {p.name}
            </span>
            <span style={{ fontWeight: 600, color: "var(--color-gray-900)" }} className="num">
              {fmtEok(p.value)}
            </span>
          </div>
        ) : null,
      )}
    </div>
  );
}

function StackedTrend({
  title,
  data,
  series,
  tickInterval = 0,
}: {
  title: ReactNode;
  data: TrendPoint[];
  series: TrendSeries[];
  tickInterval?: number;
}) {
  return (
    <div className="rounded-xl shadow-sm border border-gray-100 bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ left: 8, right: 16, top: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--color-gray-150)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--color-gray-400)" }}
            axisLine={false}
            tickLine={false}
            interval={tickInterval}
          />
          <YAxis
            tickFormatter={fmtAxis}
            tick={{ fontSize: 11, fill: "var(--color-gray-400)" }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip content={<StackTooltip />} cursor={{ fill: "var(--color-gray-50)" }} />
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="square" iconSize={8} />
          {series.map((s, i) => (
            <Bar
              {...CHART_ANIM}
              key={s.key}
              dataKey={s.key}
              name={s.key}
              stackId="a"
              fill={s.color}
              radius={i === series.length - 1 ? [3, 3, 0, 0] : 0}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── 주문월 코호트 ── */

function CohortTable({ rows }: { rows: CohortMonthRow[] }) {
  return (
    <div className="rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
      <table className="text-sm bg-white border-collapse w-full">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
              주문월
            </th>
            <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">
              주문확정
            </th>
            <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">
              → 계약완료
            </th>
            <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">
              계약률 (건)
            </th>
            <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">
              계약률 (매출)
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.ym} className="border-t border-[var(--color-line-2)]">
              <td className="px-4 py-2.5 text-xs font-semibold text-gray-600">
                {r.label}
                {r.maturing && (
                  <span className="ml-1.5 text-[10px] font-medium text-gray-400">
                    진행중
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-right text-gray-800 num">
                {fmtEok(r.orderRevenue)}{" "}
                <span className="text-xs text-gray-400">
                  ({r.orderCount.toLocaleString("ko-KR")}건)
                </span>
              </td>
              <td className="px-4 py-2.5 text-right text-gray-800 num">
                {fmtEok(r.contractRevenue)}{" "}
                <span className="text-xs text-gray-400">
                  ({r.contractCount.toLocaleString("ko-KR")}건)
                </span>
              </td>
              <td
                className={`px-4 py-2.5 text-right font-semibold num ${
                  r.maturing ? "text-gray-400" : "text-gray-800"
                }`}
              >
                {fmtPct(r.countPct)}
              </td>
              <td
                className={`px-4 py-2.5 text-right font-semibold num ${
                  r.maturing ? "text-gray-400" : "text-gray-800"
                }`}
              >
                {fmtPct(r.revenuePct)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── 견적 → 주문 리드타임 ── */

function LeadTimeCard({ lt }: { lt: LeadTime }) {
  const total = lt.withQuote + lt.withoutQuote;
  return (
    <div className="rounded-xl shadow-sm border border-gray-100 bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-1">
        견적신청 → 주문확정 리드타임{" "}
        <span className="text-xs font-normal text-gray-400">(이번달 주문)</span>
      </h3>
      <p className="text-xs text-gray-400 mb-4 num">
        견적일 있음 {lt.withQuote.toLocaleString("ko-KR")}건
        {lt.withoutQuote > 0 &&
          ` · 없음 ${lt.withoutQuote.toLocaleString("ko-KR")}건 (${total > 0 ? ((lt.withoutQuote / total) * 100).toFixed(0) : 0}%)`}
      </p>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <div className="text-xs text-gray-500">중앙값</div>
          <div className="text-xl font-bold text-gray-900 num">
            {lt.medianDays === null ? "-" : `${lt.medianDays}일`}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">상위 75%</div>
          <div className="text-xl font-bold text-gray-900 num">
            {lt.p75Days === null ? "-" : `${lt.p75Days}일`}
          </div>
        </div>
      </div>
      <div className="space-y-2">
        {lt.buckets.map((b) => (
          <div key={b.label} className="flex items-center gap-3 text-xs">
            <span className="w-10 text-gray-600">{b.label}</span>
            <div className="flex-1 h-2 rounded bg-[var(--color-gray-100)]">
              <div
                className="h-2 rounded"
                style={{ width: `${b.pct}%`, background: "var(--color-gray-600)" }}
              />
            </div>
            <span className="w-24 text-right text-gray-700 num">
              {b.count.toLocaleString("ko-KR")}건 · {b.pct.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Top5 ── */

function RankCard({ title, sub, items }: { title: string; sub: string; items: RankItem[] }) {
  return (
    <div className="rounded-xl shadow-sm border border-gray-100 bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">
        {title} <span className="text-xs font-normal text-gray-400">({sub})</span>
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-gray-400">데이터 없음</p>
      ) : (
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={item.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-semibold text-gray-400 w-4">{i + 1}</span>
                <span className="text-sm text-gray-700 truncate">{item.name}</span>
              </div>
              <div className="flex items-baseline gap-1.5 flex-shrink-0">
                <span className="text-sm font-semibold text-gray-900 num">
                  {fmtEok(item.revenue)}
                </span>
                <span className="text-xs text-gray-400 num">{item.sharePct.toFixed(1)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 카테고리별 코호트 ── */

const FUNNEL_CATEGORY_VISIBLE = 10;

function FunnelCategoryTable({ rows }: { rows: FunnelCategoryRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const visibleRows = expanded ? rows : rows.slice(0, FUNNEL_CATEGORY_VISIBLE);

  return (
    <div className="rounded-xl shadow-sm border border-gray-100 overflow-x-auto mb-4">
      <table className="text-sm bg-white border-collapse w-full">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider min-w-[120px]">
              카테고리
            </th>
            <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 min-w-[130px]">
              이번달 주문확정
            </th>
            <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 min-w-[130px]">
              그중 계약완료
            </th>
            <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 min-w-[90px]">
              계약률
            </th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => (
            <tr key={row.category} className="border-t border-gray-50">
              <td className="px-4 py-3 text-xs font-semibold text-gray-600">{row.category}</td>
              <td className="px-4 py-3 text-center text-gray-800 num">
                {fmtEok(row.orderRevenue)}{" "}
                <span className="text-xs text-gray-400">
                  ({row.orderCount.toLocaleString("ko-KR")}건)
                </span>
              </td>
              <td className="px-4 py-3 text-center text-gray-800 num">
                {fmtEok(row.contractRevenue)}{" "}
                <span className="text-xs text-gray-400">
                  ({row.contractCount.toLocaleString("ko-KR")}건)
                </span>
              </td>
              <td className="px-4 py-3 text-center font-semibold text-gray-800 num">
                {fmtPct(row.cohortPct)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > FUNNEL_CATEGORY_VISIBLE && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full py-2.5 text-xs font-semibold text-gray-500 border-t border-gray-100 hover:bg-gray-50"
        >
          {expanded ? "접기" : `더보기 (${rows.length - FUNNEL_CATEGORY_VISIBLE}개)`}
        </button>
      )}
    </div>
  );
}

/* ── 페이지 ── */

type Axis = "cat" | "bm";
type Cause = "category" | "rental";

export default function RevenueAnalysisClient({
  basisLabel,
  kpi,
  dataBasis,
  pnl,
  waterfall,
  trend,
  cohortRows,
  leadTime,
  top5,
  funnelCategories,
}: Props) {
  const [axis, setAxis] = useState<Axis>("cat");
  const [cause, setCause] = useState<Cause>("category");
  const series = axis === "cat" ? trend.catSeries : trend.bmSeries;
  const daily = axis === "cat" ? trend.daily.byCat : trend.daily.byBm;
  const weekly = axis === "cat" ? trend.weekly.byCat : trend.weekly.byBm;
  const wf = cause === "category" ? waterfall.byCategory : waterfall.byRental;

  return (
    <div className="space-y-8">
      <DataBasisLine basis={dataBasis} basisLabel={basisLabel} />

      {/* ── 1. 현재 매출 ── */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          title={`이번달 ${basisLabel} 매출`}
          value={fmtEok(kpi.revenueCurr)}
          sub={`전월 동기간 ${kpi.prevLabel} 대비`}
          badge={<MoMBadge value={kpi.revenueMoM} />}
        />
        <KpiCard
          title={`이번달 ${basisLabel} 건수`}
          value={`${kpi.count.toLocaleString("ko-KR")}건`}
          sub={`건당 ${Math.round(kpi.avgUnitPrice / 10_000).toLocaleString("ko-KR")}만원`}
        />
        <KpiCard
          title="이번달 공헌이익"
          value={fmtEok(kpi.cmCurr)}
          sub={`전월 동기간 ${kpi.prevLabel} 대비`}
          badge={<MoMBadge value={kpi.cmMoM} />}
        />
        <KpiCard
          title="이번달 주문 코호트 계약률"
          value={fmtPct(kpi.cohortCountPct)}
          sub={`주문 ${kpi.cohortOrderCount.toLocaleString("ko-KR")}건 중 ${kpi.cohortContractCount.toLocaleString("ko-KR")}건 계약 · 진행중`}
        />
      </div>

      {/* ── 2. 변화 — 추이 (분해 가능) ── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-700">
            매출 추이{" "}
            <span className="text-xs font-normal text-gray-400">({basisLabel} 기준)</span>
          </h2>
          <SegToggle
            value={axis}
            onChange={setAxis}
            options={[
              { value: "cat", label: "대카테고리" },
              { value: "bm", label: "BM" },
            ]}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <StackedTrend
            title={<>이번달 일별 <span className="text-xs font-normal text-gray-400">({kpi.currLabel})</span></>}
            data={daily}
            series={series}
            tickInterval={Math.max(0, Math.floor(daily.length / 10))}
          />
          <StackedTrend title="최근 6주" data={weekly} series={series} />
        </div>
      </div>

      {/* ── 3. 원인 — 전월 동기간 → 이번달 분해 ── */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-700">
            매출 증감 원인{" "}
            <span className="text-xs font-normal text-gray-400">
              (전월 동기간 {kpi.prevLabel} → 이번달 {kpi.currLabel} · 억원)
            </span>
          </h2>
          <SegToggle
            value={cause}
            onChange={setCause}
            options={[
              { value: "category", label: "카테고리 기여" },
              { value: "rental", label: "렌탈사 기여" },
            ]}
          />
        </div>
        <p className="text-xs text-gray-500 mb-3">
          막대 하나가 그 그룹이 이번달 매출 변화에 보탠 금액이다. 그룹이 전체를 빈틈없이
          나누므로 막대의 합은 총액 변화와 같다.
        </p>
        <div className="rounded-xl shadow-sm border border-gray-100 bg-white p-5">
          <Waterfall items={wf} decimals={2} unit="억" />
        </div>
      </div>

      {/* ── 4. 손익 계층 ── */}
      <div>
        <h2 className="text-base font-semibold text-gray-700 mb-1">
          손익 계층{" "}
          <span className="text-xs font-normal text-gray-400">
            ({basisLabel} 기준 · 거래액 → 수수료 → 공헌이익)
          </span>
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          엑셀 운영시트의 &ldquo;거래액&rdquo;은 1행, 이 페이지의 &ldquo;매출&rdquo;은
          2행, 홈의 판정 지표는 6행이다. 같은 회의에서 다른 층을 부르지 않게 한 표에
          둔다.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <PnlColumn title="이번달" sub={kpi.currLabel} l={pnl.curr} />
          <PnlColumn title="전월 동기간" sub={kpi.prevLabel} l={pnl.prev} />
        </div>
      </div>

      {/* ── 5. 주문 → 계약 전환 (주문월 코호트 · 기준 무관) ── */}
      <div>
        <h2 className="text-base font-semibold text-gray-700 mb-1">
          주문 → 계약 전환{" "}
          <span className="text-xs font-normal text-gray-400">
            (주문월 코호트 · 같은 달 주문 중 지금까지 계약된 비율 · 집계 기준 무관)
          </span>
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          계약완료를 계약일이 아니라 주문일로 묶는다. 계약일로 나누면 지난달 주문이
          이번달 분자에 섞여 월초엔 낮고 월말엔 높아지는 &lsquo;달력&rsquo;이 나온다.
        </p>
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <CohortTable rows={cohortRows} />
          </div>
          <LeadTimeCard lt={leadTime} />
        </div>
      </div>

      {/* ── 6. Top5 ── */}
      <div>
        <h2 className="text-base font-semibold text-gray-700 mb-3">
          카테고리 · 브랜드 · 파트너사 Top5
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <RankCard title="카테고리" sub={`이번달 ${basisLabel}`} items={top5.categories} />
          <RankCard title="브랜드" sub={`이번달 ${basisLabel}`} items={top5.brands} />
          <RankCard title="파트너사" sub={`이번달 ${basisLabel}`} items={top5.partners} />
        </div>
      </div>

      {/* ── 7. 카테고리별 코호트 전환 ── */}
      <div>
        <h2 className="text-base font-semibold text-gray-700 mb-3">
          카테고리별 주문 → 계약{" "}
          <span className="text-xs font-normal text-gray-400">
            (이번달 주문 코호트 · 진행중)
          </span>
        </h2>
        <FunnelCategoryTable rows={funnelCategories} />
      </div>
    </div>
  );
}
