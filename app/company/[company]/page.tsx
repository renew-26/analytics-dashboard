import { createClient } from "@supabase/supabase-js";
import { COMPANY_MAP } from "@/lib/company-map";
import CategoryTable from "@/app/components/CategoryTable";
import PositionChartModal from "@/app/components/PositionChartModal";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

interface RawRow {
  prop_item_usid: number;
  order_confirmed_at: string;
  total_rental_fee: number | null;
  contribution_margin: number | null;
  category: string | null;
  product_name: string | null;
  model_name: string | null;
  sales: number | null;
}

interface WeekStat {
  idx: number;
  label: string;
  weekStart: string;
  count: number;
  totalRentalFee: number;
  contributionMargin: number;
  marginPerContract: number;
}

// 기준: 2026-01-02(금)부터 7일 단위
const WEEK_REF = new Date("2026-01-02T00:00:00");

function getWeekIndex(dateStr: string): number {
  const d = new Date(dateStr);
  const diff = d.getTime() - WEEK_REF.getTime();
  return Math.max(0, Math.floor(diff / (7 * 24 * 60 * 60 * 1000)));
}

function getWeekStartDate(index: number): Date {
  const d = new Date(WEEK_REF);
  d.setDate(d.getDate() + index * 7);
  return d;
}

function getWeekLabel(index: number): { title: string; range: string } {
  const start = getWeekStartDate(index);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const month = start.getMonth() + 1;

  // 같은 달에서 몇 번째 주인지 계산
  let firstIndexInMonth = index;
  while (firstIndexInMonth > 0) {
    const prev = getWeekStartDate(firstIndexInMonth - 1);
    if (prev.getMonth() !== start.getMonth()) break;
    firstIndexInMonth--;
  }
  const weekNum = index - firstIndexInMonth + 1;

  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  return {
    title: `${month}월 ${weekNum}주차`,
    range: `${fmt(start)}~${fmt(end)}`,
  };
}

function aggregateByWeek(rows: RawRow[]): WeekStat[] {
  const map = new Map<
    number,
    { count: number; rental: number; margin: number }
  >();

  for (const row of rows) {
    const idx = getWeekIndex(row.order_confirmed_at);
    const cur = map.get(idx) ?? { count: 0, rental: 0, margin: 0 };
    cur.count += 1;
    cur.rental += row.total_rental_fee ?? 0;
    cur.margin += row.contribution_margin ?? 0;
    map.set(idx, cur);
  }

  return Array.from(map.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([idx, val]) => {
      const { title, range } = getWeekLabel(idx);
      return {
        idx,
        label: title,
        weekStart: range,
        count: val.count,
        totalRentalFee: val.rental,
        contributionMargin: val.margin,
        marginPerContract:
          val.count > 0 ? Math.round(val.margin / val.count) : 0,
      };
    });
}

function aggregateByCategory(
  rows: RawRow[],
  weekIndices: number[],
): { category: string; counts: number[]; total: number }[] {
  const map = new Map<string, Map<number, number>>();

  for (const row of rows) {
    const cat = row.category ?? "기타";
    const idx = getWeekIndex(row.order_confirmed_at);
    if (!map.has(cat)) map.set(cat, new Map());
    const wm = map.get(cat)!;
    wm.set(idx, (wm.get(idx) ?? 0) + 1);
  }

  return Array.from(map.entries())
    .map(([category, wm]) => {
      const counts = weekIndices.map((idx) => wm.get(idx) ?? 0);
      return { category, counts, total: counts.reduce((s, c) => s + c, 0) };
    })
    .sort((a, b) => (b.counts[0] ?? 0) - (a.counts[0] ?? 0));
}

interface ProductStat {
  product_name: string;
  model_name: string;
  count: number;
  sales: number;
}

