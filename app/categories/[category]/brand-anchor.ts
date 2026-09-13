/**
 * ⑤ 브랜드별 상품 표의 앵커 id — 표를 그리는 쪽(클라이언트)과 그리로 보내는
 * 쪽(서버의 브랜드 카드)이 같은 식을 써야 죽은 링크가 안 생긴다.
 * CategoryDrilldown 은 "use client" 라 서버에서 이 함수를 가져다 쓸 수 없어
 * 별도 모듈로 뺀다.
 */
export const brandAnchorId = (label: string) =>
  `brand-${encodeURIComponent(label)}`;

/** 접힌 브랜드 묶음 한 줄의 앵커 — 상위 N 밖 브랜드는 여기로 보낸다 */
export const REST_ANCHOR_ID = "brand-rest";
