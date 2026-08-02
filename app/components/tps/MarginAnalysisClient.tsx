'use client'

import { useState, useMemo } from 'react'
import { Product, CompetitorSubsidy, ApplianceRentreSubsidy, Telecom, TELECOM_LABELS, APPLIANCE_CATEGORIES } from '@/lib/tps/types'
import { buildMarginRows, MarginRow } from '@/lib/tps/marginRows'
import { calcMarginKpis } from '@/lib/tps/marginKpi'
import { CompetitorSubsidyForm } from '@/app/components/tps/CompetitorSubsidyForm'
import { MarginPartnerBarChart } from '@/app/components/tps/MarginPartnerBarChart'
import { MarginKpiCards } from '@/app/components/tps/MarginKpiCards'
import { buildApplianceSnapshotLookup } from '@/lib/tps/applianceRentreSubsidy'

type SortColumn = 'subsidyDiff' | 'estimatedMarginRate'

type ProductGroup = {
  key: string
  product: Product
  surveyYear: number
  surveyMonth: number
  rentreSubsidy: number
  otherPartnerSubsidy: number | null
  otherPartnerName: string | null
  otherPartnerMarginRate: number | null
  rentreMarginRate: number
  rentreCommission: number
  rentreBadDebt: number
  topSubsidySubsidyId: string
  competitors: MarginRow[]
}

type CardSection = { label: string; groups: ProductGroup[] }

function formatKRW(n: number) {
  return Math.round(n).toLocaleString('ko-KR') + '원'
}

// 지원금 차이처럼 양/음이 모두 의미 있는 값은 +/- 부호를 명시한다(음수는 toLocaleString이 이미 '-'를 붙여줌).
function formatSignedKRW(n: number) {
  const rounded = Math.round(n)
  const sign = rounded > 0 ? '+' : ''
  return sign + rounded.toLocaleString('ko-KR') + '원'
}

function formatPercent(n: number) {
  return (n * 100).toFixed(1) + '%'
}

