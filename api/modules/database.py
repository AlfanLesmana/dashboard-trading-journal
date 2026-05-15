import sqlite3
from pathlib import Path
from sqlalchemy import create_engine, text
import pandas as pd

DB_PATH = Path("/srv/trading-dashboard/db/trading.db")
ENGINE = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})

SCHEMA = """
CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trade_date TEXT,
    close_date TEXT,
    symbol TEXT,
    asset_class TEXT,
    direction TEXT,
    quantity REAL,
    entry_price REAL,
    exit_price REAL,
    fees REAL,
    gross_pnl REAL,
    net_pnl REAL,
    account TEXT,
    broker TEXT,
    strategy TEXT,
    setup TEXT,
    notes TEXT,
    trade_uid TEXT UNIQUE,
    open_time TEXT,
    close_time TEXT,
    duration_minutes REAL,
    import_id INTEGER
);

CREATE TABLE IF NOT EXISTS import_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT,
    file_hash TEXT UNIQUE,
    imported_at TEXT DEFAULT (datetime('now')),
    rows_detected INTEGER,
    rows_imported INTEGER,
    rows_rejected INTEGER,
    status TEXT
);
"""

def init_db():
    with ENGINE.connect() as conn:
        for stmt in SCHEMA.strip().split(";"):
            s = stmt.strip()
            if s:
                conn.execute(text(s))
        # Migrate: add duration columns if missing
        existing = [r[1] for r in conn.execute(text("PRAGMA table_info(trades)")).fetchall()]
        for col, typ in [("open_time", "TEXT"), ("close_time", "TEXT"), ("duration_minutes", "REAL")]:
            if col not in existing:
                conn.execute(text(f"ALTER TABLE trades ADD COLUMN {col} {typ}"))
        conn.commit()

def get_trades(filters: dict = None) -> pd.DataFrame:
    query = "SELECT * FROM trades WHERE 1=1"
    params = {}
    if filters:
        if filters.get("date_from"):
            query += " AND trade_date >= :date_from"
            params["date_from"] = filters["date_from"]
        if filters.get("date_to"):
            query += " AND trade_date <= :date_to"
            params["date_to"] = filters["date_to"]
        if filters.get("symbol"):
            query += " AND symbol = :symbol"
            params["symbol"] = filters["symbol"]
        if filters.get("strategy"):
            query += " AND strategy = :strategy"
            params["strategy"] = filters["strategy"]
        if filters.get("account"):
            query += " AND account = :account"
            params["account"] = filters["account"]
        if filters.get("broker"):
            query += " AND broker = :broker"
            params["broker"] = filters["broker"]
        if filters.get("direction"):
            query += " AND direction = :direction"
            params["direction"] = filters["direction"]
        if filters.get("result") == "Win":
            query += " AND net_pnl > 0"
        elif filters.get("result") == "Loss":
            query += " AND net_pnl <= 0"
    query += " ORDER BY trade_date DESC"
    with ENGINE.connect() as conn:
        return pd.read_sql(text(query), conn, params=params)

def insert_trades(df: pd.DataFrame, import_id: int) -> tuple[int, int]:
    inserted, rejected = 0, 0
    with ENGINE.connect() as conn:
        for _, row in df.iterrows():
            try:
                result = conn.execute(text("""
                    INSERT OR IGNORE INTO trades
                    (trade_date, close_date, symbol, asset_class, direction, quantity,
                     entry_price, exit_price, fees, gross_pnl, net_pnl, account,
                     broker, strategy, setup, notes, trade_uid, open_time, close_time,
                     duration_minutes, import_id)
                    VALUES (:trade_date, :close_date, :symbol, :asset_class, :direction,
                            :quantity, :entry_price, :exit_price, :fees, :gross_pnl,
                            :net_pnl, :account, :broker, :strategy, :setup, :notes,
                            :trade_uid, :open_time, :close_time, :duration_minutes, :import_id)
                """), {**{k: row.to_dict().get(k) for k in ["trade_date","close_date","symbol","asset_class","direction","quantity","entry_price","exit_price","fees","gross_pnl","net_pnl","account","broker","strategy","setup","notes","trade_uid","open_time","close_time","duration_minutes"]}, "import_id": import_id})
                if result.rowcount > 0:
                    inserted += 1
                else:
                    rejected += 1
            except Exception:
                rejected += 1
        conn.commit()
    return inserted, rejected

def save_import_record(filename, file_hash, rows_detected, rows_imported, rows_rejected, status) -> int:
    with ENGINE.connect() as conn:
        result = conn.execute(text("""
            INSERT INTO import_history (filename, file_hash, rows_detected, rows_imported, rows_rejected, status)
            VALUES (:filename, :file_hash, :rows_detected, :rows_imported, :rows_rejected, :status)
        """), dict(filename=filename, file_hash=file_hash, rows_detected=rows_detected,
                   rows_imported=rows_imported, rows_rejected=rows_rejected, status=status))
        conn.commit()
        return result.lastrowid

def get_import_history() -> pd.DataFrame:
    with ENGINE.connect() as conn:
        return pd.read_sql(text("SELECT * FROM import_history ORDER BY imported_at DESC"), conn)

def file_hash_exists(file_hash: str) -> bool:
    with ENGINE.connect() as conn:
        r = conn.execute(text("SELECT 1 FROM import_history WHERE file_hash=:h"), {"h": file_hash}).fetchone()
        return r is not None

def delete_import(import_id: int) -> int:
    with ENGINE.connect() as conn:
        result = conn.execute(text("DELETE FROM trades WHERE import_id = :id"), {"id": import_id})
        deleted = result.rowcount
        conn.execute(text("DELETE FROM import_history WHERE id = :id"), {"id": import_id})
        conn.commit()
    return deleted

def delete_all_data() -> dict:
    with ENGINE.connect() as conn:
        trades = conn.execute(text("SELECT COUNT(*) FROM trades")).scalar()
        conn.execute(text("DELETE FROM trades"))
        conn.execute(text("DELETE FROM import_history"))
        conn.commit()
    return {"deleted_trades": trades}

def get_distinct(col: str) -> list:
    with ENGINE.connect() as conn:
        rows = conn.execute(text(f"SELECT DISTINCT {col} FROM trades WHERE {col} IS NOT NULL AND {col} != '' ORDER BY {col}")).fetchall()
        return [r[0] for r in rows]
