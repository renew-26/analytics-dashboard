// 사이드바 라벨 → Supabase raw_contracts.rental_company 매핑
// dbName: DB에 저장된 실제 렌탈사명으로 채워주세요

export const COMPANY_MAP: {
  label: string;
  dbName: string;
  group: string;
  categoryIs?: string; // 이 카테고리만 포함
  categoryNot?: string; // 이 카테고리 제외
}[] = [
  // 가전&상조
  { label: "현대유버스", dbName: "유버스(현대렌탈서비스)", group: "가전&상조" },
  { label: "헬로비전", dbName: "LG헬로비전", group: "가전&상조" },
  { label: "스마트렌탈", dbName: "스마트렌탈", group: "가전&상조" },
  { label: "이니렌탈", dbName: "이니렌탈", group: "가전&상조" },
  { label: "KT렌탈", dbName: "KT", group: "가전&상조", categoryNot: "인터넷" },
  {
    label: "BS렌탈",
    dbName: "BS렌탈",
    group: "가전&상조",
    categoryNot: "타이어",
  },
  {
    label: "금호타이어",
    dbName: "BS렌탈",
    group: "가전&상조",
    categoryIs: "타이어",
  },
  { label: "넥센타이어", dbName: "넥센", group: "가전&상조" },
  { label: "바디프랜드", dbName: "바디프랜드", group: "가전&상조" },

  // 정수기
  { label: "SK인텔릭스", dbName: "SK인텔릭스", group: "정수기" },
  { label: "코웨이", dbName: "코웨이", group: "정수기" },
  { label: "쿠쿠", dbName: "쿠쿠", group: "정수기" },
  { label: "청호", dbName: "청호", group: "정수기" },
  { label: "LG", dbName: "LG", group: "정수기" },

  // 통신
  { label: "LGU+", dbName: "LG유플러스", group: "통신" },
  { label: "LGHV_I", dbName: "LG헬로비전(통신)", group: "통신" },
  { label: "KT_SKY_I", dbName: "KT스카이라이프", group: "통신" },
  { label: "KT_I", dbName: "KT", group: "통신", categoryIs: "인터넷" },
  { label: "SK_I", dbName: "SK", group: "통신" },
];