export function MarginAnalysisClient({
  initialProducts,
  initialSubsidies,
  initialTpsBaselineRate,
  initialApplianceBaselineRate,
  initialTpsBadDebtRate,
  initialApplianceBadDebtRate,
  initialPeriod,
  initialApplianceRentreSubsidy,
}: {
  initialProducts: Product[]
  initialSubsidies: CompetitorSubsidy[]
  initialTpsBaselineRate: number
  initialApplianceBaselineRate: number
  initialTpsBadDebtRate: number
  initialApplianceBadDebtRate: number
  initialPeriod?: string
  initialApplianceRentreSubsidy: ApplianceRentreSubsidy[]
}) {
  const [products, setProducts] = useState(initialProducts)
  const [subsidies, setSubsidies] = useState(initialSubsidies)
  const [tpsBaselineRate, setTpsBaselineRate] = useState(initialTpsBaselineRate)
  const [applianceBaselineRate, setApplianceBaselineRate] = useState(initialApplianceBaselineRate)
  const [tpsBaselineInput, setTpsBaselineInput] = useState(String(initialTpsBaselineRate * 100))
  const [applianceBaselineInput, setApplianceBaselineInput] = useState(String(initialApplianceBaselineRate * 100))
  const [tpsBadDebtInput, setTpsBadDebtInput] = useState(String(initialTpsBadDebtRate * 100))
  const [applianceBadDebtInput, setApplianceBadDebtInput] = useState(String(initialApplianceBadDebtRate * 100))
  const [showForm, setShowForm] = useState(false)
  const [applianceSyncing, setApplianceSyncing] = useState(false)

  async function handleApplianceSync() {
    setApplianceSyncing(true)
    try {
      const res = await fetch('/api/sync/appliance-rentre-subsidy', { method: 'POST' })
      const json = await res.json()
      if (json.error) {
        alert(json.error)
        return
      }
      window.location.reload()
    } finally {
      setApplianceSyncing(false)
    }
  }
  const [activeTab, setActiveTab] = useState<'tps' | 'appliance'>('tps')
  const baselineRate = activeTab === 'tps' ? tpsBaselineRate : applianceBaselineRate
  const [filterPartner, setFilterPartner] = useState('전체')
  const [filterTelecom, setFilterTelecom] = useState<Telecom | '전체'>('전체')
  const [filterBrand, setFilterBrand] = useState('전체')
  const [filterApplianceCategory, setFilterApplianceCategory] = useState('전체')
  const [applianceGroupBy, setApplianceGroupBy] = useState<'brand' | 'category'>('brand')
  const [filterPeriod, setFilterPeriod] = useState(initialPeriod ?? '전체')
  const [filterProduct, setFilterProduct] = useState('')
  const [belowBaselineOnly, setBelowBaselineOnly] = useState(false)
  const [givesMoreOnly, setGivesMoreOnly] = useState(false)
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())

  function toggleGroup(key: string) {
    setExpandedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadResult, setUploadResult] = useState<{ matched: number; marginEstimates: { partner_name: string; product_name: string; commission: number; marginRate: number }[] } | null>(null)
  const [unmatched, setUnmatched] = useState<Record<string, unknown>[]>([])
  const [unmatchedPicks, setUnmatchedPicks] = useState<Record<number, string>>({})
  const [subsidyMissing, setSubsidyMissing] = useState<Record<string, unknown>[]>([])
  const [crossValidationFlags, setCrossValidationFlags] = useState<{ category: string; product_name: string; partner_name: string; values: number[]; diffPercent: number }[]>([])
  const [uploadPeriods, setUploadPeriods] = useState<string[]>([])

  const applianceSnapshotLookup = useMemo(
    () => buildApplianceSnapshotLookup(initialApplianceRentreSubsidy),
    [initialApplianceRentreSubsidy]
  )

  const rows = useMemo(
    () => buildMarginRows(products, subsidies, activeTab, applianceSnapshotLookup),
    [products, subsidies, activeTab, applianceSnapshotLookup]
  )

  function handleTabChange(tab: 'tps' | 'appliance') {
    setActiveTab(tab)
    setFilterPartner('전체')
    setFilterTelecom('전체')
    setFilterBrand('전체')
    setFilterApplianceCategory('전체')
    setApplianceGroupBy('brand')
    setFilterPeriod('전체')
    setFilterProduct('')
  }

  const partnerOptions = useMemo(
    () => ['전체', ...Array.from(new Set(rows.map(r => r.subsidy.partner_name ?? '미지정'))).sort()],
    [rows]
  )
  const telecomOptions = useMemo(
    () => Array.from(new Set(rows.map(r => r.product.telecom).filter((t): t is Telecom => t !== null))).sort(),
    [rows]
  )
  const brandOptions = useMemo(
    () => Array.from(new Set(rows.map(r => r.product.brand).filter((b): b is string => Boolean(b)))).sort(),
    [rows]
  )
  const applianceCategoryOptions = useMemo(() => {
    const present = new Set(rows.map(r => r.product.appliance_category).filter((c): c is string => Boolean(c)))
    return APPLIANCE_CATEGORIES.filter(c => present.has(c))
  }, [rows])
  const periodOptions = useMemo(() => {
    const periods = Array.from(new Set(rows.map(r => `${r.subsidy.survey_year}-${String(r.subsidy.survey_month).padStart(2, '0')}`)))
    return ['전체', ...periods.sort().reverse()]
  }, [rows])

  const kpiRows = useMemo(() => rows.filter(r => {
    if (filterPartner !== '전체' && (r.subsidy.partner_name ?? '미지정') !== filterPartner) return false
    if (activeTab === 'tps' && filterTelecom !== '전체' && r.product.telecom !== filterTelecom) return false
    if (activeTab === 'appliance' && filterBrand !== '전체' && r.product.brand !== filterBrand) return false
    if (activeTab === 'appliance' && filterApplianceCategory !== '전체' && r.product.appliance_category !== filterApplianceCategory) return false
    if (filterPeriod !== '전체') {
      const period = `${r.subsidy.survey_year}-${String(r.subsidy.survey_month).padStart(2, '0')}`
      if (period !== filterPeriod) return false
    }
    return true
  }), [rows, filterPartner, filterTelecom, filterBrand, filterApplianceCategory, filterPeriod, activeTab])

  const kpis = useMemo(() => calcMarginKpis(kpiRows, baselineRate), [kpiRows, baselineRate])

  const displayRows = useMemo(() => {
    let r = kpiRows
    if (belowBaselineOnly) r = r.filter(row => row.estimatedMarginRate < baselineRate)
    if (givesMoreOnly) r = r.filter(row => row.competitorGivesMore)
    if (filterProduct.trim()) {
      const keyword = filterProduct.trim().toLowerCase()
      r = r.filter(row => row.product.name.toLowerCase().includes(keyword))
    }
    return r
  }, [kpiRows, belowBaselineOnly, givesMoreOnly, baselineRate, filterProduct])

  // 상품+조사월 단위로 묶어서, 같은 상품을 조사한 여러 경쟁사의 지원금·마진을 한 카드에서 비교한다.
  const groupedRows = useMemo(() => {
    const groups = new Map<string, ProductGroup>()
    for (const r of displayRows) {
      const key = `${r.product.id}::${r.subsidy.survey_year}::${r.subsidy.survey_month}`
      const existing = groups.get(key)
      if (existing) {
        existing.competitors.push(r)
      } else {
        groups.set(key, {
          key,
          product: r.product,
          surveyYear: r.subsidy.survey_year,
          surveyMonth: r.subsidy.survey_month,
          rentreSubsidy: r.rentreSubsidy,
          otherPartnerSubsidy: r.otherPartnerSubsidy,
          otherPartnerName: r.otherPartnerName,
          otherPartnerMarginRate: r.otherPartnerMarginRate,
          rentreMarginRate: r.rentreMarginRate,
          rentreCommission: r.rentreCommission,
          rentreBadDebt: r.rentreBadDebt,
          topSubsidySubsidyId: r.subsidy.id,
          competitors: [r],
        })
      }
    }

    const list = Array.from(groups.values())
    for (const group of list) {
      group.topSubsidySubsidyId = group.competitors.reduce(
        (max, r) => (r.subsidy.subsidy > max.subsidy.subsidy ? r : max)
      ).subsidy.id
      if (sortColumn) {
        const sign = sortDir === 'asc' ? 1 : -1
        group.competitors.sort((a, b) => sign * (a[sortColumn] - b[sortColumn]))
      } else {
        // 기본 정렬: 지원금을 많이 주는 경쟁사가 위로
        group.competitors.sort((a, b) => b.subsidy.subsidy - a.subsidy.subsidy)
      }
    }

    list.sort((a, b) => {
      if (a.surveyYear !== b.surveyYear) return b.surveyYear - a.surveyYear
      if (a.surveyMonth !== b.surveyMonth) return b.surveyMonth - a.surveyMonth
      return a.product.name.localeCompare(b.product.name, 'ko')
    })
    return list
  }, [displayRows, sortColumn, sortDir])

  // "전체 통신사"(TPS)/"전체 브랜드"(가전)를 볼 때만 소제목으로 묶는다 — 특정 값으로 이미
  // 필터링했으면 헤더가 하나만 반복돼서 의미가 없으므로 그 경우엔 그냥 상품 카드만 나열한다.
  function buildInnerSections(groups: ProductGroup[]): CardSection[] | null {
    if (activeTab === 'tps') {
      if (filterTelecom !== '전체') return null
      const grouped = new Map<string, ProductGroup[]>()
      for (const group of groups) {
        const key = group.product.telecom ?? '미지정'
        const list = grouped.get(key) ?? []
        list.push(group)
        grouped.set(key, list)
      }
      const order = [...telecomOptions, '미지정']
      return order
        .filter(t => grouped.has(t))
        .map(t => ({ label: t === '미지정' ? '미지정' : TELECOM_LABELS[t as Telecom], groups: grouped.get(t)! }))
    }

    if (applianceGroupBy === 'category') {
      if (filterApplianceCategory !== '전체') return null
      const grouped = new Map<string, ProductGroup[]>()
      for (const group of groups) {
        const key = group.product.appliance_category ?? '미지정'
        const list = grouped.get(key) ?? []
        list.push(group)
        grouped.set(key, list)
      }
      const order = [...applianceCategoryOptions, '미지정']
      return order
        .filter(c => grouped.has(c))
        .map(c => ({ label: c, groups: grouped.get(c)! }))
    }

    if (filterBrand !== '전체') return null
    const grouped = new Map<string, ProductGroup[]>()
    for (const group of groups) {
      const key = group.product.brand ?? '미지정'
      const list = grouped.get(key) ?? []
      list.push(group)
      grouped.set(key, list)
    }
    const order = [...brandOptions, '미지정']
    return order
      .filter(b => grouped.has(b))
      .map(b => ({ label: b, groups: grouped.get(b)! }))
  }

  // 조사월을 "전체"로 볼 때만 월별로 가장 바깥에서 묶고, 그 안에서 통신사/브랜드로 다시 나눈다
  // (동일 상품이 월마다 지원금이 달라질 수 있어서 월 단위 비교가 필요하다는 요청).
  const sections = useMemo(() => {
    if (filterPeriod !== '전체') return buildInnerSections(groupedRows)
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupedRows, filterPeriod, activeTab, filterTelecom, filterBrand, filterApplianceCategory, applianceGroupBy, telecomOptions, brandOptions, applianceCategoryOptions])

  const monthSections = useMemo(() => {
    if (filterPeriod !== '전체') return null
    const byMonth = new Map<string, ProductGroup[]>()
    for (const group of groupedRows) {
      const key = `${group.surveyYear}-${String(group.surveyMonth).padStart(2, '0')}`
      const list = byMonth.get(key) ?? []
      list.push(group)
      byMonth.set(key, list)
    }
    return Array.from(byMonth.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([label, groups]) => ({ label, groups, inner: buildInnerSections(groups) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupedRows, filterPeriod, activeTab, filterTelecom, filterBrand, filterApplianceCategory, applianceGroupBy, telecomOptions, brandOptions, applianceCategoryOptions])

  function handleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDir('asc')
    }
  }

  async function saveBaselineRate(category: 'tps' | 'appliance', percentInput: string) {
    const rate = Number(percentInput) / 100
    const field = category === 'tps' ? 'tps_baseline_rate' : 'appliance_baseline_rate'
    const res = await fetch('/api/margin-analysis/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: rate }),
    })
    const json = await res.json()
    if (json.error) {
      alert(json.error)
      return
    }
    if (category === 'tps') setTpsBaselineRate(rate)
    else setApplianceBaselineRate(rate)
  }

  async function saveBadDebtRate(category: 'tps' | 'appliance', percentInput: string) {
    const rate = Number(percentInput) / 100
    const field = category === 'tps' ? 'tps_bad_debt_rate' : 'appliance_bad_debt_rate'
    const res = await fetch('/api/margin-analysis/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: rate }),
    })
    const json = await res.json()
    if (json.error) alert(json.error)
  }

  async function handleSurveyUpload() {
    if (!uploadFile) return
    setUploadError(null)
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', uploadFile)

      const res = await fetch('/api/margin-analysis/survey-upload', { method: 'POST', body: form })
      const json = await res.json()
      if (json.error) {
        setUploadError(json.error)
        return
      }
      setUploadResult({ matched: json.matched, marginEstimates: json.marginEstimates })
      setUnmatched(json.unmatched ?? [])
      setSubsidyMissing(json.subsidyMissing ?? [])
      setCrossValidationFlags(json.crossValidationFlags ?? [])
      setUploadPeriods(json.periods ?? [])
    } catch {
      setUploadError('업로드 중 오류가 발생했습니다. 네트워크 상태를 확인하고 다시 시도해주세요.')
    } finally {
      setUploading(false)
    }
  }

  const tpsProducts = products.filter(p => p.category === 'tps')

  function renderGroupCard(group: ProductGroup) {
    const expanded = expandedKeys.has(group.key)
    return (
      <div key={group.key} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          onClick={() => toggleGroup(group.key)}
          className="w-full text-left px-4 py-3 bg-gray-50/60 hover:bg-gray-100/60 border-b border-gray-100 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
            <span className="text-sm font-semibold text-gray-900">{group.product.name}</span>
            {activeTab === 'tps' && group.product.telecom && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{TELECOM_LABELS[group.product.telecom]}</span>
            )}
            {activeTab === 'appliance' && group.product.appliance_category && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{group.product.appliance_category}</span>
            )}
            <span className="text-xs text-gray-400">{group.surveyYear}-{String(group.surveyMonth).padStart(2, '0')}</span>
            <span className="text-xs text-gray-400">경쟁사 {group.competitors.length}곳</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            <span>
              {activeTab === 'tps' ? '렌트리 실질지원금' : '렌트리 지원금'}{' '}
              <span className="font-semibold text-gray-900">{formatKRW(group.rentreSubsidy)}</span>
            </span>
            {activeTab === 'appliance' && group.otherPartnerSubsidy !== null && (
              <span>
                타파트너 최고가{' '}
                <span className="font-semibold text-gray-900">{formatKRW(group.otherPartnerSubsidy)}</span>
                <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-blue-50 text-blue-600">{group.otherPartnerName}</span>
                <span className="text-gray-400 ml-1">(추정 타겟마진율 {formatPercent(group.otherPartnerMarginRate!)})</span>
              </span>
            )}
            <span>매출 <span className="text-gray-700">{formatKRW(group.rentreCommission)}</span></span>
            <span>대손비 <span className="text-gray-700">{formatKRW(group.rentreBadDebt)}</span></span>
            <span>렌트리 타겟마진율 <span className="font-semibold text-gray-900">{formatPercent(group.rentreMarginRate)}</span></span>
          </div>
        </button>
        {expanded && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500">
                <th className="text-left py-2 px-4 font-medium">경쟁사</th>
                <th className="text-right py-2 px-3 font-medium">경쟁사 지원금</th>
                <th className="text-right py-2 px-3 font-medium cursor-pointer select-none hover:text-gray-700"
                  onClick={() => handleSort('subsidyDiff')}>
                  지원금 차이{sortColumn === 'subsidyDiff' && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                </th>
                <th className="text-right py-2 px-3 font-medium">추정 타겟마진</th>
                <th className="text-right py-2 px-4 font-medium cursor-pointer select-none hover:text-gray-700"
                  onClick={() => handleSort('estimatedMarginRate')}>
                  경쟁사 추정 타겟마진율{sortColumn === 'estimatedMarginRate' && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                </th>
              </tr>
            </thead>
            <tbody>
              {group.competitors.map(r => (
                <tr key={r.subsidy.id} className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50">
                  <td className="py-2.5 px-4">
                    {r.subsidy.partner_name}
                    {r.subsidy.id === group.topSubsidySubsidyId && group.competitors.length > 1 && (
                      <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-amber-50 text-amber-600">최다 지원금</span>
                    )}
                    {!r.subsidy.bad_debt_applicable && (
                      <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-amber-50 text-amber-600">대손비 미적용</span>
                    )}
                  </td>
                  <td className={`py-2.5 px-3 text-right ${
                    r.subsidy.id === group.topSubsidySubsidyId && group.competitors.length > 1 ? 'text-amber-600 font-semibold' : ''
                  }`}>
                    {formatKRW(r.subsidy.subsidy)}
                  </td>
                  <td className={`py-2.5 px-3 text-right font-medium ${r.subsidyDiff >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    {formatSignedKRW(r.subsidyDiff)}
                  </td>
                  <td className="py-2.5 px-3 text-right">{formatKRW(r.estimatedMargin)}</td>
                  <td className={`py-2.5 px-4 text-right font-semibold ${r.estimatedMarginRate >= baselineRate ? 'text-green-700' : 'text-red-600'}`}>
                    {formatPercent(r.estimatedMarginRate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-gray-200">
        <button onClick={() => handleTabChange('tps')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${activeTab === 'tps' ? 'border-gray-800 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
          인터넷(TPS)
        </button>
        <button onClick={() => handleTabChange('appliance')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${activeTab === 'appliance' ? 'border-gray-800 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
          가전
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <input value={filterProduct} onChange={e => setFilterProduct(e.target.value)}
            placeholder="상품명 검색"
            className="text-xs rounded-lg border border-gray-200 px-2.5 py-1.5 bg-white w-36" />
          <select value={filterPartner} onChange={e => setFilterPartner(e.target.value)}
            className="text-xs rounded-lg border border-gray-200 px-2.5 py-1.5 bg-white">
            {partnerOptions.map(p => <option key={p} value={p}>{p === '전체' ? '전체 경쟁사' : p}</option>)}
          </select>
          {activeTab === 'tps' && (
            <select value={filterTelecom} onChange={e => setFilterTelecom(e.target.value as Telecom | '전체')}
              className="text-xs rounded-lg border border-gray-200 px-2.5 py-1.5 bg-white">
              <option value="전체">전체 통신사</option>
              {telecomOptions.map(t => <option key={t} value={t}>{TELECOM_LABELS[t]}</option>)}
            </select>
          )}
          {activeTab === 'appliance' && (
            <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)}
              className="text-xs rounded-lg border border-gray-200 px-2.5 py-1.5 bg-white">
              <option value="전체">전체 브랜드</option>
              {brandOptions.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
          {activeTab === 'appliance' && (
            <select value={filterApplianceCategory} onChange={e => setFilterApplianceCategory(e.target.value)}
              className="text-xs rounded-lg border border-gray-200 px-2.5 py-1.5 bg-white">
              <option value="전체">전체 카테고리</option>
              {applianceCategoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {activeTab === 'appliance' && (
            <div className="flex text-xs rounded-lg border border-gray-200 overflow-hidden">
              <button onClick={() => setApplianceGroupBy('brand')}
                className={`px-2.5 py-1.5 ${applianceGroupBy === 'brand' ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                브랜드별
              </button>
              <button onClick={() => setApplianceGroupBy('category')}
                className={`px-2.5 py-1.5 border-l border-gray-200 ${applianceGroupBy === 'category' ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                카테고리별
              </button>
            </div>
          )}
          <select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)}
            className="text-xs rounded-lg border border-gray-200 px-2.5 py-1.5 bg-white">
            {periodOptions.map(p => <option key={p} value={p}>{p === '전체' ? '전체 조사월' : p}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input type="checkbox" checked={belowBaselineOnly} onChange={e => setBelowBaselineOnly(e.target.checked)} />
            ⚠ 기준선 미달만
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input type="checkbox" checked={givesMoreOnly} onChange={e => setGivesMoreOnly(e.target.checked)} />
            경쟁사 더 줌만
          </label>
          <span className="text-xs text-gray-400">{displayRows.length}건</span>
          {groupedRows.length > 0 && (
            <button
              onClick={() => setExpandedKeys(
                expandedKeys.size === groupedRows.length ? new Set() : new Set(groupedRows.map(g => g.key))
              )}
              className="text-xs text-blue-600 hover:underline">
              {expandedKeys.size === groupedRows.length ? '전체 접기' : '전체 펼치기'}
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {activeTab === 'tps' ? (
            <div className="flex items-center gap-1.5 text-xs text-gray-600" title="기준선 미달 배지·색상·그래프 기준선에만 반영되고, 표의 마진율 숫자 자체는 바뀌지 않습니다.">
              인터넷 타겟마진율
              <input value={tpsBaselineInput} onChange={e => setTpsBaselineInput(e.target.value)}
                className="w-14 border border-gray-200 rounded px-1.5 py-1 text-right" />
              %
              <button onClick={() => saveBaselineRate('tps', tpsBaselineInput)} className="text-blue-600 hover:underline">저장</button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-gray-600" title="기준선 미달 배지·색상·그래프 기준선에만 반영되고, 표의 마진율 숫자 자체는 바뀌지 않습니다.">
              가전 타겟마진율
              <input value={applianceBaselineInput} onChange={e => setApplianceBaselineInput(e.target.value)}
                className="w-14 border border-gray-200 rounded px-1.5 py-1 text-right" />
              %
              <button onClick={() => saveBaselineRate('appliance', applianceBaselineInput)} className="text-blue-600 hover:underline">저장</button>
            </div>
          )}
          {activeTab === 'tps' && (
            <button onClick={() => setShowForm(v => !v)}
              className="px-3 py-1.5 text-xs font-medium bg-gray-800 text-white rounded-lg hover:bg-gray-900">
              {showForm ? '입력 폼 닫기' : '+ 인터넷 지원금 입력'}
            </button>
          )}
          {activeTab === 'appliance' && (
            <button onClick={handleApplianceSync} disabled={applianceSyncing}
              className="px-3 py-1.5 text-xs font-medium bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:bg-gray-400">
              {applianceSyncing ? '동기화 중...' : '가전 렌트리 지원금 동기화'}
            </button>
          )}
        </div>
      </div>

      <MarginKpiCards kpis={kpis} baselineRate={baselineRate} />

      <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 flex flex-wrap items-center gap-4">
        {activeTab === 'tps' ? (
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            TPS 대손비율
            <input value={tpsBadDebtInput} onChange={e => setTpsBadDebtInput(e.target.value)}
              className="w-14 border border-gray-200 rounded px-1.5 py-1 text-right" />
            %
            <button onClick={() => saveBadDebtRate('tps', tpsBadDebtInput)} className="text-blue-600 hover:underline">저장</button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            가전 대손비율
            <input value={applianceBadDebtInput} onChange={e => setApplianceBadDebtInput(e.target.value)}
              className="w-14 border border-gray-200 rounded px-1.5 py-1 text-right" />
            %
            <button onClick={() => saveBadDebtRate('appliance', applianceBadDebtInput)} className="text-blue-600 hover:underline">저장</button>
          </div>
        )}
        <span className="text-[11px] text-gray-400">
          아래 표의 대손비는 Redash 기준 상품별 고정값이라 이 비율은 표 숫자에는 반영되지 않고, 엑셀 업로드 미리보기·홈 프라이싱 전략 패널 계산에만 쓰입니다.
        </span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <input type="file" accept=".xlsx" disabled={uploading} onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
            className="text-xs" title="최종 정리 시트 (유심/인터넷/가전)" />
          <button onClick={handleSurveyUpload} disabled={uploading}
            className="px-3 py-1.5 text-xs font-medium bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:bg-gray-400 disabled:cursor-not-allowed inline-flex items-center gap-1.5">
            {uploading && (
              <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            {uploading ? '업로드 중... (최대 2분 소요)' : '업로드 및 비교'}
          </button>
        </div>
        {uploadError && <div className="text-xs text-red-600">{uploadError}</div>}
        {uploadResult && (
          <div className="text-xs text-gray-600">
            매칭 {uploadResult.matched}건 · 미매칭 {unmatched.length}건
            {subsidyMissing.length > 0 && <span className="text-amber-600"> · 지원금 미입력 {subsidyMissing.length}건</span>}
            {crossValidationFlags.length > 0 && <span className="text-red-600"> · ⚠️ 업체 간 응답 차이 큰 항목 {crossValidationFlags.length}건</span>}
            {uploadPeriods.length > 0 && <span> · 반영된 조사월: {uploadPeriods.join(', ')}</span>}
          </div>
        )}
      </div>

      {subsidyMissing.length > 0 && (
        <div className="bg-white rounded-xl border border-amber-200 px-5 py-3">
          <div className="text-xs font-medium text-amber-700 mb-2">지원금 미입력 항목 (자동 보정 불가 — 원본 시트 확인 필요)</div>
          <table className="w-full text-xs">
            <tbody>
              {subsidyMissing.map((entry, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="py-1.5 pr-3">{String(entry.category ?? '')}</td>
                  <td className="py-1.5 pr-3">{String(entry.partner_name ?? '')}</td>
                  <td className="py-1.5 pr-3">{String(entry.model_name ?? entry.model_number ?? '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {crossValidationFlags.length > 0 && (
        <div className="bg-white rounded-xl border border-red-200 px-5 py-3">
          <div className="text-xs font-medium text-red-700 mb-2">⚠️ 업체 간 응답 차이가 큰 항목 (15% 초과)</div>
          <table className="w-full text-xs">
            <tbody>
              {crossValidationFlags.map((flag, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="py-1.5 pr-3">{flag.product_name}</td>
                  <td className="py-1.5 pr-3">{flag.partner_name}</td>
                  <td className="py-1.5 pr-3">{flag.values.map(v => v.toLocaleString('ko-KR')).join(' / ')}</td>
                  <td className="py-1.5 pr-3 text-red-600">{(flag.diffPercent * 100).toFixed(0)}% 차이</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {unmatched.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-3">
          <div className="text-xs font-medium text-gray-600 mb-2">미매칭 항목 검토</div>
          <table className="w-full text-xs">
            <tbody>
              {unmatched.map((entry, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="py-1.5 pr-3">{String(entry.partner_name ?? '')}</td>
                  <td className="py-1.5 pr-3">{String(entry.model_name ?? entry.model_number ?? '')}</td>
                  <td className="py-1.5 pr-3">{entry.contract_period ? `${entry.contract_period}개월` : '-'}</td>
                  <td className="py-1.5 pr-3">{String(entry.subsidy ?? '')}원</td>
                  <td className="py-1.5 pr-3">
                    <select value={unmatchedPicks[i] ?? ''} onChange={e => setUnmatchedPicks(p => ({ ...p, [i]: e.target.value }))}
                      className="border border-gray-200 rounded px-1.5 py-1">
                      <option value="">상품 선택</option>
                      {Array.isArray(entry.suggestions) && entry.suggestions.length > 0 && (
                        <optgroup label="🔎 추천">
                          {(entry.suggestions as { id: string; name: string; brand: string | null; contractPeriod: number | null }[]).map(s => (
                            <option key={`suggested-${s.id}`} value={s.id}>
                              {s.brand} {s.name}{s.contractPeriod ? ` · ${s.contractPeriod}개월` : ''}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label="전체">
                        {products
                          .filter(p => p.category === (entry.telecom ? 'tps' : 'appliance'))
                          .filter(p => !entry.brand || p.brand === entry.brand)
                          .map(p => (
                            <option key={p.id} value={p.id}>
                              {p.brand} {p.name}{p.contract_period ? ` · ${p.contract_period}개월` : ''}
                            </option>
                          ))}
                      </optgroup>
                    </select>
                  </td>
                  <td className="py-1.5">
                    <button
                      disabled={!unmatchedPicks[i]}
                      onClick={async () => {
                        const res = await fetch('/api/margin-analysis/subsidies', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            entries: [{
                              product_id: unmatchedPicks[i],
                              partner_name: entry.partner_name,
                              survey_year: Number(entry.survey_year),
                              survey_month: Number(entry.survey_month),
                              subsidy: entry.subsidy,
                              bad_debt_applicable: true,
                              category: entry.category,
                            }],
                          }),
                        })
                        const json = await res.json()
                        if (!json.error) setUnmatched(u => u.filter((_, idx) => idx !== i))
                      }}
                      className="text-blue-600 hover:underline disabled:text-gray-300"
                    >
                      매칭 확정
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'tps' && showForm && (
        <CompetitorSubsidyForm tpsProducts={tpsProducts} onSaved={() => window.location.reload()} />
      )}

      {kpis.byPartner.length > 0 && (
        <MarginPartnerBarChart data={kpis.byPartner} baselineRate={baselineRate} period={filterPeriod === '전체' ? '전체 기간 평균' : filterPeriod} />
      )}

      <div className="space-y-3">
        {monthSections ? (
          monthSections.map(month => (
            <div key={month.label} className="space-y-3 pt-3 border-t border-gray-200 first:border-t-0 first:pt-0">
              <div className="text-sm font-semibold text-gray-700">{month.label} ({month.groups.length})</div>
              {month.inner ? (
                month.inner.map(section => (
                  <div key={section.label} className="space-y-3 pl-3 border-l-2 border-gray-100">
                    <div className="text-xs font-semibold text-gray-500">{section.label} ({section.groups.length})</div>
                    {section.groups.map(renderGroupCard)}
                  </div>
                ))
              ) : (
                month.groups.map(renderGroupCard)
              )}
            </div>
          ))
        ) : sections ? (
          sections.map(section => (
            <div key={section.label} className="space-y-3">
              <div className="text-xs font-semibold text-gray-500 pt-1">{section.label} ({section.groups.length})</div>
              {section.groups.map(renderGroupCard)}
            </div>
          ))
        ) : (
          groupedRows.map(renderGroupCard)
        )}
        {groupedRows.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-sm text-gray-400">
            경쟁사 지원금 데이터가 없습니다
          </div>
        )}
      </div>
    </div>
  )
}
