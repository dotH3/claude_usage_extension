#!/usr/bin/env python3
"""
usage-monitor-daemon — thin local proxy for the OpenCode Go usage API.

Reads your OpenCode Go API key from the local OpenCode auth store
(~/.local/share/opencode/auth.json, written by `opencode auth login` or the
/connect TUI command) and serves the real usage data from
https://opencode.ai/zen/go/v1/usage over HTTP so the browser extension can
display it without you pasting the key into its settings.

Usage:
    python3 daemon.py              # starts on localhost:19876
    python3 daemon.py --port 19876

The extension polls http://localhost:19876/usage automatically. If the daemon
is not running, the extension falls back to the API key saved in its settings.

There is intentionally no "local database" fallback: the dollar usage tracked
by OpenCode Go is computed server-side, and the costs in the local OpenCode
SQLite DB do not match it. Serving invented numbers is worse than serving
none, so when the real API is unreachable this returns an error.
"""

import json
import sys
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

DEFAULT_PORT = 19876
OPENCODE_AUTH = Path.home() / ".local/share/opencode/auth.json"
USAGE_URL = "https://opencode.ai/zen/go/v1/usage"


def read_api_key():
    if not OPENCODE_AUTH.exists():
        return None
    try:
        data = json.loads(OPENCODE_AUTH.read_text())
        return data.get("opencode-go", {}).get("key")
    except Exception:
        return None


def fetch_usage(api_key):
    req = urllib.request.Request(
        USAGE_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
            # The default Python-urllib user agent is blocked by the CDN.
            "User-Agent": "usage-monitor-daemon/2.1",
        },
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode())


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/usage":
            api_key = read_api_key()
            if not api_key:
                self._json(503, {"error": f"no opencode-go key in {OPENCODE_AUTH}"})
                return
            try:
                self._json(200, fetch_usage(api_key))
            except urllib.error.HTTPError as e:
                self._json(e.code, {"error": f"usage API returned HTTP {e.code}"})
            except Exception as e:
                self._json(502, {"error": f"usage API unreachable: {e}"})

        elif self.path == "/health":
            self._json(200, {"ok": True})

        else:
            self._json(404, {"error": "not found"})

    def _json(self, code, body):
        payload = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, fmt, *args):
        # Quiet logs
        pass


def main():
    port = DEFAULT_PORT
    if "--port" in sys.argv:
        idx = sys.argv.index("--port")
        port = int(sys.argv[idx + 1])

    server = HTTPServer(("127.0.0.1", port), Handler)
    print(f"usage-monitor-daemon listening on http://localhost:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
        server.server_close()


if __name__ == "__main__":
    main()
