# 홈 화면 BM 수익성 분석 공헌이익 카드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `app/page.tsx` "3. BM 수익성 분석" 섹션에 BM별 공헌이익 금액 / 건당 공헌이익 / 전월 대비 증감 카드 3개를 추가한다.

**Architecture:** 신규 쿼리 없이 기존 `currAgg`/`prevAgg` 집계 결과(`aggregateByBM`)를 재사용한다. `prevAgg.margin`을 `prevMargin`으로 구조분해 추가하고, 섹션3의 `grid grid-cols-3` 안에 기존 카드와 동일한 스타일의 카드 3개를 이어 붙인다.

**Tech Stack:** Next.js 16 Server Component, TypeScript, Tailwind CSS

## Global Constraints

- 이 프로젝트에는 단위 테스트 프레임워크가 없다 (`package.json` scripts: dev/build/start/lint만 존재) — 검증은 `npm run build`, `npm run lint`, 그리고 `npm run dev`로 브라우저에서 직접 확인하는 방식으로 한다.
- 신규 Supabase 쿼리를 추가하지 않는다 — `docs/superpowers/specs/2026-08-06-home-bm-margin-cards-design.md`에 명시된 대로 기존 `currAgg`/`prevAgg`만 사용한다.
- 금액 표시는 기존 `fmt()` 함수(`n.toLocaleString("ko-KR")`)를 사용하고 "원" 접미사를 붙인다. 새 포맷 함수를 만들지 않는다.
- 다른 섹션(0, 1, 2)은 건드리지 않는다.

---

### Task 1: `prevMargin` 구조분해 추가 및 공헌이익 카드 3개 추가

**Files:**
- Modify: `app/page.tsx:366` (구조분해 할당)
- Modify: `app/page.tsx:1027-1050` (섹션3 카드 그리드, 기존 3번째 카드 `</div>` 뒤 `</div>` 앞)

**Interfaces:**
- Consumes: `currAgg`/`prevAgg` (line 364-365, `aggregateByBM()` 반환값 — `{ counts, revenue, margin, badDebt, incentive, salesTotal }`, 각각 `{ BM1, BM2, BM3, total }` 형태의 number record), `fmt(n: number): string` (line 56-58), `pct(curr: number, prev: number): number | null` (line 60-63)
- Produces: 없음 (이 프로젝트에서 이 페이지를 소비하는 다른 파일 없음 — `app/page.tsx`는 Next.js가 라우팅으로 직접 렌더링)

- [ ] **Step 1: `prevMargin` 구조분해 추가**

`app/page.tsx` line 366을 다음과 같이 수정한다:

```ts
  const { margin: currMargin, badDebt: currBadDebt, incentive: currIncentive, salesTotal: currSalesTotal } = currAgg;
  const { margin: prevMargin } = prevAgg;
```

- [ ] **Step 2: 섹션3 카드 그리드에 카드 3개 추가**

`app/page.tsx`의 섹션3 마지막 카드(카드 3: BM별 인센티브 효율, line 1027-1049)의 닫는 `</div>` 바로 뒤, 그리드 컨테이너를 닫는 `</div>`(line 1050) 바로 앞에 아래 JSX를 추가한다:

```tsx
          {/* 카드 4: BM별 공헌이익 금액 */}
          <div className="rounded-xl shadow-sm border border-gray-100 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">BM별 공헌이익 금액</h3>
            <div className="space-y-3">
              {(["BM1", "BM2", "BM3", "total"] as const).map((bm) => {
                const v = currMargin[bm];
                return (
                  <div key={bm} className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500">
                      {bm === "total" ? "전체" : bm}
                    </span>
                    <span className="text-sm font-bold" style={{ color: "#393939" }}>
                      {fmt(v)}원
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 카드 5: BM별 건당 공헌이익 */}
          <div className="rounded-xl shadow-sm border border-gray-100 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">BM별 건당 공헌이익</h3>
            <div className="space-y-3">
              {(["BM1", "BM2", "BM3", "total"] as const).map((bm) => {
                const cnt = currAgg.counts[bm];
                const v = cnt > 0 ? Math.round(currMargin[bm] / cnt) : null;
                return (
                  <div key={bm} className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500">
                      {bm === "total" ? "전체" : bm}
                    </span>
                    <span
                      className="text-sm font-bold"
                      style={{ color: v === null ? "#d1d5db" : "#393939" }}
                    >
                      {v === null ? "-" : `${fmt(v)}원`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 카드 6: BM별 공헌이익 증감 (전월 대비) */}
          <div className="rounded-xl shadow-sm border border-gray-100 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">BM별 공헌이익 증감 (전월 대비)</h3>
            <div className="space-y-3">
              {(["BM1", "BM2", "BM3", "total"] as const).map((bm) => {
                const p = pct(currMargin[bm], prevMargin[bm]);
                const isUp = p !== null && p > 0;
                return (
                  <div key={bm} className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500">
                      {bm === "total" ? "전체" : bm}
                    </span>
                    <span
                      className="text-sm font-bold"
                      style={{ color: p === null ? "#d1d5db" : isUp ? "var(--color-up)" : "var(--color-down)" }}
                    >
                      {p === null ? "-" : `${isUp ? "▲" : "▼"} ${Math.abs(p).toFixed(1)}%`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
```

- [ ] **Step 3: 린트 실행**

Run: `npm run lint`
Expected: 에러 없음 (경고만 있다면 기존 코드에 이미 있던 것인지 확인)

- [ ] **Step 4: 빌드 실행**

Run: `npm run build`
Expected: 타입 에러/빌드 에러 없이 성공

- [ ] **Step 5: 개발 서버로 시각 확인**

Run: `npm run dev`

브라우저에서 홈 화면(`/`) 접속 → "3. BM 수익성 분석" 섹션을 펼쳐서 다음을 확인:
- 기존 카드 3개(공헌이익률/대손율/인센티브 효율) 아래 새 카드 3개(공헌이익 금액/건당 공헌이익/증감)가 2번째 행에 나타나는지
- 각 카드에 BM1/BM2/BM3/전체 4개 행이 있는지
- 금액이 콤마 포함 "원" 단위로 표시되는지 (예: `1,234,567원`)
- 증감 카드에서 값이 양수면 초록/▲, 음수면 주황/▼로 표시되는지
- 특정 BM의 거래건수가 0인 경우(있다면) 건당 공헌이익이 "-"로 표시되는지

- [ ] **Step 6: 커밋**

```bash
git add app/page.tsx
git commit -m "feat: 홈 화면 BM 수익성 분석 섹션에 공헌이익 금액/건당/증감 카드 추가"
```

## Self-Review Notes

- **Spec coverage:** 스펙의 3개 카드(금액/건당/증감) 모두 Task 1에 포함됨. 전주 대비는 스펙에서 명시적으로 제외됨 — 이 플랜에도 없음.
- **Placeholder scan:** 없음 — 모든 JSX/로직 코드가 완성된 형태로 포함됨.
- **Type consistency:** `currMargin`/`prevMargin`/`currAgg.counts`는 기존 `aggregateByBM()`의 반환 타입(`Record<"BM1"|"BM2"|"BM3"|"total", number>`)을 그대로 따름. `fmt`/`pct` 시그니처는 기존 정의(line 56-63)와 동일하게 사용.
