<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# app/api/subsidy

## Purpose
경쟁사 지원금(`competitive_subsidy`) 데이터 관련 API 라우트 모음. 데이터 조회, 엑셀 업로드, 템플릿 다운로드 3가지 기능을 각각 별도 라우트로 제공한다.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `data/` | GET — 월별 지원금 데이터 조회 (see `data/AGENTS.md`) |
| `template/` | GET — 엑셀 업로드 템플릿 다운로드 (see `template/AGENTS.md`) |
| `upload/` | POST — 엑셀 파일 파싱 후 competitive_subsidy 테이블 upsert (see `upload/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- 모든 라우트가 `SUPABASE_SERVICE_ROLE_KEY` 사용 (competitive_subsidy 테이블 접근)
- `SubsidyClient.tsx`에서 `/api/subsidy/data?year_month=YYYY-MM` 형식으로 호출

<!-- MANUAL: -->
