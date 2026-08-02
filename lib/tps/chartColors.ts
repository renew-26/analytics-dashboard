// dataviz 참조 팔레트의 검증된 8슬롯 카테고리 컬러(고정 순서, 인접 ΔE 24.2) — 순환 금지.
// 트렌드 차트·막대 차트가 같은 경쟁사에 항상 같은 색을 쓰도록 공유한다.
export const CATEGORICAL_COLORS = [
  "#2a78d6", // blue
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
  "#e87ba4", // magenta
  "#eb6834", // orange
];

// 8개를 넘는 시리즈는 색을 새로 만들지 않고(CVD 구분 불가) 회색으로 묶는다.
export const OVERFLOW_COLOR = "#898781";

export function colorForIndex(i: number): string {
  return i < CATEGORICAL_COLORS.length ? CATEGORICAL_COLORS[i] : OVERFLOW_COLOR;
}
