// Stagione calcolata localmente, con la STESSA regola di countdown/punti:
// finestre di 2 mesi sui mesi pari, seasonKey = data d'inizio (es. "2026-07-01").
function getSeasonWindow(now = new Date()) {
    const year = now.getFullYear();
    const month = now.getMonth();
    const startMonth = month % 2 === 0 ? month : month - 1;

    const start = new Date(year, startMonth, 1, 0, 0, 0, 0);
    const end = new Date(year, startMonth + 2, 0, 0, 0, 0, 0);
    end.setDate(end.getDate() - 2);
    const secondMonthStart = new Date(year, startMonth + 1, 1, 0, 0, 0, 0);

    return { start, end, secondMonthStart };
}

export async function getCurrentSeason() {
    const w = getSeasonWindow();
    return {
        id: w.start.toISOString().slice(0, 10), // es. "2026-07-01"
        startMs: w.start.getTime(),             // inizio stagione -> grant mese 1
        secondGrantMs: w.secondMonthStart.getTime(), // 1° del 2° mese -> grant mese 2
        endMs: w.end.getTime(),
    };
}

// App separata: i punti stanno nell'altro plugin e non sono leggibili da qui.
// Restano a 0; il grant dei 1000 arrivera in modo reattivo (vedi sotto).
export async function getSeasonalPoints() {
    return 0;
}