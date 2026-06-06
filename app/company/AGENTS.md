<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# app/company

## Purpose
렌탈사별 상세 분석 페이지 컨테이너. URL 파라미터로 렌탈사 라벨을 받아 동적 라우트(`[company]`)로 처리한다.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `[company]/` | 특정 렌탈사 상세 분석 페이지 (see `[company]/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- 라우트: `/company/{label}` — `label`은 `COMPANY_MAP`의 `label` 필드와 일치해야 함
- URL에 한국어가 포함되므로 `decodeURIComponent()` 필수 (Sidebar·Header에서 이미 처리)
- 새 렌탈사 추가 시 `lib/company-map.ts`의 `COMPANY_MAP`에만 추가하면 자동으로 라우트 생성됨

<!-- MANUAL: -->
