// Parsing/formattazione durate in stile Jira ("2w 3d 4h 30m"), MA con conversione
// di CALENDARIO (decisione 20/07): il Decanter misura tempo REALE trascorso da
// quando il work item è entrato nello stato, non ore lavorate. Quindi
//   1w = 7 giorni, 1d = 24 ore, 1h = 60 minuti.
// (Jira nel logwork usa il tempo lavorativo, 1w=5d/1d=8h: qui NO, di proposito.)
// Un numero SENZA unità è inteso in minuti.
//
// Questo file è duplicato IDENTICO in static/gruppi/src/durata.js perché backend
// e frontend sono bundle separati e non possono importarsi a vicenda. Se lo
// modifichi qui, aggiorna anche l'altro.

const MIN = { w: 7 * 24 * 60, d: 24 * 60, h: 60, m: 1 };

// Stringa durata → minuti totali (intero ≥ 1) oppure null se non valida.
export const parseDurata = (testo) => {
  const s = String(testo || '').trim().toLowerCase();
  if (s === '') return null;
  // Numero puro → minuti.
  if (/^\d+$/.test(s)) return parseInt(s, 10) || null;
  // Deve essere SOLO una sequenza di token "numero+unità" separati da spazi.
  if (!/^(\d+\s*[wdhm]\s*)+$/.test(s)) return null;
  let totale = 0;
  for (const m of s.matchAll(/(\d+)\s*([wdhm])/g)) {
    totale += parseInt(m[1], 10) * MIN[m[2]];
  }
  return totale > 0 ? totale : null;
};

// Minuti → stringa leggibile compatta (max 2 unità significative), es. "2g 3h".
// Usa g/h/m (le settimane si esprimono in giorni per non confondere: "9g" non "1w 2g").
export const formattaDurata = (minuti) => {
  let n = Math.max(0, Math.floor(Number(minuti) || 0));
  if (n === 0) return '0m';
  const g = Math.floor(n / MIN.d); n -= g * MIN.d;
  const h = Math.floor(n / MIN.h); n -= h * MIN.h;
  const parti = [];
  if (g) parti.push(`${g}g`);
  if (h) parti.push(`${h}h`);
  if (n) parti.push(`${n}m`);
  return parti.slice(0, 2).join(' ');
};
