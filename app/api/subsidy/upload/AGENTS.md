<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# app/api/subsidy/upload

## Purpose
경쟁사 지원금 엑셀 파일 업로드 API. multipart/form-data로 파일과 `year_month`를 받아 파싱 후 `competitive_subsidy` 테이블에 해당 월 데이터를 교체(delete → insert)한다.

## Key Files

| File | Description |
|------|-------------|
| `route.ts` | POST 핸들러 — xlsx 파싱, 인터넷/가전 시트 분기, Supabase delete+insert |

## For AI Agents

### Working In This Directory
- 요청: `multipart/form-data` — `file` (xlsx), `year_month` (YYYY-MM)
- 시트 분기: 시트명에 "인터넷" 포함 → 인터넷 레코드, "가전" 포함 → 가전 레코드
- `comparison` 필드: 엑셀에 "지원금 비교" 컬럼 있으면 사용, 없으면 `deriveComparison()`으로 자동 산출 ("우세"/"열세"/"동일")
- 월별 전체 교체 방식: 해당 `year_month` 데이터를 먼저 DELETE 후 INSERT (upsert 아님)
- 컬럼명은 `template/route.ts`와 반드시 일치해야 함

### SubsidyRecord 스키마
```typescript
{
  year_month: string;      // "YYYY-MM"
  type: "인터넷" | "가전";
  category: string | null; // 인터넷: 통신사명, 가전: 카테고리
  brand: string | null;    // 가전 전용
  product_name: string | null;
  model_name: string | null;
  segment: string | null;  // 인터넷: 구분
  partner: string | null;  // 업체명
  competitor_subsidy: number | null;
  rentree_subsidy: number | null;
  comparison: string | null; // "우세" | "열세" | "동일"
}
```

### External
- `xlsx` ^0.18.5 — 엑셀 파싱
- `@supabase/supabase-js` (service role key)

<!-- MANUAL: -->