function aggregateByCategoryProduct(
  rows: RawRow[],
): { category: string; products: ProductStat[] }[] {
  const catMap = new Map<
    string,
    Map<string, { count: number; sales: number }>
  >();

  for (const row of rows) {
    const cat = row.category ?? "기타";
    const key = `${row.product_name ?? ""}|${row.model_name ?? ""}`;
    if (!catMap.has(cat)) catMap.set(cat, new Map());
    const pm = catMap.get(cat)!;
    const cur = pm.get(key) ?? { count: 0, sales: 0 };
    cur.count += 1;
    cur.sales += row.sales ?? 0;
    pm.set(key, cur);
  }

  return Array.from(catMap.entries())
    .map(([category, pm]) => ({
      category,
      products: Array.from(pm.entries())
        .map(([key, val]) => {
          const [product_name, model_name] = key.split("|");
          return { product_name, model_name, ...val };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    }))
    .sort((a, b) => {
      const aTotal = a.products.reduce((s, p) => s + p.count, 0);
      const bTotal = b.products.reduce((s, p) => s + p.count, 0);
      return bTotal - aTotal;
    });
}

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ company: string }>;
}) {
  const { company } = await params;
  const label = decodeURIComponent(company);

  const mapping = COMPANY_MAP.find((c) => c.label === label);
  const dbName = mapping?.dbName;

  if (!dbName) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-800">{label}</h1>
        <p className="mt-2 text-sm text-gray-400">
          DB 매핑이 아직 설정되지 않았습니다.
        </p>
      </div>
    );
  }

  const allRows: RawRow[] = [];
  const PAGE = 1000;
  let from = 0;
  let fetchError = null;

  while (true) {
    let q = supabase
      .from("raw_orders")
      .select(
        "prop_item_usid, order_confirmed_at, total_rental_fee, contribution_margin, category, product_name, model_name, sales",
      )
      .eq("rental_company", dbName);

    if (mapping.categoryIs) q = q.eq("category", mapping.categoryIs);
    if (mapping.categoryNot) q = q.neq("category", mapping.categoryNot);

    const { data, error } = await q
      .gte("order_confirmed_at", "2026-01-01")
      .order("order_confirmed_at", { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) {
      fetchError = error;
      break;
    }
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const rows = allRows;
  const error = fetchError;

  if (error) {
    return (
      <div className="p-8">
        <p className="text-red-500">데이터 로드 오류: {error.message}</p>
      </div>
    );
  }

  const weeks = aggregateByWeek(rows ?? []);
  const totalCount = weeks.reduce((s, w) => s + w.count, 0);

  const weekIndices = weeks.map((w) => w.idx);
  const categoryStats = aggregateByCategory(rows ?? [], weekIndices);
  const categoryProductStats = aggregateByCategoryProduct(rows ?? []);

  // 카테고리 포지션
  const GROUP_CATEGORIES: Record<string, string[]> = {
    "가전&상조": [
      "TV",
      "세탁기+건조기",
      "에어컨",
      "냉장고",
      "로봇청소기",
      "무선청소기",
      "음식물처리기",
      "안마의자",
      "매트리스",
      "타이어",
    ],
    정수기: ["정수기", "공기청정기", "비데"],
  };
  const GROUP_COMPANIES: Record<string, string[]> = {
    정수기: ["SK인텔릭스", "코웨이", "쿠쿠", "청호", "LG"],
  };
  const positionCategories = GROUP_CATEGORIES[mapping.group] ?? [];
  const positionCompanies = GROUP_COMPANIES[mapping.group] ?? [];
  let growthRanks: {
    category: string;
    count: number;
    rank: number;
    total: number;
    share: number;
  }[] = [];
  let categoryAllData: Record<string, { company: string; count: number }[]> = {};

  if (positionCategories.length > 0) {
    const allGrowthRows: { rental_company: string; category: string }[] = [];
    let gFrom = 0;
    while (true) {
      let q = supabase
        .from("raw_orders")
        .select("rental_company, category")
        .in("category", positionCategories)
        .gte("order_confirmed_at", "2026-01-01");
      if (positionCompanies.length > 0)
        q = q.in("rental_company", positionCompanies);
      const { data, error } = await q.range(gFrom, gFrom + PAGE - 1);
      if (error || !data || data.length === 0) break;
      allGrowthRows.push(...data);
      if (data.length < PAGE) break;
      gFrom += PAGE;
    }

    if (allGrowthRows.length > 0) {
      const catMap = new Map<string, Map<string, number>>();
      for (const r of allGrowthRows) {
        if (!r.category || !r.rental_company) continue;
        if (!catMap.has(r.category)) catMap.set(r.category, new Map());
        const cm = catMap.get(r.category)!;
        cm.set(r.rental_company, (cm.get(r.rental_company) ?? 0) + 1);
      }

      growthRanks = positionCategories
        .flatMap((cat) => {
          const cm = catMap.get(cat);
          if (!cm) return [];
          if (mapping.categoryIs && mapping.categoryIs !== cat) return [];
          if (mapping.categoryNot && mapping.categoryNot === cat) return [];
          const myCount = cm.get(dbName) ?? 0;
          if (myCount === 0) return [];
          const sorted = Array.from(cm.values()).sort((a, b) => b - a);
          const rank = sorted.findIndex((v) => v <= myCount) + 1;
          const totalCnt = sorted.reduce((s, v) => s + v, 0);
          const share = totalCnt > 0 ? (myCount / totalCnt) * 100 : 0;
          return [
            { category: cat, count: myCount, rank, total: cm.size, share },
          ];
        })
        .sort((a, b) => b.count - a.count);

      // 카테고리별 전체 렌탈사 데이터
      for (const cat of positionCategories) {
        const cm = catMap.get(cat);
        if (!cm) continue;
        categoryAllData[cat] = Array.from(cm.entries())
          .map(([company, count]) => ({ company, count }))
          .sort((a, b) => b.count - a.count);
      }
    }
  }

  return (
    <div className="px-12 pt-5 pb-8">
      {/* 주차별 현황 */}
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-700">
          렌탈사 주차별 현황
        </h2>
        <span className="text-xs text-gray-400">
          주문확정 [Metric Deck 기준] · 총{" "}
          <span className="font-semibold text-gray-700">
            {fmt(totalCount)}건
          </span>
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl shadow-sm border border-gray-100 mb-10">
        <table
          className="text-sm bg-white"
          style={{ minWidth: `${180 + weeks.length * 140}px` }}
        >
          <thead>
            <tr className="border-b border-gray-100">
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white z-10 min-w-[140px]">
                지표
              </th>
              {weeks.map((w, i) => (
                <th
                  key={w.weekStart}
                  className={`px-4 py-3 text-center min-w-[130px] ${i === 0 ? "bg-indigo-50/60" : ""}`}
                >
                  <div className="font-semibold text-gray-700 text-xs">
                    {w.label}
                  </div>
                  <div className="text-gray-400 text-[11px] font-normal mt-0.5">
                    {w.weekStart}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* 계약건수 */}
            <tr className="border-t border-gray-50">
              <td className="px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white">
                주문건수
              </td>
              {weeks.map((w, i) => (
                <td
                  key={w.weekStart}
                  className={`px-4 py-3.5 text-center text-gray-800 ${i === 0 ? "bg-indigo-50/40" : ""}`}
                >
                  {fmt(w.count)}
                </td>
              ))}
            </tr>
            {/* 총렌탈료 */}
            <tr className="border-t border-gray-50">
              <td className="px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white">
                총렌탈료
              </td>
              {weeks.map((w, i) => (
                <td
                  key={w.weekStart}
                  className={`px-4 py-3.5 text-center text-gray-800 ${i === 0 ? "bg-indigo-50/40" : ""}`}
                >
                  {fmt(w.totalRentalFee)}
                </td>
              ))}
            </tr>
            {/* 공헌이익 */}
            <tr className="border-t border-gray-50">
              <td className="px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white">
                공헌이익
              </td>
              {weeks.map((w, i) => (
                <td
                  key={w.weekStart}
                  className={`px-4 py-3.5 text-center font-medium ${i === 0 ? "bg-indigo-50/40" : ""} ${w.contributionMargin >= 0 ? "text-emerald-600" : "text-red-500"}`}
                >
                  {fmt(w.contributionMargin)}
                </td>
              ))}
            </tr>
            {/* 건당공헌이익 */}
            <tr className="border-t border-gray-50">
              <td className="px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white">
                건당공헌이익
              </td>
              {weeks.map((w, i) => (
                <td
                  key={w.weekStart}
                  className={`px-4 py-3.5 text-center text-gray-600 ${i === 0 ? "bg-indigo-50/40" : ""}`}
                >
                  {fmt(w.marginPerContract)}
                </td>
              ))}
            </tr>
            {/* 전주 대비 */}
            <tr className="border-t-2 border-gray-200">
              <td className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white">
                전주 대비
              </td>
              {weeks.map((w, i) => {
                const prev = weeks[i + 1];
                if (!prev || prev.marginPerContract === 0) {
                  return (
                    <td
                      key={w.weekStart}
                      className={`px-4 py-3 text-center text-gray-300 text-xs ${i === 0 ? "bg-indigo-50/40" : ""}`}
                    >
                      -
                    </td>
                  );
                }
                const rate =
                  ((w.marginPerContract - prev.marginPerContract) /
                    Math.abs(prev.marginPerContract)) *
                  100;
                const isUp = rate > 0;
                return (
                  <td
                    key={w.weekStart}
                    className={`px-4 py-3 text-center text-xs font-bold ${i === 0 ? "bg-indigo-50/40" : ""} ${isUp ? "text-red-500" : "text-blue-500"}`}
                  >
                    {isUp ? "▲" : "▼"} {Math.abs(rate).toFixed(1)}%
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      {/* 카테고리별 현황 */}
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-700">
          카테고리별 현황
        </h2>
        <span className="text-xs text-gray-400">
          주문확정 [Metric Deck 기준]
        </span>
      </div>

      <CategoryTable
        categoryStats={categoryStats}
        weeks={weeks}
        totalCount={totalCount}
      />

      {/* 카테고리 포지션 */}
      {growthRanks.length > 0 && (
        <div className="mt-10">
          <div className="mb-4 flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-700">
              {mapping.group === "정수기"
                ? "정수기 & 크로스셀 내 포지션"
                : "성장카테고리 내 포지션"}
            </h2>
            <span className="text-xs text-gray-400">
              2026년 기준 · 주문확정
            </span>
            <PositionChartModal
              ranks={growthRanks}
              categoryAllData={categoryAllData}
              title={mapping.group === "정수기" ? "정수기 & 크로스셀 내 포지션" : "성장카테고리 내 포지션"}
              companyLabel={label}
              myDbName={dbName}
            />
          </div>
          <div className="overflow-x-auto rounded-xl shadow-sm border border-gray-100">
            <table className="text-sm bg-white w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider min-w-[160px]">
                    카테고리
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400">
                    건수
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 min-w-[100px]">
                    점유율
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 min-w-[120px]">
                    순위
                  </th>
                </tr>
              </thead>
              <tbody>
                {growthRanks.map((r) => (
                  <tr key={r.category} className="border-t border-gray-50">
                    <td className="px-5 py-3.5 text-gray-700">{r.category}</td>
                    <td className="px-4 py-3.5 text-right font-semibold text-gray-700">
                      {fmt(r.count)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold text-indigo-500">
                      {r.share.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span
                        className={`font-bold ${r.rank === 1 ? "text-amber-500" : r.rank <= 3 ? "text-indigo-500" : "text-gray-400"}`}
                      >
                        {r.rank}위
                      </span>
                      <span className="text-xs text-gray-300 ml-1">
                        / {r.total}개사
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 카테고리별 상위 상품 */}
      <div className="mt-10 mb-4 flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-700">
          카테고리별 상위 상품
        </h2>
        <span className="text-xs text-gray-400">
          주문확정 기준 · 카테고리별 상위 5개
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {categoryProductStats.slice(0, 3).map(({ category, products }) => (
          <div
            key={category}
            className="rounded-xl shadow-sm border border-gray-100 overflow-hidden"
          >
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {category}
              </span>
              <span className="text-xs text-gray-400">
                · 총{" "}
                <span className="font-semibold text-gray-600">
                  {fmt(products.reduce((s, p) => s + p.count, 0))}건
                </span>
              </span>
            </div>
            <table className="text-sm bg-white w-full table-fixed">
              <colgroup>
                <col style={{ width: "40%" }} />
                <col style={{ width: "30%" }} />
                <col style={{ width: "15%" }} />
                <col style={{ width: "15%" }} />
              </colgroup>
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-5 py-2.5 text-left text-xs font-bold text-gray-800">
                    제품명
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-800">
                    모델명
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-bold text-gray-800">
                    건수
                  </th>
                  <th className="px-5 py-2.5 text-right text-xs font-bold text-gray-800">
                    매출
                  </th>
                </tr>
              </thead>
              <tbody>
                {products.map((p, i) => (
                  <tr key={i} className="border-t border-gray-50">
                    <td className="px-5 py-3 text-gray-700 truncate">
                      {p.product_name || "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs truncate">
                      {p.model_name || "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-700">
                      {fmt(p.count)}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-700">
                      {fmt(p.sales)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
