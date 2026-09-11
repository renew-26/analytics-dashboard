# raw_orders/raw_contracts 폐기 — raw_prop_items 단일 원장으로

작성 2026-09-11. 선행: `docs/superpowers/specs/2026-09-11-dashboard-loading-design.md`(캐싱),
`migrations/2026-09-02_unify_to_4678.sql`(PHASE 1 백필), `migrations/2026-09-04_phase2_views.sql`(뷰 전환안 — **폐기**).

## 이 작업이 필요한 이유 — 화면이 2025년 주문확정의 97%를 버리고 있다

성능 작업 중 뷰 전환(PHASE 2)을 검토하다 발견했다. 구 `raw_orders` 는 Redash 4441 이
`prop_item_pnl` 을 INNER JOIN 한 흔적으로 `sales IS NOT NULL` 을 달고 있는데,
**2026-02 이전에는 손익이 채워지지 않아** 그 조건이 2025년을 거의 전부 탈락시킨다.

| 주문확정 건수 | 현재 화면 | 실제(raw_prop_items) |
|---|---:|---:|
| 2025 전체 | **2,283** | **62,710** |
| 2026 전체 | 68,694 | 70,103 |

계약완료는 2025 전체 34,896 으로 **정확히 일치**한다 — `raw_contracts` 에는 그 조건이 없다.

`raw_prop_items` 전체 133,219행 중 62,379행(47%)이 `sales` NULL 이다. 2026-02 를
기점으로 손익이 채워지기 시작했다.

**부수 증거:** 홈에 `?hide2025=1` 토글이 있고, 거래건수 월별 격자에서 2025년 월을
통째로 숨긴다(`app/page.tsx:521`). 2025 주문확정이 97% 비어 격자가 이상해 보였기
때문으로 보인다. 이 마이그레이션이 그 원인을 없앤다.

## 결정 사항

| 항목 | 결정 | 결정자·근거 |
|---|---|---|
| 대상 테이블 | `raw_prop_items` 단일 | 사용자 — 회사 데이터레이크 수치와 일치 |
| 뷰 전환(PHASE 2) | **폐기** | 뷰는 구 의미(`sales` 조건 포함)를 재현하므로 위 버그가 남는다 |
| `sales IS NOT NULL` | **버린다** | 사용자 확정 — "주문확정은 언제 주문확정됐는지 재는 것"이라 손익이 나중에 채워졌는지와 무관. 2025 = 62,710 이 맞다 |
| 취소 건(`status=취소`) | **포함 유지** | 사용자 — 견적 취소도 분석 대상 (2026-09-10 결정, 그대로 유지) |
| 패턴 | `app/exception-approval/page.tsx` 의 `DateBasis` 를 `lib/` 로 승격 | 사용자 지정 |
| 구 테이블 | 재배선 검증 후 **즉시 드롭** | 사용자 — 놓친 호출부가 조용히 낡은 값을 주는 대신 에러로 터진다 |

## 범위 — 19개 파일

`app/api/sync/` 는 이미 `raw_prop_items` 에만 쓰므로 제외.

**계약완료 전용 (7) — 숫자 불변이어야 한다**
`lib/fetch-rows.ts` · `lib/period.ts` · `app/brand-analysis/page.tsx` ·
`app/categories/[category]/[company]/page.tsx` · `.../[product]/page.tsx` ·
`app/category/[category]/page.tsx` · `app/components/HeaderData.tsx`

**둘 다 (11) — 주문확정 부분이 바뀐다**
`app/components/DashboardSections.tsx`(10곳) · `app/company/[company]/page.tsx`(7) ·
`app/category-trends/CategoryTrendsClient.tsx`(6) · `app/page.tsx`(5) ·
`app/revenue-analysis/page.tsx`(3) · `app/category-trends/page.tsx` ·
`app/compare/page.tsx` · `app/conversion/page.tsx` · `app/group/[group]/page.tsx` ·
`app/operation-efficiency/page.tsx` · `app/product-lookup/page.tsx`

**죽은 코드 (1)** `app/api/test-query-compare/route.ts` — 2026-08-09 작성, 호출부 없음,
주석이 "Redash 4625(신규) vs raw_orders(기존 4441) 행 수 비교"인데 두 쿼리 모두 4678 로
대체됐다. 삭제한다.

## 설계

### 1. 공용층 — `lib/date-basis.ts` (신규)

```ts
export type DateBasis = "order" | "contract";

/** 기준별 날짜 컬럼. raw_prop_items 한 테이블에서 기준만 바꿔 읽는다. */
export const DATE_COL = {
  order: "order_confirmed_at",
  contract: "contract_date",
} as const satisfies Record<DateBasis, string>;

export const BASIS_LABEL: Record<DateBasis, string> = {
  order: "주문확정",
  contract: "계약완료",
};
```

**`fetch-rows.ts` 에 합치지 않는다.** `BASIS_LABEL` 은 표시층(`CategoryTrendsClient`,
클라이언트 컴포넌트)도 쓰는데 `fetch-rows.ts` 는 서버 Supabase 클라이언트를 import 한다.
클라이언트가 거기서 **값**을 가져오면 서버 모듈이 브라우저 번들 그래프로 끌려온다 —
PR #35 에서 실제로 밟은 함정이다(`import type` 은 지워지지만 값은 아니다).
타입과 라벨만 의존 없는 모듈에 두면 어디서든 안전하다.

