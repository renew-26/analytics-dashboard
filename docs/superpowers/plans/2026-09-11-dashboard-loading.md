# 대시보드 로딩 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 4678 통합 마이그레이션을 완주시킨 뒤, 하루 한 번 바뀌는 데이터를 요청마다 다시 받지 않게 만든다.

**Architecture:** 순서가 설계의 본체다. 배포로 크론이 `raw_prop_items` 를 채우게 하고, 같은 날 `raw_orders`/`raw_contracts` 를 그 위의 뷰로 교체한다. 그 상태에서 기준선을 다시 재고, 캐싱을 2트랙으로 넣는다 — `searchParams` 를 읽지 않는 11개 페이지는 라우트 세그먼트 `revalidate`, 무거운 2개(`/`·`/company/[company]`)는 조회 함수를 `unstable_cache` 로 감싼다. 무효화는 타이머가 아니라 크론이 통보한다.
>
> **정정(구현 후 실측, 2026-09-11):** 11개 페이지에서 `revalidate` 를 시도했지만
> 실제로 라우트 캐싱이 드는 것은 **7개뿐**이다(`.next/prerender-manifest.json` —
> `initialRevalidateSeconds: 86400` + `dynamicRoutes` 빈 라우트가 7개). 나머지
> 4개는 동적 세그먼트(`category/[category]`·`group/[group]`·
> `categories/[category]/[company]`·`.../[product]`)라 `generateStaticParams` 없이는
> `revalidate` 가 무동작이다 — 렌탈사 약 30곳의 무거운 조회를 빌드 시점에 프리렌더해야
> 해서 일부러 붙이지 않았고, 그 줄은 의도를 명시하는 무동작 코드로 남겨 둔다. 자세한
> 근거는 spec 의 "트랙 1" 절 참고.

**Tech Stack:** Next.js 16.2.4 (App Router, standalone) · React 19.2.4 · `@supabase/supabase-js` · Redash 4678 · Postgres 뷰

**Spec:** `docs/superpowers/specs/2026-09-11-dashboard-loading-design.md`

## Global Constraints

- **테스트 프레임워크가 없다.** jest·vitest·playwright 전부 없고 `test` 스크립트도 없다. 도입은 이 작업 범위 밖이다. 각 태스크의 검증은 `npx tsc --noEmit` · `npm run lint` · `npm run build` + 아래 단정 스크립트로 한다. **거짓 테스트 코드를 쓰지 말 것.**
- **로컬 도구 스크립트는 저장소에 두지 않는다.** `c4c183f` 가 문구 리뷰 스크립트를 `~/.claude/scripts` 로 뺐다 — "로컬 개발 도구라 제품 코드와 함께 배포될 이유가 없다". 이 계획의 검증 스크립트도 `~/.claude/scripts/` 에 두고 **프로젝트 루트에서 실행**한다(`.env.local` 을 실행 위치 기준으로 읽는다). 커밋 대상은 제품 코드뿐이다.
- **`.env.local` 은 프로덕션 Supabase 를 가리킨다.** 스크립트·sync 호출은 모두 실서비스에 닿는다. 읽기는 자유롭게, 쓰기는 사용자 승인 후에만.
- **Supabase MCP 는 다른 계정이다.** DDL·DML SQL 은 실행하지 말고 사용자에게 넘긴다.
- **`cacheComponents: true` 를 켜지 않는다.** `'use cache'` 지시어가 그 플래그를 요구하는데, 켜면 `dynamic`·`revalidate`·`fetchCache` 를 export 하는 모든 라우트가 에러가 되어 21개 페이지를 한꺼번에 Suspense 구조로 재편해야 한다. 별개의 대형 마이그레이션이다. 이 계획은 플래그 없이 동작하는 `revalidate` + `unstable_cache` + `revalidatePath` 로 간다. `unstable_cache` 는 Next 16 에서 deprecated 이지만 동작한다 — 코드 주석에 그 사실과 이유를 남긴다.
- **데이터는 하루 한 번 05:00 KST(=20:00 UTC) 들어온다.** 안전망 `revalidate` 값은 `86400`.
- **측정 규약:** 프로덕션 빌드 · 페이지별 5회 중앙값 · 1차 요청과 2차 요청을 분리해 기록. dev 서버 측정은 노이즈가 신호보다 크다(`performance-plan.md` 실측: 같은 코드가 3.5s ↔ 4.7s).
- **`PAGE = 50000` 은 PostgREST max-rows 상한이다.** 페이지네이션 루프를 건드릴 때 이 값을 키우면 응답이 상한에서 잘리고 `data.length < PAGE` 종료 조건이 마지막 페이지로 오인해 조용히 누락된다.

---

## File Structure

**수정 (제품 코드):**

| 파일 | 책임 | 태스크 |
|---|---|---|
| `app/api/sync/cron/route.ts` | 동기화 완료 후 캐시 무효화 통보 | 4 |
| `app/brand-analysis/page.tsx` 외 10개 | `force-dynamic` → `revalidate` | 4 |
| `app/page.tsx:117-215` | 조회 함수 3개를 `unstable_cache` 로 감쌈 | 5 |
| `app/company/[company]/page.tsx:544-740` | 조회 6개를 `unstable_cache` 로 감쌈 | 6 |
| `docs/performance-plan.md` | 측정 결과 갱신 | 7 |

