# 렌탈사별 매출 기준선(Revenue Target Lines) 설계

## 배경

렌탈사 페이지(`/company/[company]`)의 "월별 매출 현황" 차트는 매출 추이만 보여주고, 목표치나 손익분기점(BEP) 같은 기준값과 비교할 수 있는 방법이 없다. 렌탈사별로 여러 개의 가로 기준선을 직접 등록해 차트 위에 표시하고 싶다.

## 목표

- 렌탈사 페이지의 "월별 매출 현황" 차트에 사용자가 직접 입력한 가로 기준선(목표/BEP 등)을 표시
- 렌탈사당 여러 개의 기준선을 라벨과 함께 등록 가능
- Supabase에 영속화하여 새로고침·다른 기기·다른 사용자 간에도 동일하게 보임
- "주차별 매출 현황" 차트에는 영향 없음 (범위 밖)

## 데이터 모델

새 Supabase 테이블 `revenue_targets`:

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | bigserial PK | |
| `rental_company` | text not null | `lib/company-map.ts`의 `dbName`과 매칭 |
| `label` | text not null | 기준선 라벨 (예: "2026 목표") |
| `amount` | numeric not null | 원 단위로 저장 (UI 입력은 억 단위, 저장 시 ×100,000,000) |
| `created_at` | timestamptz not null default now() | |

RLS: `raw_orders`/`raw_contracts`와 동일하게 anon key로 SELECT 허용 (서버 컴포넌트에서 기존 `supabase` 클라이언트로 조회). INSERT/DELETE는 API route에서 `SUPABASE_SERVICE_ROLE_KEY` 기반 `supabaseAdmin` 클라이언트로만 수행.

## API

### `POST /api/revenue-targets`
- Body: `{ rental_company: string, label: string, amount: number }` (amount는 원 단위, 서버로 전달되기 전 클라이언트에서 억 단위 → 원 단위로 변환)
- 동작: `supabaseAdmin.from("revenue_targets").insert(...)`, 생성된 row를 응답으로 반환
- 실패 시 `{ ok: false, error }` + 4xx/5xx

### `DELETE /api/revenue-targets?id={id}`
- 동작: `supabaseAdmin.from("revenue_targets").delete().eq("id", id)`
- 실패 시 `{ ok: false, error }` + 4xx/5xx

두 라우트 모두 `app/api/sync/route.ts`의 기존 컨벤션(에러를 캐치해 `{ ok: false, error }` JSON으로 반환)을 따른다.

## 서버 컴포넌트 변경 (`app/company/[company]/page.tsx`)

- `dbName` 확정 이후, `revenue_targets`를 `rental_company = dbName` 조건으로 조회 (`created_at` 오름차순 정렬)
- bm(`all`/`bm1`/`bm2`/`bm3`)·tab(`order`/`contract`) 필터와 무관하게 렌탈사 전체에 공통으로 적용 — 목표는 뷰 전환과 관계없이 하나의 값이라는 전제
- "월별 매출 현황" 섹션에서만 `<MonthlyRevenueChart data={monthlyStats} targets={revenueTargets} companyDbName={dbName} />` 형태로 전달
- "주차별 매출 현황" 섹션(`weekChartData`)의 `<MonthlyRevenueChart>` 호출은 변경하지 않음 (targets prop 미전달 → 因 옵셔널이라 동작 그대로 유지)

## `MonthlyRevenueChart` 컴포넌트 변경

- 새 optional props 추가:
  - `targets?: { id: number; label: string; amount: number }[]`
  - `companyDbName?: string`
- `targets`가 전달된 경우에만:
  - `LineChart` 내부에 기준선마다 `<ReferenceLine y={t.amount} .../>` 렌더링. 라벨은 `label={{ value: t.label, position: "insideTopLeft", fontSize: 11 }}`로 표시
  - 색상은 DESIGN.md의 accent 계열(`--accent-purple`, `--accent-orange`, `--accent-yellow`, `--warning-500`)을 기준선 인덱스에 따라 순환 배정 (기존 매출 라인의 `--primary` 계열과 시각적으로 구분되도록)
  - 차트 아래에 인라인 폼 렌더:
    - 입력: 라벨 텍스트 인풋 + 금액(억원) 숫자 인풋 + "추가" 버튼
    - 등록된 기준선은 칩(pill) 형태로 나열, 각 칩에 `×` 삭제 버튼
  - 상태 관리: `useState`로 로컬 target 목록을 서버에서 받은 초기값으로 초기화. 추가/삭제 시 낙관적으로 로컬 state를 갱신하면서 동시에 API 호출로 영속화. API 실패 시 이전 상태로 롤백하고 에러 문구 노출
- `targets`가 전달되지 않은 호출(주차별 차트)은 현재 동작과 100% 동일

## 에러 처리

- 금액 입력이 비어있거나 숫자가 아니면 "추가" 버튼 비활성화
- API 요청 실패(네트워크 오류, 5xx) 시 낙관적으로 반영했던 변경을 롤백하고 짧은 에러 메시지 표시
- 그 외 특별한 폴백 로직 없음 (존재하지 않는 시나리오에 대한 방어 코드 추가하지 않음)

## 테스트 계획

1. `npm run build` — 타입 체크 통과 확인
2. 로컬 서버에서 실제 렌탈사 페이지(예: 코웨이)를 열어:
   - 기준선 추가 → 차트에 즉시 표시되는지 확인
   - 새로고침 후에도 유지되는지 확인 (Supabase 영속 확인)
   - 기준선 삭제 → 차트에서 즉시 사라지고 새로고침 후에도 사라진 상태 유지되는지 확인
3. "주차별 매출 현황" 차트가 기존과 동일하게 렌더링되는지(기준선 없이) 확인
4. 다른 렌탈사 페이지로 이동 시 해당 렌탈사의 기준선만 보이는지 확인 (렌탈사 간 데이터 섞임 없는지)

## 범위 밖 (Out of Scope)

- 주차별 매출 현황 차트에 기준선 표시
- bm(BM1/BM2/BM3)별로 다른 기준선 설정
- 기준선 값 수정(기존 항목 편집) — 삭제 후 재등록으로 대체
- 기준선 접근 권한/사용자별 소유권 관리
