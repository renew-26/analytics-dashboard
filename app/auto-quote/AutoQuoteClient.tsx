"use client";

import { useState, useMemo, Fragment } from "react";
import type { TypeBRow, TypeARow } from "./page";

// ── Company config ──────────────────────────────────────────────────────────
const COMPANIES = [
  { key: "lghv", name: "LG헬로비전" },
  { key: "ini", name: "이니렌탈" },
  { key: "hyundai", name: "현대유버스" },
  { key: "bs", name: "BS렌탈" },
  { key: "smart", name: "스마트렌탈" },
  { key: "carrier", name: "캐리어" },
  { key: "body", name: "바디프랜드" },
  { key: "kt", name: "KT렌탈" },
] as const;

type CompanyKey = (typeof COMPANIES)[number]["key"];

// ── Helpers ─────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined): string {
  if (n == null) return "-";
  return n.toLocaleString("ko-KR");
}

function fmtWon(n: number | null | undefined): string {
  if (n == null) return "-";
  return n.toLocaleString("ko-KR") + "원";
}

function getCompanyFee(row: TypeBRow, key: CompanyKey): number | null {
  return (row as Record<string, number | null | string>)[
    `${key}_monthly_fee`
  ] as number | null;
}

function getCompanySupport(row: TypeBRow, key: CompanyKey): number | null {
  return (row as Record<string, number | null | string>)[
    `${key}_support`
  ] as number | null;
}

function getCompanyTotal(row: TypeBRow, key: CompanyKey): number | null {
  return (row as Record<string, number | null | string>)[
    `${key}_total_payment`
  ] as number | null;
}

