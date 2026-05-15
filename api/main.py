import os, hashlib, io
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Query, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel
from typing import Optional
import secrets, hmac

from modules.database import (
    init_db, get_trades, insert_trades, save_import_record,
    file_hash_exists, get_import_history, get_distinct,
    delete_import, delete_all_data, update_trade_fields
)
from modules.metrics import compute_metrics, equity_curve, monthly_pnl, strategy_stats, symbol_stats
from modules.parser import parse_excel, file_hash, save_upload

app = FastAPI(title="Trading Dashboard API")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

security = HTTPBasic()
DASHBOARD_PASSWORD = os.environ.get("DASHBOARD_PASSWORD", "trading123")

def verify(creds: HTTPBasicCredentials = Depends(security)):
    ok = hmac.compare_digest(creds.password.encode(), DASHBOARD_PASSWORD.encode())
    if not ok:
        raise HTTPException(status_code=401, detail="Incorrect password", headers={"WWW-Authenticate": "Basic"})
    return creds.username

init_db()

def build_filters(
    date_from=None, date_to=None, symbol=None,
    strategy=None, account=None, broker=None,
    direction=None, result=None
):
    f = {}
    if date_from: f["date_from"] = date_from
    if date_to:   f["date_to"]   = date_to
    if symbol:    f["symbol"]    = symbol
    if strategy:  f["strategy"]  = strategy
    if account:   f["account"]   = account
    if broker:    f["broker"]    = broker
    if direction: f["direction"] = direction
    if result:    f["result"]    = result
    return f

@app.post("/api/login")
def login(creds: HTTPBasicCredentials = Depends(security)):
    verify(creds)
    return {"ok": True}

@app.get("/api/metrics")
def api_metrics(
    date_from=None, date_to=None, symbol=None, strategy=None,
    account=None, broker=None, direction=None, result=None,
    _=Depends(verify)
):
    df = get_trades(build_filters(date_from, date_to, symbol, strategy, account, broker, direction, result))
    return compute_metrics(df)

@app.get("/api/equity-curve")
def api_equity(date_from=None, date_to=None, symbol=None, direction=None, _=Depends(verify)):
    df = get_trades(build_filters(date_from, date_to, symbol=symbol, direction=direction))
    if df.empty: return []
    eq = equity_curve(df)
    return eq[["trade_date","cumulative_pnl","drawdown"]].fillna(0).to_dict("records")

@app.get("/api/monthly-pnl")
def api_monthly(date_from=None, date_to=None, symbol=None, direction=None, _=Depends(verify)):
    df = get_trades(build_filters(date_from, date_to, symbol=symbol, direction=direction))
    if df.empty: return []
    return monthly_pnl(df).to_dict("records")

@app.get("/api/strategy-stats")
def api_strategy(_=Depends(verify)):
    df = get_trades()
    if df.empty: return []
    s = strategy_stats(df)
    return [] if s.empty else s.to_dict("records")

