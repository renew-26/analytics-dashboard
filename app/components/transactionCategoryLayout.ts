export const KNOWN_CATS = new Set([
  "정수기",
  "공기청정기",
  "비데",
  "TV",
  "세탁기+건조기",
  "에어컨",
  "냉장고",
  "로봇청소기",
  "무선청소기",
  "음식물처리기",
  "안마의자",
  "매트리스",
  "타이어",
  "인터넷",
]);

export const CAT_TABLE_ROWS: {
  large: string;
  largeSpan: number;
  cat: string | null;
}[] = [
  { large: "정수기", largeSpan: 1, cat: "정수기" },
  { large: "크로스셀", largeSpan: 2, cat: "공기청정기" },
  { large: "", largeSpan: 0, cat: "비데" },
  { large: "성장성 카테고리", largeSpan: 10, cat: "TV" },
  { large: "", largeSpan: 0, cat: "세탁기+건조기" },
  { large: "", largeSpan: 0, cat: "에어컨" },
  { large: "", largeSpan: 0, cat: "냉장고" },
  { large: "", largeSpan: 0, cat: "로봇청소기" },
  { large: "", largeSpan: 0, cat: "무선청소기" },
  { large: "", largeSpan: 0, cat: "음식물처리기" },
  { large: "", largeSpan: 0, cat: "안마의자" },
  { large: "", largeSpan: 0, cat: "매트리스" },
  { large: "", largeSpan: 0, cat: "타이어" },
  { large: "인터넷", largeSpan: 1, cat: "인터넷" },
  { large: "그외 카테고리", largeSpan: 1, cat: null },
];

// CAT_TABLE_ROWS를 대카테고리 단위로 묶은 그룹 (월별/주차별 대카테고리 그래프용)
export const LARGE_CATEGORY_GROUPS: { large: string; cats: (string | null)[] }[] = [];
for (const row of CAT_TABLE_ROWS) {
  if (row.large) {
    LARGE_CATEGORY_GROUPS.push({ large: row.large, cats: [row.cat] });
  } else {
    LARGE_CATEGORY_GROUPS[LARGE_CATEGORY_GROUPS.length - 1].cats.push(row.cat);
  }
}

// dataviz 검증된 카테고리 팔레트 (라이트 서페이스, 5색 인접쌍 CVD 통과)
export const LARGE_CATEGORY_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
