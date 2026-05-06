import { useEffect, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth, isFirebaseConfigured } from './firebase'
import AuthPage from './AuthPage'
import AppPage from './AppPage'
import SetupGuide from './SetupGuide'

function App() {
  const [user, setUser] = useState<User | null | 'loading'>('loading')

  useEffect(() => {
    if (!isFirebaseConfigured) { setUser(null); return }
    return onAuthStateChanged(auth, u => setUser(u))
  }, [])

  if (!isFirebaseConfigured) return <SetupGuide />

  if (user === 'loading') {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #1a56db 0%, #0ea5e9 100%)',
      }}>
        <div style={{ color: 'white', fontSize: '1rem', fontWeight: 600 }}>読み込み中...</div>
      </div>
    )
  }

  return user ? <AppPage /> : <AuthPage />
}

export default App
