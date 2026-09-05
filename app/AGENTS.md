<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-07-22 -->

# app

## Purpose
Next.js App Router 루트 디렉토리. 전역 레이아웃(사이드바+헤더), 홈 대시보드, 렌탈사별 상세 페이지와 다수의 분석 페이지(브랜드·카테고리 트렌드·전환율·예외승인·렌탈사 비교·경쟁사 지원금), API 라우트를 포함한다. 대부분의 페이지는 `page.tsx`(Server Component, 데이터 fetch+집계) + `*Client.tsx`(Client Component, 인터랙션) 쌍으로 구성된다.

## Key Files

| File | Description |
|------|-------------|
| `layout.tsx` | 전역 레이아웃 — Sidebar + Header 래핑, Geist 폰트, 한국어 lang 설정 |
| `page.tsx` | 홈 대시보드 — ① 한눈에 보기(KPI 4종: 계약완료·거래액·매출·공헌이익) ② 왜 변했나(지표별 워터폴 + 렌탈사 기여) ③ 어디서 문제(주의 신호 / 확인 필요) ④ 어디서 성과(BM·렌탈사·카테고리) + 접힌 상세 격자 |
| `globals.css` | 전역 CSS — Tailwind 설정, CSS 변수 (color-up, color-down, color-tint-sky 등) |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `api/` | Next.js API 라우트 — 데이터 동기화, 지원금 조회/업로드 (see `api/AGENTS.md`) |
| `components/` | 공용 UI 컴포넌트 (see `components/AGENTS.md`) |
| `company/` | 렌탈사별 상세 분석 페이지 — 동적 라우트 `[company]` (see `company/AGENTS.md`) |
| `companies/` | 전체 렌탈사 — 렌탈사 카드 그리드(홈에서 이관) + 티어(T1/T2/T3)·그룹 필터·정렬 |
| `categories/` | 상위 카테고리 3축(가전&상조/정수기/인터넷) — `[category]`(KPI·워터폴·렌탈사별 성과·세부 카테고리 카드·BM 구성), `[category]/[company]`(카테고리 × 렌탈사 — 상품별 성과·변화 원인) |
| `brand-analysis/` | 브랜드별 매출·판매 상품 분석 (see `brand-analysis/AGENTS.md`) |
| `category-trends/` | 카테고리 월별·주차별 트렌드 (see `category-trends/AGENTS.md`) |
| `compare/` | 렌탈사 2개 선택 비교 (see `compare/AGENTS.md`) |
| `conversion/` | 주문확정→계약완료 전환율 분석 (see `conversion/AGENTS.md`) |
| `exception-approval/` | 예외승인(2만원 추가 보상제) 영향 분석 (see `exception-approval/AGENTS.md`) |
| `competitive-subsidy/` | 경쟁사 지원금 조사 (엑셀 업로드) (see `competitive-subsidy/AGENTS.md`) |
| `margin-analysis/` | 타사 비교 — 경쟁사 타겟마진 역산 (tps-dashboard에서 이관) |
| `products/` | 상품 관리 — TPS/유심/가전 상품 DB CRUD (tps-dashboard에서 이관) |
| `survey-selection/` | 조사 상품 선정 — 가전/TPS 카탈로그 선정 (tps-dashboard에서 이관) |

## For AI Agents

### Working In This Directory
- `layout.tsx`는 모든 페이지를 감싸므로 변경 시 전체 UI에 영향
- `page.tsx`(홈)는 Server Component — Supabase를 직접 쿼리하며 `Promise.all`로 병렬 fetch
- 홈 페이지 데이터 기준: 어제 날짜 기준 당월 1일~어제, 전월 동기간 비교
- 홈 지표 분해는 `METRIC_DEFS`(계약건수·거래액·매출·공헌이익) 단일 소스 — 워터폴·렌탈사 기여가 같은 정의를 쓴다
- 주의 신호는 `alerts`(문제), 확인 필요는 `checks`(급증 등 원인 확인) 로 분리 — 급증을 심각도색에 섞지 않는다
- 새 IA 흐름: 홈(발견) → `/categories/[축]`(분석) → `/companies`·`/company/[렌탈사]`(성과 관리) → `/categories/[축]/[렌탈사]`(원인). 사이드바 상단이 이 축, 기존 메뉴는 하단 유지
- 렌탈사 카드 빌드는 `lib/company-cards.ts` 단일 소스 — 홈은 그리드 대신 기여 Top 요약만, 그리드는 `/companies`
- 카테고리 그룹핑은 6그룹(정수기/공청기·비데/대형가전/타이어/기타/인터넷 — rentre_logic_sync_onepager.pdf 현행 체계) — 정의는 `lib/biz-category.ts` CATEGORY_GROUPS 1곳, 홈 워터폴·월별 격자·카드 필터가 전부 이 체계를 쓴다

### Testing Requirements
- 레이아웃 변경 후 모든 페이지 렌더링 확인
- 홈 페이지는 Supabase 연결 필요 (로컬 `.env.local` 필수)

### Common Patterns
- Server Component default export: `async function PageName() { ... }`
- Client Component: `"use client"` 선언 + hooks 사용
- 테이블 스타일: `rounded-xl shadow-sm border border-gray-100 overflow-hidden`
- 현재주 강조: `cell-highlight` CSS 클래스

## Dependencies

### Internal
- `lib/company-map.ts` — `getBM()`, `MAIN_RENTAL_COMPANIES` 사용 (홈 페이지)
- `app/components/` — Sidebar, Header (레이아웃)

### External
- `@supabase/supabase-js` — 직접 쿼리
- `recharts` — MonthlyRevenueChart에서 사용

<!-- MANUAL: -->