@app.get("/api/insights")
def api_insights(date_from=None, date_to=None, symbol=None, direction=None, _=Depends(verify)):
    import pandas as pd, numpy as np
    df = get_trades(build_filters(date_from, date_to, symbol=symbol, direction=direction))
    if df.empty: return {}
    df = df.copy()
    df["net_pnl"] = pd.to_numeric(df["net_pnl"], errors="coerce").fillna(0)
    df["trade_date"] = pd.to_datetime(df["trade_date"], errors="coerce")
    df = df.dropna(subset=["trade_date"])

    # Period
    first = df["trade_date"].min().strftime("%Y-%m-%d")
    last = df["trade_date"].max().strftime("%Y-%m-%d")
    active_days = df["trade_date"].dt.date.nunique()
    avg_per_day = round(len(df) / active_days, 1) if active_days else 0

    # Day of week
    df["dow"] = df["trade_date"].dt.dayofweek
    dow_map = {0:"Mon",1:"Tue",2:"Wed",3:"Thu",4:"Fri",5:"Sat",6:"Sun"}
    by_day = []
    for d in sorted(df["dow"].unique()):
        g = df[df["dow"] == d]
        wins = (g["net_pnl"] > 0).sum()
        by_day.append({
            "day": dow_map[d],
            "net_pnl": round(g["net_pnl"].sum(), 2),
            "trades": len(g),
            "win_rate": round(wins / len(g) * 100, 1) if len(g) else 0,
        })

    # Direction
    by_dir = []
    for d in df["direction"].dropna().unique():
        g = df[df["direction"] == d]
        wins = g[g["net_pnl"] > 0]
        losses = g[g["net_pnl"] <= 0]
        gp = wins["net_pnl"].sum()
        gl = abs(losses["net_pnl"].sum())
        by_dir.append({
            "direction": d,
            "net_pnl": round(g["net_pnl"].sum(), 2),
            "trades": len(g),
            "win_rate": round(len(wins) / len(g) * 100, 1) if len(g) else 0,
            "profit_factor": round(gp / gl, 2) if gl else 999,
        })

    # Streaks
    outcomes = (df.sort_values("trade_date")["net_pnl"] > 0).tolist()
    max_win = max_loss = cur = 0
    cur_type = None
    w = l = 0
    for o in outcomes:
        if o:
            w += 1; l = 0
        else:
            l += 1; w = 0
        max_win = max(max_win, w)
        max_loss = max(max_loss, l)
    cur_streak = w if outcomes and outcomes[-1] else l
    cur_type = "win" if outcomes and outcomes[-1] else "loss"
    wins_total = sum(outcomes)
    losses_total = len(outcomes) - wins_total
    win_loss_ratio = round(wins_total / losses_total, 2) if losses_total else "∞"

    # Result distribution buckets
    pnl = df["net_pnl"].values
    mn, mx = pnl.min(), pnl.max()
    bins = np.linspace(mn, mx, 9)
    buckets = []
    for i in range(len(bins) - 1):
        lo, hi = bins[i], bins[i+1]
        count = int(((pnl >= lo) & (pnl < hi)).sum())
        label = f"{'+' if lo >= 0 else ''}{lo:.0f}"
        buckets.append({"range": label, "count": int(count), "positive": bool(lo >= 0)})

    # Win rate by 30-min time slot
    by_time_slot = []
    if "open_time" in df.columns:
        df["open_time_parsed"] = pd.to_datetime(df["open_time"], format="%H:%M:%S", errors="coerce")
        df_timed = df.dropna(subset=["open_time_parsed"])
        if not df_timed.empty:
            df_timed = df_timed.copy()
            df_timed["slot_h"] = df_timed["open_time_parsed"].dt.hour
            df_timed["slot_m"] = (df_timed["open_time_parsed"].dt.minute // 30) * 30
            df_timed["slot"] = df_timed.apply(
                lambda r: f"{int(r.slot_h):02d}:{int(r.slot_m):02d}", axis=1
            )
            for slot, g in df_timed.groupby("slot"):
                wins = (g["net_pnl"] > 0).sum()
                total = len(g)
                by_dir_slot = {}
                for direction in ["Long", "Short"]:
                    gd = g[g["direction"] == direction]
                    if len(gd) > 0:
                        dw = int((gd["net_pnl"] > 0).sum())
                        by_dir_slot[direction] = {
                            "trades": int(len(gd)),
                            "wins": dw,
                            "win_rate": round(dw / len(gd) * 100, 1),
                            "net_pnl": round(float(gd["net_pnl"].sum()), 2),
                        }
                by_time_slot.append({
                    "slot": slot,
                    "trades": int(total),
                    "wins": int(wins),
                    "win_rate": round(wins / total * 100, 1),
                    "net_pnl": round(g["net_pnl"].sum(), 2),
                    "by_direction": by_dir_slot,
                })
            by_time_slot.sort(key=lambda x: x["slot"])

    # Duration stats + per-trade history
    duration = {}
    duration_history = []
    if "duration_minutes" in df.columns:
        df["duration_minutes"] = pd.to_numeric(df["duration_minutes"], errors="coerce")
        d = df["duration_minutes"].dropna()
        if not d.empty:
            duration = {
                "avg": round(d.mean(), 1),
                "min": round(d.min(), 1),
                "max": round(d.max(), 1),
                "median": round(d.median(), 1),
                "avg_win": round(df[df["net_pnl"] > 0]["duration_minutes"].dropna().mean(), 1) if (df["net_pnl"] > 0).any() else None,
                "avg_loss": round(df[df["net_pnl"] <= 0]["duration_minutes"].dropna().mean(), 1) if (df["net_pnl"] <= 0).any() else None,
            }
            history_df = df[["trade_date", "open_time", "symbol", "direction", "net_pnl", "duration_minutes"]].dropna(subset=["duration_minutes"])
            history_df = history_df.sort_values("trade_date")
            for _, r in history_df.iterrows():
                duration_history.append({
                    "date": str(r["trade_date"])[:10],
                    "open_time": str(r["open_time"]) if r["open_time"] else "",
                    "symbol": str(r["symbol"]),
                    "direction": str(r["direction"]),
                    "duration": round(float(r["duration_minutes"]), 1),
                    "net_pnl": round(float(r["net_pnl"]), 2),
                    "win": bool(r["net_pnl"] > 0),
                })

    return {
        "period": {"first_trade": first, "last_trade": last, "active_days": active_days, "avg_trades_per_day": avg_per_day},
        "by_day": by_day,
        "by_direction": by_dir,
        "streaks": {"max_win_streak": max_win, "max_loss_streak": max_loss, "current_streak_count": cur_streak, "current_streak_type": cur_type, "win_loss_ratio": win_loss_ratio},
        "buckets": buckets,
        "duration": duration,
        "duration_history": duration_history,
        "by_time_slot": by_time_slot,
    }

@app.get("/api/symbol-stats")
def api_symbol(_=Depends(verify)):
    df = get_trades()
    if df.empty: return []
    s = symbol_stats(df)
    return [] if s.empty else s.to_dict("records")

@app.get("/api/trades")
def api_trades(
    date_from=None, date_to=None, symbol=None, strategy=None,
    account=None, broker=None, direction=None, result=None,
    page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=500),
    _=Depends(verify)
):
    df = get_trades(build_filters(date_from, date_to, symbol, strategy, account, broker, direction, result))
    total = len(df)
    start = (page - 1) * page_size
    chunk = df.iloc[start:start+page_size]
    return {"total": total, "page": page, "page_size": page_size, "data": chunk.fillna("").to_dict("records")}

