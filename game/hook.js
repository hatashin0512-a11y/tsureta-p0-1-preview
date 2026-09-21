/**
 * Hook values are specified in GAME_SPEC.md §2.2. Keep them together so the
 * P0-8 device-tuning task can replace measured values without changing flow.
 */
export const P = Object.freeze({
  biteMinMs: 500,
  biteMaxMs: 4000,
  hookWindowMs: 1200,
  hookMinPeak: 1.2,
  hookMinUpness: 0.35,
});

/**
 * @param {{peakLin:number,omega:number,upness:number,durMs:number}} stroke
 * @param {typeof P} [params]
 * @returns {{ok:boolean,peakLin:number,omega:number,upness:number,durMs:number}}
 */
export function hookResult(stroke, params = P) {
  const peakLin = Number.isFinite(stroke.peakLin) ? stroke.peakLin : 0;
  const upness = Number.isFinite(stroke.upness) ? stroke.upness : 0;
  return {
    ok: peakLin > params.hookMinPeak && upness > params.hookMinUpness,
    peakLin,
    omega: Number.isFinite(stroke.omega) ? stroke.omega : 0,
    upness,
    durMs: Number.isFinite(stroke.durMs) ? stroke.durMs : 0,
  };
}

/**
 * Connects the shared tracker to the hook evaluation.
 * The caller controls when the 1.2 second hook window is open.
 * @param {{onStroke:(callback:(stroke:{peakLin:number,omega:number,upness:number,durMs:number})=>void)=>()=>void}} tracker
 * @param {(result:ReturnType<typeof hookResult>)=>void} onStroke
 * @param {typeof P} [params]
 */
export function listenForHooks(tracker, onStroke, params = P) {
  return tracker.onStroke((stroke) => onStroke(hookResult(stroke, params)));
}

/** @param {typeof P} [params] */
export function randomBiteDelay(params = P) {
  return params.biteMinMs + Math.random() * (params.biteMaxMs - params.biteMinMs);
}
