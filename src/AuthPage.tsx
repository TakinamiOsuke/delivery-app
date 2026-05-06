import { useState } from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth'
import { auth } from './firebase'

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [branchName, setBranchName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'signup') {
        if (!branchName.trim()) { setError('支店名を入力してください'); setLoading(false); return }
        const cred = await createUserWithEmailAndPassword(auth, email, password)
        await updateProfile(cred.user, { displayName: branchName.trim() })
      } else {
        await signInWithEmailAndPassword(auth, email, password)
      }
    } catch (err: unknown) {
      const msg = (err as { code?: string })?.code
      if (msg === 'auth/email-already-in-use') setError('このメールアドレスは既に登録されています')
      else if (msg === 'auth/invalid-email') setError('メールアドレスの形式が正しくありません')
      else if (msg === 'auth/weak-password') setError('パスワードは6文字以上で入力してください')
      else if (msg === 'auth/user-not-found' || msg === 'auth/wrong-password' || msg === 'auth/invalid-credential')
        setError('メールアドレスまたはパスワードが正しくありません')
      else setError('エラーが発生しました。もう一度お試しください')
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(135deg, #1a56db 0%, #0ea5e9 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
    }}>
      <div style={{
        background: 'white', borderRadius: '16px', padding: '40px 36px',
        width: '100%', maxWidth: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '60px', height: '60px', background: '#eff6ff', borderRadius: '14px', marginBottom: '12px',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1a56db" strokeWidth="2">
              <path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/>
              <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
            </svg>
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111', margin: 0 }}>配達業務管理</h1>
          <p style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: '4px' }}>
            {mode === 'login' ? 'アカウントにログイン' : '新規アカウントを作成'}
          </p>
        </div>

        {/* Tab */}
        <div style={{
          display: 'flex', background: '#f3f4f6', borderRadius: '8px', padding: '4px', marginBottom: '24px',
        }}>
          {(['login', 'signup'] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setError('') }} style={{
              flex: 1, padding: '8px', border: 'none', borderRadius: '6px', cursor: 'pointer',
              fontWeight: 600, fontSize: '0.88rem', transition: 'all 0.2s',
              background: mode === m ? 'white' : 'transparent',
              color: mode === m ? '#1a56db' : '#6b7280',
              boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
            }}>
              {m === 'login' ? 'ログイン' : '新規登録'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                支店名 / アカウント名
              </label>
              <input
                type="text" value={branchName} onChange={e => setBranchName(e.target.value)}
                placeholder="例: 東京支店" required
                style={inputStyle}
              />
            </div>
          )}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
              メールアドレス
            </label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="example@company.com" required
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
              パスワード
            </label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? '6文字以上' : 'パスワード'} required
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{
              background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca',
              borderRadius: '8px', padding: '10px 12px', fontSize: '0.82rem', marginBottom: '16px',
            }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '12px', border: 'none', borderRadius: '8px',
            background: loading ? '#93c5fd' : '#1a56db', color: 'white',
            fontWeight: 700, fontSize: '0.95rem', cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s',
          }}>
            {loading ? '処理中...' : (mode === 'login' ? 'ログイン' : 'アカウント作成')}
          </button>
        </form>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1px solid #d1d5db',
  borderRadius: '8px', fontSize: '0.9rem', outline: 'none',
  transition: 'border-color 0.2s', boxSizing: 'border-box',
}
