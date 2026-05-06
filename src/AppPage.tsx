import { useState, useEffect } from 'react'
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc,
} from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { db, auth } from './firebase'
import type { Customer } from './types'
import MapView from './MapView'

async function nominatimFetch(
  q: string,
  jpOnly: boolean,
  timeoutMs = 5000,
): Promise<{ lat: number; lng: number } | null> {
  const params = new URLSearchParams({ q, format: 'json', limit: '1', 'accept-language': 'ja' })
  if (jpOnly) params.set('countrycodes', 'jp')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.length) return null
    const lat = parseFloat(data[0].lat)
    const lng = parseFloat(data[0].lon)
    return isNaN(lat) || isNaN(lng) ? null : { lat, lng }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// 住所末尾の番地（例: 8-29 / 1丁目2番3号）を取り除いて町名レベルにする
function stripStreetNumber(address: string): string {
  return address
    .replace(/[0-9０-９]+[-−ー][0-9０-９]+[-−ー][0-9０-９]+[号室]?$/, '')
    .replace(/[0-9０-９]+[-−ー][0-9０-９]+[番号室]?$/, '')
    .replace(/[0-9０-９]+丁目[0-9０-９]*番[0-9０-９]*号?$/, '')
    .replace(/[0-9０-９]+番地[0-9０-９]*号?$/, '')
    .trim()
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const stripped = stripStreetNumber(address)
  // フル住所・番地なし住所を同時並列で問い合わせ → 先に返ってきた有効な結果を使用
  const queries: string[] = [address]
  if (stripped && stripped !== address) queries.push(stripped)

  const results = await Promise.all(queries.map(q => nominatimFetch(q, true, 5000)))
  const hit = results.find(r => r !== null)
  return hit ?? null
}

