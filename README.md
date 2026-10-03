# Kolloquium · Karteikarten

Karteikarten zur Vorbereitung auf das Kolloquium der Bachelorarbeit
„Einsatzlast der Feuerwehr San Francisco“. 80 Karten in 4 Stapeln à 20:

| Stapel | Thema |
|---|---|
| 1 | Fragestellung, Daten & Aufbereitung |
| 2 | Methodik, Validierung & Statistik |
| 3 | Ergebnisse & Interpretation |
| 4 | Kritik, Limitationen & Prüfer-Angriffe |

Reine statische Website (HTML, CSS, JavaScript), kein Build-Schritt, keine Abhängigkeiten.

---

## Lokal starten

**Windows:** Doppelklick auf `start-lokal.bat`. Der Browser öffnet sich unter `http://localhost:8000`.

**Alternativ (Terminal im Projektordner):**

```bash
python scripts/lokal.py        # Windows ggf.: py scripts/lokal.py
```

Das Skript prüft vorher die Kartendateien und startet einen kleinen Server ohne Zwischenspeicher:
Nach einer Änderung an einer JSON-Datei genügt im Browser **F5**.

> Ein Doppelklick auf `index.html` reicht nicht – Browser blockieren dann das Nachladen der Kartendateien.
> Die Seite zeigt in dem Fall einen Hinweis an.

---

## Karten bearbeiten

Alle Inhalte stehen in `data/`. Die Programmdateien müssen dafür nicht angefasst werden.

```
data/
├── index.json       Titel, Kartenstand, Liste und Reihenfolge der Stapel
├── stapel-1.json
├── stapel-2.json
├── stapel-3.json
└── stapel-4.json
```

### Aufbau einer Karte

```json
{
  "id": "2-05",
  "frage": "Warum wird nur in der ersten Wiederholung abgestimmt?",
  "punkte": [
    "Erster Stichpunkt.",
    "Zweiter Stichpunkt.",
    "Dritter Stichpunkt."
  ],
  "abschnitt": "5.2",
  "nachfrage": "Typische Nachfrage des Prüfers?"
}
```

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `id` | ja | Eindeutige Kennung. Daran hängt der Lernstand (sicher/unsicher/kritisch). |
| `frage` | ja | Vorderseite. |
| `punkte` | ja | Rückseite, **3–5 Stichpunkte**. Lieber eine Karte mehr als eine zu lange. |
| `abschnitt` | nein | Abschnitt der Arbeit, z. B. `"4.5"` oder `"7.3, 2.3"`. |
| `nachfrage` | nein | Typische Nachfrage, erscheint im orangen Kasten. |

In `frage`, `punkte` und `nachfrage` wird `**so**` fett dargestellt.

### Typische Änderungen

- **Text korrigieren:** einfach den Text ändern. Der Lernstand der Karte bleibt erhalten.
- **Karte hinzufügen:** Block kopieren, neue `id` vergeben (z. B. `"2-21"`), Komma zwischen den Karten nicht vergessen.
- **Karte löschen:** Block entfernen. Den Lernstand dieser Karte ignoriert die App danach.
- **Reihenfolge ändern:** Blöcke verschieben. Ohne Mischen erscheinen die Karten in Dateireihenfolge.
- **Neuer Stapel:** Datei `data/stapel-5.json` nach dem Muster der anderen anlegen und in `data/index.json` unter `"stapel"` eintragen.
- **`id` ändern** setzt den Lernstand dieser Karte zurück, deshalb nur bei Bedarf.

### Prüfen

```bash
python scripts/pruefe_karten.py
```

Meldet ungültiges JSON mit Zeile und Spalte, fehlende Felder, doppelte `id`s und Karten mit weniger als 3
oder mehr als 5 Stichpunkten. Die App selbst zeigt solche Hinweise ebenfalls auf der Startseite an.
Häufigster Fehler: ein fehlendes oder überzähliges Komma.

---

## Lernmodus

- Eine Runde umfasst einen Stapel, alle Stapel oder eine Auswahl (kritische, unsichere, Suchergebnis).
- **Gewusst** nimmt die Karte aus der Runde, **Nochmal** schiebt sie drei Karten nach hinten.
- Die Runde endet erst, wenn jede Karte einmal gewusst wurde.
- Jede neue Runde enthält wieder **alle** Karten der Auswahl, auch die gut gekonnten. Es gibt keine Intervallwiederholung.
- Status je Karte: *sicher* (zuletzt auf Anhieb gewusst), *unsicher* (zuletzt mindestens einmal „Nochmal“), *neu*.
- **★** markiert eine Karte als kritisch. Kritische Karten lassen sich gesammelt lernen.
- Nach der Runde: „Neue Runde“ oder „Nur die schwierigen“.

**Bedienung:** Tippen/Klicken dreht die Karte um. Auf dem Smartphone: nach rechts wischen = gewusst,
nach links = nochmal. Tastatur: Leertaste umdrehen · ← oder 1 nochmal · → oder 2 gewusst ·
K kritisch · Z letzte Antwort zurücknehmen.

### Lernstand

Der Lernstand liegt im Browser (localStorage), getrennt je Gerät und Browser.
Übertragen: Menü (⋮) → *Exportieren* auf Gerät A, *Importieren* auf Gerät B.

---

## Veröffentlichen (GitHub + Vercel)

Das Repository ist mit Vercel verbunden. Jeder Push auf `main` veröffentlicht automatisch:

```bash
git add .
git commit -m "Karten aktualisiert"
git push
```

Nach etwa einer Minute ist die neue Fassung unter der `*.vercel.app`-Adresse erreichbar.
Auf dem Smartphone lässt sich die Seite über *Zum Startbildschirm hinzufügen* wie eine App ablegen;
nach dem ersten Öffnen funktioniert sie auch ohne Netz.

Die Seite ist für Suchmaschinen gesperrt (`robots.txt`, `noindex`), aber für jeden mit dem Link erreichbar.

---

## Dateien

```
index.html             Seitengerüst
assets/app.js          Logik (Laden, Lernmodus, Übersicht, Speichern)
assets/style.css       Gestaltung inkl. Dunkelmodus
assets/icon*.{svg,png} App-Symbol
manifest.webmanifest   Installierbarkeit als App
sw.js                  Offline-Nutzung (nur auf der veröffentlichten Seite aktiv)
vercel.json            Cache-Einstellungen für Vercel
scripts/lokal.py       Lokaler Server
scripts/pruefe_karten.py  Prüfung der Kartendateien
start-lokal.bat        Startet den lokalen Server unter Windows
```
