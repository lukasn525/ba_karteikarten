"""Prüft die Kartendateien in data/ auf typische Fehler.

Aufruf im Projektordner:
    python scripts/pruefe_karten.py

Geprüft wird: gültiges JSON (mit Zeilenangabe), Pflichtfelder, doppelte ids,
3–5 Stichpunkte je Karte, leere Texte. Exit-Code 1 bei Fehlern, sonst 0.
Nur Python-Standardbibliothek, keine Installation nötig.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

WURZEL = Path(__file__).resolve().parent.parent
DATEN = WURZEL / "data"
MIN_PUNKTE, MAX_PUNKTE = 3, 5


def lade(datei: Path, fehler: list[str]):
    try:
        text = datei.read_text(encoding="utf-8")
    except FileNotFoundError:
        fehler.append(f"{datei.name}: Datei nicht gefunden.")
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        fehler.append(
            f"{datei.name}: kein gültiges JSON – Zeile {e.lineno}, Spalte {e.colno}: {e.msg}. "
            "Häufige Ursache: fehlendes oder überzähliges Komma bzw. Anführungszeichen."
        )
        return None


def pruefe() -> tuple[list[str], list[str], int]:
    fehler: list[str] = []
    hinweise: list[str] = []
    anzahl = 0

    meta = lade(DATEN / "index.json", fehler)
    if meta is None:
        return fehler, hinweise, anzahl
    stapel = meta.get("stapel")
    if not isinstance(stapel, list) or not stapel:
        fehler.append("index.json: Feld „stapel“ fehlt oder ist leer.")
        return fehler, hinweise, anzahl

    gesehen: dict[str, str] = {}
    fragen: dict[str, str] = {}
    for name in stapel:
        datei = DATEN / name
        inhalt = lade(datei, fehler)
        if inhalt is None:
            continue
        karten = inhalt.get("karten")
        if not isinstance(karten, list):
            fehler.append(f"{name}: Feld „karten“ fehlt oder ist keine Liste.")
            continue
        for k in ("id", "titel"):
            if not inhalt.get(k):
                hinweise.append(f"{name}: Feld „{k}“ fehlt (wird aus dem Dateinamen abgeleitet).")

        for i, karte in enumerate(karten, start=1):
            ort = f"{name}, Karte {i}"
            if not isinstance(karte, dict):
                fehler.append(f"{ort}: ist kein Objekt.")
                continue
            kid = karte.get("id")
            if kid:
                ort += f" ({kid})"
            if not kid:
                fehler.append(f"{ort}: „id“ fehlt.")
            elif kid in gesehen:
                fehler.append(f"{ort}: id „{kid}“ gibt es schon in {gesehen[kid]}.")
            else:
                gesehen[kid] = name

            frage = karte.get("frage")
            if not isinstance(frage, str) or not frage.strip():
                fehler.append(f"{ort}: „frage“ fehlt oder ist leer.")
            else:
                schluessel = frage.strip().lower()
                if schluessel in fragen:
                    hinweise.append(f"{ort}: gleiche Frage wie {fragen[schluessel]}.")
                else:
                    fragen[schluessel] = kid or ort

            punkte = karte.get("punkte")
            if not isinstance(punkte, list):
                fehler.append(f"{ort}: „punkte“ fehlt oder ist keine Liste.")
            else:
                leer = [p for p in punkte if not isinstance(p, str) or not p.strip()]
                if leer:
                    fehler.append(f"{ort}: {len(leer)} leere(r) Stichpunkt(e).")
                n = len(punkte) - len(leer)
                if not MIN_PUNKTE <= n <= MAX_PUNKTE:
                    hinweise.append(f"{ort}: {n} Stichpunkte (vorgesehen sind {MIN_PUNKTE}–{MAX_PUNKTE}).")

            for feld in ("abschnitt", "nachfrage"):
                if feld in karte and not isinstance(karte[feld], str):
                    fehler.append(f"{ort}: „{feld}“ muss Text sein.")
                elif not karte.get(feld):
                    hinweise.append(f"{ort}: „{feld}“ ist leer.")

            unbekannt = set(karte) - {"id", "frage", "punkte", "abschnitt", "nachfrage"}
            if unbekannt:
                hinweise.append(f"{ort}: unbekannte Felder {sorted(unbekannt)} werden ignoriert.")
            anzahl += 1

    return fehler, hinweise, anzahl


def main() -> int:
    fehler, hinweise, anzahl = pruefe()
    for f in fehler:
        print("FEHLER   ", f)
    for h in hinweise:
        print("Hinweis  ", h)
    if fehler:
        print(f"\n{len(fehler)} Fehler gefunden – bitte beheben, sonst fehlen Karten in der App.")
        return 1
    print(f"\nAlles in Ordnung: {anzahl} Karten geprüft" + (f", {len(hinweise)} Hinweis(e)." if hinweise else "."))
    return 0


if __name__ == "__main__":
    sys.exit(main())
