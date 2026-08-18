# 지원금 미입력 항목에 렌트리 현재 지원금 비교 표시 — 설계

## 배경 및 목적

`/margin-analysis` (타사 비교) 페이지에서 조사 파일을 업로드하면, 경쟁사 지원금 값을 시트에서 읽을 수 없는 행은 "지원금 미입력"으로 분류되어 화면에 경고 목록으로만 표시된다. 이 행들은 현재 렌트리 상품과의 매칭 단계 자체를 건너뛰기 때문에, 경쟁사 지원금은 없더라도 참고할 수 있는 "렌트리 현재 지원금" 값조차 보여주지 못한다.

이 기능은 지원금 미입력 행도 렌트리 상품 매칭까지는 진행시켜, 매칭된 상품의 렌트리 현재 지원금을 미입력 패널에 함께 표시한다. 담당자가 원본 시트를 확인하러 가기 전에, 최소한 "이 상품의 렌트리 지원금은 얼마인지"를 화면에서 바로 참고할 수 있게 하는 것이 목적이다.

## 현재 동작 (변경 전)

`app/api/margin-analysis/survey-upload/route.ts`의 인터넷/유심/가전 3개 처리 루프 모두 동일한 패턴이다:

```ts
if (entry.subsidy_missing) {
  subsidyMissingOut.push({ ...entry, category });
  continue; // 매칭 시도 자체를 하지 않음
}
const { record, matched } = buildCompetitorRecordFromTps(...); // or FromAppliance
```

`subsidyMissingOut`은 API 응답의 `subsidyMissing` 필드로 그대로 반환되고, `MarginAnalysisClient.tsx`가 "지원금 미입력 항목" 패널(카테고리/파트너명/모델명 3열, 헤더 없음)에 렌더링한다. 렌트리 지원금 조회나 상품 매칭은 전혀 일어나지 않는다.

## 데이터 소스 결정

렌트리 현재 지원금은 `/margin-analysis` 페이지의 정상 비교 카드가 이미 쓰는 것과 **동일한 소스**를 재사용한다:
- TPS/유심: `products.effective_subsidy` (Q4622 동기화)
- 가전: `appliance_rentre_subsidy.doublecheck_subsidy` (Q4633 동기화, `product_id`로 조회)

(비교 검토했던 대안: `/survey-selection/{tps,appliance}` 페이지가 쓰는 Redash 라이브 소스(Q4657/Q4671)는 식별키가 더 세분화되어 있고(TPS 3필드, 가전 6필드) `products.id`와 연결하는 다리가 없어, 업로드 API에 Redash 라이브 호출과 별도 매칭 레이어를 새로 추가해야 한다는 점에서 기각. 기존 소스는 이미 매칭에 쓰는 `product_id`에 직결되어 있어 재사용이 단순하다.)

## 설계

### 1. 백엔드 (`app/api/margin-analysis/survey-upload/route.ts`)

**매칭 호출 순서 변경**: 각 루프에서 `buildCompetitorRecordFromTps`/`buildCompetitorRecordFromAppliance` 호출을 `subsidy_missing` 분기 이전으로 옮긴다. 이 함수들은 지원금 값과 무관하게 통신사+상품명(TPS) / 모델명+계약기간(가전)만으로 매칭하므로, 지원금 미입력 여부와 상관없이 그대로 재사용 가능하다.

인터넷/유심 루프:
```ts
const { record, matched } = buildCompetitorRecordFromTps(entry, tpsProducts, entry.survey_year, entry.survey_month);
if (entry.subsidy_missing) {
  const rentreSubsidy = matched && record?.product_id
    ? tpsEffectiveSubsidyById.get(record.product_id) ?? null
    : null;
  subsidyMissingOut.push({ ...entry, category: "tps" /* or "usim" */, rentreSubsidy });
  continue;
}
// 이하 기존 matched 분기 로직 그대로
```

가전 루프: 현재 `row` 객체 생성과 `buildCompetitorRecordFromAppliance` 호출은 `subsidy_missing` 체크(219~223행) 이후, matched 분기(224~225행)에서만 이뤄진다. 이 호출을 체크보다 먼저 실행하도록 옮긴다.
```ts
const row = { "모델명": entry.model_number, "파트너사": entry.partner_name, "브랜드명": entry.brand, "지원금": entry.subsidy, "제품 카테고리": "appliance", "계약기간": entry.contract_period };
const { record, matched } = buildCompetitorRecordFromAppliance(row, applianceProducts, entry.survey_year, entry.survey_month);
if (entry.subsidy_missing) {
  const snapshot = matched && record?.product_id ? applianceSnapshotLookup.get(record.product_id) : undefined;
  subsidyMissingOut.push({ ...entry, category: "appliance", rentreSubsidy: snapshot?.doublecheckSubsidy ?? null });
  continue;
}
// 이하 기존 matched 분기 로직 그대로 (row/record 재사용)
```

