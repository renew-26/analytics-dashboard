/**
 * 근거 문자열 — 숫자와 같은 곳에서 나와야 어긋나지 않는다.
 *
 * 컴포넌트는 문자열을 만들지 않고 이 빌더의 결과를 그대로 렌더한다.
 * 컬럼명은 실제 DB 컬럼 그대로 적는다 — 구성원이 Redash 에서 검산할 수 있어야 한다.
 */

import {
  SOURCE,
  type Basis,
  type Metric,
  type Baseline,
  type PnlLadder,
  type CohortMonthRow,
  type LeadTime,
  type FunnelBlock,
} from "@/lib/metric-review";
import { fmt, koreanWon } from "@/lib/format";

export type Provenance = {
  source: string;
  formula: string;
  compare?: string;
  caveat?: string;
};

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/** 페이지 헤더 한 줄 — 본문이 실제로 읽은 창을 적는다 */
export function sourceLine(
  basis: Basis,
  rows: number,
  start: string,
  end: string,
  syncedAt: string | null,
): string {
  const s = SOURCE[basis];
  const stamp = syncedAt
    ? new Date(syncedAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })
    : "확인 불가";
  return `데이터 기준 ${stamp} · 출처 Redash #${s.redash} → Supabase ${s.table} · 기준 컬럼 ${s.dateCol} · ${fmt(rows)}행 (${md(start)}~${md(end)})`;
}

const col = (basis: Basis, metric: Metric) => `${SOURCE[basis].table}.${metric.column}`;

/** 부호 붙은 대입값 — 산식이 상수가 아니라 실제 차액을 보여주게 한다 */
const signedFmt = (metric: Metric, delta: number) =>
  `${delta >= 0 ? "+" : "−"}${metric.fmt(Math.abs(delta))}`;

export const pv = {
  value(
    metric: Metric,
    basis: Basis,
    excludedRows: number,
    prevLabel: string,
    curr: number,
    prev: number,
  ): Provenance {
    return {
      source: `출처 ${col(basis, metric)}`,
      formula: `산식 ${metric.fmt(prev)} → ${metric.fmt(curr)} (${signedFmt(metric, curr - prev)})`,
      compare: `전월 동기간 ${prevLabel}`,
      caveat: excludedRows > 0 ? `${metric.column} NULL ${fmt(excludedRows)}행 제외` : undefined,
    };
  },

  baseline(metric: Metric, b: Baseline, basis: Basis): Provenance {
    const range = b.months.length
      ? `${b.months[0]}~${b.months.at(-1)}`
      : "없음";
    const per = b.perDay === null
      ? "—"
      : metric.key === "revenue" ? `${koreanWon(b.perDay)}/일` : `${fmt(b.perDay)}건/일`;
    return {
      source: `출처 ${col(basis, metric)}`,
      formula: `산식 Σ(${range}) ÷ ${b.days}일 = ${per}`,
      caveat:
        b.months.length === 0 ? "기준선 없음 — 완결월 부족"
        : b.months.length < 3 ? `완결월 ${b.months.length}개만 사용`
        : undefined,
    };
  },

  waterfall(
    metric: Metric,
    basis: Basis,
    prevLabel: string,
    currLabel: string,
    prevTotal: number,
    currTotal: number,
  ): Provenance {
    return {
      source: `출처 ${col(basis, metric)}`,
      formula: `산식 그룹별 (이번달 − 전월 동기간) 델타의 합 = ${metric.fmt(prevTotal)} → ${metric.fmt(currTotal)}`,
      compare: `${prevLabel} → ${currLabel}`,
    };
  },

  composition(metric: Metric, basis: Basis, total: number): Provenance {
    return {
      source: `출처 ${col(basis, metric)}`,
      formula: `산식 항목 ÷ 당월 합계(${metric.fmt(total)}) × 100`,
      caveat: "상위 5 + 그 외",
    };
  },

  rank(metric: Metric, basis: Basis, total: number): Provenance {
    return {
      source: `출처 ${col(basis, metric)}`,
      formula: `산식 항목 ÷ 당월 합계(${metric.fmt(total)}) × 100 · 값 내림차순 상위 5`,
    };
  },

  pnl(basis: Basis, curr: PnlLadder): Provenance {
    return {
      source: `출처 ${SOURCE[basis].table}.total_rental_fee · sales · sales_incentive · bad_debt · promotion · cost_of_goods · financial_cost · contribution_margin`,
      formula: `산식 거래액 ${koreanWon(curr.gmv)} → 수수료 ${koreanWon(curr.sales)} → 공헌이익 ${koreanWon(curr.cm)}`,
      caveat: "거래액은 구 정의(월렌탈료 × 기간) — 정확 GMV 는 통합 원장 이관 후",
    };
  },

  /** basis 무관 — 계약완료를 계약일이 아니라 주문일로 묶어 두 테이블을 모두 읽는다 */
  cohort(rows: CohortMonthRow[]): Provenance {
    const source = `출처 ${SOURCE.order.table}.order_confirmed_at · ${SOURCE.contract.table}.order_confirmed_at`;
    const row = rows.at(-1);
    if (!row) {
      return {
        source,
        formula: "산식 같은 달 주문 중 지금까지 계약된 비율",
        caveat: "코호트 데이터 없음",
      };
    }
    const pctStr = row.countPct === null ? "—" : `${row.countPct.toFixed(1)}%`;
    return {
      source,
      formula: `산식 주문 ${fmt(row.orderCount)}건 중 계약 ${fmt(row.contractCount)}건 = ${pctStr}`,
      caveat: `집계 기준 무관${row.maturing ? " · 당월은 진행 중" : ""}`,
    };
  },

  leadTime(basis: Basis, lt: LeadTime): Provenance {
    const median = lt.medianDays === null ? "—" : `${lt.medianDays}일`;
    const p75 = lt.p75Days === null ? "—" : `${lt.p75Days}일`;
    return {
      source: `출처 ${SOURCE[basis].table}.quote_date → order_confirmed_at`,
      formula: `산식 두 날짜의 일수 차 · 중앙값 ${median} · 상위 75% ${p75} (표본 ${fmt(lt.withQuote)}건)`,
      caveat: lt.withoutQuote > 0 ? `quote_date 없음 ${fmt(lt.withoutQuote)}건 제외` : undefined,
    };
  },

  funnel(basis: Basis, f: FunnelBlock): Provenance {
    return {
      source: `출처 ${SOURCE[basis].table}.quote_date · order_confirmed_at · contract_date`,
      formula: `산식 ${f.stages.map((s) => `${s.label} ${fmt(s.count)}`).join(" → ")}`,
      caveat: "견적만 한 건 미포함 — 원천에 없음",
    };
  },
};
