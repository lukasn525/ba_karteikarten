/*
 * Abgleich des Lernstands zwischen Geräten (im Browser als window.Abgleich,
 * in Node per require nutzbar).
 *
 * Regeln:
 * - Je Karte gewinnt der zuletzt geänderte Eintrag (Feld „geaendert“, ms).
 * - Die Runde gewinnt als Ganzes nach „rundeGeaendert“.
 * - Einstellungen gewinnen nach „einstellungen.geaendert“.
 * - „zurueckgesetzt“ verwirft alles, was davor geändert wurde (Zurücksetzen, Import).
 */
(function (wurzel, fabrik) {
  if (typeof module === 'object' && module.exports) module.exports = fabrik();
  else wurzel.Abgleich = fabrik();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const zeit = x => (typeof x === 'number' && isFinite(x) ? x : 0);

  function leer() {
    return { version: 2, karten: {}, runde: null, rundeGeaendert: 0, einstellungen: { mischen: true, geaendert: 0 }, zurueckgesetzt: 0 };
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

    return { version: 2, karten, runde: runde || null, rundeGeaendert, einstellungen, zurueckgesetzt: zurueck };
  }

  return { leer, istLernstand, zusammenfuehren };
});
