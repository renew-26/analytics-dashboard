"use client";

import { useState, useEffect, useRef } from "react";

type SubsidyRow = {
  id: string;
  year_month: string;
  type: string;
  category: string | null;
  brand: string | null;
  product_name: string | null;
  model_name: string | null;
  segment: string | null;
  partner: string | null;
  competitor_subsidy: number | null;
  rentree_subsidy: number | null;
  comparison: string | null;
};

const COMPARISON_COLOR: Record<string, string> = {
  우세: "#1ea85e",
  열세: "#e03131",
  동일: "#788093",
};

function fmt(n: number | null) {
  if (n === null) return "-";
  return n.toLocaleString("ko-KR") + "원";
}

function StatCards({ rows }: { rows: SubsidyRow[] }) {
  const total = rows.length;
  const counts = { 우세: 0, 열세: 0, 동일: 0 };
  for (const r of rows) {
    if (r.comparison === "우세") counts["우세"]++;
    else if (r.comparison === "열세") counts["열세"]++;
    else if (r.comparison === "동일") counts["동일"]++;
  }
  const cards = [
    {
      label: "우세",
      count: counts["우세"],
      color: "#1ea85e",
      bg: "#dff7ea",
      border: "#6ee7a8",
      desc: "렌트리 지원금이 높은 항목",
    },
    {
      label: "열세",
      count: counts["열세"],
      color: "#e03131",
      bg: "#ffe0e0",
      border: "#fca5a5",
      desc: "렌트리 지원금이 낮은 항목",
    },
    {
      label: "동일",
      count: counts["동일"],
      color: "#788093",
      bg: "var(--color-gray-25)",
      border: "var(--color-gray-200)",
      desc: "지원금이 같은 항목",
    },
  ];
  return (
    <div className="grid grid-cols-3 gap-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-xl p-4 border"
          style={{ backgroundColor: c.bg, borderColor: c.border }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium" style={{ color: c.color }}>
              {c.label}
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ backgroundColor: c.color, color: "#fff" }}
            >
              {total > 0 ? Math.round((c.count / total) * 100) : 0}%
            </span>
          </div>
          <p className="text-2xl font-bold text-[#222222]">
            {c.count}
            <span className="text-sm font-normal text-[#788093] ml-1">건</span>
          </p>
          <p className="text-xs text-[#a1a5ac] mt-1">{c.desc}</p>
        </div>
      ))}
    </div>
  );
}

