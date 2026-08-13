"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ModelOption, PartnerRow, PartnerProfile } from "./page";

type Props = {
  modelOptions: ModelOption[];
  selectedModel: string | null;
  selectedInfo: ModelOption | null;
  partnerRows: PartnerRow[];
  partnerProfiles: PartnerProfile[];
  initialCategory?: string;
  initialBrand?: string;
};

function fmt(n: number): string {
  return Math.round(n).toLocaleString("ko-KR");
}

export default function ProductLookupClient({
  modelOptions,
  selectedModel,
  selectedInfo,
  partnerRows,
  partnerProfiles,
  initialCategory,
  initialBrand,
}: Props) {
  return (
    <div className="space-y-6">
      <ModelSearch
        modelOptions={modelOptions}
        selectedModel={selectedModel}
        initialCategory={initialCategory}
        initialBrand={initialBrand}
      />

      {selectedModel && selectedInfo && (
        <>
          <ModelSummary info={selectedInfo} />
          <PartnerComparisonTable rows={partnerRows} />
          <PartnerProfileCards profiles={partnerProfiles} />
        </>
      )}
    </div>
  );
}

// ─── 1. 모델 검색 ──────────────────────────────────────────────────────────────

function ModelSearch({
  modelOptions,
  selectedModel,
  initialCategory,
  initialBrand,
}: {
  modelOptions: ModelOption[];
  selectedModel: string | null;
  initialCategory?: string;
  initialBrand?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(initialCategory ?? "");
  const [brand, setBrand] = useState(initialBrand ?? "");
  const [managementType, setManagementType] = useState("");
  const [managementCycle, setManagementCycle] = useState("");

  const categories = useMemo(
    () => Array.from(new Set(modelOptions.map((m) => m.category))).sort(),
    [modelOptions],
  );

  const brands = useMemo(() => {
    const pool = category ? modelOptions.filter((m) => m.category === category) : modelOptions;
    return Array.from(new Set(pool.map((m) => m.brand))).sort();
  }, [modelOptions, category]);

  const managementTypes = useMemo(
    () => Array.from(new Set(modelOptions.map((m) => m.managementType).filter(Boolean))).sort(),
    [modelOptions],
  );

  const managementCycles = useMemo(
    () => Array.from(new Set(modelOptions.map((m) => m.managementCycle).filter(Boolean))).sort(),
    [modelOptions],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return modelOptions
      .filter((m) => !category || m.category === category)
      .filter((m) => !brand || m.brand === brand)
      .filter((m) => !managementType || m.managementType === managementType)
      .filter((m) => !managementCycle || m.managementCycle === managementCycle)
      .filter(
        (m) =>
          !q ||
          m.model_name.toLowerCase().includes(q) ||
          m.product_name.toLowerCase().includes(q) ||
          m.brand.toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [modelOptions, query, category, brand, managementType, managementCycle]);

  const selectedLabel = selectedModel
    ? (modelOptions.find((m) => m.model_name === selectedModel)?.product_name ??
      selectedModel)
    : null;

  function select(modelName: string) {
    setQuery("");
    setOpen(false);
    router.push(`/product-lookup?model=${encodeURIComponent(modelName)}`);
  }

  return (
    <div className="relative bg-white border border-[#ebebe9] rounded-xl p-4">
      <div className="flex gap-2 mb-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[#788093]">카테고리</span>
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setBrand("");
              setOpen(true);
            }}
            className="border border-[#e2e6ec] rounded-lg px-3 py-2 text-sm text-[#222222]"
          >
            <option value="">전체</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[#788093]">브랜드</span>
          <select
            value={brand}
            onChange={(e) => {
              setBrand(e.target.value);
              setOpen(true);
            }}
            className="border border-[#e2e6ec] rounded-lg px-3 py-2 text-sm text-[#222222]"
          >
            <option value="">전체</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[#788093]">관리방식</span>
          <select
            value={managementType}
            onChange={(e) => {
              setManagementType(e.target.value);
              setOpen(true);
            }}
            className="border border-[#e2e6ec] rounded-lg px-3 py-2 text-sm text-[#222222]"
          >
            <option value="">전체</option>
            {managementTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[#788093]">관리주기</span>
          <select
            value={managementCycle}
            onChange={(e) => {
              setManagementCycle(e.target.value);
              setOpen(true);
            }}
            className="border border-[#e2e6ec] rounded-lg px-3 py-2 text-sm text-[#222222]"
          >
            <option value="">전체</option>
            {managementCycles.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-[#788093]">
          모델명 · 상품명 · 브랜드로 검색
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={selectedLabel ?? "예: AF60F19D11WS, 게이밍PC, 삼성"}
          className="border border-[#e2e6ec] rounded-lg px-3 py-2 text-sm text-[#222222] w-full max-w-xl"
        />
      </label>

      {open && (
        <div className="absolute z-10 mt-1 w-full max-w-xl bg-white border border-[#e2e6ec] rounded-lg shadow-lg max-h-80 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-xs text-[#a1a5ac]">검색 결과 없음</p>
          ) : (
            filtered.map((m) => (
              <button
                key={m.model_name}
                onClick={() => select(m.model_name)}
                className="w-full text-left px-3 py-2 hover:bg-[#f6f6f6] flex items-center justify-between gap-2"
              >
                <span className="min-w-0">
                  <span className="text-sm text-[#222222] truncate block">
                    {m.product_name || m.model_name}
                  </span>
                  <span className="text-xs text-[#a1a5ac]">
                    {m.brand} · {m.category} · {m.model_name}
                  </span>
                </span>
                <span className="text-xs text-[#788093] shrink-0">{m.count}건</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── 2. 모델 요약 ──────────────────────────────────────────────────────────────

function ModelSummary({ info }: { info: ModelOption }) {
  return (
    <div className="bg-white border border-[#ebebe9] rounded-xl p-4 flex items-center gap-3">
      <span className="text-base font-bold text-[#222222]">
        {info.product_name || info.model_name}
      </span>
      <span className="text-xs text-[#788093] bg-[#f3f5f9] px-2 py-1 rounded">
        {info.brand}
      </span>
      <span className="text-xs text-[#788093] bg-[#f3f5f9] px-2 py-1 rounded">
        {info.category}
      </span>
      <span className="text-xs text-[#a1a5ac]">{info.model_name}</span>
      <span className="ml-auto text-xs text-[#a1a5ac]">
        최근 6개월 총 {info.count.toLocaleString("ko-KR")}건
      </span>
    </div>
  );
}

// ─── 3. 파트너사별 비교표 ───────────────────────────────────────────────────────

function PartnerComparisonTable({ rows }: { rows: PartnerRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="bg-white border border-[#ebebe9] rounded-xl p-6 text-center text-xs text-[#a1a5ac]">
        이 모델을 판매한 파트너사 데이터가 없습니다
      </div>
    );
  }

  return (
    <section>
      <h2 className="text-lg font-bold text-[#222222] mb-1">파트너사별 판매장려금 비교</h2>
      <p className="text-xs text-[#a1a5ac] mb-4">
        동일 모델 실거래 기준 — 렌트리 채널(더블체크파트너스/렌트리 안심구독)은 초록색으로
        표시됩니다
        <br />
        공헌이익은 매출에서 판매장려금·프로모션·원가·금융비용·대손비를 뺀, 실제로 남긴 돈입니다
        — 판매장려금 비율이 높을수록 공헌이익률은 낮아지는 경향이 있습니다
      </p>
      <div className="bg-white border border-[#ebebe9] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f6f6f6] border-b border-[#e2e6ec]">
                <th className="text-left px-4 py-3 text-xs font-bold text-[#586177]">파트너사</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-[#586177]">건수</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-[#586177]">
                  평균 총렌탈료
                </th>
                <th className="text-right px-4 py-3 text-xs font-bold text-[#586177]">
                  평균 판매장려금
                </th>
                <th className="text-right px-4 py-3 text-xs font-bold text-[#586177]">
                  판매장려금 비율
                </th>
                <th className="text-right px-4 py-3 text-xs font-bold text-[#586177]">
                  평균 공헌이익
                </th>
                <th className="text-right px-4 py-3 text-xs font-bold text-[#586177]">
                  공헌이익률
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.partner}
                  className="border-b border-[#f3f5f9]"
                  style={r.isRentre ? { backgroundColor: "var(--color-success-100)" } : undefined}
                >
                  <td
                    className="px-4 py-3"
                    style={{
                      color: r.isRentre ? "var(--color-success)" : "#586177",
                      fontWeight: r.isRentre ? 700 : 400,
                    }}
                  >
                    {r.partner}
                    {r.isRentre && (
                      <span
                        className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: "var(--color-success)", color: "#fff" }}
                      >
                        렌트리
                      </span>
                    )}
                    {r.isBM1 && (
                      <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-[#f3f5f9] text-[#a1a5ac]">
                        BM1
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-[#a1a5ac]">{r.count}</td>
                  <td className="px-4 py-3 text-right text-[#222222]">
                    {fmt(r.avgTotalRentalFee)}원
                  </td>
                  <td className="px-4 py-3 text-right text-[#222222]">
                    {r.isBM1 ? (
                      <span className="text-[#babab7]">데이터 없음</span>
                    ) : (
                      `${fmt(r.avgIncentive)}원`
                    )}
                  </td>
                  <td
                    className="px-4 py-3 text-right font-semibold"
                    style={{ color: r.isRentre ? "var(--color-success)" : "#222222" }}
                  >
                    {r.isBM1 ? (
                      <span className="font-normal text-[#babab7]">데이터 없음</span>
                    ) : (
                      `${r.incentiveRate.toFixed(1)}%`
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-[#222222]">
                    {fmt(r.avgContributionMargin)}원
                  </td>
                  <td
                    className="px-4 py-3 text-right font-semibold"
                    style={{ color: r.isRentre ? "var(--color-success)" : "#222222" }}
                  >
                    {r.marginRate.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ─── 4. 파트너사별 산정 로직 추정 카드 ───────────────────────────────────────────

function PartnerProfileCards({ profiles }: { profiles: PartnerProfile[] }) {
  if (profiles.length === 0) return null;

  const sorted = [...profiles].sort((a, b) => b.sampleCount - a.sampleCount);

  return (
    <section>
      <h2 className="text-lg font-bold text-[#222222] mb-1">파트너사별 산정 로직 추정</h2>
      <p className="text-xs text-[#a1a5ac] mb-4">
        이 모델에 등장한 각 파트너사가 <b>가전 전체 상품</b>에 걸쳐 판매장려금을 총렌탈료 대비
        평균 몇 %로 주는지 — 표준편차가 작을수록 일관된 정률 산식일 가능성이 높고, 클수록
        건마다 들쭉날쭉하다는 뜻입니다
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sorted.map((p) => (
          <div
            key={p.partner}
            className="border rounded-xl p-4"
            style={
              p.isRentre
                ? { borderColor: "var(--color-success)", backgroundColor: "var(--color-success-100)" }
                : { borderColor: "#ebebe9", backgroundColor: "#fff" }
            }
          >
            <div className="flex items-center gap-1.5 mb-2">
              <span
                className="text-sm font-bold"
                style={{ color: p.isRentre ? "var(--color-success)" : "#222222" }}
              >
                {p.partner}
              </span>
              {p.isRentre && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: "var(--color-success)", color: "#fff" }}
                >
                  렌트리
                </span>
              )}
            </div>
            <p className="text-2xl font-bold text-[#222222]">
              {p.avgRate.toFixed(1)}%
              <span className="text-xs font-normal text-[#a1a5ac] ml-1">±{p.stdDevRate.toFixed(1)}%p</span>
            </p>
            <p className="text-[11px] text-[#a1a5ac] mt-1">
              가전 전체 {p.sampleCount.toLocaleString("ko-KR")}건 기준 평균 판매장려금 비율
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
