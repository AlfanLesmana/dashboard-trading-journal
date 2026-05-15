import { useEffect, useState, useCallback } from "react"
import { api } from "../api"
import {
  AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts"

const TT = { background: "#0f172a", border: "1px solid #334155", borderRadius: 10, fontSize: 13, color: "#f1f5f9" }
const fmtAbs = (n) => n == null ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (v) => (v >= 0 ? "+" : "") + "$" + fmtAbs(Math.abs(v))

const TABS = [
  { key: "equity",   label: "Equity Curve" },
  { key: "drawdown", label: "Drawdown" },
  { key: "monthly",  label: "Monthly PnL" },
]

function FilterBar({ filters, setFilters, opts, onClear }) {
  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }))
  return (
    <div className="card p-4 mb-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div>
          <label className="label block mb-1.5">From</label>
          <input type="date" className="input text-sm" value={filters.date_from} onChange={e => set("date_from", e.target.value)} />
        </div>
        <div>
          <label className="label block mb-1.5">To</label>
          <input type="date" className="input text-sm" value={filters.date_to} onChange={e => set("date_to", e.target.value)} />
        </div>
        <div>
          <label className="label block mb-1.5">Symbol</label>
          <select className="select text-sm" value={filters.symbol} onChange={e => set("symbol", e.target.value)}>
            <option value="">All Symbols</option>
            {opts.symbols.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="label block mb-1.5">Direction</label>
          <select className="select text-sm" value={filters.direction} onChange={e => set("direction", e.target.value)}>
            <option value="">All</option>
            <option>Long</option>
            <option>Short</option>
          </select>
        </div>
        <div className="flex items-end">
          <button onClick={onClear} className="btn-ghost text-xs w-full py-2 border border-gray-700 rounded-lg">Clear Filters</button>
        </div>
      </div>
    </div>
  )
}

export default function Equity() {
  const [eq, setEq]         = useState([])
  const [monthly, setMonthly] = useState([])
  const [opts, setOpts]     = useState({ symbols: [], strategies: [] })
  const [tab, setTab]       = useState("equity")
  const [filters, setFilters] = useState({ date_from: "", date_to: "", symbol: "", direction: "" })
  const [loading, setLoading] = useState(true)

  useEffect(() => { api.filterOptions().then(setOpts) }, [])

  const load = useCallback(() => {
    setLoading(true)
    const f = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
    Promise.all([api.equityCurve(f), api.monthlyPnl(f)])
      .then(([e, m]) => { setEq(e || []); setMonthly(m || []) })
      .finally(() => setLoading(false))
  }, [filters])

  useEffect(() => { load() }, [load])

  const bestMonth  = monthly.length ? Math.max(...monthly.map(m => m.net_pnl)) : 0
  const worstMonth = monthly.length ? Math.min(...monthly.map(m => m.net_pnl)) : 0
  const profMonths = monthly.filter(m => m.net_pnl > 0).length

  return (
    <div className="space-y-4 pb-8">
      <div>
        <h1 className="page-title">Equity Curve</h1>
        <p className="text-sm text-gray-500 mt-0.5">Cumulative performance over time</p>
      </div>

      <FilterBar filters={filters} setFilters={setFilters} opts={opts}
        onClear={() => setFilters({ date_from: "", date_to: "", symbol: "", direction: "" })} />

      {/* Summary strip */}
      {monthly.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Best Month",    value: fmt(bestMonth),   color: "text-emerald-400" },
            { label: "Worst Month",   value: fmt(worstMonth),  color: "text-red-400" },
            { label: "Profitable Months", value: `${profMonths} / ${monthly.length}`, color: "text-amber-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="card px-4 py-3 text-center">
              <p className="label mb-1.5">{label}</p>
              <p className={`text-base font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-700/60 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === t.key ? "bg-amber-500 text-gray-900" : "text-gray-300 hover:text-gray-100"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-amber-500 border-t-transparent" />
        </div>
      )}

      {!loading && eq.length === 0 && (
        <div className="card p-10 text-center text-gray-500">No data for this filter — try a different date range.</div>
      )}

      {!loading && tab === "equity" && eq.length > 0 && (
        <div className="card">
          <div className="px-5 py-4 border-b border-gray-700/60">
            <p className="card-title">Cumulative P&amp;L</p>
          </div>
          <div className="p-5">
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={eq} margin={{ top: 5, right: 8, bottom: 5, left: 8 }}>
                <defs>
                  <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="trade_date" tick={{ fill: "#9ca3af", fontSize: 12 }} tickLine={false} axisLine={false}
                  tickFormatter={v => v?.slice(5, 10)} minTickGap={40} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} tickLine={false} axisLine={false} width={60}
                  tickFormatter={v => `$${Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + "k" : v}`} />
                <Tooltip contentStyle={TT} formatter={v => [`$${fmtAbs(v)}`, "Cumulative PnL"]}
                  labelFormatter={l => l?.slice(0, 10)} />
                <ReferenceLine y={0} stroke="#374151" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="cumulative_pnl" stroke="#f59e0b" strokeWidth={2.5}
                  fill="url(#pnlGrad)" dot={false} activeDot={{ r: 4, fill: "#f59e0b" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {!loading && tab === "drawdown" && eq.length > 0 && (
        <div className="card">
          <div className="px-5 py-4 border-b border-gray-700/60">
            <p className="card-title">Drawdown</p>
          </div>
          <div className="p-5">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={eq} margin={{ top: 5, right: 8, bottom: 5, left: 8 }}>
                <defs>
                  <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="trade_date" tick={{ fill: "#9ca3af", fontSize: 12 }} tickLine={false} axisLine={false}
                  tickFormatter={v => v?.slice(5, 10)} minTickGap={40} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} tickLine={false} axisLine={false} width={60}
                  tickFormatter={v => `$${Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + "k" : v}`} />
                <Tooltip contentStyle={TT} formatter={v => [`$${fmtAbs(v)}`, "Drawdown"]}
                  labelFormatter={l => l?.slice(0, 10)} />
                <Area type="monotone" dataKey="drawdown" stroke="#ef4444" strokeWidth={2} fill="url(#ddGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {!loading && tab === "monthly" && monthly.length > 0 && (
        <div className="card">
          <div className="px-5 py-4 border-b border-gray-700/60">
            <p className="card-title">Monthly P&amp;L</p>
          </div>
          <div className="p-5">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthly} margin={{ top: 5, right: 8, bottom: 5, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" tick={{ fill: "#9ca3af", fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} tickLine={false} axisLine={false} width={60}
                  tickFormatter={v => `$${Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + "k" : v}`} />
                <Tooltip contentStyle={TT} formatter={v => [`$${fmtAbs(v)}`, "Net PnL"]} />
                <ReferenceLine y={0} stroke="#374151" />
                <Bar dataKey="net_pnl" radius={[4, 4, 0, 0]}>
                  {monthly.map((m, i) => (
                    <Cell key={i} fill={m.net_pnl >= 0 ? "#10b981" : "#ef4444"} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
