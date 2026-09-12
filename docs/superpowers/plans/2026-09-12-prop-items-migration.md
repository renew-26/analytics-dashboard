# raw_prop_items 단일 원장 마이그레이션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `raw_orders`·`raw_contracts` 를 버리고 18개 파일이 `raw_prop_items` 한 테이블을 읽게 한다 — 그 과정에서 화면이 2025년 주문확정의 97%를 버리던 버그가 고쳐진다. `app/revenue-analysis/page.tsx` 는 이번에 다루지 않는다(진행 중 발견 — 아래 File Structure 표와 Task 7 참고).

**Architecture:** 호출부가 **테이블을 고르는 대신 기준(`DateBasis`)을 고른다.** `app/exception-approval/page.tsx` 가 이미 쓰는 패턴을 `lib/date-basis.ts` 로 승격하고, 각 호출부는 `.from("raw_prop_items")` + 해당 날짜 컬럼 `NOT NULL` 필터로 바꾼다. `sales IS NOT NULL` 은 넣지 않는다 — 그 조건이 버그의 원인이다.

**Tech Stack:** Next.js 16.2.4 (App Router, Server Components) · `@supabase/supabase-js` · PostgREST · Supabase Postgres

**Spec:** `docs/superpowers/specs/2026-09-11-prop-items-migration-design.md`

## Global Constraints

- **테스트 프레임워크가 없다.** jest·vitest·playwright 전부 없고 `test` 스크립트도 없다. 도입은 범위 밖이다. 검증은 `npx tsc --noEmit` · `npm run lint` · `npm run build` + 아래 단정 스크립트 + 페이지 렌더 대조로 한다. **거짓 테스트 코드를 쓰지 말 것.**
- **로컬 도구 스크립트는 저장소에 두지 않는다** (`c4c183f` 관행). `~/.claude/scripts/` 에 두고 **프로젝트 루트에서 실행**한다(`.env.local` 을 실행 위치 기준으로 읽는다). 의존성 없이 순수 `fetch` 로 PostgREST 를 호출한다 — 저장소 밖에서는 ESM 이 `node_modules` 를 해석하지 못한다.
- **`.env.local` 은 프로덕션 Supabase 를 가리킨다.** 읽기는 자유, **쓰기·DDL 은 금지**. `DROP TABLE` 을 포함한 모든 DDL 은 사용자가 실행한다(Supabase MCP 는 다른 계정).
- **포트 4100 을 쓴다.** 3000 은 다른 워크트리의 dev 서버가 점유 중이라 그걸 재면 남의 코드를 재게 된다. `PORT=4100 npm run start`.
- **`sales` 필터를 넣지 않는다.** 어느 호출부에도. 이 조건이 2025 주문확정을 2,283건으로 만든 원인이다.
- **`PAGE = 50000` 은 PostgREST max-rows 상한이다.** 루프가 짧은 페이지를 마지막으로 판정하므로 키우면 조용히 잘린다. 건드리지 않는다.
- **select 컬럼·나머지 필터·페이지네이션 구조를 바꾸지 않는다.** 테이블과 날짜 필터만 바꾼다.
- **취소 건(`status=취소`)은 포함 유지.** 필터를 추가하지 않는다.
- 주석은 한국어, *무엇*이 아니라 *왜* 를 적는다. 주변 밀도에 맞춘다.

---

## File Structure

**생성 (제품 코드)**

| 파일 | 책임 | 태스크 |
|---|---|---|
| `lib/date-basis.ts` | `DateBasis` 타입 · `DATE_COL` 매핑 · `BASIS_LABEL`. 의존성 없음 — 서버·클라이언트 양쪽에서 안전하게 import | 1 |

**수정 (제품 코드)**

| 파일 | 참조 위치 | 태스크 |
|---|---|---|
| `lib/fetch-rows.ts` | 기본 테이블·컬럼 | 1 |
| `lib/period.ts` | 51 | 1 |
| `app/brand-analysis/page.tsx` | 35 | 2 |
| `app/categories/[category]/[company]/page.tsx` | 78 | 2 |
| `app/categories/[category]/[company]/[product]/page.tsx` | 72 | 2 |
| `app/category/[category]/page.tsx` | 108 | 2 |
| `app/components/HeaderData.tsx` | 30 | 2 |
| `app/components/DashboardSections.tsx` | o:256,276,281 · c:148,183,261,286,292,298,305 | 3 |
| `app/company/[company]/page.tsx` | o:852 · c:608,639,667,895 · 동적:743 | 4 |
| `app/category-trends/CategoryTrendsClient.tsx` | 116,191,236,239,248,251,1259 (표시층) | 5 |
| `app/category-trends/page.tsx` | o:136 · c:117 | 5 |
| `app/page.tsx` | o:234,484,489 · c:128,196 | 6 |
| `app/compare/page.tsx` | o:56 · c:37 | 7 |
| `app/conversion/page.tsx` | o:31 · c:53 | 7 |
| `app/group/[group]/page.tsx` | o:95 · c:69 | 7 |
| `app/operation-efficiency/page.tsx` | o:161 · c:183 | 7 |
| `app/product-lookup/page.tsx` | o:69 · c:70 | 7 |

