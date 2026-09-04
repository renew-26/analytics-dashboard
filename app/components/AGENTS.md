<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# app/components

## Purpose
앱 전반에서 재사용되는 UI 컴포넌트 모음. 레이아웃 컴포넌트(Sidebar, Header)와 데이터 시각화 컴포넌트(차트, 테이블, 모달)로 구성된다. 모두 Client Component(`"use client"`)이다.

## Key Files

| File | Description |
|------|-------------|
| `Sidebar.tsx` | 좌측 네비게이션 — COMPANY_MAP에서 그룹별 렌탈사 링크 생성, 아코디언 토글 |
| `Header.tsx` | 상단 헤더 — 현재 경로 기반으로 페이지 제목·그룹명 표시 |
| `CategoryTable.tsx` | 카테고리별 주차별 거래건수 테이블 (회사 상세 페이지용) |
| `MonthlyRevenueChart.tsx` | 월별/주차별 총렌탈료 바 차트 (Recharts 사용) |
| `PositionChartModal.tsx` | 카테고리별 렌탈사 포지션 차트 + 모달 — 클릭 시 전체 렌탈사 분포 표시 |
| `ViewToggle.tsx` | 주문확정/계약완료 탭 전환 버튼 (URL searchParams `?tab=contract`) |
| `CategoryCompetitiveSection.tsx` | 가전&상조 카테고리별 경쟁 분석 — 상위 5개 모델 × 렌탈사 분포 + 가격표 |
| `BrandCompetitiveSection.tsx` | 정수기 브랜드별 경쟁 분석 — 내 브랜드 상위 상품 vs 동일 관리방식 경쟁군 |
| `home/WaterfallPanel.tsx` | 홈 ② 섹션 — 지표(건수·거래액·매출·공헌이익) 전환 탭 + 워터폴 + 렌탈사 증감 기여 |
| `home/Waterfall.tsx` | 워터폴 SVG — `decimals`/`unit` 으로 억·만원 지표까지 그린다 (음수 밑동 지원) |

## For AI Agents

### Working In This Directory
- 모든 파일이 `"use client"` — hooks, 브라우저 API 사용 가능
- `Sidebar.tsx`: `COMPANY_MAP`에서 중복 라벨 제거 후 그룹별 정렬. 새 렌탈사는 `company-map.ts`만 수정하면 자동 반영
- `ViewToggle.tsx`: `useRouter().push()`로 URL searchParams 변경 → Server Component 재실행
- `PositionChartModal.tsx`: 포지션 데이터는 props로 전달받음, 자체 fetch 없음
- `CategoryCompetitiveSection` / `BrandCompetitiveSection`: 가전&상조(typeB)와 정수기(typeA) 경쟁 분석을 각각 담당. 회사 상세 페이지(`[company]/page.tsx`)에서 분기 후 전달

### Common Patterns
- CSS 변수 사용: `var(--color-up)`, `var(--color-down)`, `var(--color-success)`, `var(--color-error)`, `var(--color-tint-sky)`, `var(--color-primary)` (`globals.css` 정의)
- 테이블 sticky 헤더: `sticky left-0 bg-white z-10`

## Dependencies

### Internal
- `lib/company-map.ts` — Sidebar, Header에서 COMPANY_MAP 사용

### External
- `recharts` — MonthlyRevenueChart
- `next/link`, `next/navigation` — 라우팅

<!-- MANUAL: -->
