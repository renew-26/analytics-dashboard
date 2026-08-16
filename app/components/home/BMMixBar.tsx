export type MixSegment = {
  key: string;
  color: string;
  curr: number;
  prev: number;
};

/**
 * BM 구성비 100% 스택 바.
 * 아래 얇은 고스트 바가 전월 동기간이라 "어디로 움직였나"가 한눈에 보인다.
 * 절대량이 아니라 구성비 이동을 읽는 차트다.
 */
export default function BMMixBar({
  title,
  segments,
  unit = "",
  decimals = 0,
}: {
  title: string;
  segments: MixSegment[];
  unit?: string;
  decimals?: number;
}) {
  const tc = segments.reduce((s, x) => s + x.curr, 0);
  const tp = segments.reduce((s, x) => s + x.prev, 0);
  if (tc <= 0) return null;

  const share = (v: number, t: number) => (t > 0 ? (v / t) * 100 : 0);
  const nf = (n: number) =>
    n.toLocaleString("ko-KR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });

  return (
    <div className="mt-[17px] first:mt-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <b className="text-[11.5px] font-bold text-[var(--color-gray-600)]">
          {title}
        </b>
        <span className="num text-[11px] text-[var(--color-gray-400)]">
          이번 달 {nf(tc)}
          {unit} · 전월 {nf(tp)}
          {unit}
        </span>
      </div>

      <div className="flex h-[27px] w-full gap-0.5">
        {segments.map((s) => {
          const sc = share(s.curr, tc);
          return (
            <div
              key={s.key}
              className="flex min-w-[3px] items-center justify-center overflow-hidden rounded-[3px] whitespace-nowrap text-[10.5px] font-bold text-white"
              style={{ flex: `0 0 ${sc}%`, background: s.color }}
              title={`${s.key} · ${nf(s.curr)}${unit} (${sc.toFixed(1)}%)`}
            >
              {/* 좁은 칸에 라벨을 욱여넣지 않는다 */}
              {sc >= 14 ? `${s.key} ${sc.toFixed(1)}%` : sc >= 7 ? `${sc.toFixed(1)}%` : ""}
            </div>
          );
        })}
      </div>

      {/* 전월 고스트 */}
      <div className="mt-[3px] flex h-[9px] w-full gap-0.5 opacity-[.38]">
        {segments.map((s) => (
          <div
            key={s.key}
            className="min-w-[3px] rounded-[3px]"
            style={{ flex: `0 0 ${share(s.prev, tp)}%`, background: s.color }}
          />
        ))}
      </div>

      <div className="mt-[5px] flex items-baseline justify-between gap-2.5 text-[10px] text-[var(--color-gray-400)]">
        <span>↑ 전월 동기간</span>
        <span className="num flex flex-wrap gap-[11px]">
          {segments.map((s) => {
            const d = share(s.curr, tc) - share(s.prev, tp);
            return (
              <span key={s.key}>
                {s.key}{" "}
                <i
                  className="not-italic font-bold"
                  style={{ color: dirColor(d) }}
                >
                  {d > 0 ? "+" : ""}
                  {d.toFixed(1)}%p
                </i>
              </span>
            );
          })}
        </span>
      </div>
    </div>
  );
}

function dirColor(d: number) {
  if (d > 0.05) return "var(--color-up)";
  if (d < -0.05) return "var(--color-down)";
  return "var(--color-gray-400)";
}
