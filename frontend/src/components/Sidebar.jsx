import { useState } from "react"
import { NavLink } from "react-router-dom"
import { clearCreds } from "../api"

const links = [
  { to: "/",         label: "Overview",      icon: "🏠" },
  { to: "/equity",   label: "Equity Curve",  icon: "📈" },
  { to: "/trades",   label: "Trade Log",     icon: "📋" },
  { to: "/insights", label: "Insights", icon: "💡" },
  { to: "/health",   label: "Health Metrics", icon: "🩺" },
  { to: "/upload",   label: "Upload",        icon: "📤" },
]

export default function Sidebar({ onLogout }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-surface-darker border-b border-border/50 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">📈</span>
          <span className="text-sm font-bold text-gray-100">TradeLedger</span>
        </div>
        <button onClick={() => setOpen(!open)} className="text-gray-400 hover:text-gray-100 p-1">
          {open ? "✕" : "☰"}
        </button>
      </div>

      {/* Mobile overlay */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar — slide in on mobile, always visible on desktop */}
      <aside className={`
        fixed md:static top-0 left-0 z-40 h-full w-56 bg-surface-darker border-r border-border/50 flex flex-col
        transform transition-transform duration-200 ease-in-out
        ${open ? "translate-x-0" : "-translate-x-full"} md:translate-x-0
      `}>
        {/* Logo — desktop only */}
        <div className="hidden md:flex px-5 py-5 border-b border-border/50 items-center gap-2">
          <span className="text-xl">📈</span>
          <div>
            <div className="text-sm font-bold text-gray-100 leading-tight">TradeLedger</div>
            <div className="text-[10px] text-brand font-medium tracking-widest uppercase">Pro</div>
          </div>
        </div>

        {/* Spacer for mobile top bar */}
        <div className="md:hidden h-16" />

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          <p className="text-[10px] text-gray-600 font-semibold tracking-widest uppercase px-3 py-2">Dashboard</p>
          {links.map(l => (
            <NavLink key={l.to} to={l.to} end={l.to === "/"}
              onClick={() => setOpen(false)}
              className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
              <span className="text-base">{l.icon}</span>
              <span>{l.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-border/50">
          <button onClick={() => { clearCreds(); onLogout(); }}
            className="nav-link w-full text-red-400 hover:text-red-300 hover:bg-red-500/10">
            <span>🚪</span><span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  )
}
