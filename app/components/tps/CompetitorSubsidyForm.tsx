'use client'

import { useState } from 'react'
import { Product } from '@/lib/tps/types'

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || ''

interface Row {
  product_id: string
  partner_name: string
  survey_year: number
  survey_month: number
  subsidy: string
  bad_debt_applicable: boolean
}

function emptyRow(year: number, month: number): Row {
  return { product_id: '', partner_name: '', survey_year: year, survey_month: month, subsidy: '', bad_debt_applicable: true }
}

export function CompetitorSubsidyForm({ tpsProducts, onSaved }: { tpsProducts: Product[]; onSaved: () => void }) {
  const now = new Date()
  const [rows, setRows] = useState<Row[]>([emptyRow(now.getFullYear(), now.getMonth() + 1)])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  function updateRow(index: number, patch: Partial<Row>) {
    setRows(prev => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function addRow() {
    setRows(prev => [...prev, emptyRow(now.getFullYear(), now.getMonth() + 1)])
  }

  function removeRow(index: number) {
    setRows(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit() {
    setSaving(true)
    setMessage(null)
    try {
      const entries = rows.map(r => ({
        product_id: r.product_id,
        partner_name: r.partner_name,
        survey_year: r.survey_year,
        survey_month: r.survey_month,
        subsidy: Number(r.subsidy),
        bad_debt_applicable: r.bad_debt_applicable,
      }))

      const res = await fetch(`${BASE_PATH}/api/margin-analysis/subsidies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)

      setMessage(`✓ ${json.saved}건 저장 완료`)
      setRows([emptyRow(now.getFullYear(), now.getMonth() + 1)])
      onSaved()
    } catch (e) {
      setMessage(`오류: ${e instanceof Error ? e.message : '알 수 없는 오류'}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="text-sm font-medium text-gray-700">인터넷(TPS) 경쟁사 지원금 입력</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 text-left">
              <th className="py-1 px-2">상품</th>
              <th className="py-1 px-2">경쟁사명</th>
              <th className="py-1 px-2">조사년</th>
              <th className="py-1 px-2">조사월</th>
              <th className="py-1 px-2">지원금</th>
              <th className="py-1 px-2">대손비 적용</th>
              <th className="py-1 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td className="py-1 px-2">
                  <select value={row.product_id} onChange={e => updateRow(i, { product_id: e.target.value })}
                    className="text-xs border border-gray-200 rounded px-1.5 py-1">
                    <option value="">선택</option>
                    {tpsProducts.map(p => <option key={p.id} value={p.id}>{p.telecom} {p.name}</option>)}
                  </select>
                </td>
                <td className="py-1 px-2">
                  <input value={row.partner_name} onChange={e => updateRow(i, { partner_name: e.target.value })}
                    className="text-xs border border-gray-200 rounded px-1.5 py-1 w-24" placeholder="아정당" />
                </td>
                <td className="py-1 px-2">
                  <input type="number" value={row.survey_year} onChange={e => updateRow(i, { survey_year: Number(e.target.value) })}
                    className="text-xs border border-gray-200 rounded px-1.5 py-1 w-16" />
                </td>
                <td className="py-1 px-2">
                  <input type="number" value={row.survey_month} onChange={e => updateRow(i, { survey_month: Number(e.target.value) })}
                    className="text-xs border border-gray-200 rounded px-1.5 py-1 w-12" />
                </td>
                <td className="py-1 px-2">
                  <input type="number" value={row.subsidy} onChange={e => updateRow(i, { subsidy: e.target.value })}
                    className="text-xs border border-gray-200 rounded px-1.5 py-1 w-24" placeholder="300000" />
                </td>
                <td className="py-1 px-2 text-center">
                  <input type="checkbox" checked={row.bad_debt_applicable}
                    onChange={e => updateRow(i, { bad_debt_applicable: e.target.checked })} />
                </td>
                <td className="py-1 px-2">
                  <button onClick={() => removeRow(i)} className="text-xs text-gray-400 hover:text-red-500">삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={addRow} className="text-xs text-blue-600 hover:underline">+ 행 추가</button>
        <button onClick={handleSubmit} disabled={saving}
          className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {saving ? '저장 중...' : '저장'}
        </button>
        {message && <span className="text-xs text-gray-600">{message}</span>}
      </div>
    </div>
  )
}
