# 카테고리 성과 분석 화면 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/categories/{그룹}` 화면의 1차 분석축을 세부 카테고리에서 렌탈사로 옮기고, 브랜드·상품을 그 아래 드릴다운으로 세운다. 주문확정 KPI와 전환·리드타임 섹션을 새로 넣는다.

**Architecture:** 서버 컴포넌트가 계약완료 기준·주문확정 기준 두 레인으로 데이터를 받아 전부 집계하고, 렌탈사 선택 상태가 필요한 ③~⑤만 클라이언트 컴포넌트로 내려 보낸다. 집계 산식은 `lib/` 의 순수 함수로 빼서 단정 스크립트로 검증한다.

**Tech Stack:** Next.js 16 App Router (Server Components), React 19, TypeScript, Supabase JS, Tailwind 4

**Spec:** `docs/superpowers/specs/2026-09-12-category-analysis-redesign-design.md`

## Global Constraints

- **테스트 프레임워크가 없다.** jest·vitest·playwright 전부 없고 `test` 스크립트도 없다. **도입은 범위 밖이다.** 검증은 `npx tsc --noEmit` · `npm run lint` · `npm run build` + 단정 스크립트(`node`) + 페이지 렌더 대조로 한다. **거짓 테스트 코드를 쓰지 말 것.**
- **포트 4100 을 쓴다.** 3000 은 사용자의 dev 서버가 점유 중이다. `PORT=4100 npm run start`.
- **`product_name` 을 쓴다. `model_name` 으로 바꾸지 않는다.** 현행 `app/categories/[category]/page.tsx:283` 이 이미 `product_name` 을 쓰고 있다 — 이건 지킬 것이지 바꿀 것이 아니다. `model_name` 은 `LG WD523VCT` / `LG WD523VCT_` 처럼 표기가 흔들린다.
- **조건부 노출을 넣지 않는다.** 6그룹 전부 전 섹션을 그린다. 정수기처럼 1:1 로 붕괴하는 그룹도 그대로 그린다 (사용자 확정).
- **② 전환율에 절단 보정을 넣지 않는다.** 값이 실제보다 낮게 나오는 걸 알면서 넣는다 (사용자 확정). 스펙 "보류 항목" 참고.
- **③ 에 물량 임계를 두지 않는다.** 전 그룹 동일하게 그린다 (사용자 확정).
- 색 규칙: 증감에는 방향색(`--color-up` 증가 / `--color-down` 감소), 좋고 나쁨에는 심각도색. **섞지 않는다.** 심각도색에는 항상 텍스트 라벨을 붙인다.
- 모든 숫자에 `.num` 클래스 (`font-variant-numeric: tabular-nums`).
- 폰트 사이즈는 정수만. 신규 코드에 9px·13px·16px·19px·21px·22px 를 쓰지 않는다 (DESIGN.md 정리 대상).
- 인라인 하드코딩 색상 금지 — CSS 변수를 쓴다.

---

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `lib/conversion.ts` | 주문→계약 전환율·리드타임 순수 계산 | **신규** |
| `lib/category-aggregate.ts` | 축(렌탈사/브랜드/상품) 공통 집계 순수 함수 | **신규** |
| `app/categories/[category]/CategoryDrilldown.tsx` | ③④⑤ 렌더 + 렌탈사 선택 상태 소유 (클라이언트) | **신규** |
| `app/categories/[category]/page.tsx` | 데이터 fetch + 전 집계 + ①②⑥·세부카·BM 렌더 (서버) | 수정 (현재 792줄) |
| `app/components/home/WaterfallPanel.tsx` | `subMovers` 선택 필드 추가 | 수정 (홈도 사용 — 하위호환 필수) |

**스펙의 ⑥ 상품별 성과는 ③의 3단과 같은 것이다.** 스펙이 둘을 따로 적었지만 내용이
글자 그대로 동일하다("증가 TOP10 / 감소 TOP10, 브랜드·렌탈사 병기"). 같은 표를 한
화면에 두 번 그리지 않는다 — ③ 워터폴 바로 아래 한 번만 그린다. 스펙에도 이 사실을
반영해 뒀다.

**왜 `CategoryDrilldown.tsx` 가 필요한가:** 스펙상 ③의 2단 렌탈사 선택과 ⑤ 브랜드별 성과는 같은 선택 상태를 쓴다. 두 섹션이 ④를 사이에 두고 떨어져 있어 상태를 공유하려면 공통 부모가 있어야 한다. `?company=` URL 파라미터로 풀면 이 페이지는 `force-dynamic` 이라 클릭마다 전건 재조회가 일어난다(현재도 12개월 전 카테고리를 훑는다). 서버가 집계를 끝내고 결과만 내려보내면 선택이 즉시 반영된다. `?company=` 는 **초기값 전용**으로만 읽어 딥링크 공유를 살린다.

---

## Task 0: 기대값 스냅샷

검증에 쓸 실측 기대값을 먼저 굳힌다. `synced_at` 이 갱신되면 값이 달라지므로, 이 스냅샷을 찍은 시점을 기록하고 이후 태스크는 이 값과 대조한다.

**Files:**
- Create: `/tmp/category-expect.mjs` (작업용, 커밋하지 않는다)

**Interfaces:**
- Produces: 이후 모든 태스크가 대조할 기대값 표

- [ ] **Step 1: 단정 스크립트를 쓴다**

