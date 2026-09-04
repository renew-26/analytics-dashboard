/**
 * 홈 화면의 기준 구간 계산.
 *
 * 동기화가 전일 기준으로 돌기 때문에 "어제"를 기준일로 잡는다.
 * 헤더(기준일 표기)와 페이지(집계)가 같은 구간을 써야 하므로
 * 두 곳에서 각자 계산하지 않고 여기 하나만 쓴다.
 *
 * 비교 창은 요일을 맞춘다 — 자세한 이유는 getPeriod 안의 주석 참고.
 */

import { createClient } from "@supabase/supabase-js";

function toLocalDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type Period = {
  curr: { start: string; end: string };
  prev: { start: string; end: string };
  /** 기준일이 속한 달 (1~12) */
  month: number;
  /** 기준일의 일자 — "최근 3개월 같은 기간" 창을 자를 때 쓴다 */
  day: number;
  /** 비교 창을 며칠 뒤로 밀었는지 (7의 배수). 페이스 기준을 맞출 때 쓴다 */
  shiftDays: number;
};

function addDays(d: Date, n: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/**
 * 비교 창을 며칠 뒤로 밀지 — 반드시 7의 배수여야 요일 구성이 보존된다.
 *
 * 4주(28일)가 기본이다. 창이 29일 이상이면 28일만 밀어서는 두 창이 겹치므로
 * 5주(35일)를 쓴다. 이때 비교 창이 두 달에 걸치지만, 요일 구성이 맞는 쪽이
 * 달 경계가 맞는 쪽보다 중요하다.
 */
export function shiftFor(dayCut: number) {
  return dayCut <= 28 ? 28 : 35;
}

/** ISO 날짜 문자열을 며칠 밀어 다시 ISO로 — 페이스 창을 자를 때 쓴다 */
export function shiftIso(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  return toLocalDateStr(new Date(y, m - 1, d + days));
}

/**
 * 기준일 — 데이터가 실제로 들어온 마지막 계약완료일.
 *
 * "어제"로 가정하면 동기화가 하루라도 밀린 날 curr 창의 마지막 날이 빈 채로
 * 집계돼 전 지표가 하루치만큼 낮게 찍힌다. 요일을 맞춘 비교 창은 항상 날 수가
 * 꽉 차 있어서 그 결손이 그대로 감소율로 보인다 — 2026-09-05 실측에서 9/4
 * 데이터가 없어 계약완료가 -29.0% 로 표시됐다(요일 보정 후 실제로는 -0.2%).
 *
 * 조회 실패 시 null 을 주고, 호출부는 getPeriod() 의 기본값(어제)으로 떨어진다.
 */
export async function getDataAsOf(): Promise<string | null> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data } = await supabase
      .from("raw_contracts")
      .select("contract_date")
      .order("contract_date", { ascending: false })
      .limit(1)
      .single();
    return data?.contract_date ?? null;
  } catch {
    return null;
  }
}

/**
 * @param asOf 기준일(YYYY-MM-DD). 넘기지 않으면 어제.
 *   넘긴 값이 어제보다 미래면 어제로 자른다 — 원천에 선날짜 행이 섞여도
 *   진행 중인 날을 기준일로 삼지 않게 한다.
 */
export function getPeriod(asOf?: string | null): Period {
  const today = new Date();
  const yesterday = addDays(today, -1);
  const asOfDate = asOf ? new Date(`${asOf}T00:00:00`) : null;
  const currEnd =
    asOfDate && asOfDate.getTime() < yesterday.getTime() ? asOfDate : yesterday;
  const currStart = new Date(currEnd.getFullYear(), currEnd.getMonth(), 1);
  const day = currEnd.getDate();

  // 비교 창은 일자가 아니라 "요일"을 맞춰 뒤로 민다.
  //
  // 일자로만 맞추면 월초 며칠 구간에서 한쪽 창에만 주말이 들어가 요일 구성
  // 차이가 실적 차이로 읽힌다. 2026-08-01~03 은 토·일·월이고 2026-09-01~03 은
  // 화·수·목이었는데, 일요일 계약완료는 39건(평일 220건의 18%)이라 전월 분모가
  // 무너져 실제로는 제자리인 달이 +66.1% 증가로 표시됐다.
  //
  // 7의 배수만 미루면 두 창의 요일 구성이 정확히 같아진다.
  const shiftDays = shiftFor(day);
  const prevStart = addDays(currStart, -shiftDays);
  const prevEnd = addDays(currEnd, -shiftDays);

  return {
    curr: { start: toLocalDateStr(currStart), end: toLocalDateStr(currEnd) },
    prev: { start: toLocalDateStr(prevStart), end: toLocalDateStr(prevEnd) },
    month: currEnd.getMonth() + 1,
    day,
    shiftDays,
  };
}

/** "2026.08.01 – 08.15" */
export function formatRange(start: string, end: string) {
  return `${start.replace(/-/g, ".")} – ${end.slice(5).replace("-", ".")}`;
}

/** "07.01–07.15" */
export function formatShortRange(start: string, end: string) {
  return `${start.slice(5).replace("-", ".")}–${end.slice(5).replace("-", ".")}`;
}
