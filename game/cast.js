/**
 * Cast values are specified in GAME_SPEC.md §2.1. They stay together so P0-8
 * can replace them with real-device measurements without rewriting the logic.
 */
export const P = Object.freeze({
  castMin: 2.0,
  castFull: 6.5,
  distMax: 45,
  castCooldown: 600,
});

const clamp01 = (value) => Math.max(0, Math.min(1, value));

/**
 * @param {number} peakLin Maximum estimated hand speed in m/s.
 * @param {typeof P} [params]
 * @returns {{accepted:boolean, peakLin:number, power:number, distance:number, label:string}}
 */
export function castResult(peakLin, params = P) {
  const safePeak = Number.isFinite(peakLin) ? Math.max(0, peakLin) : 0;
  const power = clamp01((safePeak - params.castMin) / (params.castFull - params.castMin));
  const distance = params.distMax * power ** 0.85;
  const label = power < .28 ? 'ショートキャスト' : power < .72 ? 'ナイスキャスト' : 'ロングキャスト';
  return { accepted: safePeak >= params.castMin, peakLin: safePeak, power, distance, label };
}

/**
 * Connects the shared tracker to one cast callback with a cooldown.
 * @param {{onStroke:(callback:(stroke:{peakLin:number,omega:number,upness:number,durMs:number})=>void)=>()=>void}} tracker
 * @param {(result:ReturnType<typeof castResult> & {omega:number,upness:number,durMs:number})=>void} onCast
 * @param {typeof P} [params]
 */
export function listenForCasts(tracker, onCast, params = P) {
  let lastCastAt = -Infinity;
  return tracker.onStroke((stroke) => {
    const now = performance.now();
    if (now - lastCastAt < params.castCooldown) return;
    lastCastAt = now;
    onCast({ ...castResult(stroke.peakLin, params), ...stroke });
  });
}
