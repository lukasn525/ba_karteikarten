"""Prüft die Kartendateien in data/ auf typische Fehler.

Aufruf im Projektordner:
    python scripts/pruefe_karten.py

Geprüft wird: gültiges JSON (mit Zeilenangabe), Pflichtfelder, doppelte ids,
3–5 Stichpunkte je Karte, leere Texte (auch eine fehlende Antwort auf die
Nachfrage) und die Zuordnung der Stapel zu den Teilen. Exit-Code 1 bei Fehlern, sonst 0.
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
    stapel_ids: list[str] = []
    for name in stapel:
        datei = DATEN / name
        inhalt = lade(datei, fehler)
        if inhalt is None:
            continue
        stapel_ids.append(str(inhalt.get("id") or name.removesuffix(".json")))
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

            for feld in ("abschnitt", "nachfrage", "nachfrage_antwort"):
                if feld in karte and not isinstance(karte[feld], str):
                    fehler.append(f"{ort}: „{feld}“ muss Text sein.")
                elif not karte.get(feld):
                    if feld != "nachfrage_antwort" or karte.get("nachfrage"):
                        hinweise.append(f"{ort}: „{feld}“ ist leer.")

            if "fassung" in karte and (not isinstance(karte["fassung"], str) or not karte["fassung"].strip()):
                fehler.append(f"{ort}: „fassung“ muss nicht leerer Text sein.")

            unbekannt = set(karte) - {"id", "fassung", "frage", "punkte", "abschnitt", "nachfrage", "nachfrage_antwort"}
            if unbekannt:
                hinweise.append(f"{ort}: unbekannte Felder {sorted(unbekannt)} werden ignoriert.")
            anzahl += 1

    pruefe_teile(meta, stapel_ids, fehler, hinweise)
    return fehler, hinweise, anzahl


def pruefe_teile(meta: dict, stapel_ids: list[str], fehler: list[str], hinweise: list[str]) -> None:
    """Teile in index.json: jeder genannte Stapel existiert und steht in genau einem Teil."""
    teile = meta.get("teile")
    if teile is None:
        return
    if not isinstance(teile, list):
        fehler.append("index.json: Feld „teile“ muss eine Liste sein.")
        return
    vergeben: dict[str, str] = {}
    teil_ids: set[str] = set()
    for i, teil in enumerate(teile, start=1):
        if not isinstance(teil, dict) or not teil.get("id") or not isinstance(teil.get("stapel"), list):
            fehler.append(f"index.json: Teil {i} braucht „id“ und eine Liste „stapel“.")
            continue
        tid = str(teil["id"])
        if tid in teil_ids:
            fehler.append(f"index.json: Teil-id „{tid}“ ist doppelt.")
        teil_ids.add(tid)
        for sid in map(str, teil["stapel"]):
            if sid not in stapel_ids:
                fehler.append(f"index.json: Teil „{tid}“ nennt den unbekannten Stapel „{sid}“.")
            elif sid in vergeben:
                fehler.append(f"index.json: Stapel „{sid}“ steht in „{vergeben[sid]}“ und „{tid}“.")
            else:
                vergeben[sid] = tid
    for sid in stapel_ids:
        if sid not in vergeben:
            hinweise.append(f"index.json: Stapel „{sid}“ steht in keinem Teil (erscheint im ersten).")


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
