import { useState } from "react"
import { api, setCreds } from "../api"

export default function Login({ onLogin }) {
  const [pw, setPw] = useState("")
  const [err, setErr] = useState("")
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setLoading(true); setErr("")
    try {
      setCreds(pw)
      await api.login(pw)
      onLogin()
    } catch {
      setErr("Incorrect password")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-darker flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">📈</div>
          <h1 className="text-2xl font-bold text-gray-100">TradeLedger</h1>
          <p className="text-gray-500 text-sm mt-1">Your private trading journal</p>
        </div>
        <div className="card p-6 shadow-2xl shadow-black/40">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-xs text-gray-400 font-medium uppercase tracking-wider block mb-1.5">Password</label>
              <input type="password" value={pw} onChange={e => setPw(e.target.value)}
                className="input" placeholder="Enter password..." autoFocus />
            </div>
            {err && <p className="text-red-400 text-sm bg-red-500/10 px-3 py-2 rounded-lg">{err}</p>}
            <button type="submit" disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 py-2.5">
              {loading ? "Logging in..." : "Login →"}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
