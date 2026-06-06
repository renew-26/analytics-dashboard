<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# app/api/subsidy/template

## Purpose
경쟁사 지원금 조사용 엑셀 템플릿 다운로드 API. "인터넷"·"가전" 두 시트가 포함된 `.xlsx` 파일을 생성해 반환한다.

## Key Files

| File | Description |
|------|-------------|
| `route.ts` | GET 핸들러 — xlsx 라이브러리로 템플릿 생성 후 파일 다운로드 응답 |

## For AI Agents

### Working In This Directory
- 인터넷 시트 컬럼: `통신사, 상품명, 구분, 업체명, 타사 지원금, 렌트리 지원금`
- 가전 시트 컬럼: `카테고리, 브랜드, 상품명, 모델명, 업체명, 최종 지원금, 더블체크파트너스 지원금`
- 업로드 라우트(`upload/route.ts`)의 파싱 로직과 컬럼명 일치 필수

### External
- `xlsx` ^0.18.5 — 엑셀 파일 생성

<!-- MANUAL: -->
