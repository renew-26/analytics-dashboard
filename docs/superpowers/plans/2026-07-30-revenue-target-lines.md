# 렌탈사별 매출 기준선 (Revenue Target Lines) Implementation Plan

**Goal:** 렌탈사 페이지(`/company/[company]`)의 "월별 매출 현황" 차트에 렌탈사별로 여러 개의 가로 기준선(목표/BEP 등)을 직접 추가·삭제할 수 있는 UI를 추가한다.

**Architecture:** `MonthlyRevenueChart` 컴포넌트가 브라우저 `localStorage`(키: `revenue-targets:{dbName}`)에 라벨+금액을 저장한다. 서버 컴포넌트 변경은 `companyDbName` prop 전달뿐이며, 별도 DB 테이블이나 API 라우트는 만들지 않는다 (사용자가 새 Supabase 테이블 생성을 피하기 위해 명시적으로 선택한 트레이드오프 — 기준선은 팀원/기기 간 공유되지 않음).

**Tech Stack:** Next.js 16 App Router, Recharts (`ReferenceLine`), Tailwind CSS, 브라우저 `localStorage`.

**변경 이력:** 최초 설계는 Supabase `revenue_targets` 테이블 + API 라우트였으나, 테이블 생성이 이 환경에서 수동 SQL 실행을 요구해 그 단계 자체를 피하려는 요청에 따라 localStorage 방식으로 전환. 스펙 문서(`docs/superpowers/specs/2026-07-30-revenue-target-lines-design.md`)에도 반영됨.

## Global Constraints

- 자동화 테스트 프레임워크 없음 — `npm run build`(타입체크) + 로컬 dev 서버 curl/브라우저 확인으로 검증한다.
- `npm run lint`는 이 저장소에서 이미 실패 상태다 (기존 이슈, 무관) — 검증에 사용하지 않는다.
- 색상은 인라인 하드코딩 대신 `DESIGN.md`에 정의된 CSS 변수를 사용한다.
- 금액은 억 원 단위로 입력받아 저장 시 원 단위(×100,000,000)로 변환한다.
- 기준선은 "월별 매출 현황" 차트에만 적용하고 "주차별 매출 현황" 차트는 변경하지 않는다.

---

### Task 1: `MonthlyRevenueChart` 컴포넌트에 localStorage 기반 기준선 표시 + 입력 UI 추가

**Files:**
- Modify: `app/components/MonthlyRevenueChart.tsx` (전체 재작성)

**Interfaces:**
- Produces: `export interface RevenueTarget { id: number; label: string; amount: number }`, `MonthlyRevenueChart`에 optional prop `companyDbName?: string` 추가. 전달되지 않으면 기존과 100% 동일하게 동작 (Task 2에서 주차별 차트 호출부는 그대로 둔다).

- [ ] **Step 1: 컴포넌트 전체 재작성**

`app/components/MonthlyRevenueChart.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

export interface MonthStat {
  month: string;
  totalRentalFee: number;
  mom: number | null;
}

export interface RevenueTarget {
  id: number;
  label: string;
  amount: number; // 원 단위
}

const TARGET_COLORS = [
  "var(--color-accent-purple)",
  "var(--color-accent-orange)",
  "var(--color-warning-500)",
  "var(--color-accent-yellow)",
];

function storageKey(companyDbName: string): string {
  return `revenue-targets:${companyDbName}`;
}

function loadTargets(companyDbName: string): RevenueTarget[] {
  try {
    const raw = localStorage.getItem(storageKey(companyDbName));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTargets(companyDbName: string, targets: RevenueTarget[]) {
  localStorage.setItem(storageKey(companyDbName), JSON.stringify(targets));
}

function fmtAxis(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`;
  return n.toLocaleString("ko-KR");
}

function fmtEok(amountWon: number): string {
  return `${Number((amountWon / 100_000_000).toFixed(2))}억`;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; payload: MonthStat }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid var(--color-gray-200)",
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 600, color: "var(--color-gray-900)", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ color: "var(--color-gray-500)" }}>
        총렌탈료{" "}
        <span style={{ fontWeight: 600, color: "var(--color-gray-900)" }}>
          {d.totalRentalFee.toLocaleString("ko-KR")}원
        </span>
      </div>
      {d.mom !== null && (
        <div
          style={{
            marginTop: 2,
            color:
              d.mom >= 0 ? "var(--color-error)" : "var(--color-down)",
            fontWeight: 600,
          }}
        >
          {d.mom >= 0 ? "▲" : "▼"} 전월 대비 {Math.abs(d.mom).toFixed(1)}%
        </div>
      )}
    </div>
  );
}

