<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# app/api/subsidy/data

## Purpose
경쟁사 지원금 데이터 조회 API. `year_month` 파라미터 없이 호출하면 사용 가능한 월 목록을 반환하고, 파라미터를 지정하면 해당 월의 전체 지원금 데이터를 반환한다.

## Key Files

| File | Description |
|------|-------------|
| `route.ts` | GET 핸들러 — `?year_month=YYYY-MM` 파라미터 유무에 따라 월 목록 또는 상세 데이터 반환 |

## For AI Agents

### Working In This Directory
- `year_month` 없음: `competitive_subsidy`에서 distinct year_month 목록 반환
- `year_month` 있음: 해당 월 전체 행을 type·category·product_name 순으로 정렬하여 반환
- service role key 사용

<!-- MANUAL: -->