**삭제** `app/api/test-query-compare/route.ts` (태스크 8)

**제외 (재배선하지 않음)** `app/revenue-analysis/page.tsx` — 진행 중이던 PR #34 가
이 파일을 통째로 재작성하고 있어 여기서 손대면 충돌한다. 구 테이블을 그대로 쓴 채
남기고, PR #34 병합 후 별도로 옮긴다. 태스크 8 의 구 테이블 드롭도 이 파일이
옮겨지기 전까지 보류한다.

**생성 (커밋 안 함 — `~/.claude/scripts/`)**

| 파일 | 책임 | 태스크 |
|---|---|---|
| `migration-delta.mjs` | 월별 × 기준별 구 테이블 vs raw_prop_items 건수 표 | 0 |

---

## Task 0: 기대 델타 표를 뜬다 — 재배선 전에만 가능

구 테이블이 살아 있는 동안에만 만들 수 있다. 드롭 후에는 재생성이 불가능하고, 이후 모든 태스크가 이 표를 대조 기준으로 쓴다.

**Files:**
- Create: `~/.claude/scripts/migration-delta.mjs` (커밋 안 함)
- Create: `docs/superpowers/plans/2026-09-12-migration-delta.md` (커밋함 — 드롭 후 유일한 기록)

**Interfaces:**
- Produces: 델타 표 마크다운. 태스크 2~7 이 "이 페이지 숫자가 기대대로 바뀌었나" 를 판정할 때 쓴다.

- [ ] **Step 1: 델타 스크립트를 만든다**

`~/.claude/scripts/migration-delta.mjs`:

```js
// 사용법: (프로젝트 루트에서) node ~/.claude/scripts/migration-delta.mjs
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: K, authorization: `Bearer ${K}` };

/** PostgREST count 는 content-range 헤더로 온다 (범위 요청의 성공 코드는 206). */
async function count(table, qs) {
  const r = await fetch(`${U}/rest/v1/${table}?select=prop_item_usid${qs}`, {
    headers: { ...H, prefer: "count=exact", range: "0-0" },
  });
  if (r.status !== 200 && r.status !== 206) throw new Error(`${table}: HTTP ${r.status}`);
  return Number((r.headers.get("content-range") || "/0").split("/")[1]);
}

const months = [];
for (let y = 2025; y <= 2026; y++) {
  for (let m = 1; m <= 12; m++) {
    const ym = `${y}-${String(m).padStart(2, "0")}`;
    if (ym > "2026-09") break;
    months.push(ym);
  }
}
const nextMonth = (ym) => { const d = new Date(`${ym}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10); };

const rows = [];
for (const ym of months) {
  const e = nextMonth(ym);
  const oq = `&order_confirmed_at=gte.${ym}-01&order_confirmed_at=lt.${e}`;
  const cq = `&contract_date=gte.${ym}-01&contract_date=lt.${e}`;
  const [oOld, oNew, cOld, cNew] = await Promise.all([
    count("raw_orders", oq), count("raw_prop_items", oq),
    count("raw_contracts", cq), count("raw_prop_items", cq),
  ]);
  rows.push({ ym, oOld, oNew, cOld, cNew });
}

