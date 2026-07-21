import { kvs } from '@forge/kvs';
import { getCatalogo, getLimiti } from './catalogo-sfide';

// L'array SFIDE hardcoded che stava qui è stato spostato in
// config/sfide-default.json ed è ora il SEED del catalogo in KVS.
// Vedi catalogo-sfide.js. Le key sono rimaste identiche di proposito.


export const getScadenza = (tipo) => {
  const ora = new Date();
  if (tipo === 'giornaliera') {
    const fine = new Date(ora);
    fine.setHours(23, 59, 59, 0);
    return fine.getTime();
  }
  if (tipo === 'settimanale') {
    const fine = new Date(ora);
    const giorniAllaFine = 7 - fine.getDay();
    fine.setDate(fine.getDate() + giorniAllaFine);
    fine.setHours(23, 59, 59, 0);
    return fine.getTime();
  }
  if (tipo === 'mensile') {
    const fine = new Date(ora.getFullYear(), ora.getMonth() + 1, 0, 23, 59, 59);
    return fine.getTime();
  }
};

export const getSfideUtente = async (accountId) => {
  const sfide = await kvs.get(`sfide-${accountId}`);
  return sfide || [];
};

export const accettaSfida = async (accountId, sfidaKey) => {
  const current = await getSfideUtente(accountId);
  const catalogo = await getCatalogo();
  const sfida = catalogo.find(s => s.key === sfidaKey);

  if (!sfida) return current;

  // I limiti non sono più fissi: li decide l'admin per categoria.
  const limiti = await getLimiti();
  const contatorePerTipo = current.filter(s => s.tipo === sfida.tipo && !s.completata).length;

  if (contatorePerTipo >= limiti[sfida.tipo]) return current;
  if (current.find(s => s.key === sfidaKey)) return current;

  const nuovaSfida = {
    key: sfidaKey,
    tipo: sfida.tipo,
    scadenza: getScadenza(sfida.tipo),
    completata: false,
  };

  await kvs.set(`sfide-${accountId}`, [...current, nuovaSfida]);
  return await getSfideUtente(accountId);
};

export const completaSfida = async (accountId, sfidaKey, descrizione) => {
  const current = await getSfideUtente(accountId);
  const aggiornate = current.map(s =>
    s.key === sfidaKey ? { ...s, completata: true, descrizione: descrizione || null } : s
  );
  await kvs.set(`sfide-${accountId}`, aggiornate);
  return await getSfideUtente(accountId);
};

export const getPuntiBonus = (tipo) => {
  const bonus = { giornaliera: 1, settimanale: 2, mensile: 4 };
  return bonus[tipo] || 0;
};

export const pulisciSfideScadute = async (accountId) => {
  const current = await getSfideUtente(accountId);
  const ora = Date.now();
  const attive = current.filter(s => s.scadenza > ora);
  await kvs.set(`sfide-${accountId}`, attive);
  return attive;
};