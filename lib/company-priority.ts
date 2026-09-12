/**
 * "지금 봐야 하는 곳" 판정 — 렌탈사 하나가 목록에 오를 이유를 만든다.
 *
 * 트리거별로 섹션을 나누지 않는 이유: 계약완료 급감과 리드타임 지연은 대개 같은
 * 원인의 두 얼굴이라, 트리거마다 줄을 세우면 같은 렌탈사가 여러 줄에 중복되고
 * "몇 군데를 봐야 하나"를 셀 수 없게 된다. 렌탈사 하나당 한 줄에 이유를 배지로 단다.
 *
 * 판정 축은 하나로 유지한다 — 페이스 판정은 lib/status.ts 의 judgeState 를 그대로
 * 쓴다. 화면에 판정 기준이 둘이면 읽는 사람이 뭘 믿을지 몰라진다.
 */
import { judgeState, STATE_META } from "@/lib/status";

export type PriorityFlag = {
  label: string;
  color: string;
  background: string;
};

/** 건당 공헌이익이 "급변"으로 보일 변화율 (%) */
const CPU_JUMP_PCT = 15;
/** 리드타임이 "급변"으로 보일 변화 (일) */
const LEAD_JUMP_DAYS = 2;

const SEV_WARN = {
  color: "var(--color-sev-warn)",
  background: "var(--color-sev-warn-100)",
};
const GOOD = {
  color: "var(--color-success)",
  background: "var(--color-success-100)",
};

export type Judgeable = {
  curr: number;
  prev: number;
  pace: number;
  cpu: number;
  cpuPrev: number;
  leadDays: number | null;
  leadDaysPrev: number | null;
};

/**
 * 이 렌탈사가 목록에 오를 이유들. 빈 배열이면 평소 범위다.
 *
 * 계약완료율은 여기 없다 — 이번 달 코호트가 아직 익지 않아(주문 후 30일에야
 * 84% 찬다) 전월과 견줄 수 없기 때문이다. 익은 값과 안 익은 값을 비교해
 * "급변"이라 부르면 시간차를 변화로 읽는 것이 된다. ① 에서 판정을 끈 것과 같은 이유.
 */
export function priorityFlags(c: Judgeable): PriorityFlag[] {
  const flags: PriorityFlag[] = [];

  const { state, idx } = judgeState(c.curr, c.pace);
  if (state === "crit") {
    flags.push({ label: "급감", ...STATE_META.crit });
  } else if (state === "check") {
    flags.push({
      label: idx >= 130 ? "급증" : "부진",
      ...STATE_META.check,
    });
  }

  // 건당 공헌이익 — 총액이 아니라 건당으로 본다. 물량이 빠지면 총액은 따라
  // 빠지지만 건당은 그대로일 수 있고, 그 둘은 다른 문제다.
  if (c.cpuPrev > 0) {
    const chg = ((c.cpu - c.cpuPrev) / c.cpuPrev) * 100;
    if (Math.abs(chg) >= CPU_JUMP_PCT) {
      flags.push(
        chg < 0
          ? { label: "건당 공헌이익 하락", ...SEV_WARN }
          : { label: "건당 공헌이익 상승", ...GOOD },
      );
    }
  }

  // 리드타임은 오르면 나쁜 지표다 — 방향색을 쓰지 않고 심각도색에 텍스트를 붙인다.
  if (c.leadDays !== null && c.leadDaysPrev !== null) {
    const d = c.leadDays - c.leadDaysPrev;
    if (Math.abs(d) >= LEAD_JUMP_DAYS) {
      flags.push(
        d > 0
          ? { label: "리드타임 지연", ...SEV_WARN }
          : { label: "리드타임 단축", ...GOOD },
      );
    }
  }

  return flags;
}

/**
 * 영향량 = 계약완료 절대 변화 건수.
 *
 * 비율로 줄을 세우면 몇 건만 움직여도 비율이 튀는 롱테일이 상단을 차지한다.
 * 건수로 재면 "규모가 큰 렌탈사의 이상 변화를 먼저"가 가중치 없이 그냥 나온다 —
 * 코웨이 -8.2% 는 -107건이고 넥센 -50% 는 -14건이다.
 */
export function impact(c: { curr: number; prev: number }) {
  return Math.abs(c.curr - c.prev);
}
