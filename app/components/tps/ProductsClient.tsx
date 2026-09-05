'use client'

import { useState } from 'react'
import { Dialog } from '@base-ui-components/react/dialog'
import { supabase } from '@/lib/supabase'
import {
  Product, Category, Telecom, ProductType, ApplianceCategory,
  CATEGORY_LABELS, APPLIANCE_CATEGORIES, calcRoom,
} from '@/lib/tps/types'

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || ''

const TELECOMS: Telecom[] = ['SKB', 'LGU+', 'KT']
const TELECOM_DISPLAY: Record<Telecom, string> = { SKB: 'SK 브로드밴드', 'LGU+': 'LG U+', KT: 'KT' }
const TPS_PRODUCT_TYPES: ProductType[] = ['인터넷', '인터넷+TV', '유심+인터넷', '유심+인터넷+TV']

function formatKRW(n: number) {
  return n.toLocaleString('ko-KR')
}

function wasSurveyedLastMonth(p: Product): boolean {
  if (!p.last_selected_year || !p.last_selected_month) return false
  const now = new Date()
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return p.last_selected_year === lastMonth.getFullYear() && p.last_selected_month === lastMonth.getMonth() + 1
}

// ── 상품 등록/수정 모달 ──────────────────────────────────────────────────────
function ProductModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Partial<Product> & { category: Category }
  onClose: () => void
  onSaved: (p: Product) => void
}) {
  const isEdit = !!initial.id
  const [form, setForm] = useState({
    category: initial.category,
    name: initial.name ?? '',
    brand: initial.brand ?? '',
    telecom: (initial.telecom ?? 'KT') as Telecom,
    product_type: (initial.product_type ?? '인터넷') as ProductType,
    has_usim_bundle: initial.has_usim_bundle ?? false,
    usim_product: initial.usim_product ?? '',
    model_number: initial.model_number ?? '',
    appliance_category: (initial.appliance_category ?? '정수기') as ApplianceCategory,
    management_type: initial.management_type ?? '자가(셀프) 관리',
    monthly_fee: initial.monthly_fee ?? 0,
    our_subsidy: initial.our_subsidy ?? 0,
    commission: initial.commission ?? 0,
    bad_debt: initial.bad_debt ?? 0,
    score: initial.score ?? 50,
    commission_key: initial.commission_key ?? '',
    commission_channel: initial.commission_channel ?? '백메가',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (k: keyof typeof form, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  function setCommission(value: number) {
    setForm(f => ({
      ...f,
      commission: value,
      bad_debt: Math.round(value * 0.05),
    }))
  }

  const room = form.commission - form.our_subsidy - form.bad_debt

  async function handleSave() {
    if (!form.name.trim()) { setError('상품명을 입력해주세요'); return }
    setLoading(true); setError('')
    const payload: Record<string, unknown> = {
      category: form.category,
      name: form.name.trim(),
      brand: form.brand || null,
      our_subsidy: form.our_subsidy,
      commission: form.commission,
      bad_debt: form.bad_debt,
      score: form.score,
    }
    if (form.category === 'tps' || form.category === 'usim') {
      payload.telecom = form.telecom
      payload.product_type = form.category === 'tps' ? form.product_type : null
      payload.has_usim_bundle = form.category === 'tps' && form.product_type.includes('유심')
      payload.usim_product = payload.has_usim_bundle ? form.usim_product || null : null
      payload.commission_key = form.commission_key || null
      payload.commission_channel = form.commission_key ? (form.commission_channel || '백메가') : null
    }
    if (form.category === 'appliance') {
      payload.appliance_category = form.appliance_category
      payload.model_number = form.model_number || null
      payload.management_type = form.management_type
      payload.monthly_fee = form.monthly_fee
    }

    try {
      let data: Product | null = null
      if (isEdit) {
        const res = await supabase.from('products').update(payload).eq('id', initial.id!).select().single()
        if (res.error) throw res.error
        data = res.data
      } else {
        const res = await supabase.from('products').insert({ ...payload, is_active: true }).select().single()
        if (res.error) throw res.error
        data = res.data
      }
      if (data) onSaved(data)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    /*
     * 부모가 조건부로 마운트하므로 open은 항상 true고, 닫기는 onClose로 위임한다.
     * disablePointerDismissal: 입력 중인 폼이라 바깥 클릭으로 닫히면 타이핑한 값이
     * 날아간다. 원래 동작(취소 버튼만 닫힘)을 유지하고 Escape만 새로 허용한다.
     */
    <Dialog.Root
      open
      disablePointerDismissal
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/40 z-50
          transition-opacity duration-200 ease-[var(--ease-out)]
          data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <Dialog.Viewport className="fixed inset-0 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <Dialog.Popup
            // 모달은 트리거에 앵커되지 않으므로 transform-origin 은 center 를 유지한다.
            // (팝오버와 다르게 처리하는 지점)
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-4
              transition-[opacity,transform] duration-200 ease-[var(--ease-out)]
              data-[starting-style]:opacity-0 data-[starting-style]:scale-[0.96]
              data-[ending-style]:opacity-0 data-[ending-style]:scale-[0.96]
              motion-reduce:transition-[opacity] motion-reduce:data-[starting-style]:scale-100
              motion-reduce:data-[ending-style]:scale-100"
          >
            <div className="px-6 py-4 border-b border-gray-100">
              <Dialog.Title className="font-semibold text-gray-900">
                {isEdit ? '상품 수정' : '상품 등록'} — {CATEGORY_LABELS[form.category]}
              </Dialog.Title>
            </div>
        <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">

          {/* 공통: 상품명 */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">상품명 *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder={form.category === 'appliance' ? '예: 퓨리케어 오브제컬렉션 냉온정 얼음정수기' : '예: 기가라이트 500 + 이코노미 183채널'}
            />
          </div>

          {/* TPS 전용 필드 */}
          {(form.category === 'tps' || form.category === 'usim') && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">통신사</label>
                  <select value={form.telecom} onChange={e => set('telecom', e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                    {TELECOMS.map(t => <option key={t} value={t}>{TELECOM_DISPLAY[t]}</option>)}
                  </select>
                </div>
                {form.category === 'tps' && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">구분</label>
                    <select value={form.product_type} onChange={e => set('product_type', e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                      {TPS_PRODUCT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                )}
              </div>
              {form.category === 'tps' && form.product_type.includes('유심') && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">유심 상품명</label>
                  <input value={form.usim_product} onChange={e => set('usim_product', e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="예: 5GX 레귤러"
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">수수료 키값</label>
                  <input value={form.commission_key} onChange={e => set('commission_key', e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="예: LGU100Mbps인"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">접수처</label>
                  <select value={form.commission_channel} onChange={e => set('commission_channel', e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                    <option value="백메가">백메가</option>
                    <option value="드림네트웍스">드림네트웍스</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {/* 가전 전용 필드 */}
          {form.category === 'appliance' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">브랜드</label>
                  <input value={form.brand} onChange={e => set('brand', e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="예: 코웨이, LG, 쿠쿠"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">카테고리</label>
                  <select value={form.appliance_category} onChange={e => set('appliance_category', e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                    {APPLIANCE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">모델명</label>
                  <input value={form.model_number} onChange={e => set('model_number', e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="예: WD722RE"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">월 요금 (원)</label>
                  <input type="number" value={form.monthly_fee} onChange={e => set('monthly_fee', Number(e.target.value))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">관리방식</label>
                <select value={form.management_type} onChange={e => set('management_type', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                  {['방문관리', '자가(셀프) 관리', '없음'].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </>
          )}

          {/* 공통: 지원금 정보 */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-500 mb-3 font-medium">자사 지원금 정보</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">수수료 (원)</label>
                <input type="number" value={form.commission} onChange={e => setCommission(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">자사지원금 (원)</label>
                <input type="number" value={form.our_subsidy} onChange={e => set('our_subsidy', Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-gray-500">대손비용 (원)</label>
                <button
                  type="button"
                  onClick={() => set('bad_debt', Math.round(form.commission * 0.05))}
                  className="text-[10px] text-blue-500 hover:underline"
                >
                  5% 자동계산 ({formatKRW(Math.round(form.commission * 0.05))})
                </button>
              </div>
              <input type="number" value={form.bad_debt} onChange={e => set('bad_debt', Number(e.target.value))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div className={`mt-3 px-3 py-2 rounded-lg text-xs font-semibold ${room > 0 ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-600'}`}>
              공헌이익 = 수수료 − 자사지원금 − 대손비용 = {formatKRW(room)}원
              {room <= 0 && ' ⚠️ 역마진'}
            </div>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">취소</button>
          <button onClick={handleSave} disabled={loading}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {loading ? '저장 중...' : isEdit ? '수정 완료' : '상품 등록'}
          </button>
        </div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ── TPS 상품 테이블 ──────────────────────────────────────────────────────────
function TpsTable({
  products,
  onEdit,
  onDelete,
}: {
  products: Product[]
  onEdit: (p: Product) => void
  onDelete: (id: string) => void
}) {
  if (products.length === 0) return (
    <p className="text-sm text-gray-400 py-8 text-center">등록된 TPS 상품이 없습니다.</p>
  )
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-xs text-gray-500">
            <th className="text-left py-2 pr-3 font-medium">통신사</th>
            <th className="text-left py-2 pr-3 font-medium">상품명</th>
            <th className="text-left py-2 pr-3 font-medium">구분</th>
            <th className="text-right py-2 pr-3 font-medium">KEY-IN</th>
            <th className="text-right py-2 pr-3 font-medium">자사지원금</th>
            <th className="text-right py-2 pr-3 font-medium">룸</th>
            <th className="text-center py-2 pr-3 font-medium">지난달 조사</th>
            <th className="text-center py-2 font-medium">선정 횟수</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {products.map(p => {
            const room = calcRoom(p)
            return (
              <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-2.5 pr-3">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                    p.telecom === 'KT' ? 'bg-red-100 text-red-700' :
                    p.telecom === 'LGU+' ? 'bg-pink-100 text-pink-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>{p.telecom}</span>
                </td>
                <td className="py-2.5 pr-3">
                  <div className="font-medium text-gray-900">{p.name}</div>
                  {p.usim_product && <div className="text-xs text-gray-400">유심: {p.usim_product}</div>}
                </td>
                <td className="py-2.5 pr-3 text-xs text-gray-500">{p.product_type}</td>
                <td className="py-2.5 pr-3 text-right text-gray-700">{formatKRW(p.commission - p.our_subsidy)}</td>
                <td className="py-2.5 pr-3 text-right text-gray-700">{formatKRW(p.our_subsidy)}</td>
                <td className={`py-2.5 pr-3 text-right font-semibold ${room >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                  {formatKRW(room)}
                </td>
                <td className="py-2.5 pr-3 text-center">
                  {wasSurveyedLastMonth(p) ? (
                    <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-green-100 text-green-700">✓ 지난달 조사</span>
                  ) : (
                    <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-gray-100 text-gray-500">미조사</span>
                  )}
                </td>
                <td className="py-2.5 text-center text-xs text-gray-500">
                  {p.selection_count}회
                  {p.last_selected_year && (
                    <div className="text-gray-400">{p.last_selected_year}/{p.last_selected_month}</div>
                  )}
                </td>
                <td className="py-2.5 pl-2">
                  <div className="flex gap-2">
                    <button onClick={() => onEdit(p)} className="text-xs text-blue-600 hover:underline">수정</button>
                    <button onClick={() => onDelete(p.id)} className="text-xs text-red-400 hover:underline">삭제</button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── 가전 상품 테이블 ─────────────────────────────────────────────────────────
function ApplianceTable({
  products,
  onEdit,
  onDelete,
}: {
  products: Product[]
  onEdit: (p: Product) => void
  onDelete: (id: string) => void
}) {
  if (products.length === 0) return (
    <p className="text-sm text-gray-400 py-8 text-center">등록된 가전 상품이 없습니다.</p>
  )
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-xs text-gray-500">
            <th className="text-left py-2 pr-3 font-medium">카테고리</th>
            <th className="text-left py-2 pr-3 font-medium">브랜드</th>
            <th className="text-left py-2 pr-3 font-medium">상품명</th>
            <th className="text-left py-2 pr-3 font-medium">모델명</th>
            <th className="text-right py-2 pr-3 font-medium">월 요금</th>
            <th className="text-left py-2 pr-3 font-medium">관리방식</th>
            <th className="text-center py-2 font-medium">선정 횟수</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {products.map(p => (
            <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="py-2.5 pr-3">
                <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">
                  {p.appliance_category}
                </span>
              </td>
              <td className="py-2.5 pr-3 text-gray-700">{p.brand}</td>
              <td className="py-2.5 pr-3 font-medium text-gray-900">{p.name}</td>
              <td className="py-2.5 pr-3 text-xs text-gray-400 font-mono">{p.model_number}</td>
              <td className="py-2.5 pr-3 text-right">{p.monthly_fee > 0 ? `${formatKRW(p.monthly_fee)}원` : '-'}</td>
              <td className="py-2.5 pr-3 text-xs text-gray-500">{p.management_type}</td>
              <td className="py-2.5 text-center text-xs text-gray-500">{p.selection_count}회</td>
              <td className="py-2.5 pl-2">
                <div className="flex gap-2">
                  <button onClick={() => onEdit(p)} className="text-xs text-blue-600 hover:underline">수정</button>
                  <button onClick={() => onDelete(p.id)} className="text-xs text-red-400 hover:underline">삭제</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────────────────
export function ProductsClient({ initialProducts }: { initialProducts: Product[] }) {
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [activeTab, setActiveTab] = useState<Category>('tps')
  const [modal, setModal] = useState<{ open: boolean; product?: Product } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  async function handleSyncTps() {
    if (!confirm('Redash 4622(렌트리 통신 데이터)에서 TPS 상품의 실질지원금·매출·대손을 가져와 갱신합니다. 계속하시겠습니까?')) return
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch(`${BASE_PATH}/api/sync/tps`, { method: 'POST' })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setSyncResult(`✓ TPS ${json.matched}개 갱신 완료 (미매칭 ${json.unmatched}개)`)
      window.location.reload()
    } catch (e) {
      setSyncResult(`오류: ${e instanceof Error ? e.message : '알 수 없는 오류'}`)
    } finally {
      setSyncing(false)
    }
  }

  async function handleSyncAppliance() {
    if (!confirm('Redash에서 가전 상품 데이터를 가져옵니다.\n기존 가전 상품은 비활성화되고 새로 등록됩니다. 계속하시겠습니까?')) return
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch(`${BASE_PATH}/api/sync/appliance`, { method: 'POST' })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setSyncResult(`✓ 가전 ${json.inserted}개 상품 동기화 완료 (전체 ${json.total}행 → 렌트리 데이터 ${json.filtered}행)`)
      // 페이지 새로고침해서 최신 데이터 로드
      window.location.reload()
    } catch (e) {
      setSyncResult(`오류: ${e instanceof Error ? e.message : '알 수 없는 오류'}`)
    } finally {
      setSyncing(false)
    }
  }

  const tpsProducts = products.filter(p => p.category === 'tps')
    .sort((a, b) => (a.telecom ?? '').localeCompare(b.telecom ?? '') || a.name.localeCompare(b.name))
  const usimProducts = products.filter(p => p.category === 'usim')
    .sort((a, b) => (a.telecom ?? '').localeCompare(b.telecom ?? '') || a.name.localeCompare(b.name))
  const applianceProducts = products.filter(p => p.category === 'appliance')
    .sort((a, b) => b.selection_count - a.selection_count)

  function openAdd() {
    setModal({ open: true, product: { category: activeTab } as Product })
  }
  function openEdit(p: Product) {
    setModal({ open: true, product: p })
  }

  function handleSaved(saved: Product) {
    setProducts(prev => {
      const idx = prev.findIndex(p => p.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]; next[idx] = saved; return next
      }
      return [saved, ...prev]
    })
  }

  async function handleDelete(id: string) {
    if (!confirm('이 상품을 삭제하시겠습니까?')) return
    const { error } = await supabase.from('products').update({ is_active: false }).eq('id', id)
    if (!error) setProducts(prev => prev.filter(p => p.id !== id))
  }

  const tabConfig: { key: Category; label: string; count: number; color: string }[] = [
    { key: 'tps', label: 'TPS (인터넷)', count: tpsProducts.length, color: 'blue' },
    { key: 'usim', label: '유심', count: usimProducts.length, color: 'purple' },
    { key: 'appliance', label: '가전', count: applianceProducts.length, color: 'green' },
  ]

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* 탭 */}
        <div className="flex border-b border-gray-200">
          {tabConfig.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`press flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50/50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.label}
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === tab.key ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
              }`}>{tab.count}</span>
            </button>
          ))}
        </div>

        {/* 상단 툴바 */}
        <div className="px-5 py-3 flex items-center justify-between border-b border-gray-100 bg-gray-50/50">
          <div className="text-xs text-gray-500">
            {activeTab !== 'appliance'
              ? '통신사·상품명순 정렬'
              : '선정 횟수 순으로 정렬 — 인기 상품이 우선 조사됩니다'}
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'tps' && (
              <button
                onClick={handleSyncTps}
                disabled={syncing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {syncing ? '동기화 중...' : '↻ 시트 동기화'}
              </button>
            )}
            {activeTab === 'appliance' && (
              <button
                onClick={handleSyncAppliance}
                disabled={syncing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {syncing ? '동기화 중...' : '↻ Redash 동기화'}
              </button>
            )}
            <button
              onClick={openAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              + 상품 추가
            </button>
          </div>
        </div>
        {syncResult && (
          <div className={`px-5 py-2 text-xs ${syncResult.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
            {syncResult}
          </div>
        )}

        {/* 테이블 */}
        <div className="p-5">
          {activeTab === 'tps' && (
            <TpsTable products={tpsProducts} onEdit={openEdit} onDelete={handleDelete} />
          )}
          {activeTab === 'usim' && (
            <TpsTable products={usimProducts} onEdit={openEdit} onDelete={handleDelete} />
          )}
          {activeTab === 'appliance' && (
            <ApplianceTable products={applianceProducts} onEdit={openEdit} onDelete={handleDelete} />
          )}
        </div>
      </div>

      {modal?.open && (
        <ProductModal
          initial={modal.product ?? { category: activeTab }}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  )
}
