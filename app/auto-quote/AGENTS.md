<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-22 | Updated: 2026-07-22 -->

# app/auto-quote

## Purpose
렌탈사별 자동견적(가격표) 비교 페이지. Redash에서 동기화된 자동견적 데이터를 렌탈사·상품·계약기간별로 나란히 비교한다. `auto_quote_typeb`(가전&상조 8개 렌탈사)와 `auto_quote_typea`(정수기, 더블체크파트너스 기준)를 각각 조회한다.

## Key Files

| File | Description |
|------|-------------|
| `page.tsx` | Server Component — `auto_quote_typeb`·`auto_quote_typea` 조회 후 클라이언트에 전달. RLS 때문에 **service role key** 사용 |
| `AutoQuoteClient.tsx` | Client Component — typeB/typeA 표 렌더링, 카테고리·상품·계약기간 필터/토글 담당 |

## For AI Agents

### Working In This Directory
- `page.tsx`는 `SUPABASE_SERVICE_ROLE_KEY`로 `supabaseAdmin` 클라이언트를 생성한다 (auto_quote 테이블에 RLS 적용 → anon key로는 조회 불가). 서버 컴포넌트 전용이며 클라이언트에 키 노출 없음
- `TypeBRow`: 렌탈사별 컬럼 prefix — `lghv`(LG헬로비전), `ini`(이니렌탈), `hyundai`(현대유버스), `bs`(BS렌탈), `smart`(스마트렌탈), `carrier`(캐리어), `body`(바디프랜드), `kt`(KT렌탈). 각 prefix당 `_monthly_fee`, `_support`, `_total_payment`, `_waiver_months`, `_expected_margin`
- `TypeARow`: 정수기 — `dc_` prefix (더블체크파트너스) 단일 렌탈사 기준
- 두 쿼리는 `Promise.all`로 병렬 fetch, 날짜 필터 없이 전체 조회

### Common Patterns
- 컬럼 prefix ↔ 렌탈사 매핑은 이 페이지와 `company/[company]/page.tsx`(포지션 경쟁 분석)에서 공유하는 개념

## Dependencies

### Internal
- (없음 — company-map 미사용, 자체 prefix 매핑)

### External
- `@supabase/supabase-js` — service role 클라이언트

<!-- MANUAL: -->
