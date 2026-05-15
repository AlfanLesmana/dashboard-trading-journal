import pandas as pd
import numpy as np

def compute_metrics(df: pd.DataFrame) -> dict:
    if df.empty:
        return {}

    df = df.copy()
    df["net_pnl"] = pd.to_numeric(df["net_pnl"], errors="coerce").fillna(0)

    wins = df[df["net_pnl"] > 0]
    losses = df[df["net_pnl"] <= 0]

    total_trades = len(df)
    win_count = len(wins)
    loss_count = len(losses)
    win_rate = win_count / total_trades if total_trades else 0

    avg_win = wins["net_pnl"].mean() if not wins.empty else 0
    avg_loss = losses["net_pnl"].mean() if not losses.empty else 0

    gross_profit = wins["net_pnl"].sum()
    gross_loss = abs(losses["net_pnl"].sum())
    profit_factor = gross_profit / gross_loss if gross_loss else float("inf")

    loss_rate = 1 - win_rate
    expectancy = (win_rate * avg_win) + (loss_rate * avg_loss)

    net_pnl_total = df["net_pnl"].sum()
    best_trade = df["net_pnl"].max()
    worst_trade = df["net_pnl"].min()

    # Max drawdown from equity curve
    eq = df.sort_values("trade_date")["net_pnl"].cumsum()
    roll_max = eq.cummax()
    drawdown = eq - roll_max
    max_dd = drawdown.min()

    return {
        "net_pnl": round(net_pnl_total, 2),
        "total_trades": total_trades,
        "win_rate": round(win_rate * 100, 2),
        "profit_factor": round(profit_factor, 2) if profit_factor != float("inf") else "∞",
        "avg_win": round(avg_win, 2),
        "avg_loss": round(avg_loss, 2),
        "expectancy": round(expectancy, 2),
        "max_drawdown": round(max_dd, 2),
        "best_trade": round(best_trade, 2),
        "worst_trade": round(worst_trade, 2),
        "win_count": win_count,
        "loss_count": loss_count,
        "gross_profit": round(gross_profit, 2),
        "gross_loss": round(gross_loss, 2),
    }

def equity_curve(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["net_pnl"] = pd.to_numeric(df["net_pnl"], errors="coerce").fillna(0)
    df = df.sort_values("trade_date")
    df["cumulative_pnl"] = df["net_pnl"].cumsum()
    df["peak"] = df["cumulative_pnl"].cummax()
    df["drawdown"] = df["cumulative_pnl"] - df["peak"]
    return df

def monthly_pnl(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["net_pnl"] = pd.to_numeric(df["net_pnl"], errors="coerce").fillna(0)
    df["month"] = pd.to_datetime(df["trade_date"], errors="coerce").dt.to_period("M").astype(str)
    return df.groupby("month")["net_pnl"].sum().reset_index().sort_values("month")

def strategy_stats(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty or "strategy" not in df.columns:
        return pd.DataFrame()
    df = df.copy()
    df["net_pnl"] = pd.to_numeric(df["net_pnl"], errors="coerce").fillna(0)

    def stats(g):
        wins = g[g["net_pnl"] > 0]
        losses = g[g["net_pnl"] <= 0]
        wr = len(wins) / len(g) if len(g) else 0
        avg_w = wins["net_pnl"].mean() if not wins.empty else 0
        avg_l = losses["net_pnl"].mean() if not losses.empty else 0
        gp = wins["net_pnl"].sum()
        gl = abs(losses["net_pnl"].sum())
        pf = gp / gl if gl else float("inf")
        exp = (wr * avg_w) + ((1 - wr) * avg_l)
        return pd.Series({
            "total_trades": len(g),
            "total_pnl": round(g["net_pnl"].sum(), 2),
            "win_rate": round(wr * 100, 2),
            "profit_factor": round(pf, 2) if pf != float("inf") else 999,
            "expectancy": round(exp, 2),
        })

    result = df.groupby("strategy").apply(stats, include_groups=False)
    return result.reset_index()

def symbol_stats(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty or "symbol" not in df.columns:
        return pd.DataFrame()
    df = df.copy()
    df["net_pnl"] = pd.to_numeric(df["net_pnl"], errors="coerce").fillna(0)

    def stats(g):
        long_pnl = g[g["direction"].str.lower() == "long"]["net_pnl"].sum() if "direction" in g.columns else 0
        short_pnl = g[g["direction"].str.lower() == "short"]["net_pnl"].sum() if "direction" in g.columns else 0
        return pd.Series({
            "Trades": len(g),
            "Net PnL": round(g["net_pnl"].sum(), 2),
            "Long PnL": round(long_pnl, 2),
            "Short PnL": round(short_pnl, 2),
        })

    result = df.groupby("symbol").apply(stats, include_groups=False).reset_index()
    return result.sort_values("Net PnL", ascending=False)
