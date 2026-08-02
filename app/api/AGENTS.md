<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-07-22 -->

# app/api

## Purpose
Next.js API 라우트 모음. Redash → Supabase 데이터 동기화(`sync/`), 마진 분석(`margin-analysis/`), 조사 상품 선정(`survey-selection/`)을 담당한다.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `sync/` | Redash에서 raw_orders·raw_contracts·auto_quote(typeA/B)·tps_pnl 동기화. `type` 파라미터로 대상 선택. `cron/`은 인증된 스케줄 진입점 (see `sync/AGENTS.md`) |
| `margin-analysis/` | 마진 분석 — 엑셀 업로드(`survey-upload`), 수동 매칭(`subsidies`), 설정(`settings`) |
| `survey-selection/` | 조사 상품 선정 — 카탈로그 후보(`candidates`), 선정 확정(`confirm`) |
| `sync/tps/` | TPS 상품 Redash 동기화 (Q4622) |
| `sync/appliance/` | 가전 상품 Redash 동기화 (Q4441) |
| `sync/appliance-rentre-subsidy/` | 가전 더블체크 스냅샷 동기화 (Q4633) |
| `sync/competitor/` | 경쟁사 지원금 동기화 (Q38) |

## For AI Agents

### Working In This Directory
- 모든 API 라우트는 `SUPABASE_SERVICE_ROLE_KEY`를 사용 — 서버 사이드 전용
- `sync/route.ts` POST body의 `type`: `contract`(기본)·`order`·`auto_quote`(typeB)·`auto_quote_typea`·`tps_pnl`. 각 타입별로 Redash 쿼리 ID·컬럼 매핑이 다름. `prop_item_usid`(auto_quote는 `prod_term_usid`) 기준 upsert
- `sync/` 라우트는 장시간 실행될 수 있으므로 `vercel.json`의 `maxDuration` 설정 확인 필요 (cron은 `maxDuration = 300`)
- `sync/cron/route.ts`는 `Bearer ${CRON_SECRET}` 인증 후 `/api/sync`를 타입별로 순차 호출

<!-- MANUAL: -->
