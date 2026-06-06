<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# app/competitive-subsidy

## Purpose
경쟁사 지원금 조사 페이지. `competitive_subsidy` 테이블에서 월별 경쟁사 지원금 데이터를 조회하고, 클라이언트 컴포넌트(`SubsidyClient`)로 인터랙티브하게 표시한다.

## Key Files

| File | Description |
|------|-------------|
| `page.tsx` | Server Component — 사용 가능한 월 목록을 Supabase에서 fetch 후 SubsidyClient에 전달 |
| `SubsidyClient.tsx` | Client Component — 월 선택 드롭다운, `/api/subsidy/data` API 호출, 데이터 테이블 렌더링 |

## For AI Agents

### Working In This Directory
- Server/Client 분리 패턴: `page.tsx`는 초기 월 목록만 fetch, 상세 데이터는 클라이언트에서 API 호출
- 데이터 소스: `competitive_subsidy` 테이블 (service role key 사용)
- 업로드/템플릿 기능은 `/api/subsidy/upload`, `/api/subsidy/template` 라우트를 통해 처리

### Dependencies

#### Internal
- `app/api/subsidy/data/route.ts` — 월별 지원금 데이터 조회 API
- `app/api/subsidy/upload/route.ts` — 엑셀 업로드 API
- `app/api/subsidy/template/route.ts` — 템플릿 다운로드 API

<!-- MANUAL: -->
