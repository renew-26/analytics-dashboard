import { fetchRows } from "@/lib/fetch-rows";
import { getPeriod, getDataAsOf } from "@/lib/period";
import { recentYmsOf } from "@/lib/format";
import {
  buildCompanyCards,
  countInstall90d,
  CARD_DEFS,
  matchesCompany,
  perDeal,
  type CardContractRow,
} from "@/lib/company-cards";
import { completionRate, conversionStats, type ConvRow } from "@/lib/conversion";
import { resolveTier, TIER_META, TIER_ORDER, type Tier } from "@/lib/tiers";
import CompanyCards from "@/app/components/home/CompanyCards";
import Overview from "@/app/components/companies/Overview";
import Priority from "@/app/components/companies/Priority";

/** fetch B 행 — 전환율 분모용. 렌탈사·카테고리는 COMPANY_MAP 매칭에만 쓴다 */
type OrderRow = ConvRow & {
  rental_company: string | null;
  category: string | null;
};

const DAY = 86_400_000;
/** 기준일로부터 오늘까지 며칠 지났나 — 코호트 성숙 판정용 */
function daysSince(ymd: string): number {
  return Math.floor((Date.now() - new Date(`${ymd}T00:00:00`).getTime()) / DAY);
}

// 크론(revalidatePath)이 실제 무효화를 담당하고,
// 이 값은 크론이 실패해도 캐시가 영구히 얼지 않게 하는 안전망이다.
export const revalidate = 86400;

/**
 * 전체 렌탈사 — 홈에 있던 렌탈사 카드 그리드의 새 집.
 * 홈은 "누가 변화를 만들었나"의 Top만 말하고, 렌탈사 단위의 탐색
 * (정렬·필터·티어)은 전부 이 화면이 맡는다.
 */
