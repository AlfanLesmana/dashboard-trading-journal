import { useState, useRef, useEffect, useCallback } from "react"
import { api } from "../api"

function ConfirmModal({ title, body, danger, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onCancel} />
      <div className="relative card p-6 max-w-sm w-full space-y-4 border border-gray-700">
        <h3 className="text-base font-bold text-gray-100">{title}</h3>
        <p className="text-sm text-gray-400 leading-relaxed">{body}</p>
        <div className="flex gap-3 pt-1">
          <button onClick={onCancel} className="btn-ghost flex-1 text-sm py-2 border border-gray-700 rounded-lg">Cancel</button>
          <button onClick={onConfirm}
            className={`flex-1 text-sm py-2 rounded-lg font-semibold transition-all ${danger ? "bg-red-600 hover:bg-red-500 text-white" : "btn-primary"}`}>
            {danger ? "Delete" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Upload() {
  const [file, setFile]         = useState(null)
  const [preview, setPreview]   = useState(null)
  const [status, setStatus]     = useState(null)
  const [loading, setLoading]   = useState(false)
  const [drag, setDrag]         = useState(false)
  const [history, setHistory]   = useState([])
  const [histLoading, setHistLoading] = useState(true)
  const [confirm, setConfirm]   = useState(null) // { type: "import"|"all", importId?, label? }
  const inputRef = useRef()

  const loadHistory = useCallback(() => {
    setHistLoading(true)
    api.importHistory().then(setHistory).finally(() => setHistLoading(false))
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  async function handleFile(f) {
    if (!f) return
    setFile(f); setPreview(null); setStatus(null); setLoading(true)
    try {
      const res = await api.upload(f)
      setPreview(res.data)
    } catch (e) {
      const msg = e.response?.data?.detail
      setStatus({ type: "error", msg: Array.isArray(msg) ? msg.join(", ") : (msg || "Upload failed") })
    } finally { setLoading(false) }
  }

  async function confirmImport() {
    if (!file) return
    setLoading(true)
    try {
      const res = await api.confirm(file)
      setStatus({ type: "success", msg: `Imported ${res.data.imported} trades. ${res.data.rejected} duplicates skipped.` })
      setPreview(null); setFile(null)
      loadHistory()
    } catch (e) {
      const msg = e.response?.data?.detail
      setStatus({ type: "error", msg: Array.isArray(msg) ? msg.join(", ") : (msg || "Import failed") })
    } finally { setLoading(false) }
  }

  async function handleDeleteImport(importId) {
    try {
      const res = await api.deleteImport(importId)
      setStatus({ type: "success", msg: `Removed ${res.data.deleted_trades} trades from this import.` })
      loadHistory()
    } catch {
      setStatus({ type: "error", msg: "Failed to delete import." })
    }
    setConfirm(null)
  }

  async function handleDeleteAll() {
    try {
      const res = await api.deleteAllData()
      setStatus({ type: "success", msg: `All data cleared — ${res.data.deleted_trades} trades removed.` })
      loadHistory()
    } catch {
      setStatus({ type: "error", msg: "Failed to clear data." })
    }
    setConfirm(null)
  }

  const totalTrades = history.reduce((s, h) => s + (h.rows_imported || 0), 0)

  return (
    <div className="space-y-4 pb-8">

      {confirm?.type === "import" && (
        <ConfirmModal
          title="Delete this import?"
          body={`This will permanently remove all ${confirm.rows} trades from "${confirm.label}" and allow the file to be re-imported.`}
          danger
          onConfirm={() => handleDeleteImport(confirm.importId)}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.type === "all" && (
        <ConfirmModal
          title="Clear all trade data?"
          body="This will permanently delete every trade and import record from the database. This cannot be undone."
          danger
          onConfirm={handleDeleteAll}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* Header */}
      <div>
        <h1 className="page-title">Upload</h1>
        <p className="text-sm text-gray-400 mt-0.5">Import cTrader or standard Excel trade files</p>
      </div>

      {/* Status */}
      {status && (
        <div className={`card p-4 flex items-start gap-3 border-l-4 ${status.type === "success" ? "border-emerald-500" : "border-red-500"}`}>
          <span className="text-lg flex-none">{status.type === "success" ? "✅" : "❌"}</span>
          <div className="flex-1 min-w-0">
            <p className={`text-sm ${status.type === "success" ? "text-emerald-400" : "text-red-400"}`}>{status.msg}</p>
          </div>
          <button onClick={() => setStatus(null)} className="text-gray-400 hover:text-gray-200 flex-none text-lg leading-none">×</button>
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]) }}
        onClick={() => inputRef.current.click()}
        className={`card p-10 text-center cursor-pointer transition-all border-2 border-dashed select-none
          ${drag ? "border-amber-500 bg-amber-500/5" : "border-gray-700 hover:border-amber-500/40 hover:bg-gray-800/30"}`}>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleFile(e.target.files[0])} />
        <div className="text-4xl mb-3">{loading ? "⏳" : "📤"}</div>
        <p className="font-semibold text-gray-200 text-base">{loading ? "Parsing file…" : "Drop your Excel file here"}</p>
        <p className="text-sm text-gray-400 mt-1">or click to browse — .xlsx / .xls</p>
        {file && <p className="text-xs text-amber-400 mt-3 font-medium">{file.name}</p>}
      </div>

      {/* Preview */}
      {preview && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="card-title">Preview</p>
              <p className="text-xs text-gray-400 mt-0.5">{preview.rows} rows detected — first 10 shown</p>
            </div>
            <button onClick={confirmImport} disabled={loading} className="btn-primary text-sm py-2 px-5 disabled:opacity-60">
              {loading ? "Importing…" : "Confirm Import"}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[500px]">
              <thead>
                <tr className="border-b border-gray-700/60 bg-gray-900/50">
                  {Object.keys(preview.preview[0] || {}).map(h => (
                    <th key={h} className="px-4 py-2.5 text-left label font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/40">
                {preview.preview.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-800/30">
                    {Object.values(row).map((v, j) => (
                      <td key={j} className="px-4 py-2.5 text-gray-400 font-mono whitespace-nowrap">{String(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Import History */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-700/60 flex items-center justify-between">
          <div>
            <h3 className="card-title">Import History</h3>
            <p className="text-xs text-gray-400 mt-0.5">{history.length} imports · {totalTrades} trades total</p>
          </div>
          {history.length > 0 && (
            <button
              onClick={() => setConfirm({ type: "all" })}
              className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-400/50 px-3 py-1.5 rounded-lg transition-colors">
              Clear All Data
            </button>
          )}
        </div>

        {histLoading ? (
          <div className="flex items-center justify-center py-10">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-amber-500 border-t-transparent" />
          </div>
        ) : history.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-10">No imports yet</p>
        ) : (
          <div className="divide-y divide-gray-700/40">
            {history.map((h) => (
              <div key={h.id} className="px-5 py-4 flex items-center gap-4">
                {/* Icon */}
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-none text-sm
                  ${h.status === "done" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                  {h.status === "done" ? "✓" : "⏳"}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-200 truncate">{h.filename}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                    <span className="text-xs text-gray-400">{h.imported_at?.slice(0, 16).replace("T", " ")}</span>
                    <span className="text-xs text-emerald-400">{h.rows_imported} imported</span>
                    {h.rows_rejected > 0 && <span className="text-xs text-amber-400">{h.rows_rejected} skipped</span>}
                  </div>
                </div>

                {/* Badge + delete */}
                <div className="flex items-center gap-3 flex-none">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide
                    ${h.status === "done" ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-400"}`}>
                    {h.status}
                  </span>
                  <button
                    onClick={() => setConfirm({ type: "import", importId: h.id, label: h.filename, rows: h.rows_imported })}
                    className="text-xs text-gray-400 hover:text-red-400 border border-gray-700/60 hover:border-red-500/30 px-2.5 py-1 rounded-lg transition-colors">
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Supported formats */}
      <div className="card p-5">
        <p className="card-title mb-4">Supported Formats</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-amber-400 mb-2">cTrader Export (auto-detected)</p>
            <div className="bg-gray-900 border border-gray-700/60 rounded-lg p-3">
              <p className="text-xs text-gray-400 font-mono leading-5">
                ID, Symbol, Opening direction<br />
                Opening time, Closing time<br />
                Entry price, Closing price, Net $
              </p>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-amber-400 mb-2">Standard Template</p>
            <div className="bg-gray-900 border border-gray-700/60 rounded-lg p-3">
              <p className="text-xs text-gray-400 font-mono leading-5">
                trade_date, symbol, direction<br />
                entry_price, exit_price<br />
                net_pnl, strategy, broker
              </p>
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-4">Duplicate rows are automatically detected and excluded on import. Removing an import allows the same file to be re-imported.</p>
      </div>

    </div>
  )
}
