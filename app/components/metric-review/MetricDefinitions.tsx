import { SOURCE, type Basis } from "@/lib/metric-review";

/** 회의에서 "이 숫자 뭐야"가 나오면 여기로 링크한다 */
export default function MetricDefinitions({ basis }: { basis: Basis }) {
  const s = SOURCE[basis];
  return (
    <details className="group">
      <summary className="text-sm font-semibold text-[var(--color-gray-700)] cursor-pointer list-none flex items-center gap-2 select-none">
        <span className="text-[var(--color-gray-400)] group-open:rotate-90 transition-transform inline-block">▶</span>
        지표 정의
      </summary>
      <div className="mt-3 rounded-xl bg-white border border-[var(--color-gray-200)] p-[17px] space-y-4">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
          <Def t="집계 기준">
            {s.label} — <code className="font-[family-name:var(--font-mono)]">{s.table}.{s.dateCol}</code>.
            Redash #{s.redash} 에서 매일 05:00(KST) 동기화된다.
          </Def>
          <Def t="전월 동기간">
            같은 <b>일자</b>까지 비교한다(9/1~9/7 ↔ 8/1~8/7). 요일을 맞추지 않으므로
            월초 며칠은 한쪽에만 주말이 들어갈 수 있다.
          </Def>
          <Def t="최근 3개월 평균">
            직전 3개 <b>완결</b>월의 합계 ÷ 그 기간 총 일수. 진행 중인 달은 넣지 않는다 —
            측정 대상이 기준선을 오염시키고 월초마다 선이 흔들린다. 완결월이 3개 미만이면
            있는 만큼 쓰고 개월 수를 밝힌다.
          </Def>
          <Def t="주문월 코호트">
            계약완료를 계약일이 아니라 <b>주문일</b>로 묶는다. 계약일로 나누면 지난달 주문이
            이번달 분자에 섞여 월초엔 낮고 월말엔 높아지는 &lsquo;달력&rsquo;이 나온다.
            집계 기준과 무관하게 같은 값이다.
          </Def>
          <Def t="거래건수">
            행 수(<code className="font-[family-name:var(--font-mono)]">prop_item_usid</code> 단위).
            수량 컬럼이 원천에 없어 수량을 반영하지 않는다.
          </Def>
          <Def t="BM 판정">
            <code className="font-[family-name:var(--font-mono)]">partner_company</code> →
            <code className="font-[family-name:var(--font-mono)]">lib/company-map.ts</code> 의
            getBM. 미매핑은 &ldquo;그 외&rdquo;로 묶는다.
          </Def>
        </dl>

        <div className="pt-3 border-t border-[var(--color-line-2)]">
          <h3 className="text-xs font-semibold text-[var(--color-gray-700)] mb-2">
            지금 제공하지 못하는 것 (원천 한계)
          </h3>
          <ul className="text-[11px] text-[var(--color-gray-600)] space-y-1 list-disc pl-4">
            <li><b>취소 건 분리</b> — <code className="font-[family-name:var(--font-mono)]">status</code> 컬럼이 현재 원천에 없다. 화면의 모든 건수는 취소 미반영이다.</li>
            <li><b>정확한 거래액</b> — <code className="font-[family-name:var(--font-mono)]">gmv</code>(요금면제·프로모션·정액할인 반영) 컬럼이 없어 구 정의(월렌탈료 × 기간)를 쓴다. 실측 3.5~4.5% 높게 잡힌다.</li>
            <li><b>수량</b> — <code className="font-[family-name:var(--font-mono)]">quantity</code> 컬럼이 없다.</li>
            <li><b>견적만 하고 만 건</b> — 원천에 주문까지 간 건만 있어 퍼널 첫 단계 분모가 운영시트보다 작다.</li>
            <li><b>상품조회·설치인증·설치후해지</b> — 원천에 없다. 운영시트가 별도 쿼리로 관리한다.</li>
          </ul>
          <p className="text-[10px] text-[var(--color-gray-400)] mt-2">
            위 다섯은 통합 원장(<code className="font-[family-name:var(--font-mono)]">raw_prop_items</code>) 이관이 끝나면 제공할 수 있다.
          </p>
        </div>
      </div>
    </details>
  );
}

function Def({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-semibold text-[var(--color-gray-700)] mb-0.5">{t}</dt>
      <dd className="text-[var(--color-gray-600)] leading-5">{children}</dd>
    </div>
  );
}