**생성 (커밋 안 함 — `~/.claude/scripts/`):**

| 파일 | 책임 | 태스크 |
|---|---|---|
| `phase2-gate.mjs` | 구 테이블의 모든 행이 `raw_prop_items` 에 있는지 단정 | 1, 3 |
| `measure-pages.mjs` | 프로덕션 빌드 페이지별 5회 중앙값 · 1차/2차 분리 | 2, 7 |

**사용자가 실행 (코드 아님):**

| 항목 | 태스크 |
|---|---|
| 운영 MySQL 판정 쿼리 (잔여 160건) | 1 |
| 마켓플레이스 배포 최신화 | 2 |
| `migrations/2026-09-04_phase2_views.sql` 적용 | 3 |

---

## Task 1: 잔여 160건 판정 — PHASE 2 안전 게이트

**이 태스크가 실패하면 Task 3 을 진행하지 않는다.** 뷰 전환으로 행이 사라지는지를 여기서 가른다.

**Files:**
- Create: `~/.claude/scripts/phase2-gate.mjs` (커밋 안 함)

**Interfaces:**
- Produces: `phase2-gate.mjs` — 종료 코드 0(통과) / 1(미통과), 그리고 미존재 `prop_item_usid` 목록을 stdout 에 출력. Task 3 이 같은 스크립트를 재사용한다.

- [ ] **Step 1: 게이트 스크립트를 만든다**

`~/.claude/scripts/phase2-gate.mjs`:

```js
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const PAGE = 50000; // PostgREST max-rows 상한
const all = async (tbl, sel, mods = (q) => q) => {
  const out = []; let from = 0;
  for (;;) {
    const { data, error } = await mods(sb.from(tbl).select(sel)).range(from, from + PAGE - 1);
    if (error) throw new Error(`${tbl}: ${error.message}`);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
};
const w = (n) => n.toLocaleString("ko-KR");

const propIds = new Set((await all("raw_prop_items", "prop_item_usid")).map((r) => r.prop_item_usid));
console.log(`raw_prop_items: ${w(propIds.size)}건\n`);

let pass = true;
const missingAll = [];
for (const [tbl, dateCol] of [["raw_orders", "order_confirmed_at"], ["raw_contracts", "contract_date"]]) {
  const rows = await all(tbl, `prop_item_usid, ${dateCol}`);
  const missing = rows.filter((r) => !propIds.has(r.prop_item_usid));
  if (missing.length) { pass = false; missingAll.push(...missing.map((r) => r.prop_item_usid)); }
  console.log(`${missing.length === 0 ? "✅" : "❌"} ${tbl}: ${w(rows.length)}건 중 미존재 ${w(missing.length)}건`);
  if (missing.length) {
    const bm = {};
    for (const r of missing) { const m = (r[dateCol] || "?").slice(0, 7); bm[m] = (bm[m] || 0) + 1; }
    console.log(`   월별: ${Object.entries(bm).sort().map(([k, v]) => `${k}:${v}`).join("  ")}`);
  }
}

if (missingAll.length) {
  console.log(`\n미존재 usid (판정 쿼리에 넣을 목록):\n${[...new Set(missingAll)].join(",")}`);
}
console.log(`\n${pass ? "✅ PHASE 2 안전 게이트 통과" : "❌ 미통과 — Task 1 의 판정 쿼리로 정당한 제외인지 확인할 것"}`);
process.exit(pass ? 0 : 1);
```

- [ ] **Step 2: 실행해 현재 미존재 목록을 얻는다**

프로젝트 루트에서 실행 (`.env.local` 을 읽으므로 루트여야 한다):

```bash
node ~/.claude/scripts/phase2-gate.mjs
```

기대: `raw_contracts` 는 ✅ 0건, `raw_orders` 는 ❌ 약 160건 + usid 목록 출력. 종료 코드 1.
(2026-09-11 백필 직후 실측값이다. 그 사이 크론이 돌았으면 수가 줄 수 있다.)

- [ ] **Step 3: 운영 MySQL 판정 쿼리를 사용자에게 넘긴다**

Step 2 가 출력한 usid 목록을 `IN (...)` 에 넣어 사용자에게 전달한다. **직접 실행하지 않는다** — 작성 시점에 `rentre-mysql` MCP 가 `SELECT 1` 까지 3연속 `ETIMEDOUT` 이었다(VPN/터널 미연결).

```sql
SELECT p.PROP_STAT, p.DEL_YN AS prop_del, pi.DEL_YN AS item_del, COUNT(*) AS cnt
FROM PROP_ITEM pi
JOIN PROP p ON p.PROP_USID = pi.PROP_USID
WHERE pi.PROP_ITEM_USID IN (/* Step 2 가 출력한 목록 */)
GROUP BY p.PROP_STAT, p.DEL_YN, pi.DEL_YN
ORDER BY cnt DESC;
```

- [ ] **Step 4: 결과를 판정한다**

4678 화이트리스트는 `INS_ARN` · `INS_RSV` · `CON_RVW` · `PAYB_WAIT` · `COMPLETE` · `REQFAIL_H` · `REQFAIL_I` · `REQFAIL_J` · `REQFAIL_K` 다.

