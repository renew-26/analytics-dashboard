# 렌탈사별 매출 기준선(Revenue Target Lines) 설계

## 배경

렌탈사 페이지(`/company/[company]`)의 "월별 매출 현황" 차트는 매출 추이만 보여주고, 목표치나 손익분기점(BEP) 같은 기준값과 비교할 수 있는 방법이 없다. 렌탈사별로 여러 개의 가로 기준선을 직접 등록해 차트 위에 표시하고 싶다.

## 목표

- 렌탈사 페이지의 "월별 매출 현황" 차트에 사용자가 직접 입력한 가로 기준선(목표/BEP 등)을 표시
- 렌탈사당 여러 개의 기준선을 라벨과 함께 등록 가능
- 새 Supabase 테이블 없이 브라우저에 영속화 (아래 "설계 변경" 참고)
- "주차별 매출 현황" 차트에는 영향 없음 (범위 밖)

## 설계 변경 (2026-07-30)

최초 설계는 Supabase `revenue_targets` 테이블 + API 라우트로 팀 전체가 공유하는 영속화를 제안했으나, 이 환경에서는 테이블 생성(DDL)을 프로그래밍적으로 실행할 수 없어 Supabase 대시보드에서 수동으로 SQL을 실행해야 했다. 이 수동 단계 자체를 피하고 싶다는 요청에 따라, **새 테이블을 만들지 않고 브라우저 `localStorage`에 저장**하는 방식으로 변경한다. 트레이드오프: 기준선이 팀원 간/기기 간 공유되지 않고 브라우저별로 분리된다 — 사용자가 이 트레이드오프를 명시적으로 선택했다.

## 데이터 모델

Supabase 대신 브라우저 `localStorage`에 렌탈사별로 저장한다.

- 키: `revenue-targets:{rental_company}` (`rental_company`는 `lib/company-map.ts`의 `dbName`)
- 값: JSON 배열 `{ id: number; label: string; amount: number }[]` (`amount`는 원 단위로 저장, UI 입력은 억 단위 → ×100,000,000 변환)
- `id`는 클라이언트에서 `Date.now()`로 생성 (서버 왕복이 없으므로 별도 시퀀스 불필요)
- 서버 컴포넌트(`page.tsx`)는 이 데이터를 조회하지 않는다 — 전적으로 클라이언트(`MonthlyRevenueChart`)가 마운트 시 `localStorage`에서 읽고 쓴다

## `MonthlyRevenueChart` 컴포넌트 변경

- 새 optional prop 추가: `companyDbName?: string` — 전달된 경우에만 기준선 기능(표시 + 입력 UI) 활성화
- 컴포넌트 마운트 시 `useEffect`로 `localStorage`에서 `revenue-targets:{companyDbName}` 읽어 state 초기화 (서버 렌더링 시점에는 `localStorage`가 없으므로 초기 state는 빈 배열 — 클라이언트 hydration 이후 짧게 나타남)
- `LineChart` 내부에 기준선마다 `<ReferenceLine y={t.amount} .../>` 렌더링. 라벨은 `label={{ value: t.label, position: "insideTopLeft", fontSize: 11 }}`로 표시
- 색상은 DESIGN.md의 accent 계열(`--accent-purple`, `--accent-orange`, `--accent-yellow`, `--warning-500`)을 기준선 인덱스에 따라 순환 배정 (기존 매출 라인의 `--primary` 계열과 시각적으로 구분되도록)
- 차트 아래에 인라인 폼 렌더:
  - 입력: 라벨 텍스트 인풋 + 금액(억원) 숫자 인풋 + "추가" 버튼
  - 등록된 기준선은 칩(pill) 형태로 나열, 각 칩에 `×` 삭제 버튼
- 추가/삭제 시 state를 갱신하고 즉시 `localStorage.setItem(...)`으로 동기 저장 (네트워크 왕복이 없으므로 낙관적 업데이트/롤백 로직 불필요)
- `companyDbName`이 전달되지 않은 호출(주차별 차트)은 현재 동작과 100% 동일

## 서버 컴포넌트 변경 (`app/company/[company]/page.tsx`)

- 별도 데이터 조회 없음. "월별 매출 현황" 섹션에서만 `<MonthlyRevenueChart data={monthlyStats} companyDbName={dbName} key={dbName} />` 형태로 전달
- "주차별 매출 현황" 섹션(`weekChartData`)의 `<MonthlyRevenueChart>` 호출은 변경하지 않음

## 에러 처리

- 금액 입력이 비어있거나 숫자가 아니면 "추가" 버튼 비활성화
- `localStorage` 읽기/쓰기 실패(예: 시크릿 모드 용량 제한)에 대한 별도 폴백 로직은 추가하지 않는다 (존재하지 않는 시나리오에 대한 방어 코드 추가하지 않음)

## 테스트 계획

1. `npm run build` — 타입 체크 통과 확인
2. 로컬 서버에서 실제 렌탈사 페이지(예: 코웨이)를 브라우저로 열어:
   - 기준선 추가 → 차트에 즉시 표시되는지 확인
   - 새로고침 후에도 유지되는지 확인 (`localStorage` 확인)
   - 기준선 삭제 → 차트에서 즉시 사라지고 새로고침 후에도 사라진 상태 유지되는지 확인
3. "주차별 매출 현황" 차트가 기존과 동일하게 렌더링되는지(기준선 없이) 확인
4. 다른 렌탈사 페이지로 이동 시 해당 렌탈사의 기준선만 보이는지 확인 (렌탈사 간 데이터 섞임 없는지, `localStorage` 키 분리 확인)

## 범위 밖 (Out of Scope)

- 주차별 매출 현황 차트에 기준선 표시
- bm(BM1/BM2/BM3)별로 다른 기준선 설정
- 기준선 값 수정(기존 항목 편집) — 삭제 후 재등록으로 대체
- 기준선 접근 권한/사용자별 소유권 관리
