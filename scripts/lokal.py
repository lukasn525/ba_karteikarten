"""Startet die Karteikarten lokal und öffnet sie im Browser.

Aufruf im Projektordner (oder per Doppelklick auf start-lokal.bat):
    python scripts/lokal.py          (Windows ggf. „py scripts/lokal.py“)
    python scripts/lokal.py 8080     (anderer Port)

Vorher werden die Kartendateien geprüft. Der Server schickt keine
Cache-Header, Änderungen an den JSON-Dateien sind nach dem Neuladen sichtbar.
Beenden mit Strg+C oder durch Schließen des Fensters.
"""

from __future__ import annotations

import functools
import http.server
import sys
import threading
import webbrowser
from pathlib import Path

WURZEL = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    from pruefe_karten import pruefe
except Exception:  # Prüfung ist optional
    pruefe = None


class OhneCache(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".json": "application/json",
        ".webmanifest": "application/manifest+json",
        ".svg": "image/svg+xml",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format, *args):  # ruhige Konsole
        pass


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

    if pruefe:
        fehler, hinweise, anzahl = pruefe()
        for f in fehler:
            print("FEHLER   ", f)
        for h in hinweise:
            print("Hinweis  ", h)
        print(f"{anzahl} Karten geprüft, {len(fehler)} Fehler, {len(hinweise)} Hinweise.\n")

    handler = functools.partial(OhneCache, directory=str(WURZEL))
    for versuch in range(port, port + 10):
        try:
            server = http.server.ThreadingHTTPServer(("127.0.0.1", versuch), handler)
            break
        except OSError:
            continue
    else:
        sys.exit(f"Kein freier Port zwischen {port} und {port + 9} gefunden.")

    adresse = f"http://localhost:{server.server_address[1]}/"
    print(f"Karteikarten laufen unter {adresse}")
    print("Beenden mit Strg+C oder durch Schließen dieses Fensters.")
    threading.Timer(0.8, lambda: webbrowser.open(adresse)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nBeendet.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
