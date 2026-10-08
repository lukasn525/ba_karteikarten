# Kolloquium · Karteikarten

Karteikarten zur Vorbereitung auf das Kolloquium der Bachelorarbeit
„Einsatzlast der Feuerwehr San Francisco“. 111 Karten in 5 Stapeln:

| Stapel | Thema |
|---|---|
| 1 | Fragestellung, Daten & Aufbereitung |
| 2 | Verfahren & Modellwahl |
| 3 | Validierung & Statistik |
| 4 | Ergebnisse & Interpretation |
| 5 | Kritik, Limitationen & Prüfer-Angriffe |

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
├── stapel-1.json    Stapel 1
├── stapel-2.json    Stapel 2
├── stapel-5.json    Stapel 3 (die Reihenfolge legt index.json fest)
├── stapel-3.json    Stapel 4
└── stapel-4.json    Stapel 5
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
  "nachfrage": "Typische Nachfrage des Prüfers?",
  "nachfrage_antwort": "Antwort darauf in ein bis zwei Sätzen."
}
```

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `id` | ja | Eindeutige Kennung. Daran hängt der Lernstand (sicher/unsicher/kritisch). |
| `frage` | ja | Vorderseite. |
| `punkte` | ja | Rückseite, **3–5 Stichpunkte**. Lieber eine Karte mehr als eine zu lange. |
| `abschnitt` | nein | Abschnitt der Arbeit, z. B. `"4.5"` oder `"7.3, 2.3"`. |
| `nachfrage` | nein | Typische Nachfrage, erscheint im orangen Kasten. |
| `nachfrage_antwort` | nein | Antwort auf die Nachfrage, 1–2 Sätze, erscheint im selben Kasten darunter. |

In `frage`, `punkte`, `nachfrage` und `nachfrage_antwort` wird `**so**` fett dargestellt.

### Typische Änderungen

- **Text korrigieren:** einfach den Text ändern. Der Lernstand der Karte bleibt erhalten.
- **Karte hinzufügen:** Block kopieren, neue `id` vergeben (z. B. `"1-29"`), Komma zwischen den Karten nicht vergessen.
- **Karte löschen:** Block entfernen. Den Lernstand dieser Karte ignoriert die App danach.
- **Reihenfolge ändern:** Blöcke verschieben. Ohne Mischen erscheinen die Karten in Dateireihenfolge.
- **Neuer Stapel:** Datei `data/stapel-6.json` nach dem Muster der anderen anlegen und in `data/index.json` unter `"stapel"` eintragen.
- **`id` ändern** setzt den Lernstand dieser Karte zurück, deshalb nur bei Bedarf.
- **Download hinzufügen:** Datei nach `unterlagen/` legen und in `data/index.json` unter `"unterlagen"` eintragen (`titel`, `datei`, `info`). Die Startseite zeigt die Liste unter „Unterlagen zum Herunterladen“.

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
- **Gewusst** nimmt die Karte aus der Runde, **Nochmal** behält sie in der Wiederholung:
  - Zwischen zwei Auftritten derselben Karte liegen **mindestens 3 und höchstens 6 andere Karten**.
  - Nach **zwei Wiederholungen in Folge** kommt eine neue Karte dazu – aber nur, solange dadurch keine
    Wiederholung länger als 6 Karten warten müsste. Gleichzeitig sind deshalb höchstens 7 Karten in der
    Wiederholung; die Zahl wächst nicht weiter, sondern es wird reihum wiederholt, bis eine Karte gewusst ist.
  - Beispiel, wenn man immer „Nochmal“ wählt: 1 2 3 4 1 2 5 3 4 6 1 2 7 5 3 4 6 1 2 7 …
  - Sind nur noch wenige Karten offen, kommen sie einfach reihum. Es werden keine fremden Karten eingestreut.
  - Einstellbar über `MIN_ABSTAND`, `MAX_ABSTAND` und `WDH_VOR_NEU` oben in `assets/app.js`.
- Die Runde endet erst, wenn jede Karte einmal gewusst wurde.
- Die Rückseite lässt sich wieder umdrehen (Karte antippen, „Nur die Frage zeigen“ oder Leertaste).
- Jede neue Runde enthält wieder **alle** Karten der Auswahl, auch die gut gekonnten. Es gibt keine Intervallwiederholung.
- Status je Karte: *sicher* (zuletzt auf Anhieb gewusst), *unsicher* (zuletzt mindestens einmal „Nochmal“), *neu*.
- **★** markiert eine Karte als kritisch. Kritische Karten lassen sich gesammelt lernen.
- Nach der Runde: „Neue Runde“ oder „Nur die schwierigen“.

**Bedienung:** Tippen/Klicken dreht die Karte um und wieder zurück. Auf dem Smartphone: nach rechts
wischen = gewusst, nach links = nochmal. Tastatur: Leertaste umdrehen und zurückdrehen · ← oder 1 nochmal ·
→ oder 2 gewusst · K kritisch · Z letzte Antwort zurücknehmen.

### Lernstand – geräteübergreifend

Status, Sterne, Einstellungen und die laufende Runde werden online in Supabase gespeichert und auf
allen Geräten abgeglichen, auf denen die Seite geöffnet wird – ohne Anmeldung.

- Jede Änderung wird nach etwa 1,5 Sekunden hochgeladen, spätestens beim Verlassen der Seite.
- Beim Öffnen und beim Zurückkehren zur Seite werden Änderungen der anderen Geräte geholt.
- Solange die Seite sichtbar ist, prüft sie alle 10 Sekunden, ob ein anderes Gerät etwas gespeichert
  hat, und zieht dann nach – sind Rechner und Handy gleichzeitig offen, gleichen sie sich von selbst an
  (`LIVE_INTERVALL` in `assets/app.js`).
- Je Karte gewinnt die zuletzt geänderte Fassung; „Lernstand zurücksetzen“ und „Importieren“ gelten
  für alle Geräte.
- Zusätzlich liegt eine Kopie im Browser (localStorage). Ohne Netz läuft alles weiter und wird
  später abgeglichen.
- Die Zeile unten auf der Startseite und im Menü zeigt den Stand des Abgleichs.
- Auch die lokale Vorschau (`start-lokal.bat`) gleicht mit dem Online-Speicher ab.
- Wer den Link kennt, teilt sich denselben Lernstand.
- *Exportieren* / *Importieren* im Menü dienen als Sicherung.

**Technik:** Supabase-Projekt `ba-karteikarten` (Free, Frankfurt), Tabelle `public.lernstand` mit
einer Zeile `gemeinsam` (`daten` jsonb, `version`). Die Tabelle ist für Browser gesperrt; gelesen und
geschrieben wird nur über die Funktionen `lernstand_laden()`, `lernstand_version()` und
`lernstand_speichern(neu_daten, basis_version)`. Geschrieben wird nur, wenn die Version noch stimmt,
sonst führt das Gerät zuerst zusammen. Die Regeln dafür stehen in `assets/abgleich.js`,
Adresse und öffentlicher Schlüssel oben im Abschnitt „Geräteübergreifender Abgleich“ in `assets/app.js`.

Kostenlose Supabase-Projekte werden nach einer Woche ohne Nutzung pausiert. Die Daten bleiben
erhalten; die Seite speichert dann nur lokal, bis das Projekt im Supabase-Dashboard wieder
gestartet wird (*Restore project*).

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
assets/app.js          Logik (Laden, Lernmodus, Übersicht, Speichern, Abgleich)
assets/abgleich.js     Regeln für das Zusammenführen des Lernstands mehrerer Geräte
assets/style.css       Gestaltung inkl. Dunkelmodus
assets/icon*.{svg,png} App-Symbol
manifest.webmanifest   Installierbarkeit als App
sw.js                  Offline-Nutzung (nur auf der veröffentlichten Seite aktiv)
vercel.json            Cache-Einstellungen für Vercel
scripts/lokal.py       Lokaler Server
scripts/pruefe_karten.py  Prüfung der Kartendateien
start-lokal.bat        Startet den lokalen Server unter Windows
```
