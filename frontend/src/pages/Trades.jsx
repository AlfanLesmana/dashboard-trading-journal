import { useEffect, useState, useCallback } from "react"
import { api } from "../api"

const fmtMoney = v => v == null || v === "" ? "—"
  : `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const EMPTY_FILTERS = { date_from: "", date_to: "", symbol: "", strategy: "", direction: "", result: "" }

const SETUP_TAGS = ["Breakout", "Reversal", "Trend Follow", "VWAP Bounce", "Opening Range", "S/R Level", "Gap Fill", "Mean Reversion"]

function TradeDrawer({ trade, onClose, onSaved }) {
  const [notes, setNotes] = useState(trade?.notes || "")
  const [setup, setSetup] = useState(trade?.setup || "")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setNotes(trade?.notes || "")
    setSetup(trade?.setup || "")
  }, [trade])

  if (!trade) return null

  const win = Number(trade.net_pnl) > 0

  const save = async () => {
    setSaving(true)
    try {
      await api.updateTrade(trade.id, { notes, setup })
      onSaved({ ...trade, notes, setup })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const toggleTag = (tag) => {
    const tags = setup.split(",").map(s => s.trim()).filter(Boolean)
    const idx = tags.indexOf(tag)
    if (idx >= 0) tags.splice(idx, 1)
    else tags.push(tag)
    setSetup(tags.join(", "))
  }

  const activeTags = setup.split(",").map(s => s.trim()).filter(Boolean)

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-gray-900 border-l border-gray-800 z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <p className="text-sm font-semibold text-gray-100">{trade.symbol} · {trade.direction}</p>
            <p className="text-xs text-gray-500 mt-0.5">{trade.trade_date}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-sm font-bold ${win ? "text-emerald-400" : "text-red-400"}`}>
              {fmtMoney(trade.net_pnl)}
            </span>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">×</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Trade details */}
          <div className="grid grid-cols-2 gap-3">
            {[
              ["Entry", trade.entry_price],
              ["Exit", trade.exit_price],
              ["Quantity", trade.quantity],
              ["Broker", trade.broker || "—"],
            ].map(([label, val]) => (
              <div key={label} className="bg-gray-800/50 rounded-xl p-3">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{label}</p>
                <p className="text-sm font-semibold text-gray-200">{val}</p>
              </div>
            ))}
          </div>

          {/* Setup tags */}
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Setup Tag</p>
            <div className="flex flex-wrap gap-2">
              {SETUP_TAGS.map(tag => {
                const active = activeTags.includes(tag)
                return (
                  <button key={tag} onClick={() => toggleTag(tag)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      active
                        ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
                        : "bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-400"
                    }`}>
                    {tag}
                  </button>
                )
              })}
            </div>
            {setup && !SETUP_TAGS.some(t => activeTags.includes(t)) && (
              <p className="text-xs text-gray-600 mt-2">Custom: {setup}</p>
            )}
          </div>

          {/* Notes */}
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Notes</p>
            <textarea
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-amber-500/50"
              rows={5}
              placeholder="What happened? Entry reason, mistakes, market context..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-800">
          <button onClick={save} disabled={saving}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-semibold text-sm py-2.5 rounded-xl transition-colors">
            {saving ? "Saving…" : "Save Notes"}
          </button>
        </div>
      </div>
    </>
  )
}

export default function Trades() {
  const [trades, setTrades]     = useState([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [filters, setFilters]   = useState(EMPTY_FILTERS)
  const [opts, setOpts]         = useState({ symbols: [], strategies: [] })
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState(null)

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

  const handleSaved = (updated) => {
    setTrades(prev => prev.map(t => t.id === updated.id ? updated : t))
  }

  return (
    <div className="space-y-4 pb-8">
      <TradeDrawer trade={selected} onClose={() => setSelected(null)} onSaved={handleSaved} />

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
                {["Date", "Symbol", "Dir", "Entry", "Exit", "Qty", "Net PnL", "Duration", "Broker", ""].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-500">
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-amber-500 border-t-transparent" />
                    <span>Loading...</span>
                  </div>
                </td></tr>
              ) : trades.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-500">No trades match this filter</td></tr>
              ) : trades.map((t, i) => {
                const win = Number(t.net_pnl) > 0
                const dur = t.duration_minutes
                const durStr = dur == null || dur === "" ? "—"
                  : dur < 60 ? `${Math.round(dur)}m`
                  : `${Math.floor(dur / 60)}h ${Math.round(dur % 60)}m`
                const hasNote = !!(t.notes || t.setup)
                return (
                  <tr key={i} className="hover:bg-gray-800/30 transition-colors cursor-pointer" onClick={() => setSelected(t)}>
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
                    <td className="px-4 py-3 text-center">
                      {hasNote
                        ? <span className="text-amber-400 text-xs">📝</span>
                        : <span className="text-gray-700 text-xs">+</span>}
                    </td>
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