```bash
WS=.superpowers/sdd/2026-09-12-category-analysis-redesign
cat > "$WS/expect.mjs" <<'EOF'
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter(l => l.includes("=") && !l.trim().startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const BIG = ["에어컨","TV","세탁기+건조기","세탁기","건조기","냉장고","김치냉장고","식기세척기","의류관리기","냉동고","얼음정수기 냉장고"];

async function page(sel, col, start) {
  const out = []; let from = 0;
  while (true) {
    const { data, error } = await sb.from("raw_prop_items").select(sel)
      .not(col, "is", null).gte(col, start)
      .order("prop_item_usid", { ascending: true }).range(from, from + 49999);
    if (error) throw new Error(error.message);
    if (!data || !data.length) break;
    out.push(...data);
    if (data.length < 50000) break;
    from += 50000;
  }
  return out;
}

const { data: sy } = await sb.from("raw_prop_items").select("synced_at")
  .not("synced_at","is",null).order("synced_at",{ascending:false}).limit(1);
console.log("synced_at 최신 :", sy?.[0]?.synced_at);

// getPeriod 와 같은 규칙: curr = 이번 달 1일~(어제 또는 데이터 최신일), prev = 전월 같은 일자까지
const asOf = (await page("contract_date","contract_date","2026-01-01"))
  .reduce((m,r)=> r.contract_date > m ? r.contract_date : m, "2026-01-01");
const [Y,M,D] = asOf.split("-").map(Number);
const p2 = n => String(n).padStart(2,"0");
const C = [`${Y}-${p2(M)}-01`, asOf];
const pm = M === 1 ? 12 : M - 1, py = M === 1 ? Y - 1 : Y;
const P = [`${py}-${p2(pm)}-01`, `${py}-${p2(pm)}-${p2(D)}`];
console.log(`curr ${C[0]}~${C[1]}  prev ${P[0]}~${P[1]}\n`);

const cRows = await page("contract_date, rental_company, brand, category, product_name, total_rental_fee, sales, contribution_margin", "contract_date", P[0]);
const oRows = await page("order_confirmed_at, contract_date, rental_company, brand, category", "order_confirmed_at", P[0]);
const inR = (d,[a,b]) => d >= a && d <= b;

for (const [name, filt] of [["정수기", r => r.category === "정수기"], ["대형가전", r => BIG.includes(r.category)]]) {
  const g = cRows.filter(filt);
  const c = g.filter(r => inR(r.contract_date, C)), p = g.filter(r => inR(r.contract_date, P));
  const S = (a,f) => a.reduce((s,r)=>s+(f(r)??0),0);
  console.log(`### ${name}`);
  console.log(`  ① 계약건수 ${c.length} (전월동기 ${p.length})`);
  console.log(`  ① 거래액 ${(S(c,r=>r.total_rental_fee)/1e8).toFixed(1)}억  매출 ${(S(c,r=>r.sales)/1e8).toFixed(2)}억  건당공헌이익 ${(S(c,r=>r.contribution_margin)/(c.length||1)/1e4).toFixed(1)}만`);
  const o = oRows.filter(filt);
  const oc = o.filter(r => inR(r.order_confirmed_at, C));
  const conv = oc.filter(r => r.contract_date);
  const days = conv.map(r => (new Date(r.contract_date) - new Date(r.order_confirmed_at))/86400000).filter(d => d >= 0);
  console.log(`  ① 주문확정 ${oc.length}건`);
  console.log(`  ② 전환율 ${(conv.length/oc.length*100).toFixed(1)}%  평균 소요 ${(days.reduce((a,b)=>a+b,0)/(days.length||1)).toFixed(1)}일`);
  const d = k => { const m=new Map(); for(const r of c) m.set(k(r),(m.get(k(r))??0)+1);
    const q=new Map(); for(const r of p) q.set(k(r),(q.get(k(r))??0)+1);
    return [...new Set([...m.keys(),...q.keys()])].map(x=>({k:x, v:(m.get(x)??0)-(q.get(x)??0)}))
      .filter(x=>x.v!==0).sort((a,b)=>Math.abs(b.v)-Math.abs(a.v)); };
  console.log(`  ③1단 렌탈사 : ${d(r=>r.rental_company??"-").slice(0,5).map(x=>`${x.k} ${x.v>0?"+":""}${x.v}`).join(" · ")}`);
  console.log(`  ③3단 상품   : ${d(r=>`${r.brand} ${r.product_name}`).slice(0,3).map(x=>`${String(x.k).slice(0,28)} ${x.v>0?"+":""}${x.v}`).join(" · ")}`);
  const bc = new Map();
  for (const r of c) { const co = r.rental_company ?? "-";
    if (!bc.has(co)) bc.set(co, new Set()); bc.get(co).add(r.brand); }
  console.log(`  ⑤ 렌탈사별 브랜드수 : ${[...bc].sort((a,b)=>b[1].size-a[1].size).slice(0,4).map(([k,s])=>`${k} ${s.size}개`).join(" · ")}\n`);
}
EOF
node "$WS/expect.mjs"
```

**`/tmp` 에 두지 말 것** — node 는 스크립트 위치에서 위로 올라가며 `node_modules` 를 찾는다. 저장소 밖이면 `@supabase/supabase-js` 를 못 찾는다.

- [ ] **Step 2: 출력을 이 계획 파일 맨 아래 "기대값 스냅샷" 절에 붙여넣는다**

`synced_at` 값과 함께 기록한다. 이후 태스크의 검증은 이 표와 대조한다.

- [ ] **Step 3: 커밋 (계획 갱신분만)**

```bash
git add docs/superpowers/plans/2026-09-12-category-analysis-redesign.md
git commit -m "docs(plan): 카테고리 개편 검증용 기대값 스냅샷을 박는다"
```

---

## Task 1: 전환·리드타임 순수 함수

화면을 건드리기 전에 산식부터 세운다. 순수 함수라 단정 스크립트로 바로 검증된다.

**Files:**
- Create: `lib/conversion.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `ConvRow`, `ConvStats`, `conversionStats(rows: ConvRow[]): ConvStats` — Task 2·5 가 쓴다

- [ ] **Step 1: `lib/conversion.ts` 를 쓴다**

```ts
/**
 * 주문확정 → 계약완료 전환. 계약완료 = 설치완료다(사용자 확정, 2026-09-12) —
 * 별도 설치일 컬럼은 없고 필요하지도 않다.
 *
 * ⚠️ 절단 보정을 하지 않는다. 주문확정 후 전환이 익는 데 30일이 걸리는데
 * (정수기 실측: 7일 60.5% · 14일 75.5% · 30일 84.0%) 여기서는 기간 내 주문 전부를
 * 분모에 넣는다. 그래서 진행 중인 달의 값은 실제보다 낮게 나온다 — 알면서 넣은
 * 것이다. 스펙의 "보류 항목" 절 참고.
 */
export type ConvRow = {
  order_confirmed_at: string;
  contract_date: string | null;
};

export type ConvStats = {
  /** 분모 — 기간 내 주문확정 건수 */
  orders: number;
  /** 분자 — 그중 계약완료된 건수 */
  converted: number;
  /** 0~1. 분모가 0이면 null */
  rate: number | null;
  /** 전환된 건의 평균 소요일. 전환이 0건이면 null */
  avgDays: number | null;
};

const DAY = 86_400_000;

export function conversionStats(rows: ConvRow[]): ConvStats {
  const orders = rows.length;
  let converted = 0;
  let daySum = 0;
  let dayN = 0;
  for (const r of rows) {
    if (!r.contract_date) continue;
    converted += 1;
    // 계약일이 주문일보다 앞서는 행은 원천 오류다 — 평균에서만 뺀다.
    // 전환 자체는 일어났으므로 분자에서는 빼지 않는다.
    const d =
      (new Date(`${r.contract_date}T00:00:00`).getTime() -
        new Date(`${r.order_confirmed_at}T00:00:00`).getTime()) /
      DAY;
    if (d >= 0) {
      daySum += d;
      dayN += 1;
    }
  }
  return {
    orders,
    converted,
    rate: orders > 0 ? converted / orders : null,
    avgDays: dayN > 0 ? daySum / dayN : null,
  };
}
```

- [ ] **Step 2: 타입 검사**

Run: `npx tsc --noEmit`
Expected: 오류 없음

- [ ] **Step 3: 단정 스크립트로 산식을 실데이터에 대조한다**

```bash
node .superpowers/sdd/2026-09-12-category-analysis-redesign/expect.mjs | grep "② 전환율"
```