@app.get("/api/filters/options")
def api_filter_options(_=Depends(verify)):
    return {
        "symbols":    get_distinct("symbol"),
        "strategies": get_distinct("strategy"),
        "accounts":   get_distinct("account"),
        "brokers":    get_distinct("broker"),
    }

@app.get("/api/import-history")
def api_import_history(_=Depends(verify)):
    df = get_import_history()
    return [] if df.empty else df.fillna("").to_dict("records")

@app.delete("/api/import/{import_id}")
def api_delete_import(import_id: int, _=Depends(verify)):
    deleted = delete_import(import_id)
    return {"deleted_trades": deleted, "import_id": import_id}

@app.delete("/api/data/all")
def api_delete_all(_=Depends(verify)):
    return delete_all_data()

@app.post("/api/upload")
async def api_upload(file: UploadFile = File(...), _=Depends(verify)):
    data = await file.read()
    fhash = file_hash(data)
    if file_hash_exists(fhash):
        raise HTTPException(status_code=409, detail="Duplicate file — already imported")
    df, errors = parse_excel(data, file.filename)
    if errors:
        raise HTTPException(status_code=422, detail=errors)
    preview = df.head(10).fillna("").to_dict("records")
    return {"preview": preview, "rows": len(df), "hash": fhash, "filename": file.filename}

@app.post("/api/upload/confirm")
async def api_upload_confirm(file: UploadFile = File(...), _=Depends(verify)):
    data = await file.read()
    fhash = file_hash(data)
    if file_hash_exists(fhash):
        raise HTTPException(status_code=409, detail="Duplicate file")
    df, errors = parse_excel(data, file.filename)
    if errors:
        raise HTTPException(status_code=422, detail=errors)
    save_upload(data, file.filename)
    import_id = save_import_record(file.filename, fhash, len(df), 0, 0, "importing")
    inserted, rejected = insert_trades(df, import_id)
    from modules.database import ENGINE
    from sqlalchemy import text
    with ENGINE.connect() as conn:
        conn.execute(text("UPDATE import_history SET rows_imported=:i,rows_rejected=:r,status='done' WHERE id=:id"),
                     {"i": inserted, "r": rejected, "id": import_id})
        conn.commit()
    return {"imported": inserted, "rejected": rejected}

class TradeUpdate(BaseModel):
    notes: Optional[str] = None
    setup: Optional[str] = None

@app.patch("/api/trades/{trade_id}")
def api_update_trade(trade_id: int, body: TradeUpdate, _=Depends(verify)):
    update_trade_fields(trade_id, body.model_dump(exclude_none=True))
    return {"ok": True}

@app.get("/api/calendar")
def api_calendar(date_from=None, date_to=None, _=Depends(verify)):
    import pandas as pd
    df = get_trades(build_filters(date_from, date_to))
    if df.empty: return []
    df["net_pnl"] = pd.to_numeric(df["net_pnl"], errors="coerce").fillna(0)
    df["trade_date"] = pd.to_datetime(df["trade_date"], errors="coerce").dt.strftime("%Y-%m-%d")
    df = df.dropna(subset=["trade_date"])
    daily = df.groupby("trade_date").agg(
        net_pnl=("net_pnl", "sum"),
        trades=("net_pnl", "count"),
        wins=("net_pnl", lambda x: int((x > 0).sum())),
    ).reset_index()
    daily["net_pnl"] = daily["net_pnl"].round(2)
    daily["trades"] = daily["trades"].astype(int)
    return daily.to_dict("records")

@app.get("/health")
def health(): return {"status": "ok"}
