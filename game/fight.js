/** P0-5 parameters from GAME_SPEC.md §2.3, grouped for P0-8 tuning. */
export const P = Object.freeze({
  maxFightMs: 20000,
  requiredTurns: 14,
  fullSpeedTurnsPerSec: 2.6,
  rushWarningMs: 700,
  rushDurationMs: 1500,
  redThreshold: 0.78,
  lineBreakMs: 2000,
  tensionRisePerSec: 0.82,
  tensionReleasePerSec: 0.58,
  tensionCoastPerSec: 0.12,
});

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const RUSH_TIMES = [2400, 6200, 10200];

/**
 * @typedef {'calm'|'warning'|'rush'} FightPhase
 * @typedef {'playing'|'caught'|'line-break'} FightOutcome
 * @typedef {{elapsedMs:number,remaining:number,tension:number,reelSpeed:number,phase:FightPhase,outcome:FightOutcome,redMs:number,rushNumber:number}} FightState
 */

/** @param {{random?:()=>number}} [options] */
export function createFight(options = {}) {
  const random = options.random ?? Math.random;
  const rushCount = 1 + Math.floor(clamp01(random()) * 2.999999);
  const rushTimes = RUSH_TIMES.slice(0, rushCount);
  let startedAt = 0;
  let lastAt = 0;
  let pendingTurns = 0;
  let remaining = 1;
  let tension = 0.28;
  let redMs = 0;
  /** @type {FightOutcome} */
  let outcome = 'playing';

  function start(now = performance.now()) {
    startedAt = now;
    lastAt = now;
    pendingTurns = 0;
    remaining = 1;
    tension = 0.28;
    redMs = 0;
    outcome = 'playing';
    return update(now);
  }

  /** @param {number} turns */
  function reel(turns) {
    if (outcome !== 'playing' || !Number.isFinite(turns)) return;
    pendingTurns += Math.max(0, turns);
  }

  /** @param {number} [now] @returns {FightState} */
  function update(now = performance.now()) {
    const elapsedMs = Math.max(0, now - startedAt);
    const dtMs = Math.min(100, Math.max(0, now - lastAt));
    const dt = dtMs / 1000;
    lastAt = now;
    const turns = pendingTurns;
    pendingTurns = 0;
    const turnsPerSec = dt > 0 ? turns / dt : 0;
    const reelSpeed = clamp01(turnsPerSec / P.fullSpeedTurnsPerSec);

    let phase = /** @type {FightPhase} */ ('calm');
    let rushNumber = 0;
    for (let index = 0; index < rushTimes.length; index += 1) {
      const rushAt = rushTimes[index];
      if (elapsedMs >= rushAt - P.rushWarningMs && elapsedMs < rushAt) {
        phase = 'warning';
        rushNumber = index + 1;
        break;
      }
      if (elapsedMs >= rushAt && elapsedMs < rushAt + P.rushDurationMs) {
        phase = 'rush';
        rushNumber = index + 1;
        break;
      }
    }

    if (outcome === 'playing') {
      remaining = clamp01(remaining - turns / P.requiredTurns);
      if (phase === 'rush') {
        tension += reelSpeed > .06
          ? dt * P.tensionRisePerSec * Math.max(.35, reelSpeed)
          : -dt * P.tensionReleasePerSec;
      } else {
        tension -= dt * (reelSpeed > .06 ? P.tensionCoastPerSec : P.tensionReleasePerSec);
      }
      tension = clamp01(tension);
      redMs = tension >= P.redThreshold ? redMs + dtMs : 0;

      if (redMs >= P.lineBreakMs) outcome = 'line-break';
      else if (remaining <= 0 || elapsedMs >= P.maxFightMs) outcome = 'caught';
    }

    return { elapsedMs, remaining, tension, reelSpeed, phase, outcome, redMs, rushNumber };
  }

  return { start, reel, update, rushCount };
}

/** Returns the shortest signed angular difference in radians. */
export function angleDelta(previous, current) {
  let delta = current - previous;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}
