import { deltaArrow, deltaColor } from "@/app/components/home/cardKit";

/**
 * ① 전체 현황 — 렌탈사 홈의 맥락 줄.
 *
 * 이 화면의 주인공은 ②(지금 봐야 하는 곳)다. 여섯 지표를 같은 크기 타일로 늘어놓으면
 * 상단을 다 먹고 ②가 스크롤 아래로 밀려, 화면의 목적("어디를 먼저 볼까")과 배치가
 * 반대가 된다. 그래서 성격으로 나눠 크기를 두 단계로 준다.
 *
 *   규모   "얼마나"  24px — 계약완료 · 거래액 · 매출
 *   효율   "어떻게"  20px — 건당 공헌이익 · 계약완료율 · 주문→계약 소요일
 */

/** 비율·소요일의 데드존 — 기반값에 비례시킨다.
 *  고정 ±1.5 를 쓰면 기반이 낮은 지표(전환율 5%대)에서 진짜 신호가 묻힌다. */
function band(prevValue: number) {
  return Math.max(0.5, Math.abs(prevValue) * 0.015);
}

/**
 * 좋고 나쁨이 있는 지표 한 칸.
 *
 * 방향색을 쓰지 않는다 — 소요일은 오르면 나쁘고 전환율은 떨어지면 나쁘다. 방향색을
 * 쓰면 빨강이 "상승"과 "위험"을 동시에 뜻하게 되어 거짓말이 된다(DESIGN.md).
 * 심각도색에는 항상 텍스트 라벨을 붙인다 — 색만으로 뜻을 전하지 않는다.
 */