// Average of non-null values across all companies
function avg(row: TypeBRow, field: "monthly_fee" | "support" | "total_payment"): number | null {
  const vals = COMPANIES.map(
    (c) =>
      (row as Record<string, number | null | string>)[
        `${c.key}_${field}`
      ] as number | null,
  ).filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// Cell highlight color
function cellColor(
  value: number | null,
  average: number | null,
): string | undefined {
  if (value == null || average == null) return undefined;
  if (value < average) return "var(--success)";
  if (value > average) return "var(--accent-orange)";
  return undefined;
}

// ── Shared styles ────────────────────────────────────────────────────────────
const thBase =
  "px-3 py-2.5 text-xs font-semibold text-[#788093] whitespace-nowrap text-right";
const thLeft =
  "px-3 py-2.5 text-xs font-semibold text-[#788093] whitespace-nowrap text-left";
const tdBase = "px-3 py-2.5 text-xs tabular-nums text-right whitespace-nowrap";
const tdLeft = "px-3 py-2.5 text-xs text-left whitespace-nowrap";

// ── Filter bar ───────────────────────────────────────────────────────────────
function FilterBar({
  categories,
  brands,
  contractMonths,
  category,
  brand,
  months,
  onCategory,
  onBrand,
  onMonths,
}: {
  categories: string[];
  brands: string[];
  contractMonths: number[];
  category: string;
  brand: string;
  months: string;
  onCategory: (v: string) => void;
  onBrand: (v: string) => void;
  onMonths: (v: string) => void;
}) {
  const selectClass =
    "px-3 py-2 text-sm font-medium border border-[#e2e6ec] rounded-lg bg-white text-[#393939] focus:outline-none focus:ring-2 focus:ring-[#c7d2fe] cursor-pointer";

  return (
    <div className="flex flex-wrap gap-3 items-center">
      <select
        value={category}
        onChange={(e) => onCategory(e.target.value)}
        className={selectClass}
      >
        <option value="">전체 카테고리</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <select
        value={brand}
        onChange={(e) => onBrand(e.target.value)}
        className={selectClass}
      >
        <option value="">전체 브랜드</option>
        {brands.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>
      <select
        value={months}
        onChange={(e) => onMonths(e.target.value)}
        className={selectClass}
      >
        <option value="">전체 계약기간</option>
        {contractMonths.map((m) => (
          <option key={m} value={String(m)}>
            {m}개월
          </option>
        ))}
      </select>
    </div>
  );
}

// ── 8사 비교 테이블 ──────────────────────────────────────────────────────────
function ComparisonTable({ rows }: { rows: TypeBRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-[#a1a5ac] py-12 text-center">
        조건에 맞는 데이터가 없습니다.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse min-w-[1400px]">
        <thead>
          {/* Company group headers */}
          <tr className="border-b border-[#e2e6ec]">
            <th
              colSpan={4}
              className="px-3 py-2 text-xs text-[#a1a5ac] text-left font-medium"
            />
            {COMPANIES.map((c) => (
              <th
                key={c.key}
                colSpan={3}
                className="px-3 py-2 text-xs font-bold text-[#393939] text-center bg-[#f3f5f9] border-l border-[#e2e6ec] whitespace-nowrap"
              >
                {c.name}
              </th>
            ))}
          </tr>
          {/* Column headers */}
          <tr className="border-b border-[#e2e6ec] bg-[#f9fafb]">
            <th className={thLeft}>카테고리</th>
            <th className={thLeft}>브랜드</th>
            <th className={thLeft}>모델명</th>
            <th className={thBase}>계약기간</th>
            {COMPANIES.map((c) => (
              <Fragment key={c.key}>
                <th
                  className={`${thBase} border-l border-[#e2e6ec]`}
                >
                  월렌탈료
                </th>
                <th className={thBase}>
                  지원금
                </th>
                <th className={thBase}>
                  총납입금
                </th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const avgFee = avg(row, "monthly_fee");
            const avgSup = avg(row, "support");
            const avgTot = avg(row, "total_payment");
            return (
              <tr
                key={row.prod_term_usid}
                className="border-b border-[#f3f5f9] hover:bg-[#f9fafb] transition-colors"
              >
                <td className={`${tdLeft} text-[#788093]`}>
                  {row.category ?? "-"}
                </td>
                <td className={`${tdLeft} text-[#788093]`}>
                  {row.brand ?? "-"}
                </td>
                <td className={`${tdLeft} text-[#222222] font-medium`}>
                  {row.model_name ?? row.product_name ?? "-"}
                </td>
                <td className={`${tdBase} text-[#586177]`}>
                  {row.contract_months != null
                    ? `${row.contract_months}개월`
                    : "-"}
                </td>
                {COMPANIES.map((c) => {
                  const fee = getCompanyFee(row, c.key);
                  const sup = getCompanySupport(row, c.key);
                  const tot = getCompanyTotal(row, c.key);
                  const feeColor = cellColor(fee, avgFee);
                  const supColor = cellColor(sup, avgSup);
                  const totColor = cellColor(tot, avgTot);
                  return (
                    <Fragment key={c.key}>
                      <td
                        className={`${tdBase} border-l border-[#f3f5f9] font-medium`}
                        style={{ color: feeColor ?? "#393939" }}
                      >
                        {fmt(fee)}
                      </td>
                      <td
                        className={tdBase}
                        style={{ color: supColor ?? "#586177" }}
                      >
                        {fmt(sup)}
                      </td>
                      <td
                        className={tdBase}
                        style={{ color: totColor ?? "#788093" }}
                      >
                        {fmt(tot)}
                      </td>
                    </Fragment>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── 카테고리 평균 벤치마크 ────────────────────────────────────────────────────
function CategoryBenchmark({ rows }: { rows: TypeBRow[] }) {
  const categories = [...new Set(rows.map((r) => r.category).filter(Boolean))] as string[];

  if (categories.length === 0) {
    return (
      <p className="text-sm text-[#a1a5ac] py-8 text-center">
        데이터가 없습니다.
      </p>
    );
  }

  // Per category, per company: average monthly_fee
  const matrix = categories.map((cat) => {
    const catRows = rows.filter((r) => r.category === cat);
    const companyAvgs = COMPANIES.map((c) => {
      const fees = catRows
        .map((r) => getCompanyFee(r, c.key))
        .filter((v): v is number => v != null);
      const avg = fees.length > 0 ? fees.reduce((a, b) => a + b, 0) / fees.length : null;
      return { key: c.key, name: c.name, avg };
    });
    return { cat, companyAvgs };
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-[#e2e6ec] bg-[#f9fafb]">
            <th className={thLeft}>카테고리</th>
            {COMPANIES.map((c) => (
              <th key={c.key} className={thBase}>
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map(({ cat, companyAvgs }) => (
            <tr
              key={cat}
              className="border-b border-[#f3f5f9] hover:bg-[#f9fafb] transition-colors"
            >
              <td className={`${tdLeft} text-[#222222] font-medium`}>{cat}</td>
              {companyAvgs.map(({ key, avg }) => (
                <td
                  key={key}
                  className={`${tdBase} text-[#586177]`}
                >
                  {avg != null
                    ? Math.round(avg).toLocaleString("ko-KR")
                    : "-"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── 더블체크파트너스 벤치마크 ─────────────────────────────────────────────────
function TypeATable({ rows }: { rows: TypeARow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-[#a1a5ac] py-8 text-center">
        데이터가 없습니다.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-[#e2e6ec] bg-[#f9fafb]">
            <th className={thLeft}>카테고리</th>
            <th className={thLeft}>브랜드</th>
            <th className={thLeft}>모델명</th>
            <th className={thLeft}>관리방식</th>
            <th className={thBase}>계약기간</th>
            <th className={thBase}>월렌탈료</th>
            <th className={thBase}>지원금</th>
            <th className={thBase}>총납입금</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.prod_term_usid}
              className="border-b border-[#f3f5f9] hover:bg-[#f9fafb] transition-colors"
            >
              <td className={`${tdLeft} text-[#788093]`}>
                {row.category ?? "-"}
              </td>
              <td className={`${tdLeft} text-[#788093]`}>
                {row.brand ?? "-"}
              </td>
              <td className={`${tdLeft} text-[#222222] font-medium`}>
                {row.model_name ?? row.product_name ?? "-"}
              </td>
              <td className={`${tdLeft} text-[#788093]`}>
                {row.management_type ?? "-"}
              </td>
              <td className={`${tdBase} text-[#586177]`}>
                {row.contract_months != null
                  ? `${row.contract_months}개월`
                  : "-"}
              </td>
              <td className={`${tdBase} text-[#222222] font-medium`}>
                {fmtWon(row.dc_monthly_fee)}
              </td>
              <td className={`${tdBase} text-[#586177]`}>
                {fmtWon(row.dc_support)}
              </td>
              <td className={`${tdBase} text-[#586177]`}>
                {fmtWon(row.dc_total_payment)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Tab bar ──────────────────────────────────────────────────────────────────
const TABS = [
  { id: "compare", label: "8사 가격 비교" },
  { id: "benchmark", label: "카테고리별 평균" },
  { id: "typea", label: "더블체크파트너스" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ── Main client component ────────────────────────────────────────────────────
export default function AutoQuoteClient({
  typeb,
  typea,
}: {
  typeb: TypeBRow[];
  typea: TypeARow[];
}) {
  const [activeTab, setActiveTab] = useState<TabId>("compare");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [months, setMonths] = useState("");

  // Derived filter options from typeb
  const categories = useMemo(
    () =>
      [...new Set(typeb.map((r) => r.category).filter(Boolean))].sort() as string[],
    [typeb],
  );

  const brands = useMemo(() => {
    const src = category
      ? typeb.filter((r) => r.category === category)
      : typeb;
    return [...new Set(src.map((r) => r.brand).filter(Boolean))].sort() as string[];
  }, [typeb, category]);

  const contractMonths = useMemo(
    () =>
      [
        ...new Set(
          typeb.map((r) => r.contract_months).filter((v): v is number => v != null),
        ),
      ].sort((a, b) => a - b),
    [typeb],
  );

  // Filtered rows
  const filteredTypeb = useMemo(() => {
    return typeb.filter((r) => {
      if (category && r.category !== category) return false;
      if (brand && r.brand !== brand) return false;
      if (months && r.contract_months !== Number(months)) return false;
      return true;
    });
  }, [typeb, category, brand, months]);

  // typea filters (category + months only — no brand override needed)
  const filteredTypea = useMemo(() => {
    return typea.filter((r) => {
      if (category && r.category !== category) return false;
      if (months && r.contract_months !== Number(months)) return false;
      return true;
    });
  }, [typea, category, months]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-[#222222] tracking-tight">
          자동견적 비교
        </h1>
        <p className="text-sm text-[#788093] mt-1">
          렌탈사별 자동견적 가격 비교 및 더블체크파트너스 벤치마크
        </p>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-[#e2e6ec] bg-white px-5 py-4">
        <FilterBar
          categories={categories}
          brands={brands}
          contractMonths={contractMonths}
          category={category}
          brand={brand}
          months={months}
          onCategory={(v) => {
            setCategory(v);
            setBrand("");
          }}
          onBrand={setBrand}
          onMonths={setMonths}
        />
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-[#f3f5f9] rounded-xl w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-5 py-1.5 text-sm rounded-lg font-medium transition-all ${
              activeTab === t.id
                ? "bg-white text-[#222222] shadow-sm"
                : "text-[#788093] hover:text-[#393939]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "compare" && (
        <div className="rounded-xl border border-[#e2e6ec] bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-[#ebebe9] flex items-center justify-between">
            <p className="text-sm font-semibold text-[#393939]">
              8사 가격 비교표
            </p>
            <span className="text-xs text-[#a1a5ac]">
              {filteredTypeb.length.toLocaleString("ko-KR")}개 모델 ·{" "}
              <span style={{ color: "var(--success)" }}>■</span> 평균 이하 &nbsp;
              <span style={{ color: "var(--accent-orange)" }}>■</span> 평균 이상
            </span>
          </div>
          <ComparisonTable rows={filteredTypeb} />
        </div>
      )}

      {activeTab === "benchmark" && (
        <div className="rounded-xl border border-[#e2e6ec] bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-[#ebebe9]">
            <p className="text-sm font-semibold text-[#393939]">
              카테고리별 평균 월렌탈료
            </p>
            <p className="text-xs text-[#a1a5ac] mt-0.5">
              각 카테고리 내 모델 기준 렌탈사별 평균 월렌탈료 (원)
            </p>
          </div>
          <CategoryBenchmark rows={filteredTypeb} />
        </div>
      )}

      {activeTab === "typea" && (
        <div className="rounded-xl border border-[#e2e6ec] bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-[#ebebe9]">
            <p className="text-sm font-semibold text-[#393939]">
              더블체크파트너스 벤치마크
            </p>
            <p className="text-xs text-[#a1a5ac] mt-0.5">
              렌트리 정수기 자동견적 기준 가격
            </p>
          </div>
          <TypeATable rows={filteredTypea} />
        </div>
      )}
    </div>
  );
}