Expected: 정수기·대형가전 각각의 전환율과 평균 소요일이 출력된다. `expect.mjs` 는
`conversionStats` 와 **같은 산식**(분모 = 기간 내 주문확정 전건, 분자 = `contract_date`
가 있는 건, 평균은 음수 일수 제외)을 인라인으로 계산하므로, Task 5 에서 화면에 뜨는
값이 이 출력과 일치해야 한다. 여기서는 값을 기록만 한다.

- [ ] **Step 4: 린트**

Run: `npm run lint`
Expected: 무출력

- [ ] **Step 5: 커밋**

```bash
git add lib/conversion.ts
git commit -m "feat(lib): 주문→계약 전환율·리드타임 순수 함수를 세운다"
```

---

## Task 2: 축 집계 공통 순수 함수

렌탈사·브랜드·상품이 전부 같은 모양(당월/전월 건수 + 금액 3종)으로 집계된다. 세 번 쓰기 전에 한 번 만든다.

**Files:**
- Create: `lib/category-aggregate.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `AxisRow`, `AxisAgg`, `aggregateAxis<T>(currRows, prevRows, keyOf): AxisAgg[]` — Task 4·5·6 이 쓴다

- [ ] **Step 1: `lib/category-aggregate.ts` 를 쓴다**

```ts
/**
 * 축 공통 집계 — 렌탈사·브랜드·상품이 전부 같은 모양이라 한 함수로 낸다.
 * 정렬은 당월 건수 내림차순, 동률이면 전월 건수 내림차순.
 */
export type AxisRow = {
  total_rental_fee: number | null;
  sales: number | null;
  contribution_margin: number | null;
};

export type AxisAgg = {
  label: string;
  /** 당월 계약건수 */
  cnt: number;
  /** 전월 동기간 계약건수 */
  cntPrev: number;
  /** 원 단위 — 표시할 때 억/만으로 나눈다 */
  amount: number;
  sales: number;
  margin: number;
};

export function aggregateAxis<T extends AxisRow>(
  currRows: T[],
  prevRows: T[],
  keyOf: (r: T) => string,
): AxisAgg[] {
  const m = new Map<string, AxisAgg>();
  const at = (label: string) => {
    let a = m.get(label);
    if (!a) {
      a = { label, cnt: 0, cntPrev: 0, amount: 0, sales: 0, margin: 0 };
      m.set(label, a);
    }
    return a;
  };
  for (const r of currRows) {
    const a = at(keyOf(r));
    a.cnt += 1;
    a.amount += r.total_rental_fee ?? 0;
    a.sales += r.sales ?? 0;
    a.margin += r.contribution_margin ?? 0;
  }
  for (const r of prevRows) at(keyOf(r)).cntPrev += 1;
  return Array.from(m.values())
    .filter((a) => a.cnt > 0 || a.cntPrev > 0)
    .sort((a, b) => b.cnt - a.cnt || b.cntPrev - a.cntPrev);
}
```

- [ ] **Step 2: 타입 검사 + 린트**

Run: `npx tsc --noEmit && npm run lint`
Expected: 오류 없음, 무출력

- [ ] **Step 3: 커밋**

```bash
git add lib/category-aggregate.ts
git commit -m "feat(lib): 렌탈사·브랜드·상품이 함께 쓸 축 집계 함수를 뺀다"
```

---

## Task 3: `WaterfallPanel` 에 `subMovers` 를 더한다

**홈(`app/page.tsx`)이 같은 컴포넌트를 쓴다. 하위호환이 깨지면 안 된다.**

**Files:**
- Modify: `app/components/home/WaterfallPanel.tsx`

**Interfaces:**
- Consumes: 기존 `Mover`, `WaterfallMetric`
- Produces: `WaterfallMetric.subMovers?: Record<string, Mover[]>` — Task 5 가 채운다

- [ ] **Step 1: 타입에 선택 필드를 더한다**

`WaterfallMetric` 에 다음 필드를 추가한다 (기존 필드는 건드리지 않는다):

```ts
export type WaterfallMetric = {
  key: string;
  label: string;
  unit: string;
  decimals: number;
  changePct: number | null;
  items: WaterfallItem[];
  movers: Mover[];
  /**
   * movers 항목을 펼쳤을 때 나올 하위 축 (렌탈사 → 브랜드).
   * 없으면 기존처럼 펼치지 않는다 — 홈은 넘기지 않으므로 동작이 그대로다.
   */
  subMovers?: Record<string, Mover[]>;
};
```

- [ ] **Step 2: mover 항목을 펼칠 수 있게 만든다**

`MOVER_LIMIT` 로 잘라내는 `ups` / `downs` 렌더 부분(현재 146~147행 부근)에서, 각 mover 를 그릴 때 `m.subMovers?.[mover.label]` 이 있고 길이가 2 이상일 때만 펼침 토글을 붙인다.

```tsx
// 컴포넌트 상단 (다른 useState 옆)
const [openMover, setOpenMover] = useState<string | null>(null);

// mover 한 줄을 그리는 자리
const sub = m.subMovers?.[mover.label];
const expandable = !!sub && sub.length > 1;
// … 기존 줄 렌더 …
{expandable && (
  <button
    type="button"
    onClick={() =>
      setOpenMover(openMover === mover.label ? null : mover.label)
    }
    aria-expanded={openMover === mover.label}
    className="press ml-1 text-[10px] font-bold text-[var(--color-gray-400)] hover:text-[var(--color-gray-900)]"
  >
    {openMover === mover.label ? "접기" : `브랜드 ${sub.length}`}
  </button>
)}
{expandable && openMover === mover.label && (
  <ul className="mt-[6px] ml-[13px] border-l border-[var(--color-line-2)] pl-[11px]">
    {sub.map((s) => (
      <li
        key={s.label}
        className="flex justify-between py-[2px] text-[11px] text-[var(--color-gray-600)]"
      >
        <span>{s.label}</span>
        <span
          className="num font-semibold"
          style={{ color: deltaColor(s.value) }}
        >
          {signed(s.value, m.decimals)}
        </span>
      </li>
    ))}
  </ul>
)}
```

`sub.length > 1` 조건이 중요하다 — 정수기는 렌탈사당 브랜드가 1개라 펼쳐도 자기 자신이 나온다. 토글 자체를 안 만든다.

- [ ] **Step 3: 홈이 안 깨졌는지 확인한다**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 오류 없음

```bash
PORT=4100 npm run start &
sleep 8
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4100/
```
Expected: `200`. 브라우저로 `http://localhost:4100/` 을 열어 "무엇 때문에 변했나" 패널이 **이전과 똑같이** 보이는지 본다 — 펼침 토글이 하나도 없어야 한다(홈은 `subMovers` 를 안 넘긴다).

- [ ] **Step 4: 커밋**

```bash
git add app/components/home/WaterfallPanel.tsx
git commit -m "feat(waterfall): mover 를 하위 축으로 펼칠 수 있게 한다"
```

