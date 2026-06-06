<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# app/api

## Purpose
Next.js API 라우트 모음. Redash → Supabase 데이터 동기화(`sync/`)와 경쟁사 지원금 데이터 조회(`subsidy/`)를 담당한다.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `sync/` | Redash에서 raw_orders·raw_contracts·auto_quote 데이터를 Supabase로 동기화 (see `sync/AGENTS.md`) |
| `subsidy/` | competitive_subsidy 테이블 데이터 조회·업로드·템플릿 다운로드 (see `subsidy/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- 모든 API 라우트는 `SUPABASE_SERVICE_ROLE_KEY`를 사용 — 서버 사이드 전용
- `sync/` 라우트는 장시간 실행될 수 있으므로 `vercel.json`의 `maxDuration` 설정 확인 필요

<!-- MANUAL: -->