function SubsidyTable({
  rows,
  type,
}: {
  rows: SubsidyRow[];
  type: "인터넷" | "가전";
}) {
  if (rows.length === 0)
    return (
      <p className="text-sm text-[#a1a5ac] py-8 text-center">데이터 없음</p>
    );

  const thClass =
    "px-4 py-3 text-left text-xs font-semibold text-[#788093] uppercase tracking-wider whitespace-nowrap";
  const tdClass = "px-4 py-3 text-sm";

  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="border-b border-[#ebebe9]">
          {type === "인터넷" ? (
            <>
              <th className={thClass}>통신사</th>
              <th className={thClass}>상품명</th>
              <th className={thClass}>구분</th>
              <th className={thClass}>업체명</th>
              <th className={`${thClass} text-right`}>타사 지원금</th>
              <th className={`${thClass} text-right`}>렌트리 지원금</th>
              <th className={`${thClass} text-center`}>비교</th>
            </>
          ) : (
            <>
              <th className={thClass}>카테고리</th>
              <th className={thClass}>브랜드</th>
              <th className={thClass}>상품명</th>
              <th className={thClass}>모델명</th>
              <th className={thClass}>업체명</th>
              <th className={`${thClass} text-right`}>타사 지원금</th>
              <th className={`${thClass} text-right`}>렌트리 지원금</th>
              <th className={`${thClass} text-center`}>비교</th>
            </>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const compColor = r.comparison
            ? COMPARISON_COLOR[r.comparison]
            : "var(--color-gray-700)";
          return (
            <tr
              key={r.id}
              className="border-b border-[#f6f6f6] hover:bg-[#f6f6f6] transition-colors"
            >
              {type === "인터넷" ? (
                <>
                  <td className={`${tdClass} text-[#788093] font-medium`}>
                    {r.category ?? "-"}
                  </td>
                  <td className={`${tdClass} text-[#222222] font-medium`}>
                    {r.product_name ?? "-"}
                  </td>
                  <td className={`${tdClass} text-[#788093]`}>
                    {r.segment ?? "-"}
                  </td>
                  <td className={`${tdClass} text-[#788093]`}>
                    {r.partner ?? "-"}
                  </td>
                  <td
                    className={`${tdClass} text-right text-[#586177] tabular-nums`}
                  >
                    {fmt(r.competitor_subsidy)}
                  </td>
                  <td
                    className={`${tdClass} text-right font-semibold tabular-nums`}
                    style={{ color: compColor }}
                  >
                    {fmt(r.rentree_subsidy)}
                  </td>
                </>
              ) : (
                <>
                  <td className={`${tdClass} text-[#788093]`}>
                    {r.category ?? "-"}
                  </td>
                  <td className={`${tdClass} text-[#788093]`}>
                    {r.brand ?? "-"}
                  </td>
                  <td className={`${tdClass} text-[#222222] font-medium`}>
                    {r.product_name ?? "-"}
                  </td>
                  <td className={`${tdClass} text-[#788093]`}>
                    {r.model_name ?? "-"}
                  </td>
                  <td className={`${tdClass} text-[#788093]`}>
                    {r.partner ?? "-"}
                  </td>
                  <td
                    className={`${tdClass} text-right text-[#586177] tabular-nums`}
                  >
                    {fmt(r.competitor_subsidy)}
                  </td>
                  <td
                    className={`${tdClass} text-right font-semibold tabular-nums`}
                    style={{ color: compColor }}
                  >
                    {fmt(r.rentree_subsidy)}
                  </td>
                </>
              )}
              <td className={`${tdClass} text-center`}>
                {r.comparison && (
                  <span
                    className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold"
                    style={{
                      backgroundColor: COMPARISON_COLOR[r.comparison] + "20",
                      color: COMPARISON_COLOR[r.comparison],
                    }}
                  >
                    {r.comparison}
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function SubsidyClient({ months }: { months: string[] }) {
  const [selectedMonth, setSelectedMonth] = useState<string>(months[0] ?? "");
  const [activeType, setActiveType] = useState<"인터넷" | "가전">("인터넷");
  const [rows, setRows] = useState<SubsidyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadMonth, setUploadMonth] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [hasFile, setHasFile] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!selectedMonth) return;
    setLoading(true);
    setSelectedPartner(null);
    fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/subsidy/data?year_month=${selectedMonth}`)
      .then((r) => r.json())
      .then((j) => setRows(j.data ?? []))
      .finally(() => setLoading(false));
  }, [selectedMonth]);

  useEffect(() => {
    setSelectedPartner(null);
  }, [activeType]);

  const typeRows = rows.filter((r) => r.type === activeType);
  const partners = [
    ...new Set(typeRows.map((r) => r.partner).filter(Boolean)),
  ] as string[];
  const visibleRows = selectedPartner
    ? typeRows.filter((r) => r.partner === selectedPartner)
    : typeRows;

  async function handleUpload() {
    if (!fileRef.current?.files?.[0] || !uploadMonth) return;
    setUploading(true);
    setUploadMsg(null);
    const fd = new FormData();
    fd.append("file", fileRef.current.files[0]);
    fd.append("year_month", uploadMonth);
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/subsidy/upload`, {
      method: "POST",
      body: fd,
    });
    const j = await res.json();
    setUploading(false);
    if (j.ok) {
      setUploadMsg({ ok: true, text: `${j.inserted}건 업로드 완료` });
      window.location.reload();
    } else {
      setUploadMsg({ ok: false, text: j.error ?? "업로드 실패" });
    }
  }

  return (
    <div className="space-y-5">
      {/* 상단 컨트롤 바 */}
      <div className="flex items-center justify-between">
        <div>
          {months.length > 0 && (
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 text-sm font-medium border border-[#e2e6ec] rounded-lg bg-white text-[#393939] focus:outline-none focus:ring-2 focus:ring-[#c7d2fe] cursor-pointer"
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/subsidy/template"
            download
            className="px-3 py-2 text-sm rounded-lg border border-[#e2e6ec] text-[#586177] hover:bg-[#f6f6f6] transition font-medium"
          >
            템플릿 다운로드
          </a>
          <button
            onClick={() => setShowUpload((v) => !v)}
            className={`px-3 py-2 text-sm rounded-lg border font-medium transition ${
              showUpload
                ? "bg-[#222222] text-white border-[#222222]"
                : "border-[#e2e6ec] text-[#586177] hover:bg-[#f6f6f6]"
            }`}
          >
            {showUpload ? "닫기" : "데이터 업로드"}
          </button>
        </div>
      </div>

      {/* 업로드 패널 */}
      {showUpload && (
        <div className="rounded-xl border border-[#e2e6ec] bg-[#f6f6f6] p-5">
          <p className="text-sm font-semibold text-[#393939] mb-4">
            엑셀 파일 업로드
          </p>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[#788093]">
                조사 월
              </label>
              <input
                type="month"
                value={uploadMonth}
                onChange={(e) => setUploadMonth(e.target.value)}
                className="px-3 py-2 text-sm border border-[#e2e6ec] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#c7d2fe]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[#788093]">
                파일 선택
              </label>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="text-sm text-[#586177] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-[#e2e6ec] file:text-xs file:font-medium file:text-[#586177] file:bg-white file:cursor-pointer hover:file:bg-[#f6f6f6]"
                onChange={(e) => setHasFile(!!e.target.files?.[0])}
              />
            </div>
            <button
              onClick={handleUpload}
              disabled={uploading || !uploadMonth || !hasFile}
              className="px-4 py-2 text-sm rounded-lg text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition"
              style={{ backgroundColor: "#6366f1" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = "#4f46e5")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "#6366f1")
              }
            >
              {uploading ? "업로드 중…" : "업로드"}
            </button>
          </div>
          {uploadMsg && (
            <p
              className="mt-3 text-sm font-medium"
              style={{ color: uploadMsg.ok ? "#1ea85e" : "#e03131" }}
            >
              {uploadMsg.text}
            </p>
          )}
        </div>
      )}

      {months.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-[#a1a5ac] text-sm">업로드된 데이터가 없습니다.</p>
          <p className="text-[#babab7] text-xs mt-1">
            템플릿을 다운로드해 데이터를 채운 후 업로드해 주세요.
          </p>
        </div>
      ) : (
        <>
          {/* 유형 탭 */}
          <div className="flex gap-1 p-1 bg-[#f3f5f9] rounded-xl w-fit">
            {(["인터넷", "가전"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setActiveType(t)}
                className={`px-5 py-1.5 text-sm rounded-lg font-medium transition-all ${
                  activeType === t
                    ? "bg-white text-[#222222] shadow-sm"
                    : "text-[#788093] hover:text-[#393939]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="py-16 text-center text-sm text-[#a1a5ac]">
              로딩 중…
            </div>
          ) : (
            <>
              {/* 업체 필터 pills */}
              {partners.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedPartner(null)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                      selectedPartner === null
                        ? "bg-[#222222] text-white"
                        : "bg-[#f3f5f9] text-[#586177] hover:bg-[#e2e6ec]"
                    }`}
                  >
                    전체
                  </button>
                  {partners.map((p) => (
                    <button
                      key={p}
                      onClick={() =>
                        setSelectedPartner(selectedPartner === p ? null : p)
                      }
                      className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                        selectedPartner === p
                          ? "bg-[#222222] text-white"
                          : "bg-[#f3f5f9] text-[#586177] hover:bg-[#e2e6ec]"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}

              {/* 통계 카드 */}
              <StatCards rows={visibleRows} />

              {/* 테이블 */}
              <div className="rounded-xl border border-[#e2e6ec] bg-white overflow-hidden">
                <div className="px-5 py-4 border-b border-[#ebebe9]">
                  <p className="text-sm font-semibold text-[#393939]">
                    상세 내역
                    {selectedPartner && (
                      <span className="ml-2 text-xs font-normal text-[#a1a5ac]">
                        — {selectedPartner}
                      </span>
                    )}
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <SubsidyTable rows={visibleRows} type={activeType} />
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