- **전건이 화이트리스트 밖이거나 `DEL_YN=1`** → 정당한 제외. `raw_orders` 가 과거 스냅샷을 들고 있던 것이므로 **Task 2 로 진행**한다.
- **화이트리스트 안이고 `DEL_YN=0` 인 행이 있다** → 4678 의 결함이다. **여기서 멈추고** 사용자에게 보고한다. `docs/redash-4678-unified-query.sql` 의 날짜 조건(`CONFIRMED_TS` OR `PROP_COMPLETE_TS`)과 조인을 다시 대조해야 하며, PHASE 2 는 보류한다.

- [ ] **Step 5: 판정 결과를 스펙에 기록한다**

`docs/superpowers/specs/2026-09-11-dashboard-loading-design.md` 의 "잔여 160건" 절에 결과 한 단락을 덧붙인다 — 실제 `PROP_STAT` 분포와 판정(정당한 제외 / 4678 결함), 그리고 판정일.

```bash
git add docs/superpowers/specs/2026-09-11-dashboard-loading-design.md
git commit -m "docs(spec): 잔여 160건 판정 결과를 기록한다"
```

---

## Task 2: 기준선 측정 + 배포 최신화

배포 전 숫자를 남겨야 개선을 증명할 수 있다. 그리고 배포는 이 계획의 나머지가 의존하는 전제다.

**Files:**
- Create: `~/.claude/scripts/measure-pages.mjs` (커밋 안 함)
- Modify: `docs/performance-plan.md` (측정 결과 추가)

**Interfaces:**
- Consumes: Task 1 의 판정 통과
- Produces: `measure-pages.mjs` — 인자로 받은 base URL 에 대해 페이지별 1차/2차 요청 시간을 5회 중앙값으로 출력. Task 7 이 같은 스크립트로 전후를 비교한다.

- [ ] **Step 1: 측정 스크립트를 만든다**

`~/.claude/scripts/measure-pages.mjs`:

```js
// 사용법: node ~/.claude/scripts/measure-pages.mjs http://localhost:3000
const base = process.argv[2];
if (!base) { console.error("base URL 을 인자로 주세요"); process.exit(1); }

const PAGES = [
  "/", "/companies", "/categories", "/categories/정수기",
  "/company/코웨이", "/exception-approval",
];
const RUNS = 5;
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

const hit = async (url) => {
  const s = Date.now();
  const res = await fetch(url, { cache: "no-store" });
  await res.arrayBuffer(); // 본문까지 받아야 실제 응답시간이다
  return { ms: Date.now() - s, status: res.status };
};

console.log(`base=${base}  runs=${RUNS}\n`);
console.log("페이지".padEnd(26) + "1차".padStart(8) + "2차 중앙값".padStart(12) + "  범위");
for (const p of PAGES) {
  const url = base + p;
  const first = await hit(url);            // 캐시가 비어 있는 첫 요청
  const rest = [];
  for (let i = 0; i < RUNS; i++) rest.push((await hit(url)).ms);
  const lo = Math.min(...rest), hi = Math.max(...rest);
  console.log(
    p.padEnd(26) +
    `${first.ms}ms`.padStart(8) +
    `${med(rest)}ms`.padStart(12) +
    `  ${lo}~${hi}ms` + (first.status !== 200 ? `  ⚠️ HTTP ${first.status}` : "")
  );
}
```

- [ ] **Step 2: 프로덕션 빌드로 기준선을 잰다**

```bash
npm run build && npm run start
```

별 셸에서:

```bash
node ~/.claude/scripts/measure-pages.mjs http://localhost:3000
```

기대: 6개 페이지 전부 HTTP 200. 1차와 2차가 **비슷하게 느리다** — 캐시가 없으니 당연하다. 이 숫자가 기준선이다.
참고 이전 실측(2026-09-10, 프로덕션 5회 중앙값): `/company/코웨이` 2.49s · `/companies` 1.75s · `/` 2.32s.

- [ ] **Step 3: 기준선을 문서에 기록한다**

`docs/performance-plan.md` 끝에 절을 추가한다 — 측정일, base URL, 표 그대로, 그리고 "PHASE 2 전 · 캐시 전" 이라는 조건 명시.

```bash
git add docs/performance-plan.md
git commit -m "docs(perf): PHASE 2 전 기준선을 기록한다"
```

- [ ] **Step 4: 사용자에게 배포 최신화를 요청한다**

마켓플레이스 서비스 화면의 "업데이트"(git pull + 재빌드 + 재시작)를 누르도록 안내한다. **에이전트가 할 수 없는 단계다.**

배포된 코드가 `cb35489`(2026-09-02) 이후여야 크론이 `prop_items` 를 채운다. 현재는 그 이전 빌드다.

- [ ] **Step 5: 다음 05:00 KST 이후 크론 게이트를 확인한다**

