# 렌탈사별 매출 기준선 (Revenue Target Lines) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 렌탈사 페이지(`/company/[company]`)의 "월별 매출 현황" 차트에 렌탈사별로 여러 개의 가로 기준선(목표/BEP 등)을 직접 추가·삭제할 수 있는 UI를 추가한다.

**Architecture:** 새 Supabase 테이블 `revenue_targets`에 라벨+금액을 저장하고, 서버 컴포넌트(`page.tsx`)가 렌탈사(`dbName`) 기준으로 조회해 `MonthlyRevenueChart`에 전달한다. 추가/삭제는 새 API 라우트(`/api/revenue-targets`)가 서비스 롤 키로 처리하고, 클라이언트는 낙관적 업데이트로 즉시 반영한다.

**Tech Stack:** Next.js 16 App Router (Server Component), Supabase (`@supabase/supabase-js`), Recharts (`ReferenceLine`), Tailwind CSS.

## Global Constraints

- 이 프로젝트에는 자동화 테스트 프레임워크(jest/vitest 등)가 없다 — `npm run build`(타입체크), 로컬 dev 서버 대상 curl/브라우저 확인, Supabase 직접 조회로 검증한다 (기존 `AGENTS.md` Testing Requirements와 동일한 방식).
- `npm run lint`는 이 저장소에서 이미 실패 상태다 (`eslint.config.js` 부재, 기존 이슈, 이번 작업과 무관) — 이번 계획의 검증 단계에서 사용하지 않는다.
- 색상은 인라인 하드코딩 대신 `DESIGN.md`에 정의된 CSS 변수를 사용한다.
- 금액은 억 원 단위로 입력받아 저장 시 원 단위(×100,000,000)로 변환한다.
- 기준선은 "월별 매출 현황" 차트에만 적용하고 "주차별 매출 현황" 차트는 변경하지 않는다.
- 기준선은 bm/tab 필터와 무관하게 렌탈사 전체에 공통으로 적용한다.
- Supabase DDL(테이블 생성)은 이 환경에서 프로그래밍적으로 실행할 수 없다 (직접 Postgres 연결 정보 없음, service role key는 PostgREST 데이터 오퍼레이션만 가능) — Supabase SQL Editor에서 수동 실행이 필요하다.

---

### Task 1: Supabase `revenue_targets` 테이블 생성

**Files:**
- 없음 (Supabase 대시보드에서 SQL 실행, 코드 변경 아님)

**Interfaces:**
- Produces: `revenue_targets` 테이블 — 컬럼 `id bigserial PK`, `rental_company text not null`, `label text not null`, `amount numeric not null`, `created_at timestamptz not null default now()`. 이후 모든 태스크가 이 스키마를 전제로 한다.

- [ ] **Step 1: Supabase SQL Editor에서 아래 SQL 실행**

사용자가 Supabase 대시보드(SQL Editor)에 접속해 다음 SQL을 실행해야 한다:

```sql
create table revenue_targets (
  id bigserial primary key,
  rental_company text not null,
  label text not null,
  amount numeric not null,
  created_at timestamptz not null default now()
);

alter table revenue_targets enable row level security;

create policy "revenue_targets_anon_select"
  on revenue_targets for select
  to anon
  using (true);
```

이 정책은 anon key로 SELECT만 허용한다. INSERT/DELETE는 API 라우트에서 서비스 롤 키로 수행하므로(서비스 롤은 RLS를 우회) 별도 정책이 필요 없다.

- [ ] **Step 2: 테이블 생성 확인**

Run:
```bash
export $(grep -E "^NEXT_PUBLIC_SUPABASE_URL=|^NEXT_PUBLIC_SUPABASE_ANON_KEY=" .env.local | xargs)
node -e '
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
(async () => {
  const { data, error } = await supabase.from("revenue_targets").select("*").limit(1);
  console.log({ data, error });
})();
'
```

Expected: `{ data: [], error: null }` (빈 배열, 에러 없음 — 테이블은 존재하지만 아직 row가 없음을 의미).

- [ ] **Step 3: Commit**

