import { EmptyState, SeverityChip, TableScroll, n, pct } from "./ui";

export type QuoteRow = {
  modelName: string;
  productName: string;
  /** 최근 3개월 실거래 건수 — 비교 대상 모델의 무게를 알려준다 */
  dealCount: number;
  /** 비교 기준 (같은 관리방식·약정개월끼리만 비교한다) */
  managementType: string;
  contractMonths: number;
  /** 렌탈사 라벨 → 자동견적 월렌탈료 */
  fees: Record<string, number>;
  min: number;
  max: number;
  minCompanies: string[];
  maxCompanies: string[];
};

export default function QuotePriceMatrix({
  companies,
  rows,
}: {
  companies: string[];
  rows: QuoteRow[];
}) {
  if (rows.length === 0) {
    return (
      <EmptyState>
        이 카테고리의 판매 상위 모델 중 자동견적(<code>auto_quote_typeb</code>)에
        렌탈사 2곳 이상의 월렌탈료가 들어 있는 모델이 없습니다. 자동견적 테이블은
        가전·상조 렌탈사 8곳만 열로 갖고 있어, 그 8곳이 취급하지 않는 모델은
        비교가 만들어지지 않습니다. 아래 &ldquo;동일 모델, 렌탈사별 가격 —
        실거래 기준&rdquo;으로 확인하세요.
      </EmptyState>
    );
  }

  return (
    <TableScroll>
      <table className="w-full min-w-[860px] text-[12px]">
        <thead>
          <tr className="bg-[var(--color-gray-25)]">
            <th className="sticky left-0 z-10 min-w-[210px] bg-[var(--color-gray-25)] border-b border-[var(--color-gray-200)] px-3 py-2.5 text-left text-[11px] font-bold text-[var(--color-gray-400)]">
              모델
            </th>
            <th className="border-b border-[var(--color-gray-200)] px-3 py-2.5 text-right text-[11px] font-bold whitespace-nowrap text-[var(--color-gray-400)]">
              실거래
            </th>
            <th className="border-b border-[var(--color-gray-200)] px-3 py-2.5 text-right text-[11px] font-bold whitespace-nowrap text-[var(--color-gray-400)]">
              비교 기준
            </th>
            {companies.map((c) => (
              <th
                key={c}
                className="border-b border-[var(--color-gray-200)] px-3 py-2.5 text-right text-[11px] font-bold whitespace-nowrap text-[var(--color-gray-400)]"
              >
                {c}
              </th>
            ))}
            <th className="border-b border-[var(--color-gray-200)] px-3 py-2.5 text-right text-[11px] font-bold whitespace-nowrap text-[var(--color-gray-400)]">
              최저–최고 격차
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const gapAbs = r.max - r.min;
            const gapPct = r.min > 0 ? (r.max / r.min - 1) * 100 : null;
            return (
              <tr
                key={`${r.modelName}|${r.managementType}|${r.contractMonths}`}
                className="border-t border-[var(--color-line-2)]"
              >
                <td className="sticky left-0 z-10 bg-white px-3 py-2.5 text-left">
                  <span className="block font-bold text-[var(--color-gray-800)]">
                    {r.productName || r.modelName}
                  </span>
                  <span className="mt-[1px] block font-mono text-[11px] text-[var(--color-gray-400)]">
                    {r.modelName}
                  </span>
                </td>
                <td className="num px-3 py-2.5 text-right whitespace-nowrap text-[var(--color-gray-600)]">
                  {n(r.dealCount)}건
                </td>
                <td className="px-3 py-2.5 text-right text-[11px] whitespace-nowrap text-[var(--color-gray-500)]">
                  {r.managementType}
                  <span className="num"> · {r.contractMonths}개월</span>
                </td>
                {companies.map((c) => {
                  const v = r.fees[c];
                  if (v === undefined) {
                    return (
                      <td
                        key={c}
                        className="px-3 py-2.5 text-right text-[var(--color-gray-300)]"
                      >
                        —
                      </td>
                    );
                  }
                  const isMin = r.minCompanies.includes(c);
                  const isMax = r.maxCompanies.includes(c);
                  return (
                    <td
                      key={c}
                      className="px-3 py-2.5 text-right whitespace-nowrap"
                      style={{
                        color: isMax
                          ? "var(--color-sev-crit)"
                          : isMin
                            ? "var(--color-success)"
                            : "var(--color-gray-800)",
                        fontWeight: isMin || isMax ? 700 : 500,
                      }}
                    >
                      <span className="num">{n(v)}</span>
                      {isMin ? (
                        <SeverityChip tone="low" label="최저" />
                      ) : isMax ? (
                        <SeverityChip tone="high" label="최고" />
                      ) : null}
                    </td>
                  );
                })}
                <td className="px-3 py-2.5 text-right whitespace-nowrap text-[var(--color-gray-800)]">
                  <span className="num font-bold">{n(gapAbs)}원</span>
                  <span className="num ml-1 text-[11px] text-[var(--color-gray-500)]">
                    ({pct(gapPct, 0)})
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableScroll>
  );
}