```bash
node -e '
const fs=require("fs");
const env=Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["\x27]|["\x27]$/g,"")]}));
const {createClient}=require("@supabase/supabase-js");
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
  for(const t of ["raw_prop_items","raw_orders","raw_contracts"]){
    const {data}=await sb.from(t).select("synced_at").not("synced_at","is",null).order("synced_at",{ascending:false}).limit(1);
    console.log(t.padEnd(16), data?.[0]?.synced_at ?? "(없음)");
  }
})();'
```

기대: `raw_prop_items.synced_at` 이 **20:00 UTC 대**로 찍힌다(=05:00 KST 크론). 그러면 배포가 반영된 것이다.

찍히지 않으면 배포가 안 됐거나 `ENABLE_CRON` 이 빠진 것이다. 컨테이너 부팅 로그의 다음 줄로 갈린다:
`[cron] Redash 자동 동기화 스케줄 등록 완료` vs `[cron] ENABLE_CRON=true 아님`.

**여기서 멈추고** 확인될 때까지 Task 3 으로 넘어가지 않는다.

---

## Task 3: PHASE 2 뷰 전환

Task 2 와 **같은 날** 처리한다. 배포 후 새 크론은 `order`/`contract` 를 부르지 않으므로, 구 테이블이 그날부터 얼고 30개 사용처가 조용히 낡는다.

**Files:**
- 코드 변경 없음. `migrations/2026-09-04_phase2_views.sql` 은 이미 저장소에 있다.

**Interfaces:**
- Consumes: Task 1 판정 통과, Task 2 Step 5 크론 게이트 통과
- Produces: `raw_orders`·`raw_contracts` 가 `raw_prop_items` 위의 뷰가 된다. 30개 사용처의 코드는 그대로 동작한다(동명·동컬럼).

- [ ] **Step 1: 게이트를 다시 돌린다**

배포 후 크론이 돌았으므로 미존재 행 수가 바뀌었을 수 있다.

```bash
node ~/.claude/scripts/phase2-gate.mjs
```

Task 1 Step 4 에서 "정당한 제외"로 판정된 usid 만 남아 있어야 한다. **새로운 usid 가 늘었으면** 크론 창(7일) 밖의 행이므로 Task 2 Step 4 의 백필을 그 월에 대해 다시 돌린다.

- [ ] **Step 2: 사용자에게 마이그레이션 SQL 적용을 요청한다**

`migrations/2026-09-04_phase2_views.sql` 전문을 Supabase SQL Editor 에서 실행하도록 넘긴다. **에이전트가 실행하지 않는다**(Supabase MCP 는 다른 계정).

적용 전 사용자에게 알릴 것 — 이 마이그레이션은 구 테이블을 **드롭하지 않는다.** `raw_orders` → `raw_orders_bak_20260904` 로 rename 하고(59~60행) 그 자리에 동명 뷰를 만든다. 전체가 `BEGIN`/`COMMIT` 한 트랜잭션이고, 파일 하단(127~133행)에 롤백 절차가 주석으로 있다:

```sql
-- 롤백 (파일 하단 주석 그대로)
BEGIN;
DROP VIEW IF EXISTS raw_orders;
DROP VIEW IF EXISTS raw_contracts;
ALTER TABLE raw_orders_bak_20260904    RENAME TO raw_orders;
ALTER TABLE raw_contracts_bak_20260904 RENAME TO raw_contracts;
COMMIT;
```

즉 되돌리기가 rename 두 번이다. 백업 테이블은 이후 정리 판단이 날 때까지 남겨 둔다.

- [ ] **Step 3: 마이그레이션 파일 하단의 확인 쿼리를 돌린다**

사용자에게 이 쿼리를 넘겨 **두 컬럼 모두 true** 인지 본다(파일 113~121행 주석 그대로):

```sql
SELECT
  (SELECT count(*) FROM raw_contracts
     WHERE contract_date BETWEEN '2025-10-01' AND '2025-10-31') = 3453
    AS "2025-10 계약완료 3453건 유지",
  (SELECT count(*) FROM raw_orders
     WHERE order_confirmed_at BETWEEN '2025-12-01' AND '2025-12-31') = 1121
    AS "2025-12 주문확정 1121건 유지";
```

하나라도 false 면 **즉시 롤백을 안내하고** 사용자에게 보고한다. 이 두 수는 마이그레이션 파일이 근거 ①②에서 실측으로 못 박은 값이다 — `raw_contracts` 에 `sales IS NOT NULL` 을 걸면 2025년이 전멸하는 그 지점을 지키는 검사다.

- [ ] **Step 4: 뷰가 실제로 뷰인지, 앱이 읽히는지 확인한다**

```bash
node ~/.claude/scripts/phase2-gate.mjs
```

기대: 이제 **두 테이블 모두 ✅ 0건** — 뷰이므로 정의상 `raw_prop_items` 의 부분집합이다. 종료 코드 0.

이어서 앱이 뜨는지 본다:

```bash
npm run build && npm run start
```

별 셸에서:

```bash
node ~/.claude/scripts/measure-pages.mjs http://localhost:3000
```

기대: 6개 페이지 전부 HTTP 200. **어느 페이지든 500 이면 뷰의 컬럼 누락이다** — 뷰 정의에 없는 컬럼(`partner_name`·`data_type` 은 NULL 로 채워져 있다)을 읽는 곳을 찾아 보고한다.