function escapeHtml(str: string) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export default function AppPage() {
  const user = auth.currentUser!
  const [customers, setCustomers] = useState<Customer[]>([])
  const [activeTab, setActiveTab] = useState<'register' | 'list'>('register')
  const [placingFor, setPlacingFor] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Form state
  const [fName, setFName] = useState('')
  const [fAddress, setFAddress] = useState('')
  const [fProducts, setFProducts] = useState('')
  const [fSeq, setFSeq] = useState('')
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [geocodingIds, setGeocodingIds] = useState<Set<string>>(new Set())

  // Firestore realtime listener — scoped to this user
  // orderBy は複合インデックスが必要なのでクライアント側でソートする
  useEffect(() => {
    const q = query(
      collection(db, 'customers'),
      where('userId', '==', user.uid),
    )
    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer))
      docs.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
      setCustomers(docs)
    })
    return unsub
  }, [user.uid])

  const runGeocode = async (customerId: string, address: string) => {
    setGeocodingIds(prev => new Set(prev).add(customerId))
    const result = await geocodeAddress(address)
    await updateDoc(doc(db, 'customers', customerId), {
      lat: result?.lat ?? null,
      lng: result?.lng ?? null,
      geocoded: !!result,
    })
    setGeocodingIds(prev => { const s = new Set(prev); s.delete(customerId); return s })
    return !!result
  }

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setFormSuccess('')
    const name = fName.trim()
    const address = fAddress.trim()
    const products = fProducts.trim()
    if (!name) { setFormError('顧客名を入力してください'); return }
    if (!address) { setFormError('住所を入力してください'); return }
    let seqNum: number | null = null
    if (fSeq.trim() !== '') {
      seqNum = parseInt(fSeq.trim(), 10)
      if (isNaN(seqNum) || seqNum < 1) { setFormError('シーケンス番号は1以上の整数を入力してください'); return }
    }
    setSubmitting(true)
    const docRef = await addDoc(collection(db, 'customers'), {
      userId: user.uid,
      name, address, products,
      sequenceNumber: seqNum,
      lat: null, lng: null, geocoded: false,
      createdAt: Date.now(),
    })
    setFName(''); setFAddress(''); setFProducts(''); setFSeq('')
    setSubmitting(false)
    setActiveTab('list')
    setFormSuccess(`「${name}」を登録しました。位置情報を取得中...`)
    const ok = await runGeocode(docRef.id, address)
    if (ok) {
      setFormSuccess(`「${name}」を登録しました`)
    } else {
      setFormSuccess(`「${name}」を登録しました（位置情報は取得できませんでした。顧客一覧から地図で設定してください）`)
    }
  }

  const handleSeqChange = async (id: string, value: string) => {
    const n = value.trim() === '' ? null : parseInt(value, 10)
    if (value.trim() !== '' && (isNaN(n as number) || (n as number) < 1)) return
    await updateDoc(doc(db, 'customers', id), { sequenceNumber: n })
  }

  const handleDelete = async (id: string) => {
    await deleteDoc(doc(db, 'customers', id))
  }

  const handleMapClick = async (lat: number, lng: number) => {
    if (!placingFor) return
    await updateDoc(doc(db, 'customers', placingFor), { lat, lng, geocoded: true })
    setPlacingFor(null)
  }

  const sorted = [...customers].sort((a, b) => {
    if (a.sequenceNumber === null && b.sequenceNumber === null) return 0
    if (a.sequenceNumber === null) return 1
    if (b.sequenceNumber === null) return -1
    return a.sequenceNumber - b.sequenceNumber
  })

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: "'Segoe UI','Hiragino Sans','Meiryo',sans-serif", background: '#f0f2f5' }}>
      {/* Header */}
      <header style={{
        background: '#1a56db', color: 'white', padding: '10px 20px',
        display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 2px 6px rgba(0,0,0,0.2)', flexShrink: 0,
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/>
          <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
        </svg>
        <span style={{ fontWeight: 700, fontSize: '1.1rem', flex: 1 }}>配達業務管理</span>
        {/* サイドバー開閉ボタン */}
        <button onClick={() => setSidebarOpen(o => !o)} style={{
          background: sidebarOpen ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.2)',
          border: '1px solid rgba(255,255,255,0.4)',
          color: 'white', borderRadius: '6px', padding: '5px 12px',
          cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: '5px',
        }}>
          {sidebarOpen ? (
            <><span style={{ fontSize: '1rem' }}>✕</span> 閉じる</>
          ) : (
            <><span style={{ fontSize: '1rem' }}>☰</span> メニュー</>
          )}
        </button>
        <span style={{ fontSize: '0.78rem', opacity: 0.8, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user.displayName || user.email}
        </span>
        <button onClick={() => signOut(auth)} style={{
          background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)',
          color: 'white', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', fontSize: '0.82rem',
        }}>
          ログアウト
        </button>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar — メニューボタンで開閉 */}
        <aside style={{
          width: sidebarOpen ? '380px' : '0',
          flexShrink: 0, background: 'white',
          display: 'flex', flexDirection: 'column',
          borderRight: sidebarOpen ? '1px solid #e0e0e0' : 'none',
          overflow: 'hidden',
          transition: 'width 0.25s ease',
        }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e0e0e0', flexShrink: 0, minWidth: '380px' }}>
            {(['register', 'list'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                flex: 1, padding: '11px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
                background: activeTab === tab ? 'white' : '#f8f9fa',
                color: activeTab === tab ? '#1a56db' : '#666',
                borderBottom: activeTab === tab ? '2px solid #1a56db' : '2px solid transparent',
                transition: 'all 0.2s',
              }}>
                {tab === 'register' ? '顧客登録' : `顧客一覧 (${customers.length})`}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', minWidth: '380px' }}>
            {activeTab === 'register' ? (
              <form onSubmit={handleRegisterSubmit}>
                {formError && <div style={alertStyle('error')}>{formError}</div>}
                {formSuccess && <div style={alertStyle('success')}>{formSuccess}</div>}
                <FormField label="顧客名 *">
                  <input style={inputStyle} type="text" placeholder="例: 山田太郎" value={fName} onChange={e => setFName(e.target.value)} />
                </FormField>
                <FormField label="住所 *">
                  <input style={inputStyle} type="text" placeholder="例: 東京都千代田区丸の内1-1-1" value={fAddress} onChange={e => setFAddress(e.target.value)} />
                </FormField>
                <FormField label="商品情報">
                  <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }} placeholder="例: A商品×2、B商品×1" value={fProducts} onChange={e => setFProducts(e.target.value)} />
                </FormField>
                <FormField label="配達順序番号（空欄で後から設定可）">
                  <input style={inputStyle} type="number" min="1" placeholder="例: 1" value={fSeq} onChange={e => setFSeq(e.target.value)} />
                </FormField>
                <button type="submit" disabled={submitting} style={{
                  width: '100%', padding: '11px', border: 'none', borderRadius: '8px',
                  background: submitting ? '#93c5fd' : '#1a56db', color: 'white',
                  fontWeight: 700, fontSize: '0.92rem', cursor: submitting ? 'not-allowed' : 'pointer',
                }}>
                  {submitting ? '登録中...' : '顧客を登録する'}
                </button>
              </form>
            ) : (
              sorted.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#9ca3af', padding: '30px 0', fontSize: '0.85rem', lineHeight: 1.8 }}>
                  登録された顧客がありません。<br />「顧客登録」タブから追加してください。
                </p>
              ) : (
                sorted.map(c => (
                  <CustomerCard
                    key={c.id}
                    customer={c}
                    isGeocoding={geocodingIds.has(c.id)}
                    onSeqChange={handleSeqChange}
                    onDelete={handleDelete}
                    onRunGeocode={() => runGeocode(c.id, c.address)}
                    onStartPlacement={() => setPlacingFor(c.id)}
                  />
                ))
              )
            )}
          </div>
        </aside>

        {/* Map */}
        <MapView
          customers={customers}
          onMapClick={handleMapClick}
          placingFor={placingFor}
          placingForName={placingFor ? (customers.find(c => c.id === placingFor)?.name ?? '') : ''}
          onCancelPlacement={() => setPlacingFor(null)}
        />
      </div>
    </div>
  )
}

