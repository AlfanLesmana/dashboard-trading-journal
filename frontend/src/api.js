import axios from "axios"

const BASE = "/api"

let _creds = null
export function setCreds(password) {
  _creds = { username: "trader", password }
  localStorage.setItem("td_pass", password)
}
export function loadCreds() {
  const p = localStorage.getItem("td_pass")
  if (p) _creds = { username: "trader", password: p }
  return !!_creds
}
export function clearCreds() {
  _creds = null
  localStorage.removeItem("td_pass")
}

function auth() {
  if (!_creds) return {}
  const token = btoa(`${_creds.username}:${_creds.password}`)
  return { Authorization: `Basic ${token}` }
}

async function get(path, params = {}) {
  const res = await axios.get(BASE + path, { params, headers: auth() })
  return res.data
}
async function post(path, data) {
  const res = await axios.post(BASE + path, data, { headers: auth() })
  return res.data
}

export const api = {
  login: (password) => axios.post(BASE + "/login", {}, {
    headers: { Authorization: `Basic ${btoa(`trader:${password}`)}` }
  }),
  metrics: (f = {}) => get("/metrics", f),
  equityCurve: (f = {}) => get("/equity-curve", f),
  monthlyPnl: (f = {}) => get("/monthly-pnl", f),
  strategyStats: () => get("/strategy-stats"),
  insights: (f = {}) => get("/insights", f),
  symbolStats: () => get("/symbol-stats"),
  trades: (f = {}) => get("/trades", f),
  filterOptions: () => get("/filters/options"),
  importHistory: () => get("/import-history"),
  deleteImport: (id) => axios.delete(BASE + `/import/${id}`, { headers: auth() }),
  deleteAllData: () => axios.delete(BASE + "/data/all", { headers: auth() }),
  upload: (file) => {
    const fd = new FormData(); fd.append("file", file)
    return axios.post(BASE + "/upload", fd, { headers: { ...auth(), "Content-Type": "multipart/form-data" } })
  },
  confirm: (file) => {
    const fd = new FormData(); fd.append("file", file)
    return axios.post(BASE + "/upload/confirm", fd, { headers: { ...auth(), "Content-Type": "multipart/form-data" } })
  },
}