### 2. `lib/fetch-rows.ts` 수정

`table` · `dateColumn` 두 옵션이 `basis?: DateBasis` 하나로 바뀐다. 테이블은
`raw_prop_items` 고정, 쿼리에 `.not(dateCol, "is", null)` 이 붙는다.
기본값 `basis = "contract"` 를 유지하면 **기존 호출부 2곳(`app/categories/page.tsx`,
`app/companies/page.tsx`)은 한 줄도 안 바뀐다** — 둘 다 기본값만 쓰고 있다.

### 3. 호출부 변환 — 기계적 규칙

```ts
// 계약완료
- .from("raw_contracts").gte("contract_date", s)
+ .from("raw_prop_items").not("contract_date", "is", null).gte("contract_date", s)

// 주문확정
- .from("raw_orders").gte("order_confirmed_at", s)
+ .from("raw_prop_items").not("order_confirmed_at", "is", null).gte("order_confirmed_at", s)
```

`sales` 필터는 넣지 않는다. select 컬럼 · 나머지 필터 · 페이지네이션 ·
`PAGE = 50000`(PostgREST max-rows 상한) 은 **손대지 않는다**.

### 4. 표시층 — 테이블 이름이 UI 로 새어 있다

`app/category-trends/CategoryTrendsClient.tsx` 가 사용자에게 이렇게 쓴다:

> "두 탭은 서로 다른 테이블에서 옵니다 — 월별은 raw_contracts(계약완료), 주차별은 raw_orders(주문확정)"

`source="raw_contracts"` / `otherSource="raw_orders"` prop 으로 출처 배지도 그린다.
테이블이 하나가 되면 이 문구는 **거짓이 된다**. 기준 이름(주문확정/계약완료)으로 바꾼다.
쿼리만이 아니라 표시층도 범위다.

## 순서와 검증 — 비대칭이 핵심이다

보통은 "숫자 불변"으로 검증하지만 여기서는 **일부 숫자가 바뀌는 것이 정상**이다.
그래서 검증 기준이 호출부마다 다르다.

**0단계 — 기대 델타 표를 먼저 뜬다.** 구 테이블이 살아 있는 동안에만 만들 수 있다.
월별 × 기준별로 `구 테이블 건수` vs `raw_prop_items 건수` 를 파일로 남긴다.
드롭 후에는 재생성이 불가능하다.

| 단계 | 대상 | 기대 | 판정 |
|---|---|---|---|
| 1 | `lib/` 공용층 | 숫자 불변 | 다르면 재배선 버그 |
| 2 | 계약완료 전용 5파일 | 숫자 불변 (34,896 = 34,896) | 다르면 재배선 버그 |
| 3 | 섞인 11파일, 무거운 순 | 2025 주문확정 27배 증가 | 델타 표와 대조 |
| 4 | 죽은 코드 삭제 + 구 테이블 드롭 | 남은 참조 0 | grep 확인 후 |

1·2단계가 **기계적 변환 자체가 옳다는 것을 이진법으로 증명**한다. 그게 통과해야
3단계에서 숫자가 바뀔 때 "의도된 변화"로 읽을 근거가 생긴다.

## 하지 않는 것

- **조회 계층 통합** — 16개 인라인 페이지네이션 루프를 `fetchRows` 로 모으는 일.
  각 호출부의 루프는 그대로 두고 테이블·필터만 바꾼다. 섞으면 재배선 오류와
  리팩터 오류가 한 diff 에 들어간다.
- **집계를 DB 로(B안)** — 캐싱 스펙의 후속. 이 작업과 독립이다.
- **`sales` 가 NULL 인 2025 행의 손익 백필** — 원천에 없는 값이다. 이 작업 범위 밖.
- **`hide2025` 토글 제거** — 원인은 없어지지만 토글 자체를 뗄지는 별도 판단.

## 위험

| 위험 | 완화 |
|---|---|
| 2025 주문확정이 27배 늘어 과거 지표 해석이 바뀐다 | 의도된 수정이다. 데이터레이크가 기준임을 사용자가 확인 |
| 호출부 하나를 놓쳐 조용히 틀린다 | 구 테이블을 드롭하므로 놓친 곳은 에러로 터진다 |
| 재배선 중 필터를 잘못 옮겨 한 페이지만 틀어진다 | 1·2단계의 이진 게이트 + 3단계 델타 표 대조 |
| 구 테이블을 참조하는 외부 소비자(Redash·타 서비스) | **미확인.** 드롭 전에 사용자가 확인해야 한다 |

## 미확인 — 드롭 전에 확인 필요

`raw_orders` · `raw_contracts` 를 이 저장소 밖에서 읽는 곳이 있는지 확인하지 못했다.
Redash 대시보드, 타 서비스, 수기 쿼리 등. 드롭은 되돌릴 수 없으므로 사용자 확인이 필요하다.