export default async function CompaniesPage() {
  const { curr, prev, day: dayCut } = getPeriod(await getDataAsOf());

  // 최근 12개월 창 — 스파크라인·평소 페이스·티어(90일)까지 이 한 번으로 충분
  const recentYms = recentYmsOf(curr.end);

  const rows = await fetchRows<CardContractRow>({
    // order_confirmed_at 은 리드타임(주문→계약 평균 소요일)용이다.
    // 이 fetch 는 basis "contract" 라 계약완료된 행만 오므로 계약완료율의 분모
    // (주문은 됐지만 아직 계약 전인 행)는 여기 없다 — 그건 별도 fetch 다.
    select:
      "contract_date, order_confirmed_at, rental_company, category, partner_company, gmv, contribution_margin, sales",
    start: `${recentYms[0]}-01`,
    end: curr.end,
    orderBy: "prop_item_usid",
  });

  const currContracts = rows.filter(
    (r) => r.contract_date >= curr.start && r.contract_date <= curr.end,
  );
  const prevContracts = rows.filter(
    (r) => r.contract_date >= prev.start && r.contract_date <= prev.end,
  );

  // fetch B — 계약완료율의 분모. 위 fetch 는 basis "contract" 라 계약된 행만 오므로
  // "주문은 됐지만 아직 계약 전"인 행이 통째로 빠져 있다. ① 이 쓰는 건 이번 달·전월
  // 두 구간뿐이라 12개월을 긁지 않는다.
  const orderRows = await fetchRows<OrderRow>({
    basis: "order",
    select: "order_confirmed_at, contract_date, status, rental_company, category",
    start: prev.start,
    end: curr.end,
    orderBy: "prop_item_usid",
  });

  // 점유율·합계의 분모와 같은 모집단을 쓴다 — COMPANY_MAP 에 있는 렌탈사만.
  // 여기서 안 맞추면 전환율 분모에만 취급 밖 렌탈사가 섞인다.
  const mapped = orderRows.filter((r) =>
    CARD_DEFS.some((d) => matchesCompany(d, r)),
  );
  const inWindow = (r: OrderRow, s: string, e: string) =>
    r.order_confirmed_at >= s && r.order_confirmed_at <= e;

  const convCurr = conversionStats(
    mapped.filter((r) => inWindow(r, curr.start, curr.end)),
  );
  const convPrev = conversionStats(
    mapped.filter((r) => inWindow(r, prev.start, prev.end)),
  );

  // 달 초에는 분자에 전월 주문의 계약이 섞여 비율이 높게 나온다 — 각주로 밝힌다.
  const earlyInMonth = Number(curr.end.slice(8, 10)) < 10;

  const cards = buildCompanyCards({
    currContracts,
    prevContracts,
    windowRows: rows,
    recentYms,
    dayCut,
  });

  // 티어 — 문서 스냅샷 우선, 미명시는 직전 90일 설치량(계약완료) 폴백
  const install90 = countInstall90d(rows, curr.end);
  const withTier = cards.map((c) => ({
    ...c,
    tier: resolveTier(install90.get(c.label) ?? 0),
  }));

  // 이번 달·전월 모두 거래가 없는 렌탈사는 카드로 세우지 않는다
  const visibleCards = withTier.filter((c) => c.curr > 0 || c.prev > 0);

  const tierCount = new Map<Tier, number>();
  for (const c of visibleCards)
    tierCount.set(c.tier, (tierCount.get(c.tier) ?? 0) + 1);

  // ① 전체 현황 — 카드 합계로 낸다. 카드가 이미 COMPANY_MAP 모집단이라
  // 점유율 분모와 같은 축이 된다.
  const sum = (f: (c: (typeof visibleCards)[number]) => number) =>
    visibleCards.reduce((s, c) => s + f(c), 0);
  const currSum = sum((c) => c.curr);
  const prevSum = sum((c) => c.prev);
  const paceSum = sum((c) => c.pace);
  // 리드타임 전체 평균은 건수 가중이어야 한다 — 렌탈사별 평균을 그냥 평균하면
  // 4건짜리 렌탈사가 6,000건짜리와 같은 무게를 갖는다.
  const weighted = (
    days: (c: (typeof visibleCards)[number]) => number | null,
    cnt: (c: (typeof visibleCards)[number]) => number,
  ) => {
    let num = 0;
    let den = 0;
    for (const c of visibleCards) {
      const d = days(c);
      if (d === null) continue;
      num += d * cnt(c);
      den += cnt(c);
    }
    return den > 0 ? num / den : null;
  };

  return (
    <div className="min-h-screen space-y-[18px] bg-[var(--color-page)] px-10 pt-8 pb-16">
      {/* 제목·기준 배지는 상단 헤더(Header.tsx)가 담당한다 — 본문은 티어 요약부터 */}
      <div>
        <div className="mb-[6px] text-[12px] text-[var(--color-gray-500)]">
          {visibleCards.length}개사 · 평소 페이스(최근 3개월 같은 기간 평균)
          대비 · 렌탈사 클릭 시 상세로 이동
        </div>
        {/* 티어 요약 — 색 단독 금지: 칩에 항상 T1/T2/T3 텍스트가 붙는다 */}
        <div className="flex flex-wrap items-center gap-x-[13px] gap-y-1.5">
          {TIER_ORDER.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-[6px] text-[11px] text-[var(--color-gray-500)]"
            >
              <span
                className="rounded-[4px] px-[5px] py-0.5 text-[10px] font-bold"
                style={TIER_META[t].chip}
              >
                {t}
              </span>
              {TIER_META[t].desc}
              <b className="num font-bold text-[var(--color-gray-600)]">
                {(tierCount.get(t) ?? 0).toLocaleString("ko-KR")}개사
              </b>
            </span>
          ))}
        </div>
      </div>

      <Overview
        contracts={currSum}
        contractsPrev={prevSum}
        contractsPaceIdx={paceSum > 0 ? (currSum / paceSum) * 100 : null}
        amountEok={sum((c) => c.amount)}
        amountPrevEok={sum((c) => c.amountPrev)}
        salesEok={sum((c) => c.sales)}
        salesPrevEok={sum((c) => c.salesPrev)}
        cpu={perDeal(sum((c) => c.cpu * c.curr), currSum)}
        cpuPrev={perDeal(sum((c) => c.cpuPrev * c.prev), prevSum)}
        convRate={completionRate(currSum, convCurr.orders)}
        convRatePrev={completionRate(prevSum, convPrev.orders)}
        earlyInMonth={earlyInMonth}
        leadDays={weighted(
          (c) => c.leadDays,
          (c) => c.curr,
        )}
        leadDaysPrev={weighted(
          (c) => c.leadDaysPrev,
          (c) => c.prev,
        )}
      />

      <Priority companies={visibleCards} />

      <CompanyCards companies={visibleCards} />

      <p className="text-[11px] leading-[1.7] text-[var(--color-gray-400)]">
        티어 기준: 직전 90일 계약완료(≒설치인증) 건수 하나로 판정한다 —
        1,500건 이상 T1, 100건 이상 T2, 미만 T3. 문서 정본 산식의 상담량이 이
        DB에 없어 설치량만 쓰며, 컷은 설치량 분포에서 다시 잡았다(T1 4사 점유
        76%로 문서 분포와 일치).
      </p>
    </div>
  );
}