---

## Task 4: 주문확정 레인 추가 + ① KPI 5타일

**Files:**
- Modify: `app/categories/[category]/page.tsx` (fetch 부 84~90행 부근, KPI 배열 403~435행 부근)

**Interfaces:**
- Consumes: `fetchRows` (`lib/fetch-rows.ts`), `conversionStats` (Task 1)
- Produces: `orderRows` / `orderCurr` / `orderPrev` — Task 5·7 이 쓴다

- [ ] **Step 1: 주문확정 기준 조회를 더한다**

기존 `rows12` 조회 바로 아래에 넣는다. **컬럼을 최소로 잡는다** — 이 페이지는 이미 `force-dynamic` 에 12개월 전건을 훑는 가장 무거운 화면이라, 두 번째 레인은 필요한 컬럼만 받는다.

```ts
type OrderRow = {
  order_confirmed_at: string;
  contract_date: string | null;
  rental_company: string | null;
  brand: string | null;
  category: string | null;
};

const orderRows = await fetchRows<OrderRow>({
  basis: "order",
  select: "order_confirmed_at, contract_date, rental_company, brand, category",
  start: `${recentYms[0]}-01`,
  end: curr.end,
  orderBy: "prop_item_usid",
});
const orderGroupRows = orderRows.filter((r) => catGroupOf(r.category) === key);
const orderCurr = orderGroupRows.filter(
  (r) => r.order_confirmed_at >= curr.start && r.order_confirmed_at <= curr.end,
);
const orderPrev = orderGroupRows.filter(
  (r) => r.order_confirmed_at >= prev.start && r.order_confirmed_at <= prev.end,
);
```

- [ ] **Step 2: 주문확정 스파크라인을 만든다**

기존 `cntByYm` 루프 옆에 같은 방식으로 넣는다 (매월 1일~`dayCut` 절단).

```ts
const ordByYm = new Map<string, number>();
for (const r of orderGroupRows) {
  if (Number(r.order_confirmed_at.slice(8, 10)) > dayCut) continue;
  const ym = r.order_confirmed_at.slice(0, 7);
  ordByYm.set(ym, (ordByYm.get(ym) ?? 0) + 1);
}
const ordSpark = trimLeadingGap(recentYms.map((ym) => ordByYm.get(ym) ?? 0));
```

- [ ] **Step 3: KPI 배열 맨 앞에 주문확정 타일을 넣는다**

현재 4타일 배열(403행 부근)의 **첫 원소**로 넣고, 그리드를 5칸으로 바꾼다.

```tsx
{
  label: "주문확정",
  value: fmt(orderCurr.length),
  unit: "건",
  prev: `${fmt(orderPrev.length)}건`,
  delta: pct(orderCurr.length, orderPrev.length),
  spark: ordSpark,
},
```

그리드 클래스 (402행 부근):
```
- className="grid grid-cols-2 gap-px bg-[var(--color-line-2)] lg:grid-cols-4"
+ className="grid grid-cols-2 gap-px bg-[var(--color-line-2)] lg:grid-cols-5"
```

- [ ] **Step 4: 빌드 + 렌더 대조**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 오류 없음

```bash
PORT=4100 npm run start &
sleep 8
for g in 정수기 공청기·비데 대형가전 타이어 인터넷 기타; do
  printf "%s " "$g"
  curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:4100/categories/$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$g")"
done
```
Expected: 6개 전부 `200`

브라우저로 `/categories/정수기` 를 열어 **주문확정 타일의 값이 Task 0 의 `① 주문확정 N건` 과 일치**하는지 본다.

- [ ] **Step 5: 커밋**

```bash
git add app/categories/\[category\]/page.tsx
git commit -m "feat(categories): 주문확정 레인을 붙이고 KPI 를 5타일로 세운다"
```

---

## Task 5: ② 전환·리드타임 섹션

**Files:**
- Modify: `app/categories/[category]/page.tsx`

**Interfaces:**
- Consumes: `conversionStats` (Task 1), `orderCurr` / `orderPrev` (Task 4)
- Produces: `convCurr` / `convPrev` — **② 섹션에서만 쓴다.** ④ 표의 렌탈사별 전환율은 Task 6 이 `convByCompany` 로 따로 만든다

- [ ] **Step 1: 집계한다**

```ts
const convCurr = conversionStats(orderCurr);
const convPrev = conversionStats(orderPrev);
```

- [ ] **Step 2: 기존 ② 주석 마커를 먼저 개명한다**

현행 `page.tsx` 에 이미 `{/* ── ② 왜 변했나 ─────… */}` 주석이 있다. 새 ② 를 넣기
전에 그 줄을 바꿔 둔다 — 안 그러면 Task 6 이 "② 를 지운다"면서 방금 만든 섹션을 지운다.

```
- {/* ── ② 왜 변했나 ─────────────────────────────── */}
+ {/* ── (구) 왜 변했나 — Task 6 에서 CategoryDrilldown 으로 대체된다 ── */}
```

- [ ] **Step 3: 새 ② 섹션을 ① 바로 뒤에 넣는다**

```tsx
{/* ── ② 전환·리드타임 ─────────────────────────── */}
<section>
  <h2 className={`mb-[11px] ${sectionHead}`}>전환·리드타임</h2>
  <div className={`${panel} overflow-hidden`}>
    <dl className="grid grid-cols-2 gap-px bg-[var(--color-line-2)]">
      {[
        {
          label: "주문 → 계약완료 전환율",
          value: convCurr.rate === null ? "—" : (convCurr.rate * 100).toFixed(1),
          unit: convCurr.rate === null ? "" : "%",
          sub: `${fmt(convCurr.converted)} / ${fmt(convCurr.orders)}건`,
          delta:
            convCurr.rate !== null && convPrev.rate !== null
              ? pctAbs(convCurr.rate, convPrev.rate)
              : null,
        },
        {
          label: "주문 → 계약완료 평균 소요",
          value: convCurr.avgDays === null ? "—" : convCurr.avgDays.toFixed(1),
          unit: convCurr.avgDays === null ? "" : "일",
          sub:
            convPrev.avgDays === null
              ? "전월 동기간 —"
              : `전월 동기간 ${convPrev.avgDays.toFixed(1)}일`,
          delta:
            convCurr.avgDays !== null && convPrev.avgDays !== null
              ? pctAbs(convCurr.avgDays, convPrev.avgDays)
              : null,
        },
      ].map((k) => (
        <div key={k.label} className="bg-white p-[13px_15px_11px]">
          <dt className="mb-[5px] text-[11px] font-semibold text-[var(--color-gray-500)]">
            {k.label}
          </dt>
          <div className="flex items-end gap-2">
            <span className="num text-[24px] font-bold leading-[28px] tracking-[-.6px]">
              {k.value}
              {k.unit && (
                <i className="ml-0.5 text-[12px] font-semibold not-italic tracking-normal text-[var(--color-gray-500)]">
                  {k.unit}
                </i>
              )}
            </span>
            {k.delta !== null && <Delta value={k.delta} />}
          </div>
          <p className="num mt-[4px] text-[11px] text-[var(--color-gray-500)]">
            {k.sub}
          </p>
        </div>
      ))}
    </dl>
    <p className="border-t border-[var(--color-line-2)] bg-[var(--color-gray-25)] p-[8px_15px] text-[11px] text-[var(--color-gray-500)]">
      진행 중인 달은 아직 전환할 시간이 지나지 않은 최근 주문이 분모에 포함돼 값이
      실제보다 낮게 나온다. 전환은 주문확정 후 30일까지 이어진다.
    </p>
  </div>
</section>
```

