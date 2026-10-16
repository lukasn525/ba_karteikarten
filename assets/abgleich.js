/*
 * Abgleich des Lernstands zwischen Geräten (im Browser als window.Abgleich,
 * in Node per require nutzbar).
 *
 * Regeln:
 * - Je Karte gewinnt der zuletzt geänderte Eintrag (Feld „geaendert“, ms).
 * - Die Runde gewinnt als Ganzes nach „rundeGeaendert“.
 * - Einstellungen gewinnen nach „einstellungen.geaendert“.
 * - „zurueckgesetzt“ verwirft alles, was davor geändert wurde (Zurücksetzen, Import).
 * - Karten des Tages (Tagesplan, ein Eintrag je Datum): je Tag bleibt die zuerst
 *   erstellte Auswahl; „erledigt“ und „uebersprungen“ gewinnen nach „geaendert“.
 *   „tageskarten“ (nur der jüngste Tag) wird für ältere Fassungen der App mitgeführt
 *   und fließt ebenfalls in den Plan ein.
 */
(function (wurzel, fabrik) {
  if (typeof module === 'object' && module.exports) module.exports = fabrik();
  else wurzel.Abgleich = fabrik();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const zeit = x => (typeof x === 'number' && isFinite(x) ? x : 0);

  function leer() {
    return { version: 2, karten: {}, runde: null, rundeGeaendert: 0, einstellungen: { mischen: true, geaendert: 0 }, zurueckgesetzt: 0, tageskarten: null, tagesplan: {} };
  }

  const istTageskarten = t => !!t && typeof t === 'object' && typeof t.datum === 'string' && Array.isArray(t.ids);

  function tageskartenWahl(x, y) {
    if (!istTageskarten(x)) return istTageskarten(y) ? y : null;
    if (!istTageskarten(y)) return x;
    if (x.datum !== y.datum) return x.datum > y.datum ? x : y;
    // Gleicher Tag: die zuerst erstellte Auswahl bleibt (bei Gleichstand eindeutig über den Inhalt)
    const ex = zeit(x.erstellt);
    const ey = zeit(y.erstellt);
    const basis = ex !== ey ? (ex < ey ? x : y) : (JSON.stringify(x.ids) <= JSON.stringify(y.ids) ? x : y);
    const gx = zeit(x.geaendert);
    const gy = zeit(y.geaendert);
    const neuer = gx !== gy ? (gx > gy ? x : y) : (zeit(x.erledigt) >= zeit(y.erledigt) ? x : y);
    if (zeit(neuer.erledigt) === zeit(basis.erledigt) && zeit(neuer.uebersprungen) === zeit(basis.uebersprungen)
        && zeit(basis.geaendert) === Math.max(gx, gy)) return basis;
    return Object.assign({}, basis, { erledigt: zeit(neuer.erledigt), uebersprungen: zeit(neuer.uebersprungen),
      geaendert: Math.max(gx, gy) });
  }

  // Tagesplan als Abbildung Datum -> Eintrag; ein einzelnes „tageskarten“ zählt als Eintrag seines Tages
  function planAus(s) {
    const plan = {};
    if (s.tagesplan && typeof s.tagesplan === 'object' && !Array.isArray(s.tagesplan)) {
      for (const [datum, e] of Object.entries(s.tagesplan)) {
        if (istTageskarten(e) && e.datum === datum) plan[datum] = e;
      }
    }
    const t = s.tageskarten;
    if (istTageskarten(t)) plan[t.datum] = plan[t.datum] ? tageskartenWahl(plan[t.datum], t) : t;
    return plan;
  }

  // Grobe Formprüfung, damit kein Unsinn gespeichert wird
  function istLernstand(s) {
    return !!s && typeof s === 'object' && !Array.isArray(s) &&
      (s.karten === undefined || (typeof s.karten === 'object' && !Array.isArray(s.karten))) &&
      (s.runde === undefined || s.runde === null || typeof s.runde === 'object');
  }

  function zusammenfuehren(a, b) {
    a = istLernstand(a) ? a : leer();
    b = istLernstand(b) ? b : leer();
    const zurueck = Math.max(zeit(a.zurueckgesetzt), zeit(b.zurueckgesetzt));

    const karten = {};
    for (const quelle of [a.karten || {}, b.karten || {}]) {
      for (const [id, k] of Object.entries(quelle)) {
        if (!k || typeof k !== 'object') continue;
        if (zeit(k.geaendert) < zurueck) continue;          // vor dem Zurücksetzen geändert
        if (!karten[id] || zeit(k.geaendert) > zeit(karten[id].geaendert)) karten[id] = k;
      }
    }

    const ra = zeit(a.rundeGeaendert);
    const rb = zeit(b.rundeGeaendert);
    let runde = rb > ra ? b.runde : a.runde;
    const rundeGeaendert = Math.max(ra, rb);
    if (rundeGeaendert < zurueck) runde = null;

    const ea = a.einstellungen || {};
    const eb = b.einstellungen || {};
    const einstellungen = Object.assign({ mischen: true, geaendert: 0 }, zeit(eb.geaendert) > zeit(ea.geaendert) ? eb : ea);

    const pa = planAus(a);
    const pb = planAus(b);
    const tagesplan = {};
    for (const datum of new Set([...Object.keys(pa), ...Object.keys(pb)])) {
      const e = tageskartenWahl(pa[datum], pb[datum]);
      if (e && zeit(e.erstellt) >= zurueck) tagesplan[datum] = e;   // vor dem Zurücksetzen erstellt: weg
    }
    const juengster = Object.keys(tagesplan).sort().pop();
    const tageskarten = juengster ? tagesplan[juengster] : null;

    return { version: 2, karten, runde: runde || null, rundeGeaendert, einstellungen, zurueckgesetzt: zurueck,
      tageskarten, tagesplan };
  }

  return { leer, istLernstand, zusammenfuehren };
});
