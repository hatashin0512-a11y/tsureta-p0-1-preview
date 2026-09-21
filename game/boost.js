const COUNT_KEY = 'tsureta.playCount';
const SAFETY_KEY = 'tsureta.safetySeen';

/** @param {Storage} [storage] @param {number} [fallback] */
export function getPlayCount(storage = localStorage, fallback = 0) {
  try {
    const stored = storage.getItem(COUNT_KEY);
    if (stored === null) {
      storage.setItem(COUNT_KEY, String(fallback));
      return fallback;
    }
    return Math.max(0, Number.parseInt(stored, 10) || 0);
  } catch {
    return fallback;
  }
}

/** @param {Storage} [storage] */
export function completePlay(storage = localStorage) {
  const next = getPlayCount(storage) + 1;
  try { storage.setItem(COUNT_KEY, String(next)); } catch { /* private mode */ }
  return next;
}

export function boostForPlayCount(playCount) {
  if (playCount < 3) return Object.freeze({
    level: 'full', biteMaxMs: 1500, hookWindowMs: 2000, hookScale: .5,
    autoHook: true, rushCountMax: 1, tensionMultiplier: .5, lotteryBoost: 'full',
  });
  if (playCount < 10) return Object.freeze({
    level: 'half', biteMaxMs: 2750, hookWindowMs: 1600, hookScale: .75,
    autoHook: false, rushCountMax: 2, tensionMultiplier: .75, lotteryBoost: 'half',
  });
  return Object.freeze({
    level: 'none', biteMaxMs: 4000, hookWindowMs: 1200, hookScale: 1,
    autoHook: false, rushCountMax: 3, tensionMultiplier: 1, lotteryBoost: 'none',
  });
}

/** @param {Storage} [storage] */
export function safetySeen(storage = localStorage) {
  try { return storage.getItem(SAFETY_KEY) === '1'; } catch { return false; }
}

/** @param {Storage} [storage] */
export function markSafetySeen(storage = localStorage) {
  try { storage.setItem(SAFETY_KEY, '1'); } catch { /* private mode */ }
}
