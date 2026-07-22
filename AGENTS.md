<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# analytics-dashboard

## Purpose
렌트리(Rentree) 애널리틱스 대시보드 — Next.js 16 서버 컴포넌트 기반의 내부 렌탈 분석 플랫폼. Redash에서 동기화된 `raw_orders`(주문확정)와 `raw_contracts`(계약완료) 데이터를 Supabase에 저장하고, 렌탈사별·카테고리별·BM별 매출·거래건수·공헌이익을 시각화한다.

## Key Files

| File | Description |
|------|-------------|
| `package.json` | 프로젝트 의존성 및 스크립트 (Next.js 16, React 19, Supabase, Recharts, xlsx) |
| `next.config.js` | Next.js 설정 |
| `tsconfig.json` | TypeScript 설정 (`@/` 경로 alias → 프로젝트 루트) |
| `vercel.json` | Vercel 배포 설정 (maxDuration 등) |
| `rentre.config.json` | 렌트리 내부 설정 파일 |
| `CLAUDE.md` | AI 에이전트용 프로젝트 지침 (AGENTS.md, GUIDELINES.md, DESIGN.md 참조) |
| `GUIDELINES.md` | 코딩 행동 가이드라인 (단순성, 외과적 변경, 목표 중심 실행) |
| `DESIGN.md` | Notion 스타일 기반 디자인 시스템 (색상 토큰, 타이포그래피, 레이아웃) |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `app/` | Next.js App Router 루트 — 페이지, API 라우트, 공용 컴포넌트 (see `app/AGENTS.md`) |
| `lib/` | 공용 유틸리티 — Supabase 클라이언트, 렌탈사/BM 매핑 (see `lib/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- `@/` 경로 alias는 프로젝트 루트를 가리킴 (`tsconfig.json` paths 설정)
- 환경변수: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (공개), `SUPABASE_SERVICE_ROLE_KEY` (서버 전용), `REDASH_URL`, `REDASH_API_KEY`
- 서버 컴포넌트에서 직접 Supabase를 쿼리하는 패턴이 일반적 — 별도 API 레이어 없음
- `SUPABASE_SERVICE_ROLE_KEY`는 서버 컴포넌트와 API 라우트에서만 사용 (클라이언트 노출 금지)

### Testing Requirements
- `npm run dev` 로컬 확인
- `npm run build` 빌드 오류 없는지 확인
- `npm run lint` ESLint 통과

### Common Patterns
- Server Component: 데이터 fetch + 집계 후 JSX 반환 (async function)
- Client Component: `"use client"` 선언, 인터랙션(토글, 모달 등) 담당
- Supabase 페이지네이션: 50,000건 단위 루프 (`range(from, from + PAGE - 1)`)
- 한국어 숫자 포맷: `n.toLocaleString("ko-KR")`

## Dependencies

### External
- `next` 16.2.4 — App Router, Server Components
- `react` / `react-dom` 19.2.4
- `@supabase/supabase-js` ^2.78.0 — 데이터베이스 클라이언트
- `recharts` ^3.8.1 — 차트 라이브러리
- `xlsx` ^0.18.5 — 엑셀 파일 파싱/생성
- `tailwindcss` ^4 — 스타일링

## Supabase Tables

| Table | Description |
|-------|-------------|
| `raw_orders` | 주문확정 데이터 (Redash Query 4441에서 동기화) |
| `raw_contracts` | 계약완료 데이터 (Redash Query 4445에서 동기화) |
| `auto_quote_typeb` | 가전&상조 렌탈사별 자동견적 (Redash Query 4404) |
| `auto_quote_typea` | 정수기 자동견적 — 더블체크 파트너스 기준 (Redash Query 4403) |
| `tps_pnl` | 견적/손익 원장 — 예외승인 분석용 (Redash Query 4405) |
| `competitive_subsidy` | 경쟁사 지원금 조사 데이터 (엑셀 업로드) |

<!-- MANUAL: -->
