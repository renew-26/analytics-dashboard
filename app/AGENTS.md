<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-07-22 -->

# app

## Purpose
Next.js App Router 루트 디렉토리. 전역 레이아웃(사이드바+헤더), 홈 대시보드, 렌탈사별 상세 페이지와 다수의 분석 페이지(브랜드·카테고리 트렌드·전환율·공헌이익·예외승인·렌탈사 비교·자동견적·경쟁사 지원금), API 라우트를 포함한다. 대부분의 페이지는 `page.tsx`(Server Component, 데이터 fetch+집계) + `*Client.tsx`(Client Component, 인터랙션) 쌍으로 구성된다.

## Key Files

| File | Description |
|------|-------------|
| `layout.tsx` | 전역 레이아웃 — Sidebar + Header 래핑, Geist 폰트, 한국어 lang 설정 |
| `page.tsx` | 홈 대시보드 — 카테고리 목표(섹션 0), 동기간 비교(섹션 1), 거래건수(섹션 2) 3개 섹션 테이블 |
| `globals.css` | 전역 CSS — Tailwind 설정, CSS 변수 (color-up, color-down, color-tint-sky 등) |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `api/` | Next.js API 라우트 — 데이터 동기화, 지원금 조회/업로드 (see `api/AGENTS.md`) |
| `components/` | 공용 UI 컴포넌트 (see `components/AGENTS.md`) |
| `company/` | 렌탈사별 상세 분석 페이지 — 동적 라우트 `[company]` (see `company/AGENTS.md`) |
| `auto-quote/` | 렌탈사별 자동견적(가격표) 비교 (see `auto-quote/AGENTS.md`) |
| `brand-analysis/` | 브랜드별 매출·판매 상품 분석 (see `brand-analysis/AGENTS.md`) |
| `category-trends/` | 카테고리 월별·주차별 트렌드 (see `category-trends/AGENTS.md`) |
| `compare/` | 렌탈사 2개 선택 비교 (see `compare/AGENTS.md`) |
| `conversion/` | 주문확정→계약완료 전환율 분석 (see `conversion/AGENTS.md`) |
| `exception-approval/` | 예외승인(2만원 추가 보상제) 영향 분석 (see `exception-approval/AGENTS.md`) |
| `profitability/` | 공헌이익 수익성 분석 (see `profitability/AGENTS.md`) |
| `competitive-subsidy/` | 경쟁사 지원금 조사 (엑셀 업로드) (see `competitive-subsidy/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- `layout.tsx`는 모든 페이지를 감싸므로 변경 시 전체 UI에 영향
- `page.tsx`(홈)는 Server Component — Supabase를 직접 쿼리하며 `Promise.all`로 병렬 fetch
- 홈 페이지 데이터 기준: 어제 날짜 기준 당월 1일~어제, 전월 동기간 비교
- 섹션 0 목표값(`GOAL_ROWS`)은 하드코딩 — 변경 시 `page.tsx` 내 상수 수정

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
