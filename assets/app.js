/*
 * Kolloquium-Karteikarten – App-Logik
 * Die Inhalte liegen ausschließlich in data/*.json. Diese Datei muss zum
 * Bearbeiten der Karten nicht angefasst werden.
 */
(() => {
  'use strict';

  const SPEICHER_SCHLUESSEL = 'ba-karten-v1';
  const DATENORDNER = 'data/';
  const ABSTAND_NOCHMAL = 3;   // „Nochmal“-Karten kommen nach so vielen anderen Karten wieder
  const WISCH_SCHWELLE = 90;   // Pixel, ab denen ein Wisch als Antwort zählt

  const app = document.getElementById('app');
  const kopfTitel = document.getElementById('kopf-titel');
  const kopfSub = document.getElementById('kopf-sub');
  const btnZurueck = document.getElementById('btn-zurueck');
  const menue = document.getElementById('menue');
  const toastEl = document.getElementById('toast');

  const daten = { meta: {}, stapel: [], stapelById: new Map(), karten: new Map(), reihenfolge: [], warnungen: [] };
  let zustand = ladeZustand();
  let verlauf = [];            // Rückgängig-Schritte (nur im Speicher)
  let sperre = false;          // verhindert Doppelantworten während der Animation
  let gezogenBis = 0;          // unterdrückt den Klick direkt nach einem Wisch
  const ansicht = { ziel: null, filter: 'alle', suche: '' };

  const istTouch = window.matchMedia('(pointer: coarse)').matches;
  const hatTastatur = window.matchMedia('(hover: hover)').matches;

  const STERN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>';
  const HAKEN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  const FILTER = [
    ['alle', 'Alle'],
    ['kritisch', '★ Kritisch'],
    ['unsicher', 'Unsicher'],
    ['neu', 'Neu'],
    ['sicher', 'Sicher']
  ];

  // ------------------------------------------------------------------ Hilfen

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Erlaubt **fett** in Fragen und Stichpunkten
  const fmt = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const normal = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  function mischen(liste) {
    const a = liste.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('zeigen');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => toastEl.classList.remove('zeigen'), 2200);
  }

  // ------------------------------------------------------------- Lernstand

  function leererZustand() {
    return { version: 1, karten: {}, runde: null, einstellungen: { mischen: true } };
  }

  function ladeZustand() {
    try {
      const roh = localStorage.getItem(SPEICHER_SCHLUESSEL);
      if (!roh) return leererZustand();
      const z = JSON.parse(roh);
      const basis = leererZustand();
      return {
        version: 1,
        karten: (z && typeof z.karten === 'object' && z.karten) || {},
        runde: (z && z.runde) || null,
        einstellungen: Object.assign(basis.einstellungen, (z && z.einstellungen) || {})
      };
    } catch (e) {
      return leererZustand();
    }
  }

  function speichere() {
    try { localStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify(zustand)); }
    catch (e) { /* privater Modus o. Ä. – App läuft ohne Speichern weiter */ }
  }

  // Zustand einer Karte (lesend)
  function kz(id) {
    return zustand.karten[id] || { status: 'neu', kritisch: false };
  }

  // Zustand einer Karte (schreibend, legt bei Bedarf an)
  function kzSchreiben(id) {
    if (!zustand.karten[id]) zustand.karten[id] = { status: 'neu', kritisch: false, gewusst: 0, nochmal: 0 };
    return zustand.karten[id];
  }

  function statistik(ids) {
    const s = { gesamt: ids.length, sicher: 0, unsicher: 0, neu: 0, kritisch: 0 };
    for (const id of ids) {
      const k = kz(id);
      if (k.status === 'sicher') s.sicher++;
      else if (k.status === 'unsicher') s.unsicher++;
      else s.neu++;
      if (k.kritisch) s.kritisch++;
    }
    return s;
  }

  // ------------------------------------------------------------ Daten laden

  class Ladefehler extends Error {}

  async function holeJson(datei) {
    let antwort;
    try {
      antwort = await fetch(DATENORDNER + datei, { cache: 'no-cache' });
    } catch (e) {
      throw new Ladefehler(`${datei} konnte nicht geladen werden.`);
    }
    if (!antwort.ok) throw new Ladefehler(`${datei} wurde nicht gefunden (HTTP ${antwort.status}).`);
    const text = await antwort.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Ladefehler(jsonFehlertext(datei, text, e));
    }
  }

  function jsonFehlertext(datei, text, fehler) {
    const m = /position (\d+)/i.exec(fehler.message);
    if (m) {
      const pos = Number(m[1]);
      const davor = text.slice(0, pos);
      const zeile = davor.split('\n').length;
      const spalte = pos - davor.lastIndexOf('\n');
      return `${datei}: Fehler in Zeile ${zeile}, Spalte ${spalte}. Häufige Ursache: fehlendes oder überzähliges Komma bzw. Anführungszeichen.`;
    }
    return `${datei} ist kein gültiges JSON (${fehler.message}). Häufige Ursache: fehlendes oder überzähliges Komma bzw. Anführungszeichen.`;
  }

  function warne(text) {
    daten.warnungen.push(text);
    console.warn('[Karteikarten]', text);
  }

  function uebernimmStapel(roh, datei, nr) {
    if (!roh || !Array.isArray(roh.karten)) {
      warne(`${datei}: Feld „karten“ fehlt oder ist keine Liste – Stapel übersprungen.`);
      return;
    }
    const id = String(roh.id || datei.replace(/\.json$/i, ''));
    if (daten.stapelById.has(id)) {
      warne(`${datei}: Stapel-id „${id}“ ist doppelt – Stapel übersprungen.`);
      return;
    }
    const st = { id, titel: String(roh.titel || id), kurz: String(roh.kurz || roh.titel || id), nr, ids: [] };
    roh.karten.forEach((k, i) => {
      const ort = `${datei}, Karte ${i + 1}${k && k.id ? ` (${k.id})` : ''}`;
      if (!k || typeof k !== 'object') { warne(`${ort}: ist kein Objekt – übersprungen.`); return; }
      if (!k.id) { warne(`${ort}: „id“ fehlt – übersprungen.`); return; }
      const kid = String(k.id);
      if (daten.karten.has(kid)) { warne(`${ort}: id „${kid}“ kommt doppelt vor – übersprungen.`); return; }
      if (!k.frage) { warne(`${ort}: „frage“ fehlt – übersprungen.`); return; }
      let punkte = [];
      if (Array.isArray(k.punkte)) punkte = k.punkte.filter(p => typeof p === 'string' && p.trim());
      else if (typeof k.punkte === 'string' && k.punkte.trim()) punkte = [k.punkte];
      if (punkte.length < 3 || punkte.length > 5) warne(`${ort}: ${punkte.length} Stichpunkte (vorgesehen sind 3–5).`);
      daten.karten.set(kid, {
        id: kid,
        frage: String(k.frage),
        punkte,
        abschnitt: k.abschnitt ? String(k.abschnitt) : '',
        nachfrage: k.nachfrage ? String(k.nachfrage) : '',
        stapel: id
      });
      st.ids.push(kid);
      daten.reihenfolge.push(kid);
    });
    daten.stapel.push(st);
    daten.stapelById.set(id, st);
  }

  async function ladeDaten() {
    const meta = await holeJson('index.json');
    if (!meta || !Array.isArray(meta.stapel) || !meta.stapel.length) {
      throw new Ladefehler('data/index.json: Feld „stapel“ fehlt oder ist leer.');
    }
    daten.meta = meta;
    const ergebnisse = await Promise.allSettled(meta.stapel.map(holeJson));
    ergebnisse.forEach((erg, i) => {
      if (erg.status === 'fulfilled') uebernimmStapel(erg.value, meta.stapel[i], i + 1);
      else warne(erg.reason && erg.reason.message ? erg.reason.message : `${meta.stapel[i]} konnte nicht geladen werden.`);
    });
    if (!daten.reihenfolge.length) throw new Ladefehler('Es wurde keine einzige Karte gefunden.');
  }

  function zeigeLadefehler(e) {
    const istDatei = location.protocol === 'file:';
    kopfTitel.textContent = 'Kolloquium';
    kopfSub.textContent = '';
    app.innerHTML = `
      <div class="fehler">
        <h2>Die Karten konnten nicht geladen werden</h2>
        <p>${esc(e && e.message ? e.message : e)}</p>
        ${istDatei ? `<p>Die Seite wurde direkt als Datei geöffnet. Browser erlauben dann kein Nachladen der Kartendateien.
          Starte stattdessen im Projektordner <code>start-lokal.bat</code> (Windows) oder
          <code>python3 scripts/lokal.py</code> und öffne <code>http://localhost:8000</code>.</p>` : ''}
      </div>`;
  }

  // Entfernt Karten aus einer gespeicherten Runde, die es nicht mehr gibt
  function bereinigeRunde() {
    const r = zustand.runde;
    if (!r) return;
    const gibt = id => daten.karten.has(id);
    r.ids = (r.ids || []).filter(gibt);
    r.offen = (r.offen || []).filter(gibt);
    r.erledigt = (r.erledigt || []).filter(gibt);
    r.fehler = r.fehler || {};
    if (!r.ids.length || (!r.fertig && !r.offen.length)) zustand.runde = null;
    speichere();
  }

  // ------------------------------------------------------------- Navigation

  function aktuelleSeite() {
    const [seite, param] = location.hash.replace(/^#\/?/, '').split('/');
    return { seite: seite || '', param: param ? decodeURIComponent(param) : '' };
  }

  function navigiere(pfad, ersetzen) {
    const ziel = '#/' + pfad;
    if (location.hash === ziel) { render(); return; }
    if (ersetzen) { history.replaceState(null, '', ziel); render(); window.scrollTo(0, 0); }
    else location.hash = ziel;
  }

  function setzeKopf(titel, sub, zurueck) {
    kopfTitel.textContent = titel;
    kopfSub.textContent = sub || '';
    btnZurueck.hidden = !zurueck;
  }

  function render() {
    const { seite, param } = aktuelleSeite();
    if (seite === 'lernen') renderLernen();
    else if (seite === 'ergebnis') renderErgebnis();
    else if (seite === 'uebersicht') renderUebersicht(param || 'alle');
    else renderStart();
  }

  // ------------------------------------------------------------- Startseite

  function renderStart() {
    setzeKopf(daten.meta.titel || 'Kolloquium', `${daten.reihenfolge.length} Karten · ${daten.stapel.length} Stapel`, false);
    const r = zustand.runde;
    const laeuft = r && !r.fertig && r.offen.length;
    const alle = statistik(daten.reihenfolge);

    let h = `<section class="intro">
      <h1>${esc(daten.meta.titel || 'Karteikarten')}</h1>
      ${daten.meta.untertitel ? `<p>${esc(daten.meta.untertitel)}</p>` : ''}
    </section>`;

    if (laeuft) {
      h += `<button class="weiter" data-aktion="fortsetzen">
        <div><strong>Runde fortsetzen</strong><span>${esc(r.titel)} · noch ${r.offen.length} von ${r.ids.length} Karten offen</span></div>
        <span class="pfeil" aria-hidden="true">→</span>
      </button>`;
    }

    if (daten.warnungen.length) {
      const liste = daten.warnungen.slice(0, 12).map(w => `<li>${esc(w)}</li>`).join('');
      const mehr = daten.warnungen.length > 12 ? `<li>… und ${daten.warnungen.length - 12} weitere (siehe Browser-Konsole)</li>` : '';
      h += `<div class="warnung"><b>Hinweise zu den Kartendateien</b><ul>${liste}${mehr}</ul></div>`;
    }

    h += '<div class="stapel-liste">' + daten.stapel.map(stapelHtml).join('') + '</div>';

    h += `<section class="alle-karten">
      <h2>Stapelübergreifend</h2>
      <p>${alle.sicher} sicher · ${alle.unsicher} unsicher · ${alle.neu} neu · ${alle.kritisch} kritisch markiert</p>
      <div class="knopfreihe">
        <button class="btn btn-primaer" data-aktion="lernen" data-art="alle">Alle ${alle.gesamt} Karten</button>
        <button class="btn" data-aktion="lernen" data-art="kritisch" ${alle.kritisch ? '' : 'disabled'}>★ Kritische (${alle.kritisch})</button>
        <button class="btn" data-aktion="lernen" data-art="unsicher" ${alle.unsicher ? '' : 'disabled'}>Unsichere (${alle.unsicher})</button>
        <button class="btn" data-aktion="uebersicht" data-ziel="alle">Alle ansehen</button>
      </div>
    </section>`;

    const fuss = [daten.meta.stand ? `Kartenstand ${daten.meta.stand}` : '', daten.meta.hinweis || ''].filter(Boolean).join(' · ');
    if (fuss) h += `<p class="fuss">${esc(fuss)}</p>`;

    app.innerHTML = h;
  }

  function stapelHtml(st) {
    const s = statistik(st.ids);
    const pGut = s.gesamt ? (s.sicher / s.gesamt) * 100 : 0;
    const pNoch = s.gesamt ? (s.unsicher / s.gesamt) * 100 : 0;
    return `<article class="stapel">
      <div class="stapel-kopf">
        <div class="stapel-nr">${st.nr}</div>
        <div><h2>${esc(st.titel)}</h2><p>${s.gesamt} Karten${s.kritisch ? ` · ${s.kritisch} kritisch` : ''}</p></div>
      </div>
      <div class="balken" role="img" aria-label="${s.sicher} sicher, ${s.unsicher} unsicher, ${s.neu} neu">
        <div class="gut" style="width:${pGut}%"></div><div class="noch" style="width:${pNoch}%"></div>
      </div>
      <div class="stapel-stat">
        <span><i class="punkt" style="background:var(--gruen)"></i>${s.sicher} sicher</span>
        <span><i class="punkt" style="background:var(--orange)"></i>${s.unsicher} unsicher</span>
        <span><i class="punkt" style="background:var(--text-3)"></i>${s.neu} neu</span>
      </div>
      <div class="knopfreihe">
        <button class="btn btn-primaer" data-aktion="lernen" data-art="stapel" data-stapel="${esc(st.id)}">Lernen</button>
        <button class="btn" data-aktion="uebersicht" data-ziel="${esc(st.id)}">Übersicht</button>
        ${s.kritisch ? `<button class="btn" data-aktion="lernen" data-art="kritisch" data-stapel="${esc(st.id)}">★ Kritische (${s.kritisch})</button>` : ''}
      </div>
    </article>`;
  }

  // ----------------------------------------------------------------- Runden

  function auswahl(art, stapelId) {
    const st = stapelId ? daten.stapelById.get(stapelId) : null;
    let ids = st ? st.ids : daten.reihenfolge;
    if (art === 'kritisch') ids = ids.filter(id => kz(id).kritisch);
    if (art === 'unsicher') ids = ids.filter(id => kz(id).status === 'unsicher');
    const basis = st ? st.kurz : 'Alle Stapel';
    const titel = art === 'kritisch' ? `★ Kritische · ${basis}` : art === 'unsicher' ? `Unsichere · ${basis}` : basis;
    return { ids, titel };
  }

  function starteRunde(ids, titel) {
    ids = ids.filter(id => daten.karten.has(id));
    if (!ids.length) { toast('In dieser Auswahl sind keine Karten.'); return; }
    const reihe = zustand.einstellungen.mischen ? mischen(ids) : ids.slice();
    zustand.runde = {
      titel,
      ids: ids.slice(),
      offen: reihe,
      erledigt: [],
      fehler: {},
      versuche: 0,
      umgedreht: false,
      fertig: false,
      start: Date.now()
    };
    verlauf = [];
    speichere();
    navigiere('lernen');
  }

  function umdrehen() {
    const r = zustand.runde;
    if (!r || r.fertig || r.umgedreht || sperre) return;
    r.umgedreht = true;
    speichere();
    renderLernen();
  }

  function antworten(gewusst) {
    const r = zustand.runde;
    if (!r || r.fertig || !r.umgedreht || sperre || !r.offen.length) return;
    const id = r.offen[0];
    verlauf.push(JSON.stringify({ runde: r, karte: zustand.karten[id] || null, id }));
    if (verlauf.length > 30) verlauf.shift();

    const k = kzSchreiben(id);
    r.versuche++;
    r.offen.shift();
    if (gewusst) {
      k.gewusst = (k.gewusst || 0) + 1;
      k.status = r.fehler[id] ? 'unsicher' : 'sicher';
      r.erledigt.push(id);
    } else {
      k.nochmal = (k.nochmal || 0) + 1;
      k.status = 'unsicher';
      r.fehler[id] = (r.fehler[id] || 0) + 1;
      r.offen.splice(Math.min(r.offen.length, ABSTAND_NOCHMAL), 0, id);
    }
    k.zuletzt = Date.now();
    r.umgedreht = false;
    if (!r.offen.length) { r.fertig = true; r.ende = Date.now(); }
    speichere();

    // kurze Ausblend-Animation, dann nächste Karte
    const el = document.getElementById('karte');
    sperre = true;
    const weiter = () => {
      sperre = false;
      if (r.fertig) navigiere('ergebnis', true);
      else { renderLernen(); window.scrollTo(0, 0); }
    };
    if (el && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.style.transition = 'transform .16s ease, opacity .16s ease';
      el.style.transform = `translateX(${gewusst ? 60 : -60}px) rotate(${gewusst ? 2 : -2}deg)`;
      el.style.opacity = '0';
      setTimeout(weiter, 160);
    } else {
      weiter();
    }
  }

  function rueckgaengig() {
    const roh = verlauf.pop();
    if (!roh) return;
    const s = JSON.parse(roh);
    const kritischJetzt = kz(s.id).kritisch;
    zustand.runde = s.runde;
    if (s.karte) zustand.karten[s.id] = Object.assign(s.karte, { kritisch: kritischJetzt });
    else if (kritischJetzt) zustand.karten[s.id] = { status: 'neu', kritisch: true, gewusst: 0, nochmal: 0 };
    else delete zustand.karten[s.id];
    zustand.runde.umgedreht = true;
    zustand.runde.fertig = false;
    speichere();
    toast('Letzte Antwort zurückgenommen');
    if (aktuelleSeite().seite === 'lernen') renderLernen();
    else navigiere('lernen', true);
  }

  function toggleKritisch(id) {
    if (!daten.karten.has(id)) return;
    const k = kzSchreiben(id);
    k.kritisch = !k.kritisch;
    speichere();
    document.querySelectorAll(`.stern[data-id="${CSS.escape(id)}"]`).forEach(b => {
      b.classList.toggle('an', k.kritisch);
      b.setAttribute('aria-pressed', String(k.kritisch));
    });
    toast(k.kritisch ? 'Als kritisch markiert' : 'Markierung entfernt');
  }

  // ------------------------------------------------------------ Lernansicht

  function sternHtml(id) {
    const an = !!kz(id).kritisch;
    return `<button class="stern${an ? ' an' : ''}" data-aktion="stern" data-id="${esc(id)}" aria-pressed="${an}"
      aria-label="Als kritisch markieren" title="Als kritisch markieren (K)">${STERN_SVG}</button>`;
  }

  function antwortHtml(k) {
    const punkte = k.punkte.length
      ? `<ul>${k.punkte.map(p => `<li>${fmt(p)}</li>`).join('')}</ul>`
      : '<p class="klein">Für diese Karte sind noch keine Stichpunkte hinterlegt.</p>';
    let zusatz = '';
    if (k.abschnitt) zusatz += `<div class="abschnitt">Abschnitt der Arbeit: <b>${esc(k.abschnitt)}</b></div>`;
    if (k.nachfrage) zusatz += `<div class="nachfrage"><span class="t">Typische Nachfrage</span>${fmt(k.nachfrage)}</div>`;
    return `<div class="antwort">${punkte}</div>${zusatz ? `<div class="zusatz">${zusatz}</div>` : ''}`;
  }

  function renderLernen() {
    const r = zustand.runde;
    if (!r) { navigiere('', true); return; }
    if (r.fertig || !r.offen.length) { navigiere('ergebnis', true); return; }
    const id = r.offen[0];
    const k = daten.karten.get(id);
    const st = daten.stapelById.get(k.stapel);
    const mehrereStapel = new Set(r.ids.map(i => daten.karten.get(i).stapel)).size > 1;
    setzeKopf(r.titel, mehrereStapel ? `Stapel ${st.nr} · ${st.kurz}` : `${r.ids.length} Karten in dieser Runde`, true);

    const z = kz(id);
    let chip = '';
    if (r.fehler[id]) chip = `<span class="chip nochmal">Wiederholung</span>`;
    else if (z.status === 'sicher') chip = `<span class="chip gut">zuletzt gewusst</span>`;
    else if (z.status === 'unsicher') chip = `<span class="chip nochmal">zuletzt unsicher</span>`;
    else chip = `<span class="chip">neu</span>`;
    const meta = `<div class="karte-meta"><span class="chip">${esc(id)}</span>${chip}</div>`;

    const anteil = (r.erledigt.length / r.ids.length) * 100;
    const fortschritt = `<div class="fortschritt">
      <div class="fortschritt-text">
        <span>${r.erledigt.length} von ${r.ids.length} gewusst</span>
        <span>${verlauf.length ? '<button class="link" data-aktion="rueckgaengig">↶ Rückgängig</button> · ' : ''}noch ${r.offen.length} offen</span>
      </div>
      <div class="balken"><div class="gut" style="width:${anteil}%"></div></div>
    </div>`;

    let karte, aktionen;
    if (!r.umgedreht) {
      karte = `<article class="karte vorne einblenden" id="karte" tabindex="0" aria-label="Frage – zum Umdrehen tippen">
        ${meta}${sternHtml(id)}
        <h2 class="frage">${fmt(k.frage)}</h2>
        <p class="tipp">${istTouch ? 'Tippen, um die Antwort zu sehen' : 'Klicken oder Leertaste, um die Antwort zu sehen'}</p>
      </article>`;
      aktionen = `<div class="aktionen"><div class="aktionen-innen einzeln">
        <button class="btn btn-gross btn-primaer" data-aktion="umdrehen">Antwort zeigen${hatTastatur ? ' <small>Leertaste</small>' : ''}</button>
      </div></div>`;
    } else {
      karte = `<article class="karte hinten" id="karte">
        ${meta}${sternHtml(id)}
        <h2 class="frage">${fmt(k.frage)}</h2>
        ${antwortHtml(k)}
      </article>
      ${istTouch ? '<p class="tipp">Wischen: nach links = nochmal · nach rechts = gewusst</p>' : ''}`;
      aktionen = `<div class="aktionen"><div class="aktionen-innen">
        <button class="btn btn-gross btn-nochmal" data-aktion="nochmal">Nochmal${hatTastatur ? ' <small>←</small>' : ''}</button>
        <button class="btn btn-gross btn-gewusst" data-aktion="gewusst">Gewusst${hatTastatur ? ' <small>→</small>' : ''}</button>
      </div></div>`;
    }

    app.innerHTML = fortschritt + karte + aktionen;
    wischenEinrichten(document.getElementById('karte'));
  }

  function wischenEinrichten(el) {
    if (!el) return;
    let start = null;
    let dx = 0;
    let aktiv = false;

    el.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('.stern') || sperre) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
      dx = 0;
      aktiv = false;
    });

    el.addEventListener('pointermove', e => {
      if (!start || e.pointerId !== start.id) return;
      const x = e.clientX - start.x;
      const y = e.clientY - start.y;
      if (!aktiv) {
        if (Math.abs(x) < 10) return;
        if (Math.abs(y) > Math.abs(x)) { start = null; return; } // senkrecht = scrollen
        aktiv = true;
        try { el.setPointerCapture(e.pointerId); } catch (_) { /* egal */ }
        el.style.transition = 'none';
      }
      dx = x;
      const darf = zustand.runde && zustand.runde.umgedreht;
      const wirk = darf ? dx : dx * 0.2;
      el.style.transform = `translateX(${wirk}px) rotate(${wirk / 30}deg)`;
      el.dataset.richtung = darf ? (dx > WISCH_SCHWELLE ? 'gut' : dx < -WISCH_SCHWELLE ? 'nochmal' : '') : '';
    });

    const ende = abgebrochen => () => {
      if (!start && !aktiv) return;
      const warAktiv = aktiv;
      start = null;
      aktiv = false;
      if (!warAktiv) return;
      gezogenBis = Date.now();
      el.style.transition = '';
      const darf = zustand.runde && zustand.runde.umgedreht;
      if (!abgebrochen && darf && Math.abs(dx) > WISCH_SCHWELLE) {
        antworten(dx > 0);
      } else {
        el.style.transform = '';
        el.dataset.richtung = '';
      }
    };
    el.addEventListener('pointerup', ende(false));
    el.addEventListener('pointercancel', ende(true));
  }

  // --------------------------------------------------------------- Ergebnis

  function renderErgebnis() {
    const r = zustand.runde;
    if (!r || !r.fertig) { navigiere('', true); return; }
    const wiederholt = r.ids.filter(id => r.fehler[id]);
    const anhieb = r.ids.length - wiederholt.length;
    setzeKopf('Runde geschafft', r.titel, true);

    let h = `<section class="ergebnis">
      <div class="haken">${HAKEN_SVG}</div>
      <h1>Alle ${r.ids.length} Karten gewusst</h1>
      <p>${esc(r.titel)} · ${r.versuche} Antworten</p>
      <div class="kennzahlen">
        <div class="kennzahl"><b>${r.ids.length}</b><span>Karten</span></div>
        <div class="kennzahl"><b>${anhieb}</b><span>auf Anhieb</span></div>
        <div class="kennzahl"><b>${wiederholt.length}</b><span>wiederholt</span></div>
      </div>
      <div class="knopfreihe">
        <button class="btn btn-primaer" data-aktion="neue-runde">Neue Runde</button>
        ${wiederholt.length ? `<button class="btn" data-aktion="schwierige">Nur die schwierigen (${wiederholt.length})</button>` : ''}
        <button class="btn" data-aktion="start">Zur Startseite</button>
      </div>
      ${verlauf.length ? '<p class="klein unterzeile"><button class="link" data-aktion="rueckgaengig">Letzte Antwort zurücknehmen</button></p>' : ''}
    </section>`;

    if (wiederholt.length) {
      h += `<section class="schwierige">
        <h2>Brauchten Wiederholung</h2>
        <div class="liste">${wiederholt.map(id => eintragHtml(id, `${r.fehler[id]}× nochmal`)).join('')}</div>
      </section>`;
    }
    app.innerHTML = h;
  }

  // -------------------------------------------------------------- Übersicht

  function eintragHtml(id, zusatzChip) {
    const k = daten.karten.get(id);
    const z = kz(id);
    const chips = [];
    if (z.status === 'sicher') chips.push('<span class="chip gut">sicher</span>');
    else if (z.status === 'unsicher') chips.push('<span class="chip nochmal">unsicher</span>');
    else chips.push('<span class="chip">neu</span>');
    if (k.abschnitt) chips.push(`<span class="chip">Abschnitt ${esc(k.abschnitt)}</span>`);
    if (zusatzChip) chips.push(`<span class="chip nochmal">${esc(zusatzChip)}</span>`);
    return `<details class="eintrag" data-id="${esc(id)}">
      <summary><span class="nr">${esc(id)}</span>${fmt(k.frage)}<span class="status-linie">${chips.join('')}</span>${sternHtml(id)}</summary>
      <div class="inhalt">${antwortHtml(k)}</div>
    </details>`;
  }

  function gefilterteIds() {
    const st = ansicht.ziel !== 'alle' ? daten.stapelById.get(ansicht.ziel) : null;
    let ids = st ? st.ids : daten.reihenfolge;
    const f = ansicht.filter;
    if (f === 'kritisch') ids = ids.filter(id => kz(id).kritisch);
    else if (f !== 'alle') ids = ids.filter(id => (kz(id).status || 'neu') === f);
    const woerter = normal(ansicht.suche).split(/\s+/).filter(Boolean);
    if (woerter.length) {
      ids = ids.filter(id => {
        const k = daten.karten.get(id);
        const text = normal([k.id, k.frage, k.abschnitt, k.nachfrage, ...k.punkte].join(' '));
        return woerter.every(w => text.includes(w));
      });
    }
    return ids;
  }

  function renderUebersicht(ziel) {
    const st = ziel !== 'alle' ? daten.stapelById.get(ziel) : null;
    if (ziel !== 'alle' && !st) { navigiere('', true); return; }
    if (ansicht.ziel !== ziel) { ansicht.suche = ''; ansicht.ziel = ziel; }
    setzeKopf('Übersicht', st ? `Stapel ${st.nr} · ${st.titel}` : 'Alle Stapel', true);

    app.innerHTML = `<div class="werkzeuge">
        <input type="search" class="suche" id="suche" placeholder="In Fragen und Antworten suchen …" value="${esc(ansicht.suche)}" autocomplete="off" enterkeyhint="search">
        <div class="filter" role="group" aria-label="Filter">
          ${FILTER.map(([w, l]) => `<button type="button" data-aktion="filter" data-wert="${w}" class="${ansicht.filter === w ? 'an' : ''}" aria-pressed="${ansicht.filter === w}">${l}</button>`).join('')}
        </div>
      </div>
      <div class="liste-kopf">
        <span id="anzahl"></span>
        <span class="knopfreihe">
          <button class="btn btn-klein" data-aktion="aufklappen" id="btn-aufklappen">Alle aufklappen</button>
          <button class="btn btn-klein btn-primaer" data-aktion="auswahl-lernen" id="btn-auswahl">Lernen</button>
        </span>
      </div>
      <div id="liste"></div>`;
    document.getElementById('suche').addEventListener('input', e => {
      ansicht.suche = e.target.value;
      renderListe();
    });
    renderListe();
  }

  function renderListe() {
    const ids = gefilterteIds();
    const liste = document.getElementById('liste');
    if (!liste) return;
    document.getElementById('anzahl').textContent = `${ids.length} ${ids.length === 1 ? 'Karte' : 'Karten'}`;
    const btn = document.getElementById('btn-auswahl');
    btn.disabled = !ids.length;
    btn.textContent = ids.length ? `Diese ${ids.length} lernen` : 'Lernen';
    document.getElementById('btn-aufklappen').textContent = 'Alle aufklappen';

    if (!ids.length) {
      liste.innerHTML = '<p class="leer">Keine Karten für diese Auswahl.</p>';
      return;
    }
    if (ansicht.ziel === 'alle') {
      let h = '';
      for (const st of daten.stapel) {
        const teil = ids.filter(id => daten.karten.get(id).stapel === st.id);
        if (!teil.length) continue;
        h += `<h2 class="gruppe">${st.nr} · ${esc(st.titel)}</h2><div class="liste">${teil.map(id => eintragHtml(id)).join('')}</div>`;
      }
      liste.innerHTML = h;
    } else {
      liste.innerHTML = `<div class="liste">${ids.map(id => eintragHtml(id)).join('')}</div>`;
    }
  }

  // ------------------------------------------------------------- Ereignisse

  app.addEventListener('click', e => {
    const btn = e.target.closest('[data-aktion]');
    if (!btn) {
      const karte = e.target.closest('#karte.vorne');
      if (karte && Date.now() - gezogenBis > 300) umdrehen();
      return;
    }
    const a = btn.dataset.aktion;
    switch (a) {
      case 'stern':
        e.preventDefault();
        e.stopPropagation();
        toggleKritisch(btn.dataset.id);
        break;
      case 'lernen': {
        const { ids, titel } = auswahl(btn.dataset.art, btn.dataset.stapel || '');
        starteRunde(ids, titel);
        break;
      }
      case 'fortsetzen': navigiere('lernen'); break;
      case 'uebersicht': navigiere('uebersicht/' + encodeURIComponent(btn.dataset.ziel)); break;
      case 'umdrehen': umdrehen(); break;
      case 'nochmal': antworten(false); break;
      case 'gewusst': antworten(true); break;
      case 'rueckgaengig': rueckgaengig(); break;
      case 'start': navigiere(''); break;
      case 'neue-runde': {
        const r = zustand.runde;
        if (r) starteRunde(r.ids, r.titel);
        break;
      }
      case 'schwierige': {
        const r = zustand.runde;
        if (r) {
          const basis = r.titel.replace(/^Schwierige · /, '');
          starteRunde(r.ids.filter(id => r.fehler[id]), `Schwierige · ${basis}`);
        }
        break;
      }
      case 'filter':
        ansicht.filter = btn.dataset.wert;
        app.querySelectorAll('.filter button').forEach(b => {
          const an = b.dataset.wert === ansicht.filter;
          b.classList.toggle('an', an);
          b.setAttribute('aria-pressed', String(an));
        });
        renderListe();
        break;
      case 'aufklappen': {
        const alle = [...app.querySelectorAll('#liste details')];
        const oeffnen = alle.some(d => !d.open);
        alle.forEach(d => { d.open = oeffnen; });
        btn.textContent = oeffnen ? 'Alle zuklappen' : 'Alle aufklappen';
        break;
      }
      case 'auswahl-lernen': {
        const st = ansicht.ziel !== 'alle' ? daten.stapelById.get(ansicht.ziel) : null;
        const basis = st ? st.kurz : 'Alle Stapel';
        const eingeschraenkt = ansicht.filter !== 'alle' || ansicht.suche.trim();
        starteRunde(gefilterteIds(), eingeschraenkt ? `Auswahl · ${basis}` : basis);
        break;
      }
    }
  });

  btnZurueck.addEventListener('click', () => navigiere(''));

  document.addEventListener('keydown', e => {
    if (menue.open || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    const { seite } = aktuelleSeite();
    const taste = e.key;

    if (seite === 'lernen' && zustand.runde && !zustand.runde.fertig) {
      const r = zustand.runde;
      const aufKnopf = e.target.closest && e.target.closest('button');
      if ((taste === ' ' || taste === 'Enter') && !aufKnopf) {
        e.preventDefault();
        if (!r.umgedreht) umdrehen();
        return;
      }
      if (r.umgedreht && (taste === 'ArrowLeft' || taste === '1')) { e.preventDefault(); antworten(false); return; }
      if (r.umgedreht && (taste === 'ArrowRight' || taste === '2')) { e.preventDefault(); antworten(true); return; }
      if (taste === 'k' || taste === 'K') { toggleKritisch(r.offen[0]); return; }
    }
    if ((taste === 'z' || taste === 'Z') && verlauf.length && (seite === 'lernen' || seite === 'ergebnis')) {
      rueckgaengig();
    }
  });

  // ------------------------------------------------------------------ Menü

  const optMischen = document.getElementById('opt-mischen');
  const btnReset = document.getElementById('btn-reset');
  const dateiImport = document.getElementById('datei-import');
  let resetTimer = null;

  document.getElementById('btn-menue').addEventListener('click', () => {
    optMischen.checked = !!zustand.einstellungen.mischen;
    const stand = daten.meta.stand ? `Kartenstand ${daten.meta.stand} · ` : '';
    document.getElementById('menue-stand').textContent = `${stand}${daten.reihenfolge.length} Karten in ${daten.stapel.length} Stapeln`;
    btnReset.textContent = 'Lernstand zurücksetzen';
    if (typeof menue.showModal === 'function') menue.showModal();
    else menue.setAttribute('open', '');
  });

  menue.addEventListener('click', e => { if (e.target === menue) menue.close(); });

  optMischen.addEventListener('change', () => {
    zustand.einstellungen.mischen = optMischen.checked;
    speichere();
  });

  document.getElementById('btn-export').addEventListener('click', () => {
    const inhalt = {
      app: 'ba-karteikarten',
      version: 1,
      exportiert: new Date().toISOString(),
      karten: zustand.karten,
      einstellungen: zustand.einstellungen
    };
    const blob = new Blob([JSON.stringify(inhalt, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kolloquium-lernstand-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Lernstand exportiert');
  });

  document.getElementById('btn-import').addEventListener('click', () => dateiImport.click());

  dateiImport.addEventListener('change', async () => {
    const datei = dateiImport.files && dateiImport.files[0];
    dateiImport.value = '';
    if (!datei) return;
    try {
      const obj = JSON.parse(await datei.text());
      if (!obj || typeof obj.karten !== 'object' || Array.isArray(obj.karten)) throw new Error('Kein Lernstand');
      const karten = {};
      for (const [id, k] of Object.entries(obj.karten)) {
        if (!k || typeof k !== 'object') continue;
        karten[id] = {
          status: ['sicher', 'unsicher'].includes(k.status) ? k.status : 'neu',
          kritisch: !!k.kritisch,
          gewusst: Number(k.gewusst) || 0,
          nochmal: Number(k.nochmal) || 0,
          zuletzt: Number(k.zuletzt) || undefined
        };
      }
      zustand.karten = karten;
      if (obj.einstellungen && typeof obj.einstellungen === 'object') {
        zustand.einstellungen.mischen = obj.einstellungen.mischen !== false;
      }
      zustand.runde = null;
      verlauf = [];
      speichere();
      menue.close();
      toast('Lernstand importiert');
      navigiere('', true);
    } catch (err) {
      toast('Die Datei ist kein gültiger Lernstand.');
    }
  });

  btnReset.addEventListener('click', () => {
    if (!btnReset.classList.contains('bestaetigen')) {
      btnReset.classList.add('bestaetigen');
      btnReset.textContent = 'Wirklich alles zurücksetzen? Nochmal tippen';
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        btnReset.classList.remove('bestaetigen');
        btnReset.textContent = 'Lernstand zurücksetzen';
      }, 4000);
      return;
    }
    clearTimeout(resetTimer);
    btnReset.classList.remove('bestaetigen');
    const mischenAn = zustand.einstellungen.mischen;
    zustand = leererZustand();
    zustand.einstellungen.mischen = mischenAn;
    verlauf = [];
    speichere();
    menue.close();
    toast('Lernstand zurückgesetzt');
    navigiere('', true);
  });

  // ------------------------------------------------------------------ Start

  async function init() {
    try {
      await ladeDaten();
    } catch (e) {
      zeigeLadefehler(e);
      return;
    }
    bereinigeRunde();
    render();
    window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
  }

  // Offline-Nutzung nur auf der veröffentlichten Seite (https), nicht lokal
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* ohne Offline-Modus weiter */ });
    });
  }

  init();
})();
