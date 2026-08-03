import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen

import yfinance as yf

ROOT = os.path.dirname(os.path.abspath(__file__))
API_KEY = os.environ.get("FINNHUB_API_KEY", "d9b9hvpr01qmk4gkrtr0d9b9hvpr01qmk4gkrtrg")


class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/quote":
            self.handle_quote(parsed)
            return
        if parsed.path == "/api/profile":
            self.handle_profile(parsed)
            return
        if parsed.path == "/api/history":
            self.handle_history(parsed)
            return
        super().do_GET()

    def handle_quote(self, parsed):
        symbol = parse_qs(parsed.query).get("symbol", [""])[0].strip().upper() or "AAPL"
        data = self.fetch_yf_quote(symbol)
        self.send_json(data)

    def handle_profile(self, parsed):
        symbol = parse_qs(parsed.query).get("symbol", [""])[0].strip().upper() or "AAPL"
        data = self.fetch_yf_profile(symbol)
        self.send_json(data)

    def handle_history(self, parsed):
        query = parse_qs(parsed.query)
        symbol = query.get("symbol", [""])[0].strip().upper() or "AAPL"
        period = query.get("range", ["1y"])[0].strip() or "1y"
        interval = query.get("interval", ["1d"])[0].strip() or "1d"
        from_raw = query.get("from", [""])[0].strip()
        to_raw = query.get("to", [""])[0].strip()

        valid_periods = {"1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"}
        valid_intervals = {"1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h", "1d", "5d", "1wk", "1mo", "3mo"}

        if period not in valid_periods:
            period = "1y"
        if interval not in valid_intervals:
            interval = "1d"

        from_sec = None
        to_sec = None
        if from_raw and to_raw:
            try:
                from_sec = int(float(from_raw))
                to_sec = int(float(to_raw))
                if to_sec <= from_sec:
                    from_sec = None
                    to_sec = None
            except Exception:
                from_sec = None
                to_sec = None

        data = self.fetch_yf_history(symbol, period=period, interval=interval, from_sec=from_sec, to_sec=to_sec)
        self.send_json(data)

    def send_json(self, data):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode("utf-8"))

    def fetch_yf_history(self, symbol, period="1y", interval="1d", from_sec=None, to_sec=None):
        try:
            ticker = yf.Ticker(symbol)

            if from_sec is not None and to_sec is not None:
                start_dt = datetime.fromtimestamp(from_sec, tz=timezone.utc)
                end_dt = datetime.fromtimestamp(to_sec, tz=timezone.utc)
                # yfinance end is often treated as exclusive; add a small guard window.
                end_dt = end_dt + timedelta(minutes=5)
                history = ticker.history(start=start_dt, end=end_dt, interval=interval, auto_adjust=False)
            else:
                history = ticker.history(period=period, interval=interval, auto_adjust=False)

            if history is None or history.empty:
                finnhub_data = self.fetch_finnhub_history(symbol, period=period, interval=interval, from_sec=from_sec, to_sec=to_sec)
                if finnhub_data:
                    return finnhub_data
                return {
                    "error": "No market history returned",
                    "symbol": symbol,
                    "source": "yfinance",
                    "isLive": False,
                    "range": period,
                    "interval": interval,
                    "from": from_sec,
                    "to": to_sec
                }

            history = history.dropna(subset=["Open", "High", "Low", "Close"])
            if history.empty:
                finnhub_data = self.fetch_finnhub_history(symbol, period=period, interval=interval, from_sec=from_sec, to_sec=to_sec)
                if finnhub_data:
                    return finnhub_data
                return {"error": "No valid OHLC rows", "symbol": symbol, "source": "yfinance", "isLive": False}

            timestamps = [int(idx.timestamp()) for idx in history.index]
            opens = [float(value) for value in history["Open"].tolist()]
            highs = [float(value) for value in history["High"].tolist()]
            lows = [float(value) for value in history["Low"].tolist()]
            closes = [float(value) for value in history["Close"].tolist()]

            return {
                "t": timestamps,
                "c": closes,
                "o": opens,
                "h": highs,
                "l": lows,
                "label": symbol,
                "source": "yfinance",
                "isLive": True,
                "range": period,
                "interval": interval,
                "from": from_sec,
                "to": to_sec
            }
        except Exception:
            finnhub_data = self.fetch_finnhub_history(symbol, period=period, interval=interval, from_sec=from_sec, to_sec=to_sec)
            if finnhub_data:
                return finnhub_data
            return {
                "error": "Failed to fetch market data",
                "symbol": symbol,
                "source": "yfinance",
                "isLive": False,
                "range": period,
                "interval": interval,
                "from": from_sec,
                "to": to_sec
            }

    def fetch_finnhub_history(self, symbol, period="1y", interval="1d", from_sec=None, to_sec=None):
        try:
            resolution_map = {
                "1m": "1",
                "2m": "1",
                "5m": "5",
                "15m": "15",
                "30m": "30",
                "60m": "60",
                "90m": "60",
                "1h": "60",
                "1d": "D",
                "5d": "D",
                "1wk": "W",
                "1mo": "M",
                "3mo": "M"
            }
            resolution = resolution_map.get(interval, "D")

            now_sec = int(datetime.now(tz=timezone.utc).timestamp())
            if from_sec is None or to_sec is None:
                lookback_map = {
                    "1d": 1,
                    "5d": 5,
                    "1mo": 31,
                    "3mo": 93,
                    "6mo": 186,
                    "1y": 370,
                    "2y": 740,
                    "5y": 1850,
                    "10y": 3700,
                    "ytd": 365,
                    "max": 5000
                }
                days = lookback_map.get(period, 370)
                from_sec = now_sec - days * 24 * 60 * 60
                to_sec = now_sec

            url = (
                "https://finnhub.io/api/v1/stock/candle"
                f"?symbol={symbol}&resolution={resolution}&from={int(from_sec)}&to={int(to_sec)}&token={API_KEY}"
            )
            req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urlopen(req, timeout=20) as response:
                body = response.read().decode("utf-8")
                payload = json.loads(body)

            if payload.get("s") != "ok":
                return None

            timestamps = payload.get("t", [])
            closes = payload.get("c", [])
            opens = payload.get("o", [])
            highs = payload.get("h", [])
            lows = payload.get("l", [])

            if not timestamps or not closes:
                return None

            return {
                "t": timestamps,
                "c": closes,
                "o": opens,
                "h": highs,
                "l": lows,
                "label": symbol,
                "source": "finnhub",
                "isLive": True,
                "range": period,
                "interval": interval,
                "from": int(from_sec),
                "to": int(to_sec)
            }
        except Exception:
            return None

    def fetch_yf_quote(self, symbol):
        try:
            history = self.fetch_yf_history(symbol, period="5d", interval="1d")
            closes = history.get("c", []) if isinstance(history, dict) else []
            if not closes:
                return {}
            latest = closes[-1]
            previous = closes[-2] if len(closes) > 1 else latest
            change = latest - previous
            percent = (change / previous * 100) if previous else 0
            return {
                "c": latest,
                "d": change,
                "dp": percent,
                "h": history.get("h", [latest])[-1] if history.get("h") else latest,
                "l": history.get("l", [latest])[-1] if history.get("l") else latest,
                "o": history.get("o", [latest])[-1] if history.get("o") else latest,
                "pc": previous,
                "source": history.get("source", "yfinance")
            }
        except Exception:
            return {}

    def fetch_yf_profile(self, symbol):
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.get_info() or {}

            name = info.get("longName") or info.get("shortName") or symbol
            exchange = info.get("exchange") or "US Market"
            industry = info.get("industry") or info.get("sector") or "Public company"
            country = info.get("country") or "US"
            currency = info.get("currency") or "USD"

            return {
                "name": name,
                "ticker": symbol,
                "exchange": exchange,
                "industry": industry,
                "country": country,
                "currency": currency,
                "marketCapitalization": info.get("marketCap"),
                "weburl": info.get("website"),
                "finnhubIndustry": industry,
                "source": "yfinance"
            }
        except Exception:
            # Fallback to Finnhub profile shape if yfinance info is unavailable.
            return self.fetch_finnhub_profile(symbol)

    def fetch_finnhub_profile(self, symbol):
        try:
            url = f"https://finnhub.io/api/v1/stock/profile2?symbol={symbol}&token={API_KEY}"
            req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urlopen(req, timeout=20) as response:
                body = response.read().decode("utf-8")
                data = json.loads(body)
                data["source"] = "finnhub"
                return data
        except Exception:
            return {}


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("0.0.0.0", port), AppHandler)
    print(f"Serving on http://127.0.0.1:{port}")
    server.serve_forever()
