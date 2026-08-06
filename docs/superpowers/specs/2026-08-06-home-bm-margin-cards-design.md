# 홈 화면 "3. BM 수익성 분석" 섹션 공헌이익 카드 추가

## 배경

`app/page.tsx`의 "3. BM 수익성 분석" 섹션은 현재 BM별 공헌이익률/대손율/인센티브 효율 3개 카드만 보여준다. 공헌이익의 절대 금액, 건당 수치, 전월 대비 증감을 추가로 보고 싶다는 요청이 있었다.

## 범위

- 대상: `app/page.tsx`의 "3. BM 수익성 분석" `<details>` 블록 내부 카드 그리드
- 다른 섹션(0, 1, 2)은 변경하지 않는다
- 전주 대비 비교는 이번 스코프에서 제외한다 (주차 집계 로직이 홈 화면에 없고, 섹션2 주차별 탭 작업과 겹치는 영역이라 별도 작업으로 분리)

## 데이터

- 신규 쿼리 없음. 이미 계산된 `currAgg`/`prevAgg` (`aggregateByBM(currContracts)` / `aggregateByBM(prevContracts)`, line 364-365)를 재사용
- line 366의 구조분해에 `prevMargin: prevAgg.margin`을 추가 (현재는 `currMargin`만 꺼내 씀)
- `currAgg.counts[bm]`은 이미 계산되어 있어 건당 공헌이익 계산에 그대로 사용

## UI

기존 3개 카드와 동일한 스타일(`rounded-xl shadow-sm border border-gray-100 bg-white p-5`, BM1/BM2/BM3/전체 행)로 카드 3개를 이어서 추가한다. `grid grid-cols-3`이므로 자연스럽게 2번째 행에 배치된다.

1. **BM별 공헌이익 금액**
   - 값: `fmt(currMargin[bm])` + "원"
   - 색상: 기존 카드처럼 값이 없으면(0건) 회색(`#d1d5db`), 있으면 기본 텍스트색(`#393939`)

2. **BM별 건당 공헌이익**
   - 값: `currAgg.counts[bm] > 0 ? currMargin[bm] / currAgg.counts[bm] : null` → `fmt(Math.round(값))` + "원"
   - `null`이면 "-"

3. **BM별 공헌이익 증감 (전월 대비)**
   - 값: `pct(currMargin[bm], prevMargin[bm])`
   - 표시: 기존 "동기간대비" 로직과 동일하게 `▲/▼` + `Math.abs(p).toFixed(1)}%`, 양수는 `var(--color-up)`, 음수는 `var(--color-down)`, `null`이면 "-"(회색)

## 엣지 케이스

- 특정 BM에 해당 기간 거래가 0건이면 건당 공헌이익은 "-" 처리
- 전월 공헌이익이 0이면(`pct` 함수가 이미 처리) 증감률 "-" 처리
- 공헌이익 합계가 음수인 경우도 그대로 표시 (마이너스 부호 포함, 별도 처리 없음)

## 컴포넌트 변경 목록

| 파일 | 변경 |
|---|---|
| `app/page.tsx` | line 366 구조분해에 `prevMargin` 추가, 섹션3 카드 그리드에 카드 3개 추가 |