- [ ] **Step 5: 뷰 전환 후 숫자를 기록한다**

`docs/performance-plan.md` 에 절을 추가한다 — 뷰 전환 후 측정값과, 기준선(Task 2 Step 3) 대비 변화. **뷰는 조회마다 필터를 타므로 느려질 수 있다.** 느려졌으면 그 사실을 그대로 적는다.

```bash
git add docs/performance-plan.md
git commit -m "docs(perf): PHASE 2 뷰 전환 후 측정값을 기록한다"
```

---

## Task 4: 라우트 세그먼트 캐싱 + 크론 무효화 통보

`force-dynamic` 제거와 무효화 통보는 **함께 가야 의미가 있다.** 무효화만 넣으면 캐시할 것이 없고, `force-dynamic` 만 떼면 최대 24시간 낡은 화면이 뜬다.

**Files:**
- Modify: `app/api/sync/cron/route.ts`
- Modify: `searchParams` 를 읽지 **않는** 11개 페이지
  - `app/brand-analysis/page.tsx`
  - `app/categories/page.tsx`
  - `app/categories/[category]/[company]/page.tsx`
  - `app/categories/[category]/[company]/[product]/page.tsx`
  - `app/category/[category]/page.tsx`
  - `app/companies/page.tsx`
  - `app/conversion/page.tsx`
  - `app/group/[group]/page.tsx`
  - `app/products/page.tsx`
  - `app/survey-selection/appliance/page.tsx`
  - `app/survey-selection/tps/page.tsx`

**Interfaces:**
- Consumes: Task 3 완료(뷰 전환된 상태에서 캐싱해야 캐시에 담기는 값이 맞다)
- Produces: 태그 이름 `"dashboard-data"` — Task 5·6 의 `unstable_cache` 가 같은 태그를 쓴다.

- [ ] **Step 1: `force-dynamic` 을 읽지 않는 11개 페이지에서만 뗀다**

각 파일에서 이 줄을 지우고 대신 `revalidate` 를 둔다:

```ts
// 지운다
export const dynamic = "force-dynamic";

// 넣는다 — 크론(revalidatePath)이 실제 무효화를 담당하고,
// 이 값은 크론이 실패해도 캐시가 영구히 얼지 않게 하는 안전망이다.
export const revalidate = 86400;
```

**`searchParams` 를 읽는 10개 페이지는 건드리지 않는다** — `searchParams` 접근이 동적 렌더링을 강제하므로 `force-dynamic` 을 떼도 캐싱되지 않는다. 그 페이지들은 Task 5·6 이 다룬다.
(`app/category-trends/page.tsx` · `app/company/[company]/page.tsx` · `app/compare/page.tsx` · `app/exception-approval/page.tsx` · `app/margin-analysis/page.tsx` · `app/operation-efficiency/page.tsx` · `app/page.tsx` · `app/product-lookup/page.tsx` · `app/revenue-analysis/page.tsx` · `app/transaction-count/page.tsx`)

- [ ] **Step 2: 크론 끝에 무효화 통보를 넣는다**

`app/api/sync/cron/route.ts` — `import` 에 추가:

```ts
import { revalidatePath, revalidateTag } from "next/cache";
```

`results` 를 반환하기 직전에 추가:

```ts
  // 동기화가 캐시를 깬다 — 타이머(revalidate)는 데이터가 실제로 바뀐 시점을 모른다.
  // 데이터는 하루 한 번 통째로 바뀌므로 페이지별로 골라 깰 이유가 없다.
  // revalidatePath("/", "layout") 는 하위 전체를, revalidateTag 는 unstable_cache 항목을 무효화한다.
  revalidatePath("/", "layout");
  revalidateTag("dashboard-data", "max");
```

정정(구현 후 실측, 2026-09-11): 설치된 Next 16.2.4 의 타입 선언
(`node_modules/next/dist/server/web/spec-extension/revalidate.d.ts`)은
`revalidateTag(tag: string, profile: string | CacheLifeConfig)` 로 두 번째
인자(profile)를 **필수**로 둔다 — 위 스니펫의 원래 1-인자 호출은 타입 에러가 난다.
`"max"` 는 Next 자체 경고가 권하는 기본값이라 그대로 채택했다(`app/api/sync/cron/route.ts:73`).
다만 이 profile 이 무효화를 "하드하게" 만들어 주는 것은 아니다 — `"max"` 는
`{expire: 31536000}` 로 해석되어 `stale: now` 만 세우고 `expired` 는 365일 뒤다.
실제 하드 퍼지는 바로 위 `revalidatePath("/", "layout")` 가 한다 — 자세한 이유는
`app/api/sync/cron/route.ts` 의 해당 주석 참고.

- [ ] **Step 3: 타입·린트·빌드를 통과시킨다**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

기대: 전부 통과. `cacheComponents` 를 켜지 않았으므로 `revalidate` export 는 에러가 아니다.

- [ ] **Step 4: 캐시가 실제로 드는지 확인한다**

```bash
npm run start
```

별 셸에서:

```bash
node ~/.claude/scripts/measure-pages.mjs http://localhost:3000
```

