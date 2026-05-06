export default function SetupGuide() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a56db 0%, #0ea5e9 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
    }}>
      <div style={{
        background: 'white', borderRadius: '16px', padding: '40px 36px',
        width: '100%', maxWidth: '560px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '60px', height: '60px', background: '#eff6ff', borderRadius: '14px', marginBottom: '12px',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1a56db" strokeWidth="2">
              <path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/>
              <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
            </svg>
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111', margin: '0 0 6px' }}>
            配達業務管理アプリ
          </h1>
          <p style={{ color: '#6b7280', fontSize: '0.88rem' }}>
            起動するには Firebase の設定が必要です
          </p>
        </div>

        <div style={{
          background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '10px',
          padding: '14px 16px', marginBottom: '24px',
        }}>
          <p style={{ color: '#92400e', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
            ⚠️ Firebase が未設定です
          </p>
          <p style={{ color: '#78350f', fontSize: '0.82rem', lineHeight: 1.6 }}>
            <code style={{ background: '#fde68a', padding: '1px 5px', borderRadius: '3px' }}>.env</code> ファイルに Firebase の設定値を追加してください。
          </p>
        </div>

        <ol style={{ paddingLeft: '20px', color: '#374151', fontSize: '0.88rem', lineHeight: 2 }}>
          <li>
            <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer"
              style={{ color: '#1a56db', fontWeight: 600 }}>
              Firebase Console
            </a> でプロジェクトを作成
          </li>
          <li>Authentication → メール/パスワードを有効化</li>
          <li>Firestore Database を作成</li>
          <li>プロジェクト設定 → ウェブアプリを追加 → 設定値をコピー</li>
          <li>
            <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px', fontSize: '0.82rem' }}>
              .env.example
            </code> を
            <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px', fontSize: '0.82rem' }}>
              .env
            </code> にコピーして設定値を貼り付け
          </li>
          <li>
            <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px', fontSize: '0.82rem' }}>
              npm run dev
            </code> を再起動
          </li>
        </ol>

        <div style={{
          marginTop: '20px', background: '#f8fafc', borderRadius: '8px',
          padding: '12px 14px', fontSize: '0.78rem', color: '#64748b',
        }}>
          詳しいセットアップ手順は{' '}
          <code style={{ background: '#e2e8f0', padding: '1px 5px', borderRadius: '3px' }}>README.md</code>{' '}
          をご確認ください。
        </div>
      </div>
    </div>
  )
}
