'use client'

import { useState, useCallback, useEffect, useMemo, useDeferredValue } from 'react'
import {
  CATEGORY_FIELDS, FIELD_LABELS, BRAND_FIELD, SECONDARY_FILTER_FIELD, TABLE_COLUMNS, SurveyCategory,
} from '@/lib/tps/surveySelection'

interface CatalogItem {
  key: string
  surveyCount: number
  lastSurveyYear: number | null
  lastSurveyMonth: number | null
  [field: string]: unknown
}

interface CandidatesResponse {
  items: CatalogItem[]
  skippedCount: number
  usedCache: boolean
  syncedAt: string | null
  error?: string
}

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || ''

export function SurveySelectionCatalog({ category }: { category: SurveyCategory }) {
  const [data, setData] = useState<CandidatesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [brandFilter, setBrandFilter] = useState('전체')
  const [secondaryFilterValue, setSecondaryFilterValue] = useState('전체')
  const [search, setSearch] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmedItems, setConfirmedItems] = useState<CatalogItem[] | null>(null)

  const fields = CATEGORY_FIELDS[category]
  const tableColumns = TABLE_COLUMNS[category]
  const brandField = BRAND_FIELD[category]
  const secondaryField = SECONDARY_FILTER_FIELD[category]

  const load = useCallback(async (opts?: { preserveMessage?: boolean }) => {
    setLoading(true)
    if (!opts?.preserveMessage) setMessage(null)
    try {
      const res = await fetch(`${BASE_PATH}/api/survey-selection/candidates?category=${category}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '후보 조회 실패')
      setData(json)
      setChecked({})
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '알 수 없는 오류')
    } finally {
      setLoading(false)
    }
  }, [category])

  useEffect(() => {
    // Defer the initial load so the state writes inside `load` (setLoading/setMessage)
    // don't happen synchronously during the effect's own execution
    // (react-hooks/set-state-in-effect).
    const timer = setTimeout(() => {
      load()
    }, 0)
    return () => clearTimeout(timer)
  }, [load])

  const brands = useMemo(() => {
    if (!data) return []
    return Array.from(new Set(data.items.map((item) => String(item[brandField] ?? '')))).sort()
  }, [data, brandField])

  const secondaryOptions = useMemo(() => {
    if (!data) return []
    return Array.from(new Set(data.items.map((item) => String(item[secondaryField] ?? '')))).sort()
  }, [data, secondaryField])

  const deferredSearch = useDeferredValue(search)

  const filtered = useMemo(() => {
    if (!data) return []
    const q = deferredSearch.trim().toLowerCase()
    return data.items
      .filter((item) => brandFilter === '전체' || String(item[brandField]) === brandFilter)
      .filter((item) => secondaryFilterValue === '전체' || String(item[secondaryField]) === secondaryFilterValue)
      .filter((item) => {
        if (!q) return true
        return fields.map((f) => String(item[f] ?? '')).join(' ').toLowerCase().includes(q)
      })
      .sort((a, b) => a.surveyCount - b.surveyCount)
  }, [data, brandFilter, secondaryFilterValue, deferredSearch, brandField, secondaryField, fields])

  const toggle = (key: string) => setChecked((prev) => ({ ...prev, [key]: !prev[key] }))

  const confirm = async () => {
    if (!data) return
    const confirmed = data.items.filter((item) => checked[item.key])
    if (confirmed.length === 0) return
    setConfirming(true)
    setMessage(null)
    try {
      const res = await fetch(`${BASE_PATH}/api/survey-selection/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, confirmed }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '확정 실패')
      setConfirmedItems(confirmed)
      setMessage(`${json.confirmedCount}건 확정 완료 (${json.year}년 ${json.month}월)`)
      await load({ preserveMessage: true })
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '알 수 없는 오류')
    } finally {
      setConfirming(false)
    }
  }

  const copyConfirmed = async () => {
    if (!confirmedItems) return
    const header = tableColumns.map((f) => FIELD_LABELS[f] ?? f).join('\t')
    const rows = confirmedItems.map((item) => tableColumns.map((f) => String(item[f] ?? '')).join('\t'))
    await navigator.clipboard.writeText([header, ...rows].join('\n'))
    setMessage('클립보드에 복사했습니다. 구글시트에 붙여넣으세요.')
  }

  const checkedCount = Object.values(checked).filter(Boolean).length

  const formatFieldValue = (value: unknown) =>
    typeof value === 'number' ? `${value.toLocaleString()}원` : String(value ?? '-')

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select
          value={brandFilter}
          onChange={(e) => setBrandFilter(e.target.value)}
          className="px-2 py-1.5 rounded border border-gray-200 text-sm"
        >
          <option value="전체">전체 {FIELD_LABELS[brandField] ?? brandField}</option>
          {brands.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        <select
          value={secondaryFilterValue}
          onChange={(e) => setSecondaryFilterValue(e.target.value)}
          className="px-2 py-1.5 rounded border border-gray-200 text-sm"
        >
          <option value="전체">전체 {FIELD_LABELS[secondaryField] ?? secondaryField}</option>
          {secondaryOptions.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="제품명/모델 검색"
          className="px-3 py-1.5 rounded border border-gray-200 text-sm flex-1 min-w-[160px]"
        />
        <button onClick={() => load()} className="px-3 py-1.5 rounded bg-gray-100 text-sm">새로고침</button>
      </div>

      {message && <div className="mb-3 text-sm px-3 py-2 rounded bg-yellow-50 text-yellow-800">{message}</div>}
      {loading && <div className="text-sm text-gray-500">불러오는 중...</div>}

      {data && (
        <>
          {data.usedCache && (
            <div className="mb-3 text-xs px-3 py-2 rounded bg-red-50 text-red-700">
              Redash 연동 실패 — 마지막 동기화 결과 사용 중 (동기화 시각: {data.syncedAt})
            </div>
          )}
          {data.skippedCount > 0 && (
            <div className="mb-3 text-xs px-3 py-2 rounded bg-orange-50 text-orange-700">
              식별 정보가 불완전해 스킵된 항목 {data.skippedCount}건
            </div>
          )}

          <div className="text-xs text-gray-500 mb-2">{filtered.length}개 상품 · 조사횟수 적은 순</div>

          <div className="border border-gray-200 rounded-lg overflow-x-auto">
            {filtered.length === 0 ? (
              <p className="text-sm text-gray-400 py-12 text-center">조건에 맞는 상품이 없습니다.</p>
            ) : (
              <table className="min-w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
                    <th className="px-3 py-2 font-medium"></th>
                    {tableColumns.map((f) => (
                      <th key={f} className="px-3 py-2 font-medium">{FIELD_LABELS[f] ?? f}</th>
                    ))}
                    <th className="px-3 py-2 font-medium">조사 현황</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((item) => (
                    <tr key={item.key} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={!!checked[item.key]} onChange={() => toggle(item.key)} />
                      </td>
                      {tableColumns.map((f) => (
                        <td key={f} className="px-3 py-2 text-gray-700">{formatFieldValue(item[f])}</td>
                      ))}
                      <td className="px-3 py-2 text-xs text-gray-400">
                        {item.surveyCount > 0
                          ? `조사 ${item.surveyCount}회 · ${item.lastSurveyYear}/${item.lastSurveyMonth}`
                          : '미조사'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="sticky bottom-4 mt-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-lg px-5 py-4 flex items-center justify-between">
              <span className="text-sm text-gray-600">
                <span className="font-semibold text-gray-900">{checkedCount}개</span> 선택됨
              </span>
              <button
                onClick={confirm}
                disabled={confirming || checkedCount === 0}
                className="px-4 py-2 rounded bg-green-600 text-white text-sm disabled:opacity-50"
              >
                {confirming ? '확정 중...' : '이번 달 조사 상품 확정'}
              </button>
            </div>
          </div>
        </>
      )}

      {confirmedItems && (
        <div className="mt-6 border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">확정된 상품 ({confirmedItems.length}건)</span>
            <button onClick={copyConfirmed} className="px-3 py-1.5 rounded bg-blue-600 text-white text-xs">
              클립보드에 복사
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs whitespace-nowrap">
              <thead>
                <tr className="text-left text-gray-400">
                  {tableColumns.map((f) => (
                    <th key={f} className="px-2 py-1 font-medium">{FIELD_LABELS[f] ?? f}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {confirmedItems.map((item) => (
                  <tr key={item.key}>
                    {tableColumns.map((f) => (
                      <td key={f} className="px-2 py-1 text-gray-600">{formatFieldValue(item[f])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
