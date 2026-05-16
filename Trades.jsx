import { useEffect, useState, useCallback } from "react"
import { api } from "../api"

const fmtMoney = v => v == null || v === "" ? "—"
  : `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const EMPTY_FILTERS = { date_from: "", date_to: "", symbol: "", strategy: "", direction: "", result: "" }

export default function Trades() {
  const [trades, setTrades]   = useState([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [opts, setOpts]       = useState({ symbols: [], strategies: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => { api.filterOptions().then(setOpts) }, [])

  const load = useCallback(() => {
    setLoading(true)
    const active = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
    api.trades({ ...active, page, page_size: 50 })
      .then(r => { setTrades(r.data || []); setTotal(r.total || 0) })
      .finally(() => setLoading(false))
  }, [filters, page])

  useEffect(() => { load() }, [load])

  const set = (k, v) => { setPage(1); setFilters(f => ({ ...f, [k]: v })) }
  const totalPages = Math.ceil(total / 50)
  const activeCount = Object.values(filters).filter(Boolean).length

  return (
    <div className="space-y-4 pb-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-100">Trade Log</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} trades{activeCount > 0 ? " (filtered)" : ""}</p>
        </div>
        {activeCount > 0 && (
          <button onClick={() => { setPage(1); setFilters(EMPTY_FILTERS) }}
            className="text-xs text-amber-400 hover:text-amber-300 border border-amber-500/30 hover:border-amber-400/50 px-3 py-1.5 rounded-lg transition-colors flex-none mt-1">
            Clear all filters
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="card p-4">
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">From</label>
            <input type="date" className="input text-sm" value={filters.date_from} onChange={e => set("date_from", e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">To</label>
            <input type="date" className="input text-sm" value={filters.date_to} onChange={e => set("date_to", e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Symbol</label>
            <select className="select text-sm" value={filters.symbol} onChange={e => set("symbol", e.target.value)}>
              <option value="">All Symbols</option>
              {opts.symbols.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Strategy</label>
            <select className="select text-sm" value={filters.strategy} onChange={e => set("strategy", e.target.value)}>
              <option value="">All Strategies</option>
              {opts.strategies.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Direction</label>
            <select className="select text-sm" value={filters.direction} onChange={e => set("direction", e.target.value)}>
              <option value="">All</option>
              <option>Long</option>
              <option>Short</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Result</label>
            <select className="select text-sm" value={filters.result} onChange={e => set("result", e.target.value)}>
              <option value="">All</option>
              <option>Win</option>
              <option>Loss</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/50">
                {["Date", "Symbol", "Dir", "Entry", "Exit", "Qty", "Net PnL", "Duration", "Broker"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-amber-500 border-t-transparent" />
                    <span>Loading...</span>
                  </div>
                </td></tr>
              ) : trades.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-500">No trades match this filter</td></tr>
              ) : trades.map((t, i) => {
                const win = Number(t.net_pnl) > 0
                const dur = t.duration_minutes
                const durStr = dur == null || dur === "" ? "—"
                  : dur < 60 ? `${Math.round(dur)}m`
                  : `${Math.floor(dur / 60)}h ${Math.round(dur % 60)}m`
                return (
                  <tr key={i} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">{t.trade_date}</td>
                    <td className="px-4 py-3 font-semibold text-gray-100 whitespace-nowrap">{t.symbol}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${t.direction === "Long" ? "bg-emerald-500/15 text-emerald-400" : "bg-indigo-500/15 text-indigo-400"}`}>
                        {t.direction}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs whitespace-nowrap">{t.entry_price}</td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs whitespace-nowrap">{t.exit_price}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{t.quantity}</td>
                    <td className={`px-4 py-3 font-bold font-mono whitespace-nowrap ${win ? "text-emerald-400" : "text-red-400"}`}>
                      {fmtMoney(t.net_pnl)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{durStr}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{t.broker || "—"}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-gray-800 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {total} trades · page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="btn-ghost text-xs px-3 py-1.5 disabled:opacity-30 disabled:cursor-not-allowed">← Prev</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="btn-ghost text-xs px-3 py-1.5 disabled:opacity-30 disabled:cursor-not-allowed">Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
