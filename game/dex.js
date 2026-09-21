const KEY = 'tsureta.dex.v1';

/** @param {Storage} [storage] */
export function readDex(storage = localStorage) {
  try {
    const value = JSON.parse(storage.getItem(KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

/**
 * @param {{id:string}} species
 * @param {number} cm
 * @param {Storage} [storage]
 */
export function recordCatch(species, cm, storage = localStorage) {
  const dex = readDex(storage);
  let entry = dex.find((item) => item.species_id === species.id);
  const first = !entry;
  if (!entry) {
    entry = {
      species_id: species.id,
      game: { count: 0, max_cm: null, first_at: null },
      real: { count: 0, max_cm: null, first_at: null, photo_ref: null },
      badges: [],
    };
    dex.push(entry);
  }
  const best = entry.game.max_cm === null || cm > entry.game.max_cm;
  entry.game.count += 1;
  entry.game.max_cm = best ? cm : entry.game.max_cm;
  entry.game.first_at ??= new Date().toISOString();
  if (first && !entry.badges.includes('first_catch')) entry.badges.push('first_catch');
  if (best && !entry.badges.includes('personal_best')) entry.badges.push('personal_best');
  storage.setItem(KEY, JSON.stringify(dex));
  return { first, best, entry, speciesCount: dex.length };
}
