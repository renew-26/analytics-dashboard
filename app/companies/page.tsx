import { fetchRows } from "@/lib/fetch-rows";
import { getPeriod, getDataAsOf } from "@/lib/period";
import { recentYmsOf } from "@/lib/format";
import {
  buildCompanyCards,
  countInstall90d,
  CARD_GROUP_ORDER,
  type CardContractRow,
} from "@/lib/company-cards";
import { resolveTier, TIER_META, TIER_ORDER, type Tier } from "@/lib/tiers";
import CompanyCards from "@/app/components/home/CompanyCards";

export const dynamic = "force-dynamic";

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
    select:
      "contract_date, rental_company, category, partner_company, total_rental_fee, contribution_margin, sales",
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
    tier: resolveTier(c.label, install90.get(c.label) ?? 0).tier,
  }));

  // 이번 달·전월 모두 거래가 없는 렌탈사는 카드로 세우지 않는다
  const visibleCards = withTier.filter((c) => c.curr > 0 || c.prev > 0);
  const cardGroups = CARD_GROUP_ORDER.filter((g) =>
    visibleCards.some((c) => c.group === g),
  );

  const tierCount = new Map<Tier, number>();
  for (const c of visibleCards)
    tierCount.set(c.tier, (tierCount.get(c.tier) ?? 0) + 1);

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

      <CompanyCards companies={visibleCards} groups={cardGroups} />

      <p className="text-[11px] leading-[1.7] text-[var(--color-gray-400)]">
        티어 기준: 티어 산정 문서(2026-07-10 스냅샷)에 명시된 렌탈사는 문서
        티어를 쓰고, 미명시 렌탈사는 직전 90일 계약완료(≒설치인증) 건수로
        폴백 판정한다(15건 이상 T2, 미만 T3 — 정본 산식의 상담량이 이 DB에
        없어 T1 승급은 폴백에서 판정하지 않는다).
      </p>
    </div>
  );
}