export default function MonthlyRevenueChart({
  data,
  color = "var(--color-primary-500)",
  companyDbName,
}: {
  data: MonthStat[];
  color?: string;
  companyDbName?: string;
}) {
  const [targets, setTargets] = useState<RevenueTarget[]>([]);
  const [label, setLabel] = useState("");
  const [amountEok, setAmountEok] = useState("");

  useEffect(() => {
    if (companyDbName) setTargets(loadTargets(companyDbName));
  }, [companyDbName]);

  if (data.length === 0) return null;

  const editable = !!companyDbName;

  function handleAdd() {
    if (!companyDbName) return;
    const trimmedLabel = label.trim();
    const parsedEok = Number(amountEok);
    if (!trimmedLabel || !amountEok || isNaN(parsedEok) || parsedEok <= 0) return;

    const next = [
      ...targets,
      {
        id: Date.now(),
        label: trimmedLabel,
        amount: Math.round(parsedEok * 100_000_000),
      },
    ];
    setTargets(next);
    saveTargets(companyDbName, next);
    setLabel("");
    setAmountEok("");
  }

  function handleRemove(id: number) {
    if (!companyDbName) return;
    const next = targets.filter((t) => t.id !== id);
    setTargets(next);
    saveTargets(companyDbName, next);
  }

  return (
    <div className="[&_svg]:outline-none [&_svg]:focus:outline-none">
      <ResponsiveContainer width="100%" height={200}>
        <LineChart
          data={data}
          margin={{ left: 8, right: 24, top: 8, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="4 4"
            vertical={false}
            stroke="var(--color-gray-150)"
          />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 12, fill: "var(--color-gray-400)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={fmtAxis}
            tick={{ fontSize: 11, fill: "var(--color-gray-400)" }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: "var(--color-gray-200)" }} />
          <Line
            type="monotone"
            dataKey="totalRentalFee"
            stroke={color}
            strokeWidth={2.5}
            dot={{ r: 4, fill: color, strokeWidth: 2, stroke: "#fff" }}
            activeDot={{ r: 5.5, fill: color, strokeWidth: 2, stroke: "#fff" }}
          />
          {targets.map((t, i) => (
            <ReferenceLine
              key={t.id}
              y={t.amount}
              stroke={TARGET_COLORS[i % TARGET_COLORS.length]}
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{
                value: `${t.label} ${fmtEok(t.amount)}`,
                position: "insideTopLeft",
                fontSize: 11,
                fill: TARGET_COLORS[i % TARGET_COLORS.length],
              }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* MOM 요약 배지 */}
      <div className="flex gap-2 flex-wrap mt-3">
        {data.map(
          (d) =>
            d.mom !== null && (
              <div
                key={d.month}
                className="flex items-center gap-1 text-[11px]"
              >
                <span className="text-[#a1a5ac]">{d.month}</span>
                <span
                  className="font-semibold"
                  style={{
                    color:
                      d.mom >= 0
                        ? "var(--color-error)"
                        : "var(--color-down)",
                  }}
                >
                  {d.mom >= 0 ? "▲" : "▼"} {Math.abs(d.mom).toFixed(1)}%
                </span>
              </div>
            )
        )}
      </div>

      {editable && (
        <div className="mt-4 pt-4 border-t border-[var(--color-gray-150)]">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="라벨 (예: 2026 목표)"
              className="px-3 py-1.5 text-xs rounded-md border border-[var(--color-gray-200)] w-36"
            />
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={amountEok}
                onChange={(e) => setAmountEok(e.target.value)}
                placeholder="금액"
                className="px-3 py-1.5 text-xs rounded-md border border-[var(--color-gray-200)] w-20"
              />
              <span className="text-xs text-[var(--color-gray-500)]">억원</span>
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!label.trim() || !amountEok}
              className="px-3 py-1.5 text-xs font-semibold rounded-md bg-[var(--color-primary)] text-white disabled:opacity-40"
            >
              기준선 추가
            </button>
          </div>
          {targets.length > 0 && (
            <div className="flex gap-2 flex-wrap mt-2">
              {targets.map((t, i) => (
                <div
                  key={t.id}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
                  style={{
                    backgroundColor: "var(--color-gray-100)",
                    color: TARGET_COLORS[i % TARGET_COLORS.length],
                  }}
                >
                  <span className="font-medium">
                    {t.label} {fmtEok(t.amount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemove(t.id)}
                    className="text-[var(--color-gray-400)] hover:text-[var(--color-gray-700)]"
                    aria-label={`${t.label} 삭제`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: `✓ Compiled successfully`, TypeScript 에러 없음. (아직 `companyDbName`을 넘기는 호출부가 없으므로 두 기존 호출부 모두 `editable === false`로 동작 — 기존과 동일한 렌더링이어야 한다.)

- [ ] **Step 3: Commit**

```bash
git add app/components/MonthlyRevenueChart.tsx
git commit -m "feat(chart): localStorage 기반 매출 기준선 표시 및 입력 UI 추가"
```

---

### Task 2: 페이지에서 월별 차트에 `companyDbName` 연결

**Files:**
- Modify: `app/company/[company]/page.tsx`

**Interfaces:**
- Consumes: 확장된 `MonthlyRevenueChart` props (Task 1)
- Produces: 렌탈사 페이지의 "월별 매출 현황" 섹션에 기준선 입력 UI가 표시됨. 이 태스크로 기능이 end-to-end 완성된다.

- [ ] **Step 1: "월별 매출 현황" 차트 호출부 수정**

기존:

```tsx
          <div className="rounded-xl shadow-sm border border-gray-100 bg-white px-5 pt-5 pb-4">
            <MonthlyRevenueChart
              data={monthlyStats}
              color={view === "contract" ? "#6366f1" : undefined}
            />
          </div>
```

변경 후:

```tsx
          <div className="rounded-xl shadow-sm border border-gray-100 bg-white px-5 pt-5 pb-4">
            <MonthlyRevenueChart
              key={dbName}
              data={monthlyStats}
              color={view === "contract" ? "#6366f1" : undefined}
              companyDbName={dbName}
            />
          </div>
```

`key={dbName}`은 다른 렌탈사 페이지로 이동했을 때 컴포넌트가 새로 마운트되어 이전 렌탈사의 로컬 기준선 state가 남지 않도록 하기 위함이다 (localStorage 자체는 키로 분리되어 있지만, `useState`/`useEffect` 타이밍상 마운트 시점에 새 값을 로드하도록 강제한다).

"주차별 매출 현황" 섹션의 `<MonthlyRevenueChart data={weekChartData} .../>` 호출부는 수정하지 않는다 (companyDbName 미전달 → 기존과 동일하게 동작).

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: `✓ Compiled successfully`, TypeScript 에러 없음.

- [ ] **Step 3: 로컬 서버로 end-to-end 확인**

로컬 dev 서버(포트 3000)가 실행 중이어야 한다. 브라우저에서 렌탈사 페이지(예: `/company/코웨이?tab=contract`)를 열어:

1. "월별 매출 현황" 차트 아래 입력 폼에 라벨("2026 목표")과 금액("3")을 입력하고 "기준선 추가" 클릭 → 차트에 가로 점선과 라벨이 즉시 표시되는지 확인
2. 새로고침 → 기준선이 그대로 남아있는지 확인 (localStorage 영속 확인)
3. 칩의 `×` 클릭 → 차트에서 기준선이 사라지고, 새로고침 후에도 사라진 상태가 유지되는지 확인
4. 다른 렌탈사 페이지로 이동 → 방금 등록한 기준선이 보이지 않는지 확인 (localStorage 키 분리 확인)
5. "주차별 매출 현황" 차트에는 입력 폼이나 기준선이 나타나지 않는지 확인 (변경 없음 확인)

브라우저 개발자 도구 콘솔에서 직접 확인도 가능:

```js
localStorage.getItem("revenue-targets:코웨이")
```

Expected: `'[{"id":...,"label":"2026 목표","amount":300000000}]'` 형태의 JSON 문자열.

- [ ] **Step 4: Commit**

```bash
git add "app/company/[company]/page.tsx"
git commit -m "feat(company): 월별 매출 현황 차트에 렌탈사별 매출 기준선 연결"
```

---

## Post-Implementation Verification (spec 대비 최종 확인)

- [ ] 기준선 추가 → 차트에 즉시 표시 (Task 2 Step 3)
- [ ] 새로고침 후에도 유지 (localStorage 영속 — Task 2 Step 3)
- [ ] 기준선 삭제 → 차트에서 즉시 사라지고 새로고침 후에도 사라진 상태 유지 (Task 2 Step 3)
- [ ] 주차별 매출 현황 차트는 기존과 동일 (Task 2 Step 3)
- [ ] 렌탈사 간 기준선 데이터가 섞이지 않음 (Task 2 Step 3)