코드 변경이 없으므로 커밋 없음. Task 완료 후 Task 2로 진행.

---

### Task 2: `POST /api/revenue-targets` — 기준선 생성 API

**Files:**
- Create: `app/api/revenue-targets/route.ts`

**Interfaces:**
- Consumes: `revenue_targets` 테이블 (Task 1)
- Produces: `POST /api/revenue-targets` — body `{ rental_company: string, label: string, amount: number }` → 응답 `{ ok: true, data: { id, rental_company, label, amount, created_at } }` 또는 `{ ok: false, error: string }`. 이후 Task 4(컴포넌트)가 이 응답 형태를 그대로 사용한다.

- [ ] **Step 1: API 라우트 파일 작성**

`app/api/revenue-targets/route.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rentalCompany = body.rental_company as string | undefined;
    const label = body.label as string | undefined;
    const amount = body.amount as number | undefined;

    if (
      !rentalCompany ||
      !label ||
      typeof amount !== "number" ||
      !(amount > 0)
    ) {
      return NextResponse.json(
        { ok: false, error: "rental_company, label, amount가 필요합니다." },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("revenue_targets")
      .insert({ rental_company: rentalCompany, label, amount })
      .select()
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : JSON.stringify(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: `✓ Compiled successfully`, TypeScript 에러 없음.

- [ ] **Step 3: 로컬 서버에서 POST 동작 확인**

로컬 dev 서버(`npm run dev`, 포트 3000)가 실행 중이어야 한다.

Run:
```bash
curl -s -X POST http://localhost:3000/api/revenue-targets \
  -H "Content-Type: application/json" \
  -d '{"rental_company":"코웨이","label":"테스트 목표","amount":300000000}'
