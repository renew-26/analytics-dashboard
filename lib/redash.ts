const REDASH_URL = process.env.REDASH_URL!;
const REDASH_API_KEY = process.env.REDASH_API_KEY!;

/** Redash 쿼리 ID 통합 관리 */
export const REDASH_QUERY = {
  // analytics 기존 — 4678(견적신청&주문확정&계약완료 통합 원장)로 이관.
  // 4441(주문확정)/4445(계약완료)를 대체한다. 3개월 실측으로 동등성 확인:
  //   주문확정 27,440건 / 계약완료 17,822건 — USID 전건 일치, 공헌이익 불일치 0건.
  // 4678은 총렌탈료를 fn_calc_gmv로 계산해 요금면제·프로모션·정액할인을 반영한다
  // (구 쿼리의 단순곱 대비 3.5~4.5% 낮음 → gmv 컬럼에 적재, 상세는 sync/route.ts 참고).
  PROP_ITEMS: 4678,
  AUTO_QUOTE: 4404,
  AUTO_QUOTE_TYPEA: 4403,
  TPS_PNL: 4405,
  // tps 이관
  TPS_QUOTE: 4622,
  // 4441 유지 — buildApplianceMonthlyBest가 4678에 없는 `지원금`(수량 미반영 단가)을 쓰고
  // CONFIRMED_TS 단일 기준을 가정한다. 4678 전환은 집계 의미가 달라져 별도 검증 필요.
  APPLIANCE_ORDERS: 4441,
  APPLIANCE_SNAPSHOT: 4633,
  APPLIANCE_COMPETITOR: 38,
  SURVEY_APPLIANCE: 4671,
  SURVEY_TPS: 4657,
} as const;

export async function fetchRedashData(
  queryId: number,
  startDate?: string,
  endDate?: string,
  rowLimit: string | number = 100000,
  dateParamName: string = "조회기간",
): Promise<unknown[]> {
  const initRes = await fetch(`${REDASH_URL}/api/queries/${queryId}`, {
    headers: { Authorization: `Key ${REDASH_API_KEY}` },
  });
  const setCookie = initRes.headers.get("set-cookie") ?? "";
  const csrfMatch = setCookie.match(/csrf_token=([^;]+)/);
  const csrfRaw = csrfMatch?.[1] ?? "";
  const csrfToken = decodeURIComponent(csrfRaw).replace(/^"(.*)"$/, "$1");
  const sessionMatch = setCookie.match(/session=([^;]+)/);
  const cookieHeader = [
    csrfMatch ? `csrf_token=${csrfRaw}` : "",
    sessionMatch ? `session=${sessionMatch[1]}` : "",
  ]
    .filter(Boolean)
    .join("; ");

  const parameters: Record<string, unknown> = { row_limit: rowLimit };
  if (startDate && endDate) {
    parameters[dateParamName] = { start: startDate, end: endDate };
  }

  const jobRes = await fetch(`${REDASH_URL}/api/queries/${queryId}/results`, {
    method: "POST",
    headers: {
      Authorization: `Key ${REDASH_API_KEY}`,
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
      Cookie: cookieHeader,
    },
    body: JSON.stringify({ max_age: 0, parameters }),
  });

  const { job } = await jobRes.json();

  let resultId: number | null = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const statusRes = await fetch(`${REDASH_URL}/api/jobs/${job.id}`, {
      headers: { Authorization: `Key ${REDASH_API_KEY}`, Cookie: cookieHeader },
    });
    const { job: j } = await statusRes.json();
    if (j.status === 3) { resultId = j.query_result_id; break; }
    if (j.status === 4) throw new Error(`Redash job failed: ${j.error}`);
  }

  if (!resultId) throw new Error("Redash query timed out");

  const dataRes = await fetch(`${REDASH_URL}/api/query_results/${resultId}`, {
    headers: { Authorization: `Key ${REDASH_API_KEY}`, Cookie: cookieHeader },
  });
  const data = await dataRes.json();
  return data.query_result.data.rows;
}
