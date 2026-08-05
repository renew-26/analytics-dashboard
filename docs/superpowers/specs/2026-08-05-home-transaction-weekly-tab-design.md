# 홈 화면 "2. 거래건수" 섹션 월별/주차별 탭 분리

## 배경

`app/page.tsx`의 "2. 거래건수" 섹션(2-1 카테고리별, 2-2 BM별, 2-3 주요 렌탈사별 거래건수 + 상단 카테고리 차트)은 현재 월별 집계만 보여준다. 사용자가 월별 화면과 주차별 화면을 탭으로 나눠서 볼 수 있게 요청했다.

`app/category-trends/`에 이미 "월별 트렌드 / 주차별 트렌드" 탭 전환 UI 패턴(`CategoryTrendsClient.tsx`의 `TabButton`, `useState<"monthly"|"weekly">`)과 주차 계산 로직(`getWeekIndex`, `getWeekLabel`, `WEEK_REF = 2026-01-02`)이 존재하므로 이를 재사용한다.

## 범위

- 대상: `app/page.tsx`의 "2. 거래건수" 섹션 전체 — 상단 카테고리 차트(정수기/대카테고리 그래프) + 2-1/2-2/2-3 표
- 데이터 기준: 계약완료 기준(`raw_contracts.contract_date`) 유지. 이미 서버에서 fetch 중인 `catRaw`(`fetchAllYearContracts`, 2025-01-01~현재)를 재사용하고, 새 Supabase 쿼리는 추가하지 않는다.
- 다른 섹션(0, 1, 3)은 변경하지 않는다.

## 아키텍처

1. **주차 계산 로직 공유화**: `getWeekIndex`, `getWeekStartDate`, `getWeekLabel`, `WEEK_REF` 상수를 `app/category-trends/page.tsx`에서 새 파일 `lib/week.ts`로 추출하고, `category-trends/page.tsx`와 `app/page.tsx` 양쪽에서 import해서 사용한다. 이렇게 하면 두 페이지가 동일한 주차 번호("8월 1주차" 등) 기준을 공유한다.
2. **섹션 2 분리**: `app/page.tsx`의 "2. 거래건수" JSX 블록(상단 차트 + 2-1/2-2/2-3 표)을 새 Client Component `app/components/TransactionCountSection.tsx`로 이동한다.
3. **서버 집계 확장**: `app/page.tsx`(Server Component)는 기존 월별 집계(`monthCatMap`/`monthBmMap`/`monthRcMap`, `categoryChart2026`/`categoryChart2025`)에 더해, 같은 `catRaw`를 주차 단위로도 집계한다 (`weekCatMap`/`weekBmMap`/`weekRcMap`, `weekColumns`, `weeklyCategoryChartData`). 두 집계 결과를 `TransactionCountSection`에 props로 전달한다.
4. **탭 상태**: `TransactionCountSection` 내부에서 `useState<"monthly" | "weekly">("monthly")`로 관리 (URL에는 반영하지 않음, `category-trends`와 동일한 방식).

## UI 동작

### 월별 탭 (기본값)
- 현재 화면과 완전히 동일: `CategoryMonthlyChart` 26년/25년 2분할, 2-1/2-2/2-3 표, `TransactionYearToggle`("25년 데이터 숨기기") 그대로 동작.

### 주차별 탭
- 카테고리 차트는 연도로 나누지 않고 **정수기 그래프 1개 + 대카테고리 그래프 1개**, x축은 주차 라벨(예: "8/4~8/10")을 시간순으로 이어서 표시. `CategoryMonthlyChart`는 `dataKey="month"`로 하드코딩돼 있으므로 컴포넌트 변경 없이 데이터 포인트의 `month` 필드에 주차 라벨을 넣어 그대로 재사용한다.
- 2-1/2-2/2-3 표는 열 헤더가 "월" 대신 "주차"가 되고, 기본적으로 **최근 12주**만 보여준다. 주차별 탭 전체에 **하나의 "더보기" 버튼**을 두어(개별 표마다 따로 두지 않음) 클릭 시 상단 차트와 2-1/2-2/2-3 표 전부가 동시에 2025-01-01까지 전체 주차로 확장된다 (`category-trends`의 `WeeklyView`가 쓰는 `TAB_LIMIT` + `tabsExpanded` 패턴과 동일한 UX를 하나의 공유 상태로 적용).
- `TransactionYearToggle`은 주차별 탭에는 노출하지 않는다 — 기본 12주 창이 이미 2025년 대부분을 가리므로 별도 처리가 불필요하다.

## 데이터 흐름 상세

- `catRaw: YearContractRow[]` (기존, 변경 없음) → 월별 집계는 `contract_date.slice(0,7)`로 그룹, 주차별 집계는 `getWeekIndex(contract_date)`로 그룹.
- 주차별 집계 맵 구조는 월별과 동일하게 `Map<number, Map<string, number>>` 형태 (키가 `weekIdx`인 것만 다름).
- 주차 컬럼 목록(`weekColumns: {idx, title, range}[]`)은 실제 데이터에 존재하는 `weekIdx`들을 최신순으로 정렬해서 만든다 (category-trends의 `weekColumns` 생성 로직과 동일).
- 표시용 "최근 12주" 자르기는 `TransactionCountSection` 내부의 단일 상태(`weeksExpanded: boolean`)로 처리하며, `weekColumns.slice(0, 12)` 결과를 차트 데이터와 2-1/2-2/2-3 표 컬럼에 동일하게 적용한다 (더보기 클릭 시 전체로 전환). 서버는 항상 전체 주차 데이터를 내려주고, 자르기는 클라이언트 상태로만 처리.

## 컴포넌트 변경 목록

| 파일 | 변경 |
|---|---|
| `lib/week.ts` (신규) | `WEEK_REF`, `getWeekIndex`, `getWeekStartDate`, `getWeekLabel` 추출 |
| `app/category-trends/page.tsx` | 위 4개를 `lib/week.ts`에서 import (로컬 정의 제거) |
| `app/page.tsx` | 섹션 2 JSX를 `TransactionCountSection`으로 교체, 주차별 집계 로직 추가 |
| `app/components/TransactionCountSection.tsx` (신규, `"use client"`) | 탭 전환 + 월별/주차별 렌더링 (차트 + 2-1/2-2/2-3 표) |

## 엣지 케이스

- 특정 주차에 카테고리/BM/렌탈사 건수가 0이면 기존 표와 동일하게 "-" 표시.
- 데이터가 아직 12주치도 없는 경우(예: 서비스 초기) "더보기" 버튼은 숨김.
- 주차 경계는 `WEEK_REF = 2026-01-02` 고정 기준을 그대로 사용하므로 연도가 바뀌어도 주차 번호가 끊기지 않음 (category-trends와 동일).
