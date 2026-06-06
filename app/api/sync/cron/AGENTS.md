<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# app/api/sync/cron

## Purpose
Vercel Cron Job 트리거 라우트. 스케줄에 따라 자동으로 `../route.ts`(sync API)를 호출해 Redash → Supabase 데이터 동기화를 실행한다.

## Key Files

| File | Description |
|------|-------------|
| `route.ts` | GET 핸들러 — Vercel Cron 호출 시 sync POST API를 내부적으로 실행 |

## For AI Agents

### Working In This Directory
- Cron 스케줄은 `vercel.json`에 정의
- 인증: Vercel이 `CRON_SECRET` 헤더를 주입 — 외부 직접 호출 방지 확인 필요

<!-- MANUAL: -->
