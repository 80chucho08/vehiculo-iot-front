"""Servidor estático para pruebas locales (no se publica).

- Tipos MIME correctos para módulos JS (el http.server de Python en Windows puede servirlos como text/plain).
- Cache-Control: no-store, para que el navegador nunca mezcle módulos ES de versiones distintas.
Uso: python .claude/servidor_local.py [puerto] [host]
"""
import http.server
import sys
from functools import partial
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]


class Manejador(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
        ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
    host = sys.argv[2] if len(sys.argv) > 2 else "127.0.0.1"
    http.server.ThreadingHTTPServer((host, puerto), partial(Manejador, directory=str(RAIZ))).serve_forever()