function QualityStat({
  label,
  value,
  unit,
  delta,
  baseline,
  deltaUnit,
  higherIsBetter,
  judged,
  note,
}: {
  label: string;
  value: string;
  unit: string;
  /** 전월 대비 변화량. null 이면 비교 기준이 없다 */
  delta: number | null;
  /** 밴드를 잡을 기준 = 전월값. 변화량 자신에서 뽑으면 순환한다 */
  baseline: number | null;
  deltaUnit: string;
  higherIsBetter: boolean;
  /**
   * 판정할 수 있는 비교인가. 미성숙 코호트처럼 분모의 성격이 두 기간에서 다르면
   * false 로 준다 — 익은 값과 안 익은 값을 견주고 "주의"라고 말하면 거짓말이다.
   */
  judged?: boolean;
  note?: string;
}) {
  const comparable = judged !== false;
  const flat =
    !comparable ||
    delta === null ||
    baseline === null ||
    Math.abs(delta) < band(baseline);
  const improved =
    comparable && delta !== null && (higherIsBetter ? delta > 0 : delta < 0);

  const color = flat
    ? "var(--color-gray-400)"
    : improved
      ? "var(--color-success)"
      : "var(--color-sev-warn)";
  const word = flat ? "" : improved ? "개선" : "주의";

  return (
    <div className="flex flex-col gap-[2px]">
      <span className="text-[11px] text-[var(--color-gray-500)]">{label}</span>
      <span className="flex items-baseline gap-[3px]">
        <b className="num text-[20px] leading-[28px] font-bold tracking-[-.3px] text-[var(--color-gray-900)]">
          {value}
        </b>
        <i className="text-[11px] font-medium not-italic text-[var(--color-gray-500)]">
          {unit}
        </i>
      </span>
      <span className="flex items-center gap-[5px] text-[11px]">
        <span className="num font-semibold" style={{ color }}>
          {delta === null || flat
            ? "—"
            : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}${deltaUnit}`}
        </span>
        {word && (
          <span className="font-semibold" style={{ color }}>
            {word}
          </span>
        )}
        {note && (
          <span className="text-[var(--color-gray-400)]">{note}</span>
        )}
      </span>
    </div>
  );
}

/** 규모 한 칸 — 증감이므로 방향색을 그대로 쓴다 */
function ScaleStat({
  label,
  value,
  unit,
  changePct,
  paceIdx,
}: {
  label: string;
  value: string;
  unit: string;
  changePct: number | null;
  /** 평소 페이스 대비 % — 건수에만 있다 */
  paceIdx?: number | null;
}) {
  return (
    <div className="flex flex-col gap-[2px]">
      <span className="text-[11px] text-[var(--color-gray-500)]">{label}</span>
      <span className="flex items-baseline gap-[3px]">
        <b className="num text-[24px] leading-[28px] font-bold tracking-[-.5px] text-[var(--color-gray-900)]">
          {value}
        </b>
        <i className="text-[12px] font-medium not-italic text-[var(--color-gray-500)]">
          {unit}
        </i>
      </span>
      <span className="flex items-center gap-[7px] text-[11px]">
        <span
          className="num font-semibold"
          style={{
            color:
              changePct === null
                ? "var(--color-gray-400)"
                : deltaColor(changePct),
          }}
        >
          {changePct === null
            ? "—"
            : `${deltaArrow(changePct)} ${Math.abs(changePct).toFixed(1)}%`}
        </span>
        {paceIdx !== undefined && paceIdx !== null && (
          <span className="text-[var(--color-gray-400)]">
            평소 대비 <b className="num font-semibold">{paceIdx.toFixed(0)}%</b>
          </span>
        )}
      </span>
    </div>
  );
}

export type OverviewProps = {
  /** 규모 */
  contracts: number;
  contractsPrev: number;
  /** 평소 페이스(최근 3개월 같은 기간 평균) 대비 % */
  contractsPaceIdx: number | null;
  amountEok: number;
  amountPrevEok: number;
  salesEok: number;
  salesPrevEok: number;
  /** 효율·속도 */
  cpu: number;
  cpuPrev: number;
  /** 0~1. 분모가 없으면 null */
  convRate: number | null;
  convRatePrev: number | null;
  /** 이번 달 코호트가 아직 익지 않았나 */
  convMature: boolean;
  leadDays: number | null;
  leadDaysPrev: number | null;
};

const pct = (c: number, p: number) => (p > 0 ? (c / p - 1) * 100 : null);

export default function Overview(p: OverviewProps) {
  return (
    <section className="rounded-[12px] border border-[var(--color-gray-200)] bg-white px-[17px] py-[15px] shadow-[0_1px_2px_rgba(28,35,56,.04),0_2px_8px_rgba(28,35,56,.05)]">
      <div className="grid grid-cols-2 gap-x-[26px] gap-y-[15px] sm:grid-cols-3 xl:grid-cols-6">
        <ScaleStat
          label="계약완료"
          value={p.contracts.toLocaleString("ko-KR")}
          unit="건"
          changePct={pct(p.contracts, p.contractsPrev)}
          paceIdx={p.contractsPaceIdx}
        />
        <ScaleStat
          label="거래액"
          value={p.amountEok.toFixed(1)}
          unit="억"
          changePct={pct(p.amountEok, p.amountPrevEok)}
        />
        <ScaleStat
          label="매출"
          value={p.salesEok.toFixed(1)}
          unit="억"
          changePct={pct(p.salesEok, p.salesPrevEok)}
        />

        <QualityStat
          label="건당 공헌이익"
          value={(p.cpu / 10_000).toFixed(1)}
          unit="만"
          delta={p.cpuPrev > 0 ? (p.cpu - p.cpuPrev) / 10_000 : null}
          baseline={p.cpuPrev > 0 ? p.cpuPrev / 10_000 : null}
          deltaUnit="만"
          higherIsBetter
        />
        <QualityStat
          label="계약완료율"
          value={p.convRate === null ? "—" : (p.convRate * 100).toFixed(1)}
          unit="%"
          delta={
            p.convRate === null || p.convRatePrev === null
              ? null
              : (p.convRate - p.convRatePrev) * 100
          }
          baseline={p.convRatePrev === null ? null : p.convRatePrev * 100}
          deltaUnit="%p"
          higherIsBetter
          // 이번 달 코호트가 안 익었으면 전월과 견줄 수 없다 — 판정을 끄고
          // 전월 값을 참고로만 적는다. "집계 중"이라 써놓고 옆에서 "주의"라고
          // 판정하면 라벨이 무색해진다.
          judged={p.convMature}
          note={
            p.convMature
              ? undefined
              : p.convRatePrev === null
                ? "집계 중"
                : `집계 중 · 전월 ${(p.convRatePrev * 100).toFixed(1)}%`
          }
        />
        <QualityStat
          label="주문→계약"
          value={p.leadDays === null ? "—" : p.leadDays.toFixed(1)}
          unit="일"
          delta={
            p.leadDays === null || p.leadDaysPrev === null
              ? null
              : p.leadDays - p.leadDaysPrev
          }
          baseline={p.leadDaysPrev}
          deltaUnit="일"
          higherIsBetter={false}
        />
      </div>

      {!p.convMature && (
        <p className="mt-[11px] border-t border-[var(--color-line-2)] pt-[9px] text-[11px] leading-[1.7] text-[var(--color-gray-400)]">
          계약완료율은 <b>주문확정 기준 코호트</b>다 — 이번 달 주문 중 계약까지 간
          비율. 전환은 주문확정 후 30일까지 이어지므로(7일 60.5% · 14일 75.5% · 30일
          84.0%) 이번 달 값은 <b>아직 오르는 중</b>이다. 값은 보정하지 않고, 익은
          전월과 견주지도 않는다 — 그 비교는 악화가 아니라 시간차를 재게 된다.
        </p>
      )}
    </section>
  );
}
