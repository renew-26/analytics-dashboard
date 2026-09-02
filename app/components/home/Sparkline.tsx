/**
 * 12개월 추세 스파크라인.
 * 축·격자 없이 모양만 보여주는 용도라 값 라벨을 붙이지 않는다.
 * 마지막 점은 속을 비워 "진행 중"임을 표시한다.
 */
export default function Sparkline({
  values,
  color,
  width = 150,
  height = 30,
  title,
}: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
  title?: string;
}) {
  const pts = values.filter((v) => Number.isFinite(v));
  if (pts.length < 2) return null;

  const pad = 4; // 종점 원이 잘리지 않도록 상하좌우 여백
  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  // 전 구간이 같은 값이면 0으로 나누게 되므로 가운데 선으로 눕힌다
  const span = hi - lo || 1;
  const X = (i: number) => (i / (pts.length - 1)) * (width - pad);
  const Y = (v: number) => pad + (1 - (v - lo) / span) * (height - pad * 2);

  const line = pts
    .map((v, i) => `${i === 0 ? "M" : "L"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${(width - pad).toFixed(1)},${height} L0,${height} Z`;
  // gradient는 color에만 의존하므로 id도 색으로만 만든다.
  // 값 해시로 만들면 값이 같고 색이 다른 두 개가 같은 id를 갖고, SVG는 먼저
  // 정의된 gradient만 쓰므로 한쪽 area가 남의 색으로 칠해진다.
  const gid = `sp-${color.replace(/[^a-zA-Z0-9]/g, "")}`;

  // 고정 크기로 그린다. width를 100%로 늘리면 종점 원이 타원으로 찌그러진다.
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{
        display: "block",
        maxWidth: "100%",
        marginInline: "auto",
        overflow: "visible",
      }}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.18" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* 진행 중인 달이라 종점은 속을 비운다 */}
      <circle
        cx={X(pts.length - 1)}
        cy={Y(pts[pts.length - 1])}
        r="2.6"
        fill="#ffffff"
        stroke={color}
        strokeWidth="1.6"
      />
    </svg>
  );
}