const n = (v) => v.toLocaleString("ko-KR");
console.log(`# 마이그레이션 기대 델타 (${new Date().toISOString().slice(0, 10)} 측정)\n`);
console.log("구 테이블이 살아 있을 때만 뜰 수 있다. 드롭 후 재생성 불가.\n");
console.log("| 월 | 주문확정 구 | 주문확정 신 | 배수 | 계약완료 구 | 계약완료 신 | 차 |");
console.log("|---|---:|---:|---:|---:|---:|---:|");
for (const r of rows) {
  const mult = r.oOld > 0 ? (r.oNew / r.oOld).toFixed(1) + "x" : "—";
  console.log(`| ${r.ym} | ${n(r.oOld)} | ${n(r.oNew)} | ${mult} | ${n(r.cOld)} | ${n(r.cNew)} | ${n(r.cNew - r.cOld)} |`);
}
const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
console.log(`| **합계** | **${n(sum("oOld"))}** | **${n(sum("oNew"))}** | | **${n(sum("cOld"))}** | **${n(sum("cNew"))}** | **${n(sum("cNew") - sum("cOld"))}** |`);
```

- [ ] **Step 2: 실행해 표를 파일로 남긴다**

프로젝트 루트에서:

```bash
node ~/.claude/scripts/migration-delta.mjs > docs/superpowers/plans/2026-09-12-migration-delta.md
cat docs/superpowers/plans/2026-09-12-migration-delta.md
```

기대: 2025 월들은 주문확정 배수가 크게(수십 배) 나오고, 2026-02 이후는 1.0x 근처. 계약완료 차는 전 구간 0 이거나 한 자릿수(동기화 시점 차이).

**계약완료 차가 어느 월에서든 두 자릿수 이상이면 멈추고 보고한다** — 계약완료는 일치해야 하고, 아니라면 전제가 틀렸다는 뜻이다.

- [ ] **Step 3: 커밋**

```bash
git add docs/superpowers/plans/2026-09-12-migration-delta.md
git commit -m "docs(migration): 재배선 전 기대 델타 표를 떠둔다"
```

---

## Task 1: 공용층 — `lib/date-basis.ts` + `lib/fetch-rows.ts` + `lib/period.ts`

**Files:**
- Create: `lib/date-basis.ts`
- Modify: `lib/fetch-rows.ts` (전체)
- Modify: `lib/period.ts:50-56`

**Interfaces:**
- Produces:
  - `type DateBasis = "order" | "contract"`
  - `const DATE_COL: Record<DateBasis, "order_confirmed_at" | "contract_date">`
  - `const BASIS_LABEL: Record<DateBasis, string>` — `{ order: "주문확정", contract: "계약완료" }`
  - `fetchRows<T>(options)` — `options.basis?: DateBasis` (기본 `"contract"`), `table`·`dateColumn` 옵션은 제거됨
- 태스크 2~7 이 `DATE_COL` 과 `BASIS_LABEL` 을 쓴다.

- [ ] **Step 1: `lib/date-basis.ts` 를 만든다**

```ts
/**
 * 날짜 기준 — raw_prop_items 한 테이블에서 어느 날짜 컬럼으로 볼지 고른다.
 *
 * 예전에는 기준이 곧 테이블이었다(raw_orders / raw_contracts). 4678 통합 이후
 * 한 행이 세 기준 날짜를 다 담으므로 테이블을 나눌 이유가 없어졌다.
 *
 * 이 모듈은 의존성이 없다 — 서버 Supabase 클라이언트를 import 하지 않는다.
 * BASIS_LABEL 을 클라이언트 컴포넌트도 쓰는데, lib/fetch-rows.ts 처럼 서버
 * 클라이언트를 만드는 모듈에서 값을 가져오면 그 모듈이 브라우저 번들 그래프로
 * 끌려온다(import type 은 지워지지만 값은 아니다).
 */
export type DateBasis = "order" | "contract";

export const DATE_COL = {
  order: "order_confirmed_at",
  contract: "contract_date",
} as const satisfies Record<DateBasis, string>;

export const BASIS_LABEL = {
  order: "주문확정",
  contract: "계약완료",
} as const satisfies Record<DateBasis, string>;
```

- [ ] **Step 2: `lib/fetch-rows.ts` 를 고친다**

`table`·`dateColumn` 두 옵션을 `basis` 하나로 바꾸고, 테이블을 고정하고, 날짜 NOT NULL 필터를 더한다:

```ts
import { supabase } from "@/lib/supabase";
import { DATE_COL, type DateBasis } from "@/lib/date-basis";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_PAGE_SIZE = 50000;

interface FetchRowsOptions {
  /** 기준. 기본 "contract" — 기존 호출부가 계약완료였다. */
  basis?: DateBasis;
  select: string;
  start: string;
  end?: string;
  orderBy?: string;
  pageSize?: number;
  client?: SupabaseClient;
}

