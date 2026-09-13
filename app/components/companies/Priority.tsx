import Link from "next/link";
import { TIER_META, type Tier } from "@/lib/tiers";
import { paceColor } from "@/lib/status";
import { deltaArrow, deltaColor } from "@/app/components/home/cardKit";
import { priorityFlags, impact } from "@/lib/company-priority";

/**
 * ② 지금 봐야 하는 곳 — 이 화면의 주인공.
 *
 * 스펙의 질문은 "누가 잘했는가"가 아니라 "어디를 먼저 확인해야 하는가"다. 그래서
 * 순위표가 아니라 "이유가 있는 곳만" 세운다. 이유가 없으면 목록에서 빠진다.
 *
 * ③ 렌탈사별 성과 표의 발췌다 — 같은 데이터, 같은 판정. 카드 클릭과 표 행 클릭이
 * 같은 곳으로 간다. 티어 필터는 ③ 에만 건다: 여기서 필터로 가리면 볼 곳을 숨기는
 * 셈이 된다.
 */

/** 몇 장까지 세울지 — 나머지는 ③ 표에서 본다 */
const LIMIT = 6;

export type PriorityCompany = {
  label: string;
  tier: Tier;
  curr: number;
  prev: number;
  pace: number;
  amount: number;
  sales: number;
  cpu: number;
  cpuPrev: number;
  leadDays: number | null;
  leadDaysPrev: number | null;
};

function Card({ c }: { c: PriorityCompany }) {
  const flags = priorityFlags(c);
  const delta = c.curr - c.prev;
  const chg = c.prev > 0 ? (c.curr / c.prev - 1) * 100 : null;
  const idx = c.pace > 0 ? (c.curr / c.pace) * 100 : null;
  const href = `/company/${encodeURIComponent(c.label)}`;

  return (
    <Link
      href={href}
      className="press group flex flex-col gap-[9px] rounded-[12px] border border-[var(--color-gray-200)] bg-white px-[15px] py-[13px] shadow-[0_1px_2px_rgba(28,35,56,.04),0_2px_8px_rgba(28,35,56,.05)] transition-colors duration-[var(--dur-hover)] ease-[var(--ease-out)] hover:border-[var(--color-primary-500)]"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-baseline gap-[6px]">
          <span
            className="rounded-[4px] px-[5px] py-0.5 text-[10px] font-bold"
            style={TIER_META[c.tier].chip}
            title={TIER_META[c.tier].desc}
          >
            {c.tier}
          </span>
          <b className="text-[15px] font-bold tracking-[-.3px] text-[var(--color-gray-900)] group-hover:text-[var(--color-primary)]">
            {c.label}
          </b>
        </span>
        {/* 목적지를 숨기지 않는다 — 이동 경로를 mono 로 병기한다 (DESIGN.md) */}
        <span className="hidden font-mono text-[10px] text-[var(--color-gray-400)] group-hover:text-[var(--color-primary)] sm:inline">
          {decodeURIComponent(href)}
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-[11px] gap-y-[3px]">
        <span className="flex items-baseline gap-[3px]">
          <b className="num text-[20px] leading-[28px] font-bold tracking-[-.3px] text-[var(--color-gray-900)]">
            {c.curr.toLocaleString("ko-KR")}
          </b>
          <i className="text-[11px] font-medium not-italic text-[var(--color-gray-500)]">
            건
          </i>
        </span>
        {/* 증감은 변화량이므로 방향색 그대로.
            건수를 앞에 둔다 — 목록의 정렬 키가 건수인데 비율만 보이면 왜 이 카드가
            여기 있는지 읽을 수 없다. 5건짜리 -54%가 773건짜리와 같은 크기로 서 있으면
            그 자체가 거짓 신호다. */}
        <span
          className="num text-[12px] font-semibold"
          style={{
            color: delta === 0 ? "var(--color-gray-400)" : deltaColor(delta),
          }}
        >
          {delta > 0 ? "+" : delta < 0 ? "−" : ""}
          {Math.abs(delta).toLocaleString("ko-KR")}건
          {chg !== null && (
            <span className="font-medium opacity-70">
              {" "}
              {deltaArrow(chg)} {Math.abs(chg).toFixed(1)}%
            </span>
          )}
        </span>
        {idx !== null && (
          <span className="text-[11px] text-[var(--color-gray-400)]">
            평소 대비{" "}
            <b
              className="num font-semibold"
              style={{ color: paceColor(idx) }}
            >
              {idx.toFixed(0)}%
            </b>
          </span>
        )}
      </div>

      {/* 이 렌탈사가 목록에 오른 이유. 색 단독으로 뜻을 전하지 않으므로 전부 텍스트다 */}
      <div className="flex flex-wrap gap-[5px]">
        {flags.map((f) => (
          <span
            key={f.label}
            className="rounded-[4px] px-[6px] py-[2px] text-[10px] font-bold"
            style={{ color: f.color, background: f.background }}
          >
            {f.label}
          </span>
        ))}
      </div>

      <div className="num border-t border-[var(--color-line-2)] pt-[8px] text-[11px] text-[var(--color-gray-500)]">
        거래액 {c.amount.toFixed(1)}억 · 매출 {c.sales.toFixed(1)}억 · 건당
        공헌이익 {(c.cpu / 10_000).toFixed(1)}만
      </div>
    </Link>
  );
}

export default function Priority({
  companies,
}: {
  companies: PriorityCompany[];
}) {
  // 이유가 있는 곳만 세우고, 영향량(절대 변화 건수) 큰 순으로 자른다
  const picked = companies
    .filter((c) => priorityFlags(c).length > 0)
    .sort((a, b) => impact(b) - impact(a))
    .slice(0, LIMIT);

  return (
    <section className="flex flex-col gap-[11px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] leading-[20px] font-bold tracking-[-.2px] text-[var(--color-gray-900)]">
          지금 봐야 하는 곳
        </h2>
        <span className="text-[11px] text-[var(--color-gray-400)]">
          평소 페이스(최근 3개월 같은 기간 평균) 대비 · 계약완료 변화 건수 큰 순
        </span>
      </div>

      {picked.length === 0 ? (
        <p className="rounded-[12px] border border-[var(--color-gray-200)] bg-white px-[17px] py-[22px] text-center text-[12px] text-[var(--color-gray-500)]">
          지금 특별히 볼 곳 없음 —{" "}
          <b className="num font-semibold text-[var(--color-gray-600)]">
            {companies.length}
          </b>
          개사 모두 평소 범위입니다.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-[11px] md:grid-cols-2 xl:grid-cols-3">
          {picked.map((c) => (
            <Card key={c.label} c={c} />
          ))}
        </div>
      )}

      <p className="text-[11px] leading-[1.7] text-[var(--color-gray-400)]">
        비율이 아니라 <b>변화 건수</b>로 줄을 세운다 — 비율로 재면 몇 건만 움직여도
        비율이 튀는 롱테일이 상단을 차지하고, 규모가 큰 렌탈사의 작은 변화가 밀린다.
        계약완료율은 이 판정에 넣지 않았다: 이번 달 코호트가 아직 익지 않아 전월과
        견주면 악화가 아니라 시간차를 재게 된다.
      </p>
    </section>
  );
}
