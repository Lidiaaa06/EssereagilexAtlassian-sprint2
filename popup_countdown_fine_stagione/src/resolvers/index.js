// src/resolvers/index.js
import Resolver from '@forge/resolver';

const resolver = new Resolver();

resolver.define('getSeasonConfig', async () => ({
  seasonStartIso: '2026-07-01T00:00:00+02:00',
  seasonName: 'Stagione corrente'
}));

export const handler = resolver.getDefinitions();