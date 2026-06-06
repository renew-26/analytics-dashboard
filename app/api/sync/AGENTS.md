<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# app/api/sync

## Purpose
Redash → Supabase 데이터 동기화 API. POST 요청으로 4가지 데이터 타입(`contract`, `order`, `auto_quote`, `auto_quote_typea`)을 동기화한다. Vercel Cron으로 자동 실행된다.

## Key Files

| File | Description |
|------|-------------|
| `route.ts` | POST 핸들러 — Redash API 호출 후 Supabase upsert. 4가지 타입 분기 처리 |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `cron/` | Vercel Cron 트리거 라우트 — 자동 동기화 스케줄 |

## For AI Agents

### Working In This Directory
- Redash 쿼리 ID: contract=4445, order=4441, auto_quote(typeB)=4404, auto_quote(typeA)=4403
- `fetchRedashData()`: CSRF 토큰 추출 → job 생성 → 최대 30회 × 3초 폴링 → 결과 조회
- Supabase upsert 충돌 키: `prop_term_usid` (auto_quote), `prop_item_usid` (orders/contracts)
- 환경변수: `REDASH_URL`, `REDASH_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- 장시간 실행 가능 — `vercel.json`의 `maxDuration` 설정 확인 필요

### Request Body
```json
{
  "type": "contract" | "order" | "auto_quote" | "auto_quote_typea",
  "startDate": "2026-01-01",
  "endDate": "2026-06-06"
}
```

### Dependencies

#### External
- Redash REST API (CSRF 인증 방식)
- `@supabase/supabase-js` (service role key)

<!-- MANUAL: -->
