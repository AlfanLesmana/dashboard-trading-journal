import hashlib
import pandas as pd
from pathlib import Path
import uuid

UPLOAD_DIR = Path("/srv/trading-dashboard/data/uploads")
PROCESSED_DIR = Path("/srv/trading-dashboard/data/processed")
REJECTED_DIR = Path("/srv/trading-dashboard/data/rejected")

# Our internal schema
REQUIRED_COLUMNS = ["trade_date", "close_date", "symbol", "direction", "entry_price", "exit_price", "net_pnl"]

# cTrader column mapping -> our internal schema
CTRADER_MAP = {
    "id":                  "trade_uid",
    "order id":            "order_id",
    "symbol":              "symbol",
    "opening direction":   "direction",
    "opening time":        "trade_date",
    "closing time":        "close_date",
    "entry price":         "entry_price",
    "closing price":       "exit_price",
    "closing quantity":    "quantity",
    "net $":               "net_pnl",
    "balance $":           "balance",
    "pips":                "pips",
}

def file_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def _detect_format(cols: list[str]) -> str:
    """Detect which broker format this file is."""
    cols_lower = [c.lower().strip() for c in cols]
    if "opening direction" in cols_lower and "net $" in cols_lower:
        return "ctrader"
    if "trade_date" in cols_lower and "net_pnl" in cols_lower:
        return "standard"
    return "unknown"

def _parse_ctrader(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    errors = []
    df.columns = [c.lower().strip() for c in df.columns]

    renamed = {k: v for k, v in CTRADER_MAP.items() if k in df.columns}
    df = df.rename(columns=renamed)

    # direction: cTrader uses "Buy"/"Sell" (Opening direction) -> Long/Short
    if "direction" in df.columns:
        df["direction"] = df["direction"].map({"Buy": "Long", "Sell": "Short"}).fillna(df["direction"])

    # Parse datetime columns (format: DD/MM/YYYY HH:MM:SS.mmm)
    for col, time_col in [("trade_date", "open_time"), ("close_date", "close_time")]:
        if col in df.columns:
            parsed = pd.to_datetime(df[col], dayfirst=True, errors="coerce")
            df[time_col] = parsed.dt.strftime("%H:%M:%S")
            df[col] = parsed.dt.strftime("%Y-%m-%d")

    # Compute duration in minutes
    if "open_time" in df.columns and "close_time" in df.columns:
        t_open = pd.to_datetime(df["trade_date"] + " " + df["open_time"].fillna("00:00:00"), errors="coerce")
        t_close = pd.to_datetime(df["close_date"] + " " + df["close_time"].fillna("00:00:00"), errors="coerce")
        df["duration_minutes"] = (t_close - t_open).dt.total_seconds() / 60

    # Add missing standard columns with defaults
    for col in ["gross_pnl", "fees", "asset_class", "account", "broker", "strategy", "setup", "notes"]:
        if col not in df.columns:
            df[col] = None

    df["broker"] = df["broker"].fillna("cTrader")
    df["gross_pnl"] = df["gross_pnl"].fillna(df.get("net_pnl", 0))

    # Ensure trade_uid is string
    if "trade_uid" in df.columns:
        df["trade_uid"] = df["trade_uid"].astype(str)
    else:
        df["trade_uid"] = [str(uuid.uuid4()) for _ in range(len(df))]

    # Numeric coercion
    for col in ["quantity", "entry_price", "exit_price", "fees", "gross_pnl", "net_pnl"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    keep = ["trade_date", "close_date", "symbol", "asset_class", "direction",
            "quantity", "entry_price", "exit_price", "fees", "gross_pnl",
            "net_pnl", "account", "broker", "strategy", "setup", "notes", "trade_uid",
            "open_time", "close_time", "duration_minutes"]
    keep = [c for c in keep if c in df.columns]
    df = df[keep]

    dedup_keys = [c for c in ["trade_date", "symbol", "direction", "entry_price", "exit_price", "net_pnl"] if c in df.columns]
    df = df.drop_duplicates(subset=dedup_keys)

    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        errors.append(f"Missing required columns after mapping: {', '.join(missing)}")

    return df, errors

def _parse_standard(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    errors = []
    df.columns = [c.lower().strip().replace(" ", "_") for c in df.columns]

    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        errors.append(f"Missing required columns: {', '.join(missing)}")
        return df, errors

    all_cols = ["trade_date", "close_date", "symbol", "asset_class", "direction",
                "quantity", "entry_price", "exit_price", "fees", "gross_pnl",
                "net_pnl", "account", "broker", "strategy", "setup", "notes"]
    for col in all_cols:
        if col not in df.columns:
            df[col] = None

    if "trade_uid" not in df.columns:
        df["trade_uid"] = [str(uuid.uuid4()) for _ in range(len(df))]

    for col in ["quantity", "entry_price", "exit_price", "fees", "gross_pnl", "net_pnl"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df["trade_date"] = pd.to_datetime(df["trade_date"], errors="coerce").dt.strftime("%Y-%m-%d")
    df["close_date"] = pd.to_datetime(df["close_date"], errors="coerce").dt.strftime("%Y-%m-%d")

    df = df[all_cols + ["trade_uid"]]
    dedup_keys = [c for c in ["trade_date", "symbol", "direction", "entry_price", "exit_price", "net_pnl"] if c in df.columns]
    df = df.drop_duplicates(subset=dedup_keys)
    return df, errors

def parse_excel(data: bytes, filename: str) -> tuple[pd.DataFrame, list[str]]:
    try:
        raw = pd.read_excel(data, engine="openpyxl")
    except Exception as e:
        return pd.DataFrame(), [f"Could not read Excel file: {e}"]

    fmt = _detect_format(list(raw.columns))

    if fmt == "ctrader":
        df, errors = _parse_ctrader(raw.copy())
    elif fmt == "standard":
        df, errors = _parse_standard(raw.copy())
    else:
        cols = ", ".join(raw.columns.tolist())
        return pd.DataFrame(), [
            f"Unrecognized file format. Columns found: {cols}",
            "Supported formats: cTrader export, or standard template with trade_date/net_pnl columns."
        ]

    return df, errors

def save_upload(data: bytes, filename: str) -> Path:
    dest = UPLOAD_DIR / filename
    dest.write_bytes(data)
    return dest