**TPS 렌트리 지원금 조회 준비**:
- `fetchAllActiveProducts`의 select 컬럼에 `effective_subsidy` 추가 (현재 `"id, telecom, name, model_number, brand, contract_period"`만 조회 중).
- 매핑 전 원본 배열을 별도로 보관해 `id → effective_subsidy` 맵을 만든다:
```ts
const tpsProductsRaw = needsTpsProducts ? await fetchAllActiveProducts("tps") : [];
const tpsProducts: TpsProductLookup[] = tpsProductsRaw.filter(p => p.telecom && p.name).map(p => ({ id: p.id, telecom: p.telecom as string, name: p.name }));
const tpsEffectiveSubsidyById = new Map(tpsProductsRaw.map(p => [p.id, p.effective_subsidy as number | null]));
```

**단순화 (사용자 확정)**: 매칭 실패와 "매칭은 됐지만 렌트리 지원금 데이터 없음"을 구분하지 않는다. `subsidyMissingOut` 각 항목에는 `rentreSubsidy: number | null` 필드 하나만 추가하면 충분하다 — `matched` 여부를 별도로 넘길 필요 없음. `null`이면 사유(매칭 실패든 데이터 없음이든)와 무관하게 UI에서 동일하게 처리한다.

**DB 쓰기 없음**: 기존과 동일하게 지원금 미입력 행은 `competitor_subsidies`에 저장하지 않는다. 이번 업로드 응답 안에서만 표시되는 일회성 데이터다.

### 2. 프런트엔드 (`app/components/tps/MarginAnalysisClient.tsx`)

"지원금 미입력 항목" 패널(현재 630~645행)에 4번째 열 "렌트리 지원금"을 추가하고, 헤더 행을 새로 넣는다 (현재 `<tbody>`만 있고 헤더가 없어 열 의미가 불명확했으므로 이번에 함께 정리).

```tsx
<table className="w-full text-xs">
  <thead>
    <tr className="text-gray-400">
      <td className="py-1.5 pr-3">카테고리</td>
      <td className="py-1.5 pr-3">파트너사</td>
      <td className="py-1.5 pr-3">모델명</td>
      <td className="py-1.5 pr-3">렌트리 지원금</td>
    </tr>
  </thead>
  <tbody>
    {subsidyMissing.map((entry, i) => (
      <tr key={i} className="border-b border-gray-50">
        <td className="py-1.5 pr-3">{String(entry.category ?? '')}</td>
        <td className="py-1.5 pr-3">{String(entry.partner_name ?? '')}</td>
        <td className="py-1.5 pr-3">{String(entry.model_name ?? entry.model_number ?? '')}</td>
        <td className="py-1.5 pr-3">
          {entry.rentreSubsidy != null
            ? formatKRW(Number(entry.rentreSubsidy))
            : <span className="text-gray-400">렌트리 매칭 안 됨</span>}
        </td>
      </tr>
    ))}
  </tbody>
</table>
```

`formatKRW`는 기존 헬퍼(34행)를 그대로 재사용한다.

## 적용 범위

인터넷/유심/가전 3개 카테고리 모두 동일한 방식 적용 (사용자 확정).

## 비목표 (YAGNI)

- 지원금 미입력 행을 `competitor_subsidies`에 저장하는 것 — 하지 않음, 기존과 동일하게 일회성 표시로 유지.
- survey-selection(Q4657/Q4671) 라이브 소스로 전환 — 검토 후 기각, 기존 동기화 소스 재사용.
- 매칭 실패/데이터 없음 사유 구분 표시 — 하나로 통합.

## 테스트 전략

- `npm run build`, `npm run lint` 통과 확인.
- 로컬에서 지원금 미입력 행이 포함된 조사 파일(인터넷/유심/가전 각각)을 업로드해 "지원금 미입력" 패널에 렌트리 지원금 금액 또는 "렌트리 매칭 안 됨"이 올바르게 표시되는지 수동 확인.
- 기존 매칭/미매칭/교차검증 플로우가 이번 변경으로 회귀하지 않았는지 함께 확인 (정상 지원금 입력 행의 업로드 결과가 기존과 동일한지).
