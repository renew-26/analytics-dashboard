import { SOURCE, type Basis, type Metric } from "@/lib/metric-review";

const CODE = "font-[family-name:var(--font-mono)]";

type Row = { metric: string; source: string; formula: string };

/**
 * 화면의 모든 패널/지표에 대한 정적 정의표 — 라이브 숫자를 대입하지 않는다.
 * 값이 궁금하면 화면을 보고, 그 값이 어디서 왔는지 궁금하면 여기를 본다.
 * 테이블명은 항상 SOURCE 에서 가져온다 — 리터럴로 박아넣지 않는다.
 */
function rowsFor(basis: Basis, metric: Metric): Row[] {
  const s = SOURCE[basis];
  const col = `${s.table}.${metric.column}`;
  return [
    {
      metric: "수수료 매출",
      source: `${s.table}.sales`,
      formula: "sales 합계 (NULL 인 행 제외)",
    },
    {
      metric: "거래건수",
      source: `${s.table}.prop_item_usid`,
      formula: "행 수. 수량 컬럼이 원천에 없어 수량은 반영하지 않는다",
    },
    {
      metric: "공헌이익",
      source: `${s.table}.contribution_margin`,
      formula: "contribution_margin 합계",
    },
    {
      metric: "최근 3개월 평균",
      source: col,
      formula: "직전 3개 완결월 합계 ÷ 그 기간 총 일수. 진행 중인 달은 제외, 완결월 3개 미만이면 있는 만큼 쓴다",
    },
    {
      metric: "전월 동기간",
      source: `${s.table}.${s.dateCol}`,
      formula: "같은 일자까지 비교(예 9/1~9/7 ↔ 8/1~8/7). 요일은 맞추지 않는다",
    },
    {
      metric: "추이",
      source: col,
      formula: "일별·주별 스택 합계. 카테고리·BM 축 전환, 최근 3개월 평균선 동시 표기",
    },
    {
      metric: "증감 원인",
      source: col,
      formula: "그룹별 (이번달 − 전월 동기간) 델타의 합 = 총액 변화. 카테고리·렌탈사 축 전환",
    },
    {
      metric: "구성비",
      source: col,
      formula: "항목 ÷ 당월 합계 × 100. 카테고리·BM 축 전환, 상위 5 + 그 외",
    },
    {
      metric: "Top5",
      source: col,
      formula: "항목 ÷ 당월 합계 × 100, 값 내림차순 상위 5(카테고리·브랜드·파트너사)",
    },
    {
      metric: "손익 계층 6단",
      source: `${s.table}.total_rental_fee·sales·sales_incentive·bad_debt·promotion·cost_of_goods·financial_cost·contribution_margin`,
      formula: "거래액(GMV) → 수수료 → 판매장려금(−) → 대손충당(−) → 기타원가(−) → 공헌이익",
    },
    {
      metric: "주문월 코호트",
      source: `${SOURCE.order.table}.order_confirmed_at · ${SOURCE.contract.table}.order_confirmed_at`,
      formula: "계약완료를 계약일이 아니라 주문일로 묶어, 주문월별 주문 대비 계약 비율을 잰다(집계 기준 무관)",
    },
    {
      metric: "리드타임",
      source: `${SOURCE.order.table}.quote_date → order_confirmed_at`,
      formula: "두 날짜의 일수 차. 중앙값·상위 75% (basis 무관 — 항상 주문 원장)",
    },
    {
      metric: "퍼널",
      source: `${SOURCE.order.table}.quote_date·order_confirmed_at → ${SOURCE.contract.table}.prop_item_usid(신원 조인)`,
      formula: "이번달 견적 코호트의 견적신청 → 주문확정 → 계약완료 단계별 건수",
    },
  ];
}

/** 회의에서 "이 숫자 뭐야"가 나오면 여기로 링크한다 */
export default function MetricDefinitions({ basis, metric }: { basis: Basis; metric: Metric }) {
  const s = SOURCE[basis];
  const rows = rowsFor(basis, metric);
  return (
    <details className="group">
      <summary className="text-sm font-semibold text-[var(--color-gray-700)] cursor-pointer list-none flex items-center gap-2 select-none">
        <span className="text-[var(--color-gray-400)] group-open:rotate-90 transition-transform inline-block">▶</span>
        지표 정의
      </summary>
      <div className="mt-3 rounded-xl bg-white border border-[var(--color-gray-200)] p-[17px] space-y-4">
        <p className="text-[11px] leading-4 text-[var(--color-gray-500)]">
          집계 기준 {s.label} — <code className={CODE}>{s.table}.{s.dateCol}</code>.
          Redash #{s.redash} 에서 매일 05:00(KST) 동기화된다.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-line-2)]">
                <th className="py-1.5 pr-3 text-left font-semibold text-[var(--color-gray-400)] whitespace-nowrap">지표</th>
                <th className="py-1.5 pr-3 text-left font-semibold text-[var(--color-gray-400)]">출처</th>
                <th className="py-1.5 text-left font-semibold text-[var(--color-gray-400)]">산식</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.metric} className="border-t border-[var(--color-line-2)] align-top">
                  <td className="py-1.5 pr-3 font-semibold text-[var(--color-gray-700)] whitespace-nowrap">{r.metric}</td>
                  <td className={`py-1.5 pr-3 text-[var(--color-gray-600)] ${CODE}`}>{r.source}</td>
                  <td className="py-1.5 text-[var(--color-gray-600)]">{r.formula}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pt-3 border-t border-[var(--color-line-2)]">
          <h3 className="text-xs font-semibold text-[var(--color-gray-700)] mb-2">
            지금 제공하지 못하는 것 (원천 한계)
          </h3>
          <ul className="text-[11px] text-[var(--color-gray-600)] space-y-1 list-disc pl-4">
            <li><b>취소 건 분리</b> — <code className={CODE}>status</code> 컬럼이 현재 원천에 없다. 화면의 모든 건수는 취소 미반영이다.</li>
            <li><b>정확한 거래액</b> — <code className={CODE}>gmv</code>(요금면제·프로모션·정액할인 반영) 컬럼이 없어 구 정의(월렌탈료 × 기간)를 쓴다. 실측 3.5~4.5% 높게 잡힌다.</li>
            <li><b>수량</b> — <code className={CODE}>quantity</code> 컬럼이 없다.</li>
            <li><b>견적만 하고 만 건</b> — 원천에 주문까지 간 건만 있어 퍼널 첫 단계 분모가 운영시트보다 작다.</li>
            <li><b>상품조회·설치인증·설치후해지</b> — 원천에 없다. 운영시트가 별도 쿼리로 관리한다.</li>
          </ul>
          <p className="text-[10px] text-[var(--color-gray-400)] mt-2">
            위 다섯은 통합 원장(<code className={CODE}>raw_prop_items</code>) 이관이 끝나면 제공할 수 있다.
          </p>
        </div>
      </div>
    </details>
  );
}