캡션은 **빼지 말 것.** 절단 보정을 안 하기로 했으므로 값이 낮게 나오는 이유를 화면에 적어두지 않으면 읽는 사람이 오독한다.

- [ ] **Step 4: 빌드 + 렌더 대조**

Run: `npx tsc --noEmit && npm run lint && npm run build`

```bash
PORT=4100 npm run start &
sleep 8
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:4100/categories/%EC%A0%95%EC%88%98%EA%B8%B0"
```
Expected: `200`. 화면의 전환율·평균 소요일이 Task 0 의 `② 전환율 X% 평균 소요 Y일` 과 일치.
`(구) 왜 변했나` 워터폴도 아직 그대로 떠 있어야 한다 — Task 6 전까지는 안 지운다.

- [ ] **Step 5: 커밋**

```bash
git add app/categories/\[category\]/page.tsx
git commit -m "feat(categories): 전환·리드타임 섹션을 세운다"
```

---

## Task 6: ③④⑤ 를 클라이언트 컴포넌트로 내리고 렌탈사 축으로 갈아끼운다

이 태스크가 이 계획의 본체다. 서버는 집계만 하고, 렌탈사 선택 상태는 클라이언트가 갖는다.

**Files:**
- Create: `app/categories/[category]/CategoryDrilldown.tsx`
- Modify: `app/categories/[category]/page.tsx` (③④ 섹션 제거 후 이 컴포넌트로 대체)

**Interfaces:**
- Consumes: `AxisAgg` / `aggregateAxis` (Task 2), `ConvStats` / `conversionStats` (Task 1), `WaterfallMetric` (Task 3)
- Produces: `CategoryDrilldownProps` — page.tsx 가 채운다

- [ ] **Step 1: 서버에서 축 집계를 만든다** (`page.tsx`)

기존 `coMap` 블록(249~268행)을 지우고 대신 쓴다. `companyLabelOf` 를 그대로 써서 라벨 규칙을 유지한다.

```ts
// ── 축 집계 — 렌탈사(1차) · 렌탈사별 브랜드(2차) · 상품(3차) ──
const companies = aggregateAxis(currRows, prevRows, companyLabelOf);

const brandOf = (r: Row) => r.brand?.trim() || "(브랜드 없음)";
const brandByCompany: Record<string, AxisAgg[]> = {};
for (const co of companies) {
  brandByCompany[co.label] = aggregateAxis(
    currRows.filter((r) => companyLabelOf(r) === co.label),
    prevRows.filter((r) => companyLabelOf(r) === co.label),
    brandOf,
  );
}

// 렌탈사별 전환율·리드타임 — ④ 표의 열
const convByCompany: Record<string, ConvStats> = {};
for (const co of companies) {
  convByCompany[co.label] = conversionStats(
    orderCurr.filter((r) => companyLabelOf(r) === co.label),
  );
}
```

`Row` 타입에 `brand` 를 더해야 한다 (58행 부근):
```ts
- type Row = CardContractRow & { product_name: string | null };
+ type Row = CardContractRow & {
+   product_name: string | null;
+   brand: string | null;
+ };
```

그리고 `rows12` 의 `select` 에 `brand` 를 더한다 (86행):
```ts
select:
  "contract_date, rental_company, category, partner_company, total_rental_fee, contribution_margin, sales, product_name, brand",
```

`companyLabelOf` 는 `{rental_company, category}` 만 보므로 `OrderRow` 에도 그대로 쓸 수 있다.

`page.tsx` 에 더해야 하는 import:

```ts
import { aggregateAxis, type AxisAgg } from "@/lib/category-aggregate";
import { conversionStats, type ConvStats } from "@/lib/conversion";
import { type Mover } from "@/app/components/home/WaterfallPanel";
import CategoryDrilldown, {
  type ProductDelta,
} from "./CategoryDrilldown";
```

`WaterfallPanel` 의 직접 import 와 `CARD_DEFS`·`perDeal` 등 기존 import 중 이 변경으로
쓰이지 않게 된 것은 Task 7 Step 2 의 린트에서 걸러 지운다.

- [ ] **Step 2: 워터폴 1차축을 세부 카테고리에서 렌탈사로 바꾼다** (`page.tsx`)

기존 `waterfallMetrics` 블록(184~238행)에서 `catKeyOf` 를 `companyLabelOf` 로 바꾸고, `movers` 를 브랜드가 아니라 **`subMovers`** 로 옮긴다.

```ts
const waterfallMetrics: WaterfallMetric[] = METRIC_DEFS.map((def) => {
  const c = sumBy(currRows, companyLabelOf, def.of);
  const p = sumBy(prevRows, companyLabelOf, def.of);
  const currTotal = sum(currRows, def.of);
  const prevTotal = sum(prevRows, def.of);
  const subMovers: Record<string, Mover[]> = {};
  for (const co of companies) {
    subMovers[co.label] = diffMap(
      sumBy(currRows.filter((r) => companyLabelOf(r) === co.label), brandOf, def.of),
      sumBy(prevRows.filter((r) => companyLabelOf(r) === co.label), brandOf, def.of),
    ).map((x) => ({ label: x.key, value: x.value }));
  }
  return {
    key: def.key,
    label: def.label,
    unit: def.unit,
    decimals: def.decimals,
    changePct: pctAbs(currTotal, prevTotal),
    items: [
      { label: "전월 동기간", type: "total" as const, value: prevTotal },
      ...diffMap(c, p).map((g) => ({
        label: g.key,
        type: "delta" as const,
        value: g.value,
        href: coHref(g.key),
      })),
      { label: "이번 달", type: "total" as const, value: currTotal },
    ],
    movers: diffMap(c, p).map((x) => ({
      label: x.key,
      value: x.value,
      href: coHref(x.key),
    })),
    subMovers,
  };
});
```

`cpu` 지표도 같은 방식으로 바꾼다 — `cpuContribution(currRows, prevRows, catKeyOf, …)` 를 `companyLabelOf` 로, `movers` 도 `companyLabelOf` 기여로, `subMovers` 는 렌탈사별 `cpuContribution(…, brandOf, …)` 으로.

`catHref` 는 더 이상 워터폴에서 쓰지 않는다. 세부 카테고리 섹션(Task 7)에서 계속 쓰므로 **지우지 않는다.**