export async function fetchRows<T>(options: FetchRowsOptions): Promise<T[]> {
  const {
    basis = "contract",
    select,
    start,
    end,
    orderBy,
    pageSize = DEFAULT_PAGE_SIZE,
    client = supabase,
  } = options;

  const dateColumn = DATE_COL[basis];
  const all: T[] = [];
  let from = 0;

  while (true) {
    // 기준 날짜가 빈 행은 그 기준에 존재하지 않는 건이다.
    let query = client
      .from("raw_prop_items")
      .select(select)
      .not(dateColumn, "is", null)
      .gte(dateColumn, start);

    if (end) {
      query = query.lte(dateColumn, end);
    }

    if (orderBy) {
      query = query.order(orderBy, { ascending: true });
    }

    query = query.range(from, from + pageSize - 1);

    const { data, error } = await query;
    if (error || !data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all;
}
```

`app/categories/page.tsx` 와 `app/companies/page.tsx` 가 이 함수를 쓰는데 둘 다 기본값만 넘기므로 **두 파일은 건드리지 않는다.**

- [ ] **Step 3: `lib/period.ts:50-56` 을 고친다**

```ts
    const { data } = await supabase
      .from("raw_prop_items")
      .select("contract_date")
      .not("contract_date", "is", null)
      .order("contract_date", { ascending: false })
      .limit(1)
      .single();
    return data?.contract_date ?? null;
```

- [ ] **Step 4: 타입·린트·빌드를 통과시킨다**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

- [ ] **Step 5: 숫자 불변을 확인한다 — 이 태스크의 게이트**

이 세 파일은 전부 계약완료 기준이므로 **숫자가 한 건도 바뀌면 안 된다.**

```bash
PORT=4100 npm run start
```

별 셸에서, `lib/fetch-rows.ts` 를 쓰는 두 페이지와 `lib/period.ts` 가 기준일을 주는 헤더를 본다:

```bash
for p in /companies /categories; do
  printf "%-16s " "$p"
  curl -s "http://localhost:4100$p" | grep -o '기준일[^<]*' | head -1
done
```

Task 0 의 델타 표에서 계약완료 열의 구/신 값이 같은지 재확인한다. 다르면 멈추고 보고한다.

- [ ] **Step 6: 커밋**

```bash
git add lib/date-basis.ts lib/fetch-rows.ts lib/period.ts
git commit -m "refactor(lib): 테이블 대신 기준을 고르는 공용층을 세운다"
```

---

## Task 2: 계약완료 전용 5파일 — 이진 게이트

이 태스크가 **기계적 변환 자체가 옳다는 것을 증명한다.** 다섯 파일 모두 계약완료 기준이라 숫자가 바뀌면 안 된다. 판정이 이진법이라 애매함이 없다.

**Files:**
- Modify: `app/brand-analysis/page.tsx:35`
- Modify: `app/categories/[category]/[company]/page.tsx:78`
- Modify: `app/categories/[category]/[company]/[product]/page.tsx:72`
- Modify: `app/category/[category]/page.tsx:108`
- Modify: `app/components/HeaderData.tsx:30`

**Interfaces:**
- Consumes: Task 1 의 `DATE_COL`(직접 쓰지 않아도 된다 — 기준이 고정이므로 컬럼명을 문자열로 써도 무방)

- [ ] **Step 1: 다섯 곳을 같은 규칙으로 바꾼다**

각 파일의 해당 줄에서:

```ts
-      .from("raw_contracts")
+      .from("raw_prop_items")
```

그리고 그 체인에 날짜 NOT NULL 필터를 더한다. `.select(...)` 바로 뒤가 자연스럽다:

```ts
+      .not("contract_date", "is", null)
```

**주의:** 이미 `.gte("contract_date", ...)` 같은 필터가 있어도 `.not(...)` 을 따로 더한다 — `gte` 는 NULL 을 자동으로 거르지만, 명시해 두면 이 쿼리가 계약완료 기준임이 코드에 드러난다. 다른 필터·select 컬럼·페이지네이션은 **손대지 않는다.**

- [ ] **Step 2: 남은 참조가 없는지 확인한다**

```bash
for f in app/brand-analysis/page.tsx 'app/categories/[category]/[company]/page.tsx' 'app/categories/[category]/[company]/[product]/page.tsx' 'app/category/[category]/page.tsx' app/components/HeaderData.tsx; do
  printf "%-52s " "$f"
  grep -ac 'raw_contracts\|raw_orders' "$f" || echo 0
done
```

기대: 전부 `0`.

- [ ] **Step 3: 타입·린트·빌드를 통과시킨다**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

- [ ] **Step 4: 숫자 불변을 확인한다 — 이진 게이트**

변경 **전** 커밋(`HEAD~1`)에서 각 페이지를 렌더해 저장하고, 변경 후와 대조한다.

```bash
PORT=4100 npm run start
```

별 셸에서, 다섯 페이지가 서빙하는 URL 을 받아 태그를 지우고 저장한다:

```bash
mkdir -p /tmp/mig && for p in /brand-analysis /categories/정수기 /category/정수기; do
  curl -s "http://localhost:4100$p" | sed 's/<[^>]*>//g' | tr -s ' \n' ' \n' > "/tmp/mig/after$(echo $p | tr '/' '_').txt"
done
```

`git stash` 로 변경을 잠시 되돌려 같은 방식으로 `before*.txt` 를 만들고 `diff` 한다. **빌드 id 해시 외에 차이가 있으면 재배선 버그다** — 멈추고 보고한다.

- [ ] **Step 5: 커밋**

```bash
git add app/brand-analysis/page.tsx "app/categories/[category]/[company]/page.tsx" "app/categories/[category]/[company]/[product]/page.tsx" "app/category/[category]/page.tsx" app/components/HeaderData.tsx
git commit -m "refactor(data): 계약완료 전용 5파일을 raw_prop_items 로 옮긴다"
```

---

## Task 3: `app/components/DashboardSections.tsx` — 10곳

가장 참조가 많은 파일이다. 주문확정 3곳 · 계약완료 7곳.

**Files:**
- Modify: `app/components/DashboardSections.tsx` — 주문확정 256, 276, 281 · 계약완료 148, 183, 261, 286, 292, 298, 305

**Interfaces:**
- Consumes: Task 1 의 `DATE_COL`·`DateBasis`

- [ ] **Step 1: 열 곳을 규칙대로 바꾼다**

```ts
// 계약완료 (148, 183, 261, 286, 292, 298, 305)
-  .from("raw_contracts")
+  .from("raw_prop_items")
+  .not("contract_date", "is", null)

// 주문확정 (256, 276, 281)
-  .from("raw_orders")
+  .from("raw_prop_items")
+  .not("order_confirmed_at", "is", null)
```

`sales` 필터를 넣지 않는다. select·나머지 필터·페이지네이션은 그대로.

- [ ] **Step 2: 남은 참조 0 확인**

```bash
grep -ac 'raw_contracts\|raw_orders' app/components/DashboardSections.tsx
```

기대: `0`.

- [ ] **Step 3: 타입·린트·빌드**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

- [ ] **Step 4: 델타 표와 대조한다**

이 컴포넌트는 홈이 아니라 `/transaction-count` 에서 렌더된다(`app/transaction-count/page.tsx`). `PORT=4100 npm run start` 후 `/transaction-count` 를 열어 거래건수·매출 섹션의 2025 월 값이 Task 0 표의 "주문확정 신" 열과 방향이 맞는지 본다(정확히 같을 필요는 없다 — 페이지가 추가 필터를 걸 수 있다. **2025 값이 눈에 띄게 늘었는지**가 판정 기준이다).

계약완료 기반 수치(매출·공헌이익 등)는 **변하면 안 된다.**

- [ ] **Step 5: 커밋**

```bash
git add app/components/DashboardSections.tsx
git commit -m "refactor(data): DashboardSections 를 raw_prop_items 로 옮긴다"
```

---

## Task 4: `app/company/[company]/page.tsx` — 7곳 + 동적 테이블 선택

이 파일에는 **테이블을 런타임에 고르는 지점**이 있다(743행). 거기가 이 마이그레이션의 핵심 단순화다.

**Files:**
- Modify: `app/company/[company]/page.tsx` — 계약완료 608, 639, 667, 895 · 주문확정 852 · **동적 743-746**

**Interfaces:**
- Consumes: Task 1 의 `DATE_COL`

- [ ] **Step 1: 동적 선택 지점(743-746)을 고친다**

현재:

```ts
  const growthTable = view === "order" ? "raw_orders" : "raw_contracts";
  const growthDateCol =
    view === "order" ? "order_confirmed_at" : "contract_date";
```

테이블 분기가 사라지고 컬럼만 남는다:

```ts
  // 기준이 곧 테이블이던 시절의 분기가 사라졌다 — 이제 컬럼만 고른다.
  const growthDateCol = DATE_COL[view];
```

그리고 쿼리에서:

```ts
-      .from(growthTable)
+      .from("raw_prop_items")
+      .not(growthDateCol, "is", null)
```

파일 상단에 import 를 더한다:

```ts
import { DATE_COL } from "@/lib/date-basis";
```

`view` 의 타입이 이미 `"order" | "contract"` 라 `DATE_COL[view]` 가 그대로 맞는다.

- [ ] **Step 2: 나머지 다섯 곳을 규칙대로 바꾼다**

608, 639, 667, 895 는 계약완료 / 852 는 주문확정. Task 3 Step 1 과 같은 규칙.

- [ ] **Step 3: 남은 참조 0 확인 + 타입·린트·빌드**

```bash
grep -ac 'raw_contracts\|raw_orders' "app/company/[company]/page.tsx"
npx tsc --noEmit && npm run lint && npm run build
```

기대: grep `0`, 나머지 통과.

- [ ] **Step 4: 네 파라미터 조합을 확인한다**

이 페이지는 `?tab=` 으로 기준을, `?bm=` 으로 BM 을 가른다. 전부 200 이어야 하고, **`?tab=contract` 와 기본이 서로 다른 값**을 내야 한다.

```bash
PORT=4100 npm run start
```

```bash
for q in "" "?tab=contract" "?bm=bm2" "?tab=contract&bm=bm2"; do
  printf "%-34s " "/company/코웨이$q"
  curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:4100/company/코웨이$q"
done
```

그리고 다른 회사도 하나 연다: `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:4100/company/쿠쿠"`

- [ ] **Step 5: 커밋**

```bash
git add "app/company/[company]/page.tsx"
git commit -m "refactor(data): 렌탈사 상세를 raw_prop_items 로 옮기고 테이블 분기를 없앤다"
```

---

## Task 5: `category-trends` — 쿼리 2곳 + 표시층

이 화면은 **테이블 이름을 사용자에게 보여준다.** 테이블이 하나가 되면 그 표기가 거짓이 되므로 표시층까지 함께 고친다.

**Files:**
- Modify: `app/category-trends/page.tsx` — 주문확정 136 · 계약완료 117
- Modify: `app/category-trends/CategoryTrendsClient.tsx` — 116(BasisNotice 호출), 191(BasisBar 정의), 236·239·248·251(BasisBar 호출), 1259(BasisNotice 정의)

**Interfaces:**
- Consumes: Task 1 의 `DATE_COL`·`BASIS_LABEL`

- [ ] **Step 1: `page.tsx` 쿼리 두 곳을 바꾼다**

117 은 계약완료, 136 은 주문확정. Task 3 Step 1 규칙 그대로.

- [ ] **Step 2: 표시층의 테이블 이름을 날짜 컬럼으로 바꾼다**

`BasisNotice` 는 기준 이름과 함께 테이블을 mono 배지로 보여준다(DESIGN.md "목적지를 숨기지 않는다"). 테이블이 하나가 되면 그 배지는 구분에 쓸모가 없다 — **실제로 갈리는 값인 날짜 컬럼**으로 바꾼다.

`CategoryTrendsClient.tsx:1259` 의 정의에서 prop 이름을 바꾼다:

```ts
-  table,
+  column,
 }: {
   source: string;
-  table: string;
+  column: string;
```

그리고 본문의 `{table}` 을 `{column}` 으로.

호출부(116)는:

```ts
       <BasisNotice
-        source={activeTab === "monthly" ? "계약완료" : "주문확정"}
-        table={activeTab === "monthly" ? "raw_contracts" : "raw_orders"}
+        source={BASIS_LABEL[activeTab === "monthly" ? "contract" : "order"]}
+        column={DATE_COL[activeTab === "monthly" ? "contract" : "order"]}
         counterpart={activeTab === "monthly" ? "주차별" : "월별"}
-        counterpartSource={activeTab === "monthly" ? "주문확정" : "계약완료"}
+        counterpartSource={BASIS_LABEL[activeTab === "monthly" ? "order" : "contract"]}
       />
```

파일 상단에 import 를 더한다. **이 파일은 `"use client"` 컴포넌트라 `lib/date-basis.ts` 가
의존성 없는 모듈이어야 하는 이유가 바로 여기다**(Task 1 의 주석 참고):

```ts
import { BASIS_LABEL, DATE_COL } from "@/lib/date-basis";
```

`BasisBar`(191 정의, 236·248 호출)도 같은 방식으로 `source`/`otherSource` 를 날짜 컬럼으로 바꾼다:

```ts
   <BasisBar
-      basis="계약완료"
-      source="raw_contracts"
+      basis={BASIS_LABEL.contract}
+      source={DATE_COL.contract}
       otherTab="주차별 트렌드"
-      otherBasis="주문확정"
-      otherSource="raw_orders"
+      otherBasis={BASIS_LABEL.order}
+      otherSource={DATE_COL.order}
   />
```

`WeeklyBasisBar`(248 부근)는 `contract` 와 `order` 를 맞바꾼 형태로 같이 고친다.

- [ ] **Step 3: 사용자에게 보이는 설명 문구를 고친다**

`CategoryTrendsClient.tsx:109-110` 부근이 이렇게 적혀 있다:

> "두 탭은 서로 다른 테이블에서 옵니다 — 월별은 raw_contracts(계약완료), 주차별은 raw_orders(주문확정)."

테이블이 하나가 됐으므로 **기준**으로 다시 쓴다:

> "두 탭은 서로 다른 기준에서 옵니다 — 월별은 계약완료일, 주차별은 주문확정일. 표시가 없으면 탭을 오가며 숫자를 …"

186행 부근의 주석(`데이터 기준 표기 — 월별=계약완료(raw_contracts), 주차별=주문확정(raw_orders)`)도 같이 고친다.

- [ ] **Step 4: 남은 참조 0 확인 + 타입·린트·빌드**

```bash
grep -ac 'raw_contracts\|raw_orders' app/category-trends/page.tsx app/category-trends/CategoryTrendsClient.tsx
npx tsc --noEmit && npm run lint && npm run build
```

기대: 두 파일 모두 `0`.

- [ ] **Step 5: 두 탭이 렌더되고 문구가 바뀐 것을 확인한다**

```bash
PORT=4100 npm run start
curl -s "http://localhost:4100/category-trends" | sed 's/<[^>]*>//g' | grep -o '두 탭은[^.]*' | head -1
```

기대: "서로 다른 기준에서 옵니다" 가 보이고 `raw_` 로 시작하는 문자열이 화면에 없다.

- [ ] **Step 6: 커밋**

```bash
git add app/category-trends/page.tsx app/category-trends/CategoryTrendsClient.tsx
git commit -m "refactor(data): 카테고리 트렌드를 raw_prop_items 로 옮기고 출처 표기를 기준으로 바꾼다"
```

---

## Task 6: `app/page.tsx` — 5곳

홈이다. 2025 주문확정이 27배 늘어나는 것이 **가장 눈에 띄는 화면**이다.

**Files:**
- Modify: `app/page.tsx` — 주문확정 234, 484, 489 · 계약완료 128, 196

**Interfaces:**
- Consumes: Task 1 의 `DATE_COL`

- [ ] **Step 1: 다섯 곳을 규칙대로 바꾼다**

Task 3 Step 1 규칙 그대로. 이 파일의 조회 함수들은 PR #35 에서 `unstable_cache` 로 감싸졌으므로 **`...Uncached` 함수 본문 안**의 쿼리를 고친다. 래퍼·캐시 키·태그는 건드리지 않는다.

- [ ] **Step 2: 남은 참조 0 확인 + 타입·린트·빌드**

```bash
grep -ac 'raw_contracts\|raw_orders' app/page.tsx
npx tsc --noEmit && npm run lint && npm run build
```

- [ ] **Step 3: 2025 거래건수가 늘어난 것을 확인한다 — 이 마이그레이션의 목적**

```bash
PORT=4100 npm run start
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:4100/"
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:4100/?hide2025=1"
```

둘 다 200 이어야 한다.

**주의:** "상세 데이터 → 카테고리 거래건수" 월별 격자(`visibleMonths`/`monthCatMap`)는
`fetchAllYearContracts` 로 채워지는 **계약완료 기준**이라 2025 주문확정 27배 증가가
애초에 거기 반영되지 않는다 — 그 격자로 이 태스크를 검증하지 않는다. 대신
① Task 0 델타 표의 "주문확정 신" 2025 합계(62,710)와, ② 아래처럼 프로덕션 DB를
직접 세어 2025 `order_confirmed_at` 건수가 그 값과 일치하는지 확인한다:

```bash
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/raw_prop_items?select=order_confirmed_at&order_confirmed_at=gte.2025-01-01&order_confirmed_at=lt.2026-01-01&limit=1" \
  -H "apikey: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}" -H "Authorization: Bearer ${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
  -H "Prefer: count=exact" -I | grep -i content-range
```

- [ ] **Step 4: 커밋**

```bash
git add app/page.tsx
git commit -m "refactor(data): 홈을 raw_prop_items 로 옮긴다 — 2025 주문확정이 되살아난다"
```

---

## Task 7: 나머지 5파일 — 같은 모양의 기계적 변환

각 파일이 주문확정 1곳 + 계약완료 1곳으로 모양이 같다. 한 태스크로 묶는다.

**`app/revenue-analysis/page.tsx` 는 이 태스크에 포함하지 않는다** — 진행 중이던
PR #34 가 그 파일을 통째로 재작성 중이라 여기서 손대면 그 PR 과 충돌한다. 구
테이블을 그대로 쓴 채 남기고 PR #34 병합 후 별도로 옮긴다.

**Files:**
- Modify: `app/compare/page.tsx` — o:56 · c:37
- Modify: `app/conversion/page.tsx` — o:31 · c:53
- Modify: `app/group/[group]/page.tsx` — o:95 · c:69
- Modify: `app/operation-efficiency/page.tsx` — o:161 · c:183
- Modify: `app/product-lookup/page.tsx` — o:69 · c:70

- [ ] **Step 1: 열 곳을 규칙대로 바꾼다**

Task 3 Step 1 규칙 그대로. 각 파일에서 `raw_contracts` → 계약완료 규칙, `raw_orders` → 주문확정 규칙.

- [ ] **Step 2: 남은 참조 0 확인 + 타입·린트·빌드**

```bash
grep -rac 'raw_contracts\|raw_orders' app/compare/page.tsx app/conversion/page.tsx "app/group/[group]/page.tsx" app/operation-efficiency/page.tsx app/product-lookup/page.tsx
npx tsc --noEmit && npm run lint && npm run build
```

기대: 다섯 파일 모두 `0`. (`app/revenue-analysis/page.tsx` 는 의도적으로 여전히 `raw_orders`/`raw_contracts` 를 참조한다 — 이 grep 대상에 넣지 않는다.)

- [ ] **Step 3: 다섯 페이지가 전부 렌더되는지 확인한다**

```bash
PORT=4100 npm run start
```

```bash
for p in /compare /conversion /group/정수기 /operation-efficiency /product-lookup; do
  printf "%-26s " "$p"
  curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:4100$p"
done
```

기대: 전부 200. `/group/정수기` 가 404 면 실제 그룹 이름을 `lib/biz-category.ts` 의 `CATEGORY_GROUPS` 에서 확인해 바꾼다.

- [ ] **Step 4: 커밋**

```bash
git add app/compare/page.tsx app/conversion/page.tsx "app/group/[group]/page.tsx" app/operation-efficiency/page.tsx app/product-lookup/page.tsx
git commit -m "refactor(data): 나머지 5개 화면을 raw_prop_items 로 옮긴다"
```

---

## Task 8: 죽은 코드 삭제 + 구 테이블 드롭

**Files:**
- Delete: `app/api/test-query-compare/route.ts`
- Modify: `AGENTS.md` (Supabase Tables 표)

- [ ] **Step 1: 저장소 전체에 남은 참조가 0인지 확인한다**

`app/revenue-analysis/page.tsx` 는 의도적 제외라 이 grep 에서 뺀다(File Structure
표 참고 — PR #34 병합 전까지는 구 테이블을 그대로 참조한다).

```bash
grep -ran 'raw_orders\|raw_contracts' app/ lib/ --include='*.ts' --include='*.tsx' | grep -v '/api/test-query-compare/' | grep -v '/revenue-analysis/page.tsx'
```

기대: **출력 없음.** 하나라도 나오면 그 파일을 먼저 처리한다.

- [ ] **Step 2: 죽은 테스트 라우트를 지운다**

`app/api/test-query-compare/route.ts` 는 2026-08-09 작성, 호출부 없음, 주석이 "Redash 4625(신규) vs raw_orders(기존 4441) 행 수 비교"인데 두 쿼리 모두 4678 로 대체됐다.

```bash
git rm app/api/test-query-compare/route.ts
```

- [ ] **Step 3: `AGENTS.md` 의 테이블 표를 고친다**

현재 표에 `raw_orders`(주문확정, 4441) · `raw_contracts`(계약완료, 4445) 두 줄이 있다. 한 줄로 합친다:

```markdown
| `raw_prop_items` | 견적아이템 통합 원장 (Redash Query 4678) — 주문확정·계약완료를 날짜 컬럼으로 구분 |
```

같은 파일 Purpose 절의 "Redash에서 동기화된 `raw_orders`(주문확정)와 `raw_contracts`(계약완료) 데이터를 Supabase에 저장하고" 도 함께 고친다.

- [ ] **Step 4: 타입·린트·빌드 + 전 페이지 렌더**

```bash
npx tsc --noEmit && npm run lint && npm run build
PORT=4100 npm run start
```

```bash
for p in / /companies /categories /categories/정수기 /company/코웨이 /exception-approval /brand-analysis /category-trends /compare /conversion /operation-efficiency /product-lookup /revenue-analysis; do
  printf "%-26s " "$p"
  curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:4100$p"
done
```

기대: 전부 200.

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "chore(data): 죽은 비교 라우트를 지우고 문서를 단일 원장으로 고친다"
```

- [ ] **Step 6: DROP 은 `revenue-analysis` 재배선 전까지 차단한다 — 지금 실행하지 않는다**

**이 브랜치는 `app/revenue-analysis/page.tsx` 를 의도적으로 제외했다** (진행 중이던
PR #34 가 그 파일을 통째로 재작성 중이라 여기서 손대면 충돌하기 때문). 그 결과
그 파일은 지금도 `raw_orders`/`raw_contracts` 를 직접 읽는다(48·70·103행).

**"이 브랜치를 배포해 전 화면이 정상 동작함을 확인했다"는 이 DROP 의 선행 조건으로
불충분하다** — `/revenue-analysis` 는 구 테이블을 읽는 채로도 정상 렌더되므로, 그
확인은 통과하면서도 구 테이블은 여전히 필요한 상태가 된다. 이 상태에서 DROP 을
실행하면 `/revenue-analysis` 하나가 그대로 깨진다.

**따라서 DROP SQL 은 PR #34 가 병합되어 `app/revenue-analysis/page.tsx` 가
`raw_prop_items` 로 옮겨지고, 저장소 전체 grep(Step 1 규칙, 이번에는 예외 없이)이
0을 낼 때까지 사용자에게 넘기지 않는다.** Supabase 는 다른 계정이라 DDL 은 어차피
사용자가 실행해야 한다 — 그 시점이 되면 아래를 전달한다:

```sql
-- 선행 조건 (둘 다 충족돼야 함):
--   1) 이 브랜치가 배포되어 전 화면이 정상 동작함을 확인
--   2) app/revenue-analysis/page.tsx 가 raw_prop_items 로 재배선됨 (PR #34 병합 후)
--      — 이 조건이 없으면 이 화면 하나가 구 테이블에 의존한 채로 남아 드롭과 함께 깨진다.
-- 외부 소비자 없음은 확인됨(사용자, 2026-09-12).
BEGIN;
DROP TABLE IF EXISTS raw_orders;
DROP TABLE IF EXISTS raw_contracts;
COMMIT;
```

**드롭은 두 조건을 모두 채운 후에 한다.** 코드 배포만 확인하고 드롭하면, 아직
구 테이블을 읽는 `revenue-analysis` 가 그 자리에서 깨진다.

---

## 이 계획이 다루지 않는 것

- **조회 계층 통합** — 16개 인라인 페이지네이션 루프를 `fetchRows` 로 모으는 일. 각 루프는 그대로 두고 테이블·필터만 바꾼다.
- **집계를 DB 로(B안)** — 캐싱 스펙의 후속. 독립 안건.
- **`hide2025` 토글 제거** — 원인은 없어지지만 토글을 뗄지는 별도 판단(스펙의 "하지 않는 것").
- **2025 행의 손익 백필** — 원천에 없는 값이다.
