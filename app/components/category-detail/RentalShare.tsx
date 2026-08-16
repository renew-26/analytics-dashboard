import { DeltaText, n, pct, seriesColor, EmptyState } from "./ui";

export type ShareItem = {
  label: string;
  count: number;
  prevCount: number;
};

export default function RentalShare({
  items,
  prevRangeLabel,
}: {
  items: ShareItem[];
  prevRangeLabel: string;
}) {
  const total = items.reduce((s, i) => s + i.count, 0);
  if (total === 0) {
    return <EmptyState>이 구간에 계약완료 거래가 없습니다.</EmptyState>;
  }

  // 계열 색은 5색뿐이라 상위 5곳만 색을 주고 나머지는 하나로 묶는다.
  const head = items.slice(0, 5);
  const tail = items.slice(5);
  const tailCount = tail.reduce((s, i) => s + i.count, 0);
  const segments = [
    ...head.map((i, idx) => ({
      label: i.label,
      count: i.count,
      color: seriesColor(idx),
    })),
    ...(tailCount > 0
      ? [
          {
            label: `그 외 ${tail.length}곳`,
            count: tailCount,
            color: seriesColor(99),
          },
        ]
      : []),
  ];

  const deltas = items
    .map((i) => ({ label: i.label, d: i.count - i.prevCount }))
    .filter((x) => x.d !== 0)
    .sort((a, b) => b.d - a.d);
  const maxAbs = Math.max(1, ...deltas.map((x) => Math.abs(x.d)));

  return (
    <div>
      <div className="flex h-[30px] gap-[2px] overflow-hidden rounded-[6px]">
        {segments.map((s) => {
          const p = (s.count / total) * 100;
          return (
            <div
              key={s.label}
              className="flex items-center justify-center"
              style={{ width: `${p}%`, background: s.color }}
              title={`${s.label} ${n(s.count)}건 (${p.toFixed(1)}%)`}
            >
              {p > 9 ? (
                <span className="num text-[10.5px] font-bold text-white">
                  {p.toFixed(0)}%
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((s) => (
          <span
            key={s.label}
            className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-gray-600)]"
          >
            <i
              className="block h-[9px] w-[9px] shrink-0 rounded-[2px]"
              style={{ background: s.color }}
            />
            {s.label}
            <b className="num font-semibold text-[var(--color-gray-900)]">
              {n(s.count)}
            </b>
            <span className="num text-[var(--color-gray-400)]">
              {pct((s.count / total) * 100)}
            </span>
          </span>
        ))}
      </div>

      <div className="mt-5">
        <div className="mb-2 text-[11.5px] font-bold text-[var(--color-gray-600)]">
          전월 동기간({prevRangeLabel}) 대비 증감 (건)
        </div>
        {deltas.length === 0 ? (
          <p className="text-[12px] text-[var(--color-gray-500)]">
            전월 동기간과 건수가 같습니다.
          </p>
        ) : (
          <ul className="flex flex-col gap-[3px]">
            {deltas.map((x) => {
              const w = (Math.abs(x.d) / maxAbs) * 46;
              const pos = x.d > 0;
              return (
                <li key={x.label} className="flex items-center gap-2">
                  <span className="w-[86px] shrink-0 text-right text-[11.5px] font-semibold text-[var(--color-gray-600)]">
                    {x.label}
                  </span>
                  <span className="relative block h-[14px] flex-1">
                    <i className="absolute top-0 bottom-0 left-1/2 w-px bg-[var(--color-gray-200)]" />
                    <i
                      className="absolute top-[1px] h-[12px] rounded-[3px]"
                      style={{
                        width: `${Math.max(w, 0.6)}%`,
                        left: pos ? "50%" : undefined,
                        right: pos ? undefined : "50%",
                        background: pos
                          ? "var(--color-up)"
                          : "var(--color-down)",
                      }}
                    />
                  </span>
                  <span className="w-[46px] shrink-0 text-left text-[11px]">
                    <DeltaText value={x.d} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