// Sub-components

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#555', marginBottom: '4px' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function CustomerCard({
  customer: c, isGeocoding, onSeqChange, onDelete, onRunGeocode, onStartPlacement,
}: {
  customer: Customer
  isGeocoding: boolean
  onSeqChange: (id: string, val: string) => void
  onDelete: (id: string) => void
  onRunGeocode: () => void
  onStartPlacement: () => void
}) {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '12px', marginBottom: '10px', background: '#fafafa' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
          background: c.sequenceNumber !== null ? '#1a56db' : '#9ca3af',
          color: 'white', fontWeight: 700, fontSize: '0.82rem',
        }}>
          {c.sequenceNumber ?? '?'}
        </div>
        <span style={{ fontWeight: 600, fontSize: '0.95rem', flex: 1 }}>{escapeHtml(c.name)}</span>
        <span style={{
          fontSize: '0.72rem', padding: '2px 7px', borderRadius: '4px',
          background: c.geocoded ? '#dcfce7' : '#fef2f2',
          color: c.geocoded ? '#166534' : '#991b1b',
        }}>
          {isGeocoding ? '取得中...' : (c.geocoded ? '位置OK' : '未取得')}
        </span>
      </div>
      <div style={detailStyle}><span style={labelStyle}>住所</span><span>{escapeHtml(c.address)}</span></div>
      {c.products && <div style={detailStyle}><span style={labelStyle}>商品</span><span>{escapeHtml(c.products)}</span></div>}

      {/* 位置未取得の場合は目立つ案内を表示 */}
      {!c.geocoded && !isGeocoding && (
        <div style={{
          marginTop: '8px', background: '#fff7ed', border: '1px solid #fed7aa',
          borderRadius: '7px', padding: '8px 10px', fontSize: '0.78rem', color: '#92400e',
        }}>
          <div style={{ fontWeight: 700, marginBottom: '4px' }}>⚠ 位置情報を取得できませんでした</div>
          <div style={{ marginBottom: '6px', lineHeight: 1.5 }}>
            右の地図を目的地付近まで移動し、<b>「📍 地図でクリック設定」</b>ボタンを押してから地図上をクリックしてください。
          </div>
          <button
            onClick={onStartPlacement}
            style={{
              width: '100%', padding: '6px', border: 'none', borderRadius: '6px',
              background: '#f97316', color: 'white', fontWeight: 700, fontSize: '0.82rem',
              cursor: 'pointer',
            }}
          >
            📍 地図でクリック設定
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '6px', marginTop: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.78rem', color: '#4b5563' }}>順序:</span>
        <input
          type="number" min="1" placeholder="番号"
          defaultValue={c.sequenceNumber ?? ''}
          key={c.sequenceNumber ?? 'null'}
          onChange={e => onSeqChange(c.id, e.target.value)}
          style={{ width: '62px', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: '5px', fontSize: '0.85rem', textAlign: 'center' }}
        />
        {!c.geocoded && !isGeocoding && (
          <button onClick={onRunGeocode} style={smallBtn('#e5e7eb', '#374151')}>住所で再取得</button>
        )}
        {c.geocoded && (
          <button onClick={onStartPlacement} style={smallBtn('#0ea5e9', 'white')}>📍 地図で修正</button>
        )}
        <button onClick={() => onDelete(c.id)} style={smallBtn('#ef4444', 'white')}>削除</button>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '7px',
  fontSize: '0.9rem', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
}

const detailStyle: React.CSSProperties = {
  fontSize: '0.78rem', color: '#6b7280', marginBottom: '3px', display: 'flex', gap: '6px',
}
const labelStyle: React.CSSProperties = {
  fontWeight: 600, color: '#4b5563', minWidth: '38px',
}

function alertStyle(type: 'error' | 'success'): React.CSSProperties {
  return {
    padding: '9px 12px', borderRadius: '7px', fontSize: '0.82rem', marginBottom: '12px',
    background: type === 'error' ? '#fef2f2' : '#f0fdf4',
    color: type === 'error' ? '#991b1b' : '#166534',
    border: `1px solid ${type === 'error' ? '#fecaca' : '#bbf7d0'}`,
  }
}

function smallBtn(bg: string, color: string): React.CSSProperties {
  return {
    padding: '4px 10px', border: 'none', borderRadius: '5px', cursor: 'pointer',
    fontSize: '0.78rem', fontWeight: 600, background: bg, color,
  }
}
