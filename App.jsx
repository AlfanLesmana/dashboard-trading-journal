import { useState, useEffect } from "react"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { loadCreds } from "./api"
import Login from "./pages/Login"
import Sidebar from "./components/Sidebar"
import Overview from "./pages/Overview"
import Equity from "./pages/Equity"
import Trades from "./pages/Trades"
import Insights from "./pages/Insights"
import HealthMetrics from "./pages/HealthMetrics"
import Upload from "./pages/Upload"

function Layout({ onLogout }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar onLogout={onLogout} />
      {/* Offset for mobile top bar */}
      <main className="flex-1 overflow-auto pt-16 md:pt-0">
        <div className="max-w-7xl mx-auto p-4 md:p-8">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/equity" element={<Equity />} />
            <Route path="/trades" element={<Trades />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/health" element={<HealthMetrics />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

export default function App() {
  const [auth, setAuth] = useState(false)
  useEffect(() => { setAuth(loadCreds()) }, [])
  return (
    <BrowserRouter>
      {auth
        ? <Layout onLogout={() => setAuth(false)} />
        : <Login onLogin={() => setAuth(true)} />}
    </BrowserRouter>
  )
}