기대: `force-dynamic` 을 뗀 페이지들(`/companies` · `/categories` · `/categories/정수기`)의 **2차 중앙값이 1차보다 뚜렷히 작다.** `/` · `/company/코웨이` · `/exception-approval` 은 아직 변화가 없어야 한다(`searchParams` 를 읽으므로 — Task 5·6 이 다룬다).

2차가 1차와 같으면 캐시가 안 든 것이다. 그 페이지가 `searchParams`·`cookies()`·`headers()` 를 읽는지 다시 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add app/api/sync/cron/route.ts app/brand-analysis/page.tsx app/categories/page.tsx "app/categories/[category]/[company]/page.tsx" "app/categories/[category]/[company]/[product]/page.tsx" "app/category/[category]/page.tsx" app/companies/page.tsx app/conversion/page.tsx "app/group/[group]/page.tsx" app/products/page.tsx app/survey-selection/appliance/page.tsx app/survey-selection/tps/page.tsx
git commit -m "perf(cache): 동기화가 캐시를 깨게 하고 정적 가능한 11개 페이지를 캐싱한다"
```

---

## Task 5: 홈 조회 함수 캐싱

`/` 는 `searchParams` 를 읽지만 그 값(`hide2025`)은 **표시용일 뿐 조회에 안 들어간다**(`app/page.tsx:421` 에서만 쓰인다). 그래서 조회 함수만 캐싱하면 된다 — 캐시 키에 `searchParams` 가 필요 없다.

**Files:**
- Modify: `app/page.tsx` — `import` 추가, `fetchContracts`(117행) · `fetchAllYearContracts`(152행) · `fetchAllYearOrders`(183행) 를 감쌈

**Interfaces:**
- Consumes: Task 4 의 태그 이름 `"dashboard-data"`
- Produces: 없음(페이지 내부 변경). 세 함수의 시그니처는 그대로 유지한다 — `fetchContracts(start: string, end: string): Promise<ContractRow[]>` · `fetchAllYearContracts(yearStart: string, end: string): Promise<YearContractRow[]>` · `fetchAllYearOrders(yearStart: string, end: string): Promise<OrderRow[]>`. 호출부(446~449행)는 손대지 않는다.

- [ ] **Step 1: `unstable_cache` 를 import 한다**

`app/page.tsx` 상단:

```ts
import { unstable_cache } from "next/cache";
```

- [ ] **Step 2: 세 조회 함수를 감싼다**

각 `async function fetchX(...)` 를 그대로 두고 이름을 `fetchXUncached` 로 바꾼 뒤, 같은 이름의 캐시 래퍼를 만든다. 예 — `fetchContracts`:

```ts
// 기존 함수는 이름만 바꿔 그대로 둔다
async function fetchContractsUncached(
  start: string,
  end: string,
): Promise<ContractRow[]> {
  // ... 본문 그대로 ...
}

/**
 * 이 페이지는 searchParams(hide2025)를 읽어 동적 렌더링이 강제되므로 라우트 세그먼트
 * 캐싱이 안 든다. 대신 조회만 캐싱한다 — hide2025 는 표시용이라(421행) 캐시 키에
 * 넣을 필요가 없다.
 *
 * unstable_cache 는 Next 16 에서 'use cache' 로 대체됐으나, 그 지시어는
 * cacheComponents: true 를 요구하고 그걸 켜면 dynamic·revalidate·fetchCache 를
 * export 하는 모든 라우트가 에러가 된다(21개 페이지 동시 재편). 그래서 여기서는
 * deprecated 이지만 동작하는 이 API 를 쓴다.
 *
 * revalidate 86400 은 크론(revalidateTag)이 실패해도 영구히 얼지 않게 하는 안전망이다.
 */
const fetchContracts = unstable_cache(
  fetchContractsUncached,
  ["home-contracts"],
  { tags: ["dashboard-data"], revalidate: 86400 },
);
```

`fetchAllYearContracts` → 키 `["home-year-contracts"]`, `fetchAllYearOrders` → 키 `["home-year-orders"]` 로 같은 방식으로 감싼다. **인자는 캐시 키에 자동으로 붙으므로** 날짜별로 항목이 갈린다.

- [ ] **Step 3: 타입·린트·빌드를 통과시킨다**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

기대: 전부 통과. 실패하면 대개 래퍼의 반환 타입 추론 문제다 — 원 함수의 명시적 반환 타입(`Promise<ContractRow[]>`)이 그대로 남아 있는지 확인한다.

- [ ] **Step 4: 홈의 숫자가 그대로인지, 2차가 빨라졌는지 확인한다**

```bash
npm run start
```

캐싱은 **숫자를 바꾸면 안 된다.** 두 조건을 함께 본다:

```bash
node ~/.claude/scripts/measure-pages.mjs http://localhost:3000
curl -s "http://localhost:3000/" | grep -o '이달의 요약\|건\|원' | head -3
```

기대: `/` 의 2차 중앙값이 1차보다 뚜렷히 작다. 그리고 캐싱 전(Task 3 Step 5 기록)과 **화면의 대표 숫자가 동일**하다 — 다르면 캐시 키가 잘못돼 다른 기간의 결과를 재사용하는 것이므로 즉시 되돌린다.

`?hide2025=1` 로도 열어 토글이 여전히 듣는지 확인한다:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/?hide2025=1"
```