- [ ] **Step 3: `CategoryDrilldown.tsx` 를 쓴다**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import WaterfallPanel, {
  type WaterfallMetric,
} from "@/app/components/home/WaterfallPanel";
import { type AxisAgg } from "@/lib/category-aggregate";
import { type ConvStats } from "@/lib/conversion";
import { EOK, fmt, signedInt } from "@/lib/format";
import { manwon, deltaColor } from "@/app/components/home/cardKit";

export type ProductDelta = {
  product: string;
  company: string;
  brand: string;
  cnt: number;
  cntPrev: number;
  href?: string;
};

export default function CategoryDrilldown({
  groupKey,
  metrics,
  companies,
  brandByCompany,
  convByCompany,
  prodUp,
  prodDown,
  initialCompany,
  panelClass,
  sectionHead,
}: {
  groupKey: string;
  metrics: WaterfallMetric[];
  companies: AxisAgg[];
  brandByCompany: Record<string, AxisAgg[]>;
  convByCompany: Record<string, ConvStats>;
  prodUp: ProductDelta[];
  prodDown: ProductDelta[];
  /** ?company= 딥링크. 목록에 없으면 무시하고 1위 렌탈사를 연다. */
  initialCompany?: string;
  panelClass: string;
  sectionHead: string;
}) {
  const valid = companies.some((c) => c.label === initialCompany);
  const [selected, setSelected] = useState<string>(
    valid ? initialCompany! : (companies[0]?.label ?? ""),
  );
  const brands = brandByCompany[selected] ?? [];
  const totalCnt = companies.reduce((s, c) => s + c.cnt, 0);

  const th =
    "bg-[var(--color-gray-25)] p-[8px_12px] text-right text-[11px] font-bold whitespace-nowrap text-[var(--color-gray-400)]";
  const td = "p-[8px_12px] text-right whitespace-nowrap";

  return (
    <>
      {/* ── ③ 왜 변했나 ─────────────────────────────── */}
      <section>
        <h2 className={`mb-[11px] ${sectionHead}`}>
          이번 달 {groupKey}는 왜 변했나
        </h2>
        <WaterfallPanel metrics={metrics} panelClass={panelClass} />
        <div className={`${panelClass} mt-[11px] overflow-hidden`}>
          <h3 className="border-b border-[var(--color-line-2)] p-[11px_15px] text-[12px] font-semibold text-[var(--color-gray-600)]">
            어떤 상품이 움직였나
          </h3>
          <div className="grid gap-px bg-[var(--color-line-2)] md:grid-cols-2">
            {[
              { title: "증가 TOP10", list: prodUp },
              { title: "감소 TOP10", list: prodDown },
            ].map((col) => (
              <div key={col.title} className="bg-white p-[11px_15px_13px]">
                <p className="mb-[6px] text-[10px] font-bold tracking-wider text-[var(--color-gray-400)] uppercase">
                  {col.title}
                </p>
                {col.list.length === 0 ? (
                  <p className="text-[12px] text-[var(--color-gray-400)]">
                    해당 없음
                  </p>
                ) : (
                  <ul>
                    {col.list.map((p) => (
                      <li
                        key={`${p.company}/${p.product}`}
                        className="flex items-baseline justify-between gap-3 border-b border-[var(--color-line-2)] py-[5px] last:border-0"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[12px] font-medium text-[var(--color-gray-900)]">
                            {p.href ? (
                              <Link href={p.href} className="hover:underline">
                                {p.product}
                              </Link>
                            ) : (
                              p.product
                            )}
                          </span>
                          <span className="block text-[10px] text-[var(--color-gray-400)]">
                            {p.brand} · {p.company}
                          </span>
                        </span>
                        <DeltaCount value={p.cnt - p.cntPrev} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ④ 렌탈사별 성과 ─────────────────────────── */}
      <section>
        <h2 className={`mb-[11px] ${sectionHead}`}>렌탈사별 성과</h2>
        <div className={`${panelClass} overflow-x-auto`}>
          <table className="w-full min-w-[900px] bg-white text-[12px]">
            <thead>
              <tr>
                <th className={`${th} text-left`}>렌탈사</th>
                <th className={th}>계약</th>
                <th className={th}>전월</th>
                <th className={th}>증감</th>
                <th className={th}>점유율</th>
                <th className={th}>전환율</th>
                <th className={th}>리드타임</th>
                <th className={th}>거래액</th>
                <th className={th}>매출</th>
                <th className={th}>건당 공헌이익</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => {
                const cv = convByCompany[c.label];
                const on = c.label === selected;
                return (
                  <tr
                    key={c.label}
                    onClick={() => setSelected(c.label)}
                    className={`cursor-pointer border-t border-[var(--color-line-2)] ${
                      on
                        ? "bg-[var(--color-primary-50)]"
                        : "hover:bg-[var(--color-gray-25)]"
                    }`}
                  >
                    <td className="p-[8px_12px] text-left font-semibold">
                      {c.label}
                    </td>
                    <td className={`${td} num`}>{fmt(c.cnt)}</td>
                    <td className={`${td} num text-[var(--color-gray-500)]`}>
                      {fmt(c.cntPrev)}
                    </td>
                    <td className={td}>
                      <DeltaCount value={c.cnt - c.cntPrev} />
                    </td>
                    <td className={`${td} num`}>
                      {totalCnt > 0
                        ? `${((c.cnt / totalCnt) * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                    <td className={`${td} num`}>
                      {cv?.rate == null
                        ? "—"
                        : `${(cv.rate * 100).toFixed(0)}%`}
                    </td>
                    <td className={`${td} num`}>
                      {cv?.avgDays == null
                        ? "—"
                        : `${cv.avgDays.toFixed(1)}일`}
                    </td>
                    <td className={`${td} num`}>
                      {(c.amount / EOK).toFixed(2)}
                    </td>
                    <td className={`${td} num`}>{(c.sales / EOK).toFixed(2)}</td>
                    <td className={`${td} num`}>
                      {manwon(c.cnt > 0 ? c.margin / c.cnt : 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-[6px] text-[11px] text-[var(--color-gray-500)]">
          행을 누르면 아래 브랜드별 성과가 그 렌탈사로 바뀐다.
        </p>
      </section>

      {/* ── ⑤ 브랜드별 성과 ─────────────────────────── */}
      <section>
        <h2 className={`mb-[11px] ${sectionHead}`}>
          브랜드별 성과
          <span className="ml-2 text-[12px] font-semibold text-[var(--color-gray-500)]">
            {selected}
          </span>
        </h2>
        <div className={`${panelClass} overflow-x-auto`}>
          <table className="w-full min-w-[720px] bg-white text-[12px]">
            <thead>
              <tr>
                <th className={`${th} text-left`}>브랜드</th>
                <th className={th}>계약</th>
                <th className={th}>전월</th>
                <th className={th}>증감</th>
                <th className={th}>거래액</th>
                <th className={th}>매출</th>
                <th className={th}>건당 공헌이익</th>
              </tr>
            </thead>
            <tbody>
              {brands.map((b) => (
                <tr
                  key={b.label}
                  className="border-t border-[var(--color-line-2)]"
                >
                  <td className="p-[8px_12px] text-left font-semibold">
                    {b.label}
                  </td>
                  <td className={`${td} num`}>{fmt(b.cnt)}</td>
                  <td className={`${td} num text-[var(--color-gray-500)]`}>
                    {fmt(b.cntPrev)}
                  </td>
                  <td className={td}>
                    <DeltaCount value={b.cnt - b.cntPrev} />
                  </td>
                  <td className={`${td} num`}>{(b.amount / EOK).toFixed(2)}</td>
                  <td className={`${td} num`}>{(b.sales / EOK).toFixed(2)}</td>
                  <td className={`${td} num`}>
                    {manwon(b.cnt > 0 ? b.margin / b.cnt : 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
```

**`Delta` 를 건수 증감에 쓰지 말 것.** `app/components/Delta.tsx` 는 **증감률 전용**이다 — `unit` 기본값이 `%` 이고 ±1.5 데드존이 걸려 있어, 건수 `+1` 을 넘기면 회색 `—` 로 죽는다. 건수 증감은 이 파일 안에 로컬 헬퍼로 그린다 (`deltaColor` 의 `flatBand` 를 0 으로 눌러 데드존을 없앤다):

```tsx
import { signedInt } from "@/lib/format";
import { deltaColor } from "@/app/components/home/cardKit";

/** 건수 증감 — 비율이 아니라 절대 건수라 데드존(±1.5)을 쓰지 않는다 */
function DeltaCount({ value }: { value: number }) {
  if (value === 0)
    return <span className="num text-[var(--color-gray-400)]">—</span>;
  return (
    <span
      className="num font-semibold"
      style={{ color: deltaColor(value, 0) }}
    >
      {signedInt(value)}
      <i className="ml-0.5 text-[10px] font-medium not-italic text-[var(--color-gray-500)]">
        건
      </i>
    </span>
  );
}
```

위 JSX 의 `<Delta.Raw value={…} unit="건" />` 세 곳을 전부 `<DeltaCount value={…} />` 로 쓴다.

- [ ] **Step 4: `page.tsx` 에서 ③(세부 카테고리)·④(렌탈사 표) 섹션 JSX 를 걷어내고 컴포넌트를 꽂는다**

**행번호로 찾지 말 것.** Task 4·5 가 같은 파일에 조회 블록과 새 ② 섹션을 끼워 넣어
원래 계획을 쓸 때의 행번호가 전부 밀렸다. 아래 세 블록을 **JSX 주석 마커로 찾아** 지운다:

| 지울 블록 | 찾는 마커 |
|---|---|
| 구 워터폴 섹션 | `{/* ── (구) 왜 변했나 …` (Task 5 Step 2 가 개명해 둔 것) |
| 렌탈사별 성과 | `{/* ── ④ 렌탈사별 성과 …` |
| 상품·모델별 성과 | `{/* ── ⑤ 상품·모델별 성과 …` |

**`{/* ── ② 전환·리드타임 ── */}` 은 지우지 않는다** — Task 5 가 방금 만든 것이다.
`{/* ── ③ 세부 카테고리 ── */}` 와 `{/* ── ⑥ BM 구성 ── */}` 도 남긴다 (Task 7).

세 블록을 지운 자리(구 워터폴이 있던 곳)에 넣는다:

```tsx
<CategoryDrilldown
  groupKey={key}
  metrics={waterfallMetrics}
  companies={companies}
  brandByCompany={brandByCompany}
  convByCompany={convByCompany}
  prodUp={prodUp}
  prodDown={prodDown}
  initialCompany={(await searchParams)?.company}
  panelClass={panel}
  sectionHead={sectionHead}
/>
```

`searchParams` 를 받도록 시그니처를 바꾼다:

```ts
export default async function CategoryGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ company?: string }>;
}) {
```

`prodUp` / `prodDown` 은 기존 로직(311~319행)을 그대로 쓰되 `brand` 를 실어 보낸다:

```ts
const prodOf = (r: Row) => {
  const product = r.product_name?.trim() || "(상품명 없음)";
  const company = companyLabelOf(r);
  const brand = r.brand?.trim() || "(브랜드 없음)";
  const k = `${company} ${product}`;
  let a = prodMap.get(k);
  if (!a) {
    a = { product, company, brand, cnt: 0, cntPrev: 0 };
    prodMap.set(k, a);
  }
  return a;
};
```

`ProdAgg` 의 `amount` / `sales` / `margin` 은 새 상품 표가 안 쓰므로 뺀다 — **내 변경이 만든 미사용 필드는 지운다.**

`href` 는 기존 `prodHref`(320~323행)를 그대로 써서 `prodUp` / `prodDown` 을 만들 때 실어 보낸다:

```ts
const withHref = (list: ProdAgg[]): ProductDelta[] =>
  list.map((p) => ({ ...p, href: prodHref(p) }));
// …
prodUp={withHref(prodUp)}
prodDown={withHref(prodDown)}
```

`prodHref` 는 `COMPANY_LABELS.has(p.company)` 이고 상품명이 있을 때만 경로를 낸다 —
그 조건이 `ProductDelta.href` 가 선택 필드인 이유다.

- [ ] **Step 5: 빌드 + 전 그룹 렌더**

Run: `npx tsc --noEmit && npm run lint && npm run build`

```bash
PORT=4100 npm run start &
sleep 8
for g in 정수기 공청기·비데 대형가전 타이어 인터넷 기타; do
  printf "%s " "$g"
  curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:4100/categories/$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$g")"
done
curl -s -o /dev/null -w "?company= 딥링크 %{http_code}\n" "http://localhost:4100/categories/%EB%8C%80%ED%98%95%EA%B0%80%EC%A0%84?company=%EC%8A%A4%EB%A7%88%ED%8A%B8%EB%A0%8C%ED%83%88"
```
Expected: 전부 `200`

브라우저 대조 (Task 0 스냅샷과):
- `/categories/정수기` — ③ 워터폴 1단이 `코웨이 · LG · 쿠쿠 · 청호 · SK인텔릭스` 순, 값이 스냅샷의 `③1단 렌탈사` 와 일치
- `/categories/정수기` — 렌탈사 mover 에 **펼침 토글이 없어야 한다** (렌탈사당 브랜드 1개)
- `/categories/대형가전` — `스마트렌탈` mover 에 `브랜드 8` 토글이 있고, 눌렀을 때 브랜드 목록이 열린다
- ④ 표에서 다른 렌탈사 행을 누르면 ⑤ 제목의 렌탈사 이름과 표 내용이 바뀐다
- ③ 상품 증가 TOP10 1위가 스냅샷의 `③3단 상품` 1위와 일치

- [ ] **Step 6: 커밋**

```bash
git add app/categories/\[category\]/CategoryDrilldown.tsx app/categories/\[category\]/page.tsx
git commit -m "feat(categories): 1차축을 렌탈사로 옮기고 브랜드·상품 드릴다운을 세운다"
```

---

## Task 7: 섹션 순서 정리 + 최종 검증

**Files:**
- Modify: `app/categories/[category]/page.tsx`

- [ ] **Step 1: 순서를 스펙대로 맞춘다**

최종 순서:
```
탭
① 한눈에 보기        (KPI 5타일)
② 전환·리드타임
③④⑤ CategoryDrilldown
세부 카테고리        (기존 CategoryCards — 명세에 없지만 유지, 뒤로 민다)
BM(판매 채널)별 성과  (기존 BMMixBar — 유지, 맨 뒤)
```

세부 카테고리·BM 섹션은 **지우지 않는다.** 명세에 대응이 없지만 제거 요청도 없었다 (스펙 "명세에 없는 기존 섹션의 처리").

- [ ] **Step 2: 내 변경이 만든 미사용 심볼을 지운다**

`catKeyOf` 는 세부 카테고리 섹션이 계속 쓰므로 남긴다. 실제로 아무도 안 쓰게 된 것만 지운다:

```bash
npx tsc --noEmit
npm run lint
```
Expected: `no-unused-vars` 경고 0. 경고가 나오면 그 심볼만 지운다 — **내가 만들지 않은 미사용 코드는 건드리지 않는다.**

- [ ] **Step 3: 전체 검증**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

```bash
PORT=4100 npm run start &
sleep 8
# 6그룹
for g in 정수기 공청기·비데 대형가전 타이어 인터넷 기타; do
  printf "%-12s " "$g"
  curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:4100/categories/$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$g")"
done
# 기존 드릴다운 라우트 무손상
curl -s -o /dev/null -w "회사   %{http_code}\n" "http://localhost:4100/categories/%EC%A0%95%EC%88%98%EA%B8%B0/%EC%BD%94%EC%9B%A8%EC%9D%B4"
# 홈 무손상
curl -s -o /dev/null -w "홈     %{http_code}\n" "http://localhost:4100/"
```
Expected: 전부 `200`

- [ ] **Step 4: 스펙 검증표 8항목을 눈으로 대조한다**

`docs/superpowers/specs/2026-09-12-category-analysis-redesign-design.md` 의 "검증" 절 1~8 을 Task 0 스냅샷 값으로 하나씩 확인한다. 특히:

- **7번** — ⑥(=③ 3단) 증가 TOP10 과 감소 TOP10 에 **같은 상품이 동시에 오르지 않는다.** 오른다면 `product_name` 이 아니라 `model_name` 을 쓰고 있는 것이다.
- **8번** — `/categories/정수기/코웨이` 와 그 아래 상품 페이지가 그대로 동작한다.

- [ ] **Step 5: 커밋**

```bash
git add app/categories/\[category\]/page.tsx
git commit -m "refactor(categories): 섹션 순서를 명세대로 맞춘다"
```

---

## 기대값 스냅샷

`synced_at` 2026-09-10T15:05Z 기준, 2026-09-12 측정. 비교창은 `getPeriod` 와 같은
규칙(당월 1일~데이터 최신일 vs 전월 같은 일자).

**크론이 돌면 값이 달라진다.** 검증 시점에 값이 안 맞으면 먼저
`node .superpowers/sdd/2026-09-12-category-analysis-redesign/expect.mjs` 를 다시 돌려
스냅샷을 갱신하고, 그래도 안 맞으면 그때 코드를 의심한다.

```
synced_at 최신 : 2026-09-10T15:05:25.152+00:00
curr 2026-09-01~2026-09-10  prev 2026-08-01~2026-08-10

### 정수기
  ① 계약건수 1314 (전월동기 1187)
  ① 거래액 32.0억  매출 1.81억  건당공헌이익 11.3만
  ① 주문확정 1498건 (전월동기 1618)
  ② 전환율 42.8%  평균 소요 3.6일
  ③1단 렌탈사 : 코웨이 +175 · LG -52 · 쿠쿠 -6 · 교원웰스 +5 · KT +3
  ③3단 상품   : 코웨이 아이콘3 냉온정 정수기 +142 · LG 퓨리케어 오브제컬렉션 냉온정 정수기(맞춤출수, 초 -136 · LG 퓨리케어 오브제컬렉션 냉온정 정수기 베이지(맞춤출 +52
  ⑤ 렌탈사별 브랜드수 : 코웨이 1개 · LG 1개 · 청호 1개 · SK인텔릭스 1개

### 대형가전
  ① 계약건수 73 (전월동기 100)
  ① 거래액 2.1억  매출 0.32억  건당공헌이익 14.4만
  ① 주문확정 318건 (전월동기 464)
  ② 전환율 5.3%  평균 소요 3.9일
  ③1단 렌탈사 : KT -9 · BS렌탈 -8 · 코웨이 -6 · 이니렌탈 +5 · LG헬로비전 -4
  ③3단 상품   : 삼성 AI Q9000 2in1 에어컨 17+6평형 (2 -9 · 삼성 AI 세탁기 21kg + 건조기 21kg -5 · 코웨이 벽걸이에어컨 6평형 (에너지효율 1등급) -5
  ⑤ 렌탈사별 브랜드수 : 이니렌탈 3개 · 스마트렌탈 3개 · KT 2개 · BS렌탈 2개
```

**읽을 때 주의 — ② 전환율이 낮다.** 정수기 42.8% · 대형가전 5.3% 는 절단 때문이다
(주문확정 후 30일까지 전환이 이어지는데 분모에 최근 주문이 다 들어있다). 화면에
이 값이 그대로 나오는 게 **정상**이다 — 낮다고 산식을 고치지 말 것.

---

## 알려진 위험

| 위험 | 완화 |
|---|---|
| 조회 레인이 둘로 늘어 페이지가 더 무거워진다. 이 화면은 이미 `force-dynamic` 이고 12개월 전건을 훑는다 | 주문확정 레인은 컬럼 5개만 받는다. 그래도 느리면 주문확정 스파크라인을 12개월에서 6개월로 줄이는 게 첫 손질 지점이다 |
| `WaterfallPanel` 변경이 홈을 깬다 | `subMovers` 는 선택 필드다. Task 3 Step 3 에서 홈을 직접 열어 확인한다 |
| ② 전환율이 낮게 나와 오독된다 | 패널 하단 캡션으로 이유를 화면에 적는다 (Task 5 Step 2). 빼지 말 것 |
| 대형가전은 월 73건이라 ③ 증감이 노이즈와 구분 안 된다 | 이번 범위 밖. 스펙 "보류 항목"에 기록됨 |
| 정수기 ⑤ 가 렌탈사와 1:1 이라 무의미해 보인다 | 의도된 것(사용자 확정). 화면을 보고 뺄지 판단한다 |