```

Expected: `{"ok":true,"data":{"id":<number>,"rental_company":"코웨이","label":"테스트 목표","amount":300000000,...}}` — 응답의 `data.id` 값을 다음 태스크 검증에 사용할 수 있도록 기록해 둔다.

- [ ] **Step 4: Commit**

```bash
git add app/api/revenue-targets/route.ts
git commit -m "feat(api): 매출 기준선 생성 API 추가"
```

---

### Task 3: `DELETE /api/revenue-targets` — 기준선 삭제 API

**Files:**
- Modify: `app/api/revenue-targets/route.ts`

**Interfaces:**
- Consumes: Task 2에서 생성한 `revenue_targets` row의 `id`
- Produces: `DELETE /api/revenue-targets?id={id}` → `{ ok: true }` 또는 `{ ok: false, error: string }`. Task 4가 이 엔드포인트를 호출한다.

- [ ] **Step 1: DELETE 핸들러 추가**

`app/api/revenue-targets/route.ts`의 기존 `POST` export 아래에 추가:

```ts
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "id가 필요합니다." },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from("revenue_targets")
      .delete()
      .eq("id", Number(id));

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : JSON.stringify(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: `✓ Compiled successfully`, TypeScript 에러 없음.

- [ ] **Step 3: 로컬 서버에서 DELETE 동작 확인**

Task 2 Step 3에서 생성한 `id`를 사용 (예: `123`):

```bash
curl -s -X DELETE "http://localhost:3000/api/revenue-targets?id=123"
```

Expected: `{"ok":true}`

이어서 실제로 삭제됐는지 확인:

```bash
export $(grep -E "^NEXT_PUBLIC_SUPABASE_URL=|^SUPABASE_SERVICE_ROLE_KEY=" .env.local | xargs)
node -e '
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await supabase.from("revenue_targets").select("*").eq("label","테스트 목표");
  console.log(data);
})();
'
```

Expected: `[]` (빈 배열 — 테스트로 만든 row가 삭제됨).

- [ ] **Step 4: Commit**

```bash
git add app/api/revenue-targets/route.ts
git commit -m "feat(api): 매출 기준선 삭제 API 추가"
```

---

### Task 4: `MonthlyRevenueChart` 컴포넌트에 기준선 표시 + 입력 UI 추가

**Files:**
- Modify: `app/components/MonthlyRevenueChart.tsx` (전체 재작성)

**Interfaces:**
- Consumes: `POST /api/revenue-targets`, `DELETE /api/revenue-targets?id=` (Task 2, 3)
- Produces: `export interface RevenueTarget { id: number; label: string; amount: number }`, `MonthlyRevenueChart` 컴포넌트에 optional props `targets?: RevenueTarget[]`, `companyDbName?: string` 추가. `targets`가 `undefined`면 기존과 동일하게 동작(기준선/입력 UI 미표시) — Task 5에서 이 optional 동작을 활용해 주차별 차트 호출부는 그대로 둔다.

- [ ] **Step 1: 컴포넌트 전체 재작성**

`app/components/MonthlyRevenueChart.tsx`:

```tsx
"use client";

import { useState } from "react";
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
  targets,
  companyDbName,
}: {
  data: MonthStat[];
  color?: string;
  targets?: RevenueTarget[];
  companyDbName?: string;
}) {
  const [localTargets, setLocalTargets] = useState<RevenueTarget[]>(
    targets ?? [],
  );
  const [label, setLabel] = useState("");
  const [amountEok, setAmountEok] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (data.length === 0) return null;

  const editable = targets !== undefined && !!companyDbName;

  async function handleAdd() {
    const trimmedLabel = label.trim();
    const parsedEok = Number(amountEok);
    if (!trimmedLabel || !amountEok || isNaN(parsedEok) || parsedEok <= 0) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/revenue-targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rental_company: companyDbName,
          label: trimmedLabel,
          amount: Math.round(parsedEok * 100_000_000),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "추가 실패");
      setLocalTargets((prev) => [...prev, json.data]);
      setLabel("");
      setAmountEok("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "추가 실패");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(id: number) {
    const prevTargets = localTargets;
    setLocalTargets((cur) => cur.filter((t) => t.id !== id));
    setError(null);
    try {
      const res = await fetch(`/api/revenue-targets?id=${id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "삭제 실패");
    } catch (e) {
      setLocalTargets(prevTargets);
      setError(e instanceof Error ? e.message : "삭제 실패");
    }
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
          {localTargets.map((t, i) => (
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
              disabled={submitting || !label.trim() || !amountEok}
              className="px-3 py-1.5 text-xs font-semibold rounded-md bg-[var(--color-primary)] text-white disabled:opacity-40"
            >
              기준선 추가
            </button>
          </div>
          {error && (
            <p className="mt-2 text-xs text-[var(--color-warning)]">{error}</p>
          )}
          {localTargets.length > 0 && (
            <div className="flex gap-2 flex-wrap mt-2">
              {localTargets.map((t, i) => (
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
Expected: `✓ Compiled successfully`, TypeScript 에러 없음. (이 시점에는 아직 `targets`/`companyDbName`를 넘기는 호출부가 없으므로 기존 두 호출부 모두 `editable === false`로 동작 — 기존과 동일한 렌더링이어야 한다.)

- [ ] **Step 3: Commit**

```bash
git add app/components/MonthlyRevenueChart.tsx
git commit -m "feat(chart): 매출 기준선 표시 및 입력 UI 추가"
```

---

### Task 5: 페이지에서 기준선 조회 및 월별 차트에 연결

**Files:**
- Modify: `app/company/[company]/page.tsx`

**Interfaces:**
- Consumes: `RevenueTarget` 타입, 확장된 `MonthlyRevenueChart` props (Task 4)
- Produces: 렌탈사 페이지의 "월별 매출 현황" 섹션에 실제 기준선 데이터가 표시됨. 이 태스크로 기능이 end-to-end 완성된다.

- [ ] **Step 1: import에 `RevenueTarget` 타입 추가**

`app/company/[company]/page.tsx` 상단 import 블록:

```ts
import MonthlyRevenueChart, {
  type RevenueTarget,
} from "@/app/components/MonthlyRevenueChart";
```

기존 `import MonthlyRevenueChart from "@/app/components/MonthlyRevenueChart";` 줄을 위 코드로 교체한다.

- [ ] **Step 2: `dbName` 확정 직후 `revenue_targets` 조회**

`if (!dbName) { ... }` 블록 바로 다음에 추가:

```ts
  const { data: revenueTargets } = await supabase
    .from("revenue_targets")
    .select("id, label, amount")
    .eq("rental_company", dbName)
    .order("created_at", { ascending: true });
```

- [ ] **Step 3: "월별 매출 현황" 차트 호출부 수정**

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
              targets={(revenueTargets ?? []) as RevenueTarget[]}
              companyDbName={dbName}
            />
          </div>
```

`key={dbName}`은 다른 렌탈사 페이지로 이동했을 때 컴포넌트가 새로 마운트되어 이전 렌탈사의 로컬 기준선 state가 남지 않도록 하기 위함이다.

"주차별 매출 현황" 섹션의 `<MonthlyRevenueChart data={weekChartData} .../>` 호출부는 수정하지 않는다 (targets/companyDbName 미전달 → 기존과 동일하게 동작).

- [ ] **Step 4: 빌드 확인**

Run: `npm run build`
Expected: `✓ Compiled successfully`, TypeScript 에러 없음.

- [ ] **Step 5: 로컬 서버로 end-to-end 확인**

로컬 dev 서버(포트 3000)가 실행 중이어야 한다.

기준선 추가 후 렌더링 확인:

```bash
curl -s -X POST http://localhost:3000/api/revenue-targets \
  -H "Content-Type: application/json" \
  -d '{"rental_company":"코웨이","label":"2026 목표","amount":300000000}'

curl -s "http://localhost:3000/company/%EC%BD%94%EC%9B%A8%EC%9D%B4?tab=contract" -o /tmp/coway_target.html
grep -o "2026 목표[^<]*" /tmp/coway_target.html
```

Expected: `grep`이 "2026 목표"를 포함한 텍스트(칩 라벨 또는 ReferenceLine 라벨)를 최소 1건 이상 출력.

다른 렌탈사 페이지에는 노출되지 않는지 확인:

```bash
curl -s "http://localhost:3000/company/%ED%98%84%EB%8C%80%EC%9C%A0%EB%B2%84%EC%8A%A4?tab=contract" -o /tmp/hyundai_check.html
grep -c "2026 목표" /tmp/hyundai_check.html
```

Expected: `0` (다른 렌탈사에는 표시되지 않음).

주차별 차트가 영향받지 않았는지 확인 (입력 폼이 주차별 섹션에는 없어야 함):

```bash
python3 -c "
html = open('/tmp/coway_target.html').read()
idx = html.find('주차별 매출 현황')
snippet = html[idx:idx+3000]
print('기준선 추가 폼 존재:' , '기준선 추가' in snippet)
"
```

Expected: `기준선 추가 폼 존재: False`

테스트로 등록한 기준선 삭제 (정리):

```bash
export $(grep -E "^NEXT_PUBLIC_SUPABASE_URL=|^SUPABASE_SERVICE_ROLE_KEY=" .env.local | xargs)
node -e '
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { error } = await supabase.from("revenue_targets").delete().eq("label","2026 목표").eq("rental_company","코웨이");
  console.log({ error });
})();
'
```

Expected: `{ error: null }`

- [ ] **Step 6: Commit**

```bash
git add "app/company/[company]/page.tsx"
git commit -m "feat(company): 월별 매출 현황 차트에 렌탈사별 매출 기준선 연결"
```

---

## Post-Implementation Verification (spec 대비 최종 확인)

- [ ] 기준선 추가 → 차트에 즉시 표시 (Task 5 Step 5로 확인)
- [ ] 새로고침 후에도 유지 (Supabase 영속 — Task 1~5의 조회/저장 경로로 보장)
- [ ] 기준선 삭제 → 차트에서 즉시 사라지고 새로고침 후에도 사라진 상태 유지 (Task 3, 4의 낙관적 삭제 + DB delete로 보장)
- [ ] 주차별 매출 현황 차트는 기존과 동일 (Task 5 Step 5로 확인)
- [ ] 렌탈사 간 기준선 데이터가 섞이지 않음 (Task 5 Step 5로 확인)
