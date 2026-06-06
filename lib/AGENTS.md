<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# lib

## Purpose
공용 유틸리티 모듈. Supabase 클라이언트 싱글톤과 렌탈사·BM 분류 매핑 데이터를 제공한다. 앱 전반에서 `@/lib/...`으로 임포트된다.

## Key Files

| File | Description |
|------|-------------|
| `supabase.ts` | Supabase 클라이언트 싱글톤 (`NEXT_PUBLIC_*` 환경변수 사용, anon key) |
| `company-map.ts` | 렌탈사 매핑(`COMPANY_MAP`), 주요 렌탈사 목록(`MAIN_RENTAL_COMPANIES`), BM 분류(`getBM()`) |

## For AI Agents

### Working In This Directory
- `supabase.ts`의 클라이언트는 anon key 사용 — RLS가 적용된 공개 데이터용. 관리자 작업(upsert, service role)은 각 Server Component/API 라우트에서 `createClient`를 직접 호출해 `SUPABASE_SERVICE_ROLE_KEY` 사용
- `company-map.ts`의 `COMPANY_MAP`은 사이드바 네비게이션과 렌탈사 상세 페이지 라우팅의 단일 소스. 렌탈사 추가/변경 시 이 파일만 수정하면 됨
- `getBM()` 함수: `partner_company` 기준으로 BM1/BM2/BM3 분류. BM3→BM2→BM1 우선순위

### Common Patterns
```typescript
// BM 분류
import { getBM } from "@/lib/company-map";
const bm = getBM(row.partner_company); // "BM1" | "BM2" | "BM3"

// 렌탈사 매핑 조회
import { COMPANY_MAP } from "@/lib/company-map";
const mapping = COMPANY_MAP.find((c) => c.label === label);
// mapping.dbName → Supabase rental_company 컬럼 값
// mapping.categoryIs → 특정 카테고리만 (e.g. "타이어")
// mapping.categoryNot → 특정 카테고리 제외 (e.g. "인터넷")
```

### COMPANY_MAP 구조
- `label`: 사이드바 표시명 (URL 인코딩되어 라우트에 사용)
- `dbName`: Supabase `rental_company` 컬럼의 실제 값
- `group`: "가전&상조" | "정수기" | "통신" (사이드바 그룹핑, 포지션 분석 분기)
- `categoryIs` / `categoryNot`: 한 dbName이 여러 라벨에 매핑될 때 카테고리로 분기

## Dependencies

### External
- `@supabase/supabase-js` — `createClient`

<!-- MANUAL: -->