- [ ] **Step 5: 커밋**

```bash
git add app/page.tsx
git commit -m "perf(cache): 홈 조회 3개를 unstable_cache 로 감싼다"
```

---

## Task 6: 렌탈사 상세 조회 캐싱

가장 무거운 페이지다 — `.from()` 28회, 프로덕션 중앙값 2.49s. `searchParams` 의 `bm` 은 831행 JS 필터라 조회에 안 들어가므로 캐시 키에서 뺀다. **`view`(`tab`)는 다르다** — 정정(구현 후 리뷰, 2026-09-11): 브리프 초안은 "735행 JS 분기라 조회에 안 들어간다"고 했으나 틀렸다. `fetchGrowthRows` 는 `view` 값에 따라 조회 테이블 자체가 `raw_orders`/`raw_contracts` 로, 날짜 컬럼도 `order_confirmed_at`/`contract_date` 로 갈린다(아래 Step 1의 `growthRowsP`). 그래서 `view` 는 그 조회에 한해 캐시 키에 반드시 넣는다 — 빼면 `?tab=contract` 가 `raw_orders` 캐시를 그대로 받아 주문확정 행을 계약완료로 보여주는 오염이 난다. 나머지 5개 조회는 `view` 에 따라 SQL 이 갈리지 않으므로 그대로 뺀다.

**Files:**
- Modify: `app/company/[company]/page.tsx` — `import` 추가, 544~740행의 조회 Promise 6개가 쓰는 조회 본문을 감쌈

**Interfaces:**
- Consumes: Task 4 의 태그 이름 `"dashboard-data"`
- Produces: 없음(페이지 내부 변경)

- [ ] **Step 1: 조회 단위를 페이지 밖 함수로 들어낸다**

현재 조회는 컴포넌트 본문 안의 Promise 표현식이다(`periodP` 544행 · `iaAllP` 547 · `shareRowsP` 577 · `typeInfoP` 633 · `typeaPoolP` 665 · `growthRowsP` 706). `unstable_cache` 는 모듈 스코프 함수를 감싸야 하므로, 각 Promise 의 **조회 본문만** 컴포넌트 밖으로 옮긴다.

옮길 때 지킬 것:
- 클로저로 쓰던 값(`dbNames` · `dbName` · `PAGE` · `FETCH_RANGE_START` · `REVENUE_RANGE_START`)을 **인자로 받는다.** 캐시 키에 들어가야 회사별로 항목이 갈린다.
- `PAGE = 50000` 을 인자로 넘기지 말고 모듈 상수로 둔다 — 캐시 키에 상수를 넣을 이유가 없다.
- 병렬 구조(`.then` 체인, 진입부에서 시작만 걸고 쓰는 자리에서 `await`)를 **유지한다.** `performance-plan.md` 1단계가 순차 4,043ms → 병렬 1,936ms 로 줄인 구조다.

- [ ] **Step 2: 들어낸 함수를 감싼다**

각 함수에 회사 식별자를 첫 인자로 두고 감싼다. 예 — `shareRowsP` 의 조회:

```ts
async function fetchShareRowsUncached(
  dbNames: string[],
  start: string,
): Promise<CardContractRow[]> {
  // ... 577~632행의 본문 ...
}

/**
 * 이 페이지는 searchParams(tab·bm)를 읽어 동적 렌더링이 강제되므로 라우트 세그먼트
 * 캐싱이 안 든다. 대신 조회만 캐싱한다 — bm 은 831행 JS 필터라 조회에 들어가지
 * 않으므로 캐시 키에 넣지 않는다. (이 조회는 view 에도 안 갈리므로 view 도 인자로
 * 받지 않는다 — view 를 키에 넣어야 하는 조회는 fetchGrowthRows 뿐이다. 이유는
 * fetchGrowthRowsUncached 위 주석 참고.)
 * unstable_cache 를 쓰는 이유는 app/page.tsx 의 같은 주석 참고.
 */
const fetchShareRows = unstable_cache(
  fetchShareRowsUncached,
  ["company-share-rows"],
  { tags: ["dashboard-data"], revalidate: 86400 },
);
```

나머지도 같은 방식으로 — 키는 `["company-period"]` · `["company-ia-all"]` · `["company-type-info"]` · `["company-typea-pool"]` · `["company-growth-rows"]`.

**`dbNames` 는 배열이다.** `unstable_cache` 는 인자를 직렬화해 키에 넣으므로 순서가 다르면 다른 항목이 된다. `dbNamesOf(mapping)` 이 안정적 순서를 주는지 확인하고, 아니면 정렬해서 넘긴다.

- [ ] **Step 3: 타입·린트·빌드를 통과시킨다**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

- [ ] **Step 4: 숫자가 그대로인지, 2차가 빨라졌는지, 파라미터가 여전히 듣는지 확인한다**

```bash
npm run start
```

세 가지를 함께 본다:

```bash
node ~/.claude/scripts/measure-pages.mjs http://localhost:3000
for q in "" "?tab=contract" "?bm=bm2" "?tab=contract&bm=bm2"; do
  printf "%-26s " "/company/코웨이$q"
  curl -s -o /dev/null -w "%{http_code}  %{time_total}s\n" "http://localhost:3000/company/코웨이$q"
done
```

