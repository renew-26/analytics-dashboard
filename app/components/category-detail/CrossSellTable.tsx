import { EmptyState, SeverityChip, TableScroll, n, pct } from "./ui";

export type CrossSellRow = {
  modelName: string;
  productName: string;
  contractMonths: number;
  totalCount: number;
  entries: { label: string; avgFee: number; count: number }[];
  min: number;
  max: number;
};

export default function CrossSellTable({
  rows,
  emptyReason,
}: {
  rows: CrossSellRow[];
  emptyReason: string;
}) {
  if (rows.length === 0) {
    return <EmptyState>{emptyReason}</EmptyState>;
  }

  return (
    <TableScroll>
      <table className="w-full min-w-[720px] text-[12.5px]">
        <thead>
          <tr className="bg-[var(--color-gray-25)]">
            <th className="sticky left-0 z-10 min-w-[210px] bg-[var(--color-gray-25)] border-b border-[var(--color-gray-200)] px-3 py-2.5 text-left text-[10.5px] font-bold text-[var(--color-gray-400)]">
              모델
            </th>
            <th className="border-b border-[var(--color-gray-200)] px-3 py-2.5 text-right text-[10.5px] font-bold whitespace-nowrap text-[var(--color-gray-400)]">
              약정
            </th>
            <th className="border-b border-[var(--color-gray-200)] px-3 py-2.5 text-right text-[10.5px] font-bold whitespace-nowrap text-[var(--color-gray-400)]">
              건수
            </th>
            <th className="border-b border-[var(--color-gray-200)] px-3 py-2.5 text-left text-[10.5px] font-bold text-[var(--color-gray-400)]">
              렌탈사별 실거래 평균 월렌탈료
            </th>
            <th className="border-b border-[var(--color-gray-200)] px-3 py-2.5 text-right text-[10.5px] font-bold whitespace-nowrap text-[var(--color-gray-400)]">
              최저–최고 격차
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const gapPct = r.min > 0 ? (r.max / r.min - 1) * 100 : null;
            return (
              <tr
                key={`${r.modelName}|${r.contractMonths}`}
                className="border-t border-[var(--color-line-2)]"
              >
                <td className="sticky left-0 z-10 bg-white px-3 py-2.5 text-left">
                  <span className="block font-bold text-[var(--color-gray-800)]">
                    {r.productName || r.modelName}
                  </span>
                  <span className="mt-[1px] block font-mono text-[10.5px] text-[var(--color-gray-400)]">
                    {r.modelName}
                  </span>
                </td>
                <td className="num px-3 py-2.5 text-right whitespace-nowrap text-[var(--color-gray-500)]">
                  {r.contractMonths}개월
                </td>
                <td className="num px-3 py-2.5 text-right whitespace-nowrap text-[var(--color-gray-600)]">
                  {n(r.totalCount)}
                </td>
                <td className="px-3 py-2.5">
                  <span className="flex flex-wrap gap-x-3 gap-y-1">
                    {r.entries.map((e) => {
                      const isMin = e.avgFee === r.min;
                      const isMax = e.avgFee === r.max;
                      return (
                        <span
                          key={e.label}
                          className="inline-flex items-center whitespace-nowrap"
                        >
                          <span className="text-[var(--color-gray-500)]">
                            {e.label}
                          </span>
                          <b
                            className="num ml-1 font-bold"
                            style={{
                              color: isMax
                                ? "var(--color-sev-crit)"
                                : isMin
                                  ? "var(--color-success)"
                                  : "var(--color-gray-800)",
                            }}
                          >
                            {n(e.avgFee)}
                          </b>
                          <span className="num ml-[3px] text-[10.5px] text-[var(--color-gray-400)]">
                            (n{e.count})
                          </span>
                          {isMin ? (
                            <SeverityChip tone="low" label="최저" />
                          ) : isMax ? (
                            <SeverityChip tone="high" label="최고" />
                          ) : null}
                        </span>
                      );
                    })}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap text-[var(--color-gray-800)]">
                  <span className="num font-bold">{n(r.max - r.min)}원</span>
                  <span className="num ml-1 text-[10.5px] text-[var(--color-gray-500)]">
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