기대:
- `/company/코웨이` 2차 중앙값이 1차보다 뚜렷히 작다
- 네 파라미터 조합 전부 HTTP 200
- **화면의 대표 숫자가 Task 3 Step 5 기록과 동일**하다. 그리고 `?tab=contract` 와 기본이 **서로 다른** 값을 보인다 — 같으면 캐시가 `view` 분기를 삼킨 것이므로 즉시 되돌린다.
- 다른 회사도 한 곳 열어 회사별로 캐시가 갈리는지 본다: `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/company/쿠쿠"`

- [ ] **Step 5: 커밋**

```bash
git add "app/company/[company]/page.tsx"
git commit -m "perf(cache): 렌탈사 상세 조회 6개를 unstable_cache 로 감싼다"
```

---

## Task 7: 최종 측정 + 후속 범위 결정

**Files:**
- Modify: `docs/performance-plan.md`
- Modify: `docs/superpowers/specs/2026-09-11-dashboard-loading-design.md`

**Interfaces:**
- Consumes: Task 2~6 의 측정 기록

- [ ] **Step 1: 최종 측정을 돌린다**

```bash
npm run build && npm run start
```

```bash
node ~/.claude/scripts/measure-pages.mjs http://localhost:3000
```

- [ ] **Step 2: 크론 무효화가 실제로 캐시를 깨는지 확인한다**

캐시가 든 상태에서 크론 라우트를 부르고, 그 다음 요청이 다시 느려지는지 본다.

```bash
# 1) 2차 요청이 빠른 것을 확인
curl -s -o /dev/null -w "캐시 적중: %{time_total}s\n" "http://localhost:3000/companies"
# 2) 크론을 부른다 (실서비스 Supabase 에 동기화가 일어난다 — 사용자 승인 후 실행)
curl -s -X POST -o /dev/null "http://localhost:3000/api/sync/cron" \
  -H "authorization: Bearer $(grep '^CRON_SECRET=' .env.local | cut -d= -f2-)"
# 3) 무효화 후 첫 요청은 다시 느려야 한다
curl -s -o /dev/null -w "무효화 후: %{time_total}s\n" "http://localhost:3000/companies"
```

기대: 3)이 1)보다 뚜렷히 느리다. 같으면 무효화가 안 든 것이다.

⚠️ 이 단계는 **실서비스에 동기화를 일으킨다.** 사용자 승인 후 실행하고, 승인이 없으면 이 스텝을 건너뛰고 그 사실을 보고한다.

- [ ] **Step 3: 결과를 문서에 기록한다**

`docs/performance-plan.md` 에 최종 표를 넣는다 — 기준선 / 뷰 전환 후 / 캐싱 후 3열 비교, 1차·2차 분리. 그리고 2·3단계의 상태를 갱신한다(2단계 = 적용 완료로 표시).

`docs/superpowers/specs/2026-09-11-dashboard-loading-design.md` 의 "집계 SQL(B안)" 절에 **③ 재측정 결과로 정한 범위**를 적는다 — 어느 쿼리가 여전히 아픈지, matview 를 만들 대상이 무엇인지. 아픈 곳이 없으면 "B안 불필요"로 닫는다.

- [ ] **Step 4: 커밋**

```bash
git add docs/performance-plan.md docs/superpowers/specs/2026-09-11-dashboard-loading-design.md
git commit -m "docs(perf): 캐싱 적용 후 최종 측정과 B안 범위를 기록한다"
```

- [ ] **Step 5: PR 을 올린다**

```bash
git push -u origin 대시보드-로딩-개선-설계
```

PR 본문에 담을 것 — 기준선/뷰 전환 후/캐싱 후 3열 비교표, `searchParams` 때문에 2트랙으로 간 이유, `cacheComponents` 를 켜지 않은 이유, Task 1 의 160건 판정 결과, 그리고 후속(B안 범위 · 조회 계층 통합 · 낡은 AGENTS.md 3곳).

---

## 이 계획이 다루지 않는 것

스펙의 "하지 않는 것"을 그대로 따른다. 실행 중 손대고 싶어지면 **멈추고 사용자에게 물을 것.**

- **조회 계층 통합** — 16개 인라인 페이지네이션 루프를 `lib/fetch-rows.ts` 로 모으는 일. Task 5·6 이 두 페이지의 조회를 함수로 들어내지만, 그건 `unstable_cache` 가 모듈 스코프 함수를 요구해서다. **다른 14개 파일로 번지게 하지 말 것.**
- **`cacheComponents: true` / `'use cache'`** — Global Constraints 참조.
- **PostgREST 집계 함수 전역 켜기** — 스펙의 결정 사항.
- **Suspense 스트리밍** — Task 7 이후에 판단.
- **`rentre.config.json` 의 `type`·`observability` 절** — 마켓플레이스 스키마 마이그레이션. 배포(Task 2)와 같은 화면을 만지지만 별건이다.
- **낡은 AGENTS.md 3곳** — `vercel.json` 을 아직 설명하는 문서들. 별건.
- **레거시 페이지 성능** — 사이드바 `기타 분석` 아래.
