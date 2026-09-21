/**
 * @typedef {{x:number, y:number, z:number}} Vector3
 * @typedef {{alpha:number|null, beta:number|null, gamma:number|null}} Orientation
 * @typedef {{t:number, acc:Vector3, accG:Vector3, rot:Vector3, ori:Orientation}} MotionFrame
 * @typedef {{peakLin:number, omega:number, upness:number, durMs:number}} Stroke
 */

let motionHandler = null;
let orientationHandler = null;
let orientation = { alpha: null, beta: null, gamma: null };

const numberOrZero = (value) => Number.isFinite(value) ? value : 0;
const toRadians = (degrees) => numberOrZero(degrees) * Math.PI / 180;

/**
 * Requests motion and orientation access. Call directly from a user gesture.
 * @returns {Promise<boolean>}
 */
export async function requestMotion() {
  if (typeof window === 'undefined' || typeof window.DeviceMotionEvent === 'undefined') {
    return false;
  }

  // Start every permission request before the first await so iOS keeps the tap activation.
  const motionRequest = typeof window.DeviceMotionEvent.requestPermission === 'function'
    ? window.DeviceMotionEvent.requestPermission()
    : Promise.resolve('granted');
  const orientationRequest = typeof window.DeviceOrientationEvent?.requestPermission === 'function'
    ? window.DeviceOrientationEvent.requestPermission()
    : Promise.resolve('granted');

  const [motionResult, orientationResult] = await Promise.allSettled([
    motionRequest,
    orientationRequest,
  ]);

  return motionResult.status === 'fulfilled'
    && motionResult.value === 'granted'
    && orientationResult.status === 'fulfilled'
    && orientationResult.value === 'granted';
}

/**
 * Starts device motion delivery. Only one subscription can be active.
 * @param {(frame: MotionFrame) => void} onFrame
 */
export function startMotion(onFrame) {
  if (typeof window === 'undefined' || typeof onFrame !== 'function') return;
  stopMotion();

  orientationHandler = (event) => {
    orientation = {
      alpha: Number.isFinite(event.alpha) ? event.alpha : null,
      beta: Number.isFinite(event.beta) ? event.beta : null,
      gamma: Number.isFinite(event.gamma) ? event.gamma : null,
    };
  };

  motionHandler = (event) => {
    const acc = event.acceleration || {};
    const accG = event.accelerationIncludingGravity || {};
    const rot = event.rotationRate || {};
    onFrame({
      t: performance.now(),
      acc: {
        x: numberOrZero(acc.x),
        y: numberOrZero(acc.y),
        z: numberOrZero(acc.z),
      },
      accG: {
        x: numberOrZero(accG.x),
        y: numberOrZero(accG.y),
        z: numberOrZero(accG.z),
      },
      // DeviceMotion rotationRate is degrees/sec; the shared API exposes radians/sec.
      rot: {
        x: toRadians(rot.beta),
        y: toRadians(rot.gamma),
        z: toRadians(rot.alpha),
      },
      ori: { ...orientation },
    });
  };

  window.addEventListener('deviceorientation', orientationHandler, true);
  window.addEventListener('devicemotion', motionHandler, true);
}

export function stopMotion() {
  if (typeof window === 'undefined') return;
  if (motionHandler) window.removeEventListener('devicemotion', motionHandler, true);
  if (orientationHandler) window.removeEventListener('deviceorientation', orientationHandler, true);
  motionHandler = null;
  orientationHandler = null;
}

/**
 * Rotates a device-space acceleration vector into a world-space approximation.
 * DeviceOrientation uses intrinsic Z-X'-Y'' rotations. Screen orientation is
 * removed so portrait and landscape report the same horizontal axes.
 * @param {Vector3} vector
 * @param {Orientation} ori
 * @returns {Vector3}
 */
function toWorld(vector, ori) {
  if (ori.alpha === null || ori.beta === null || ori.gamma === null) {
    return { ...vector };
  }

  const a = toRadians(ori.alpha);
  const b = toRadians(ori.beta);
  const g = toRadians(ori.gamma);
  const ca = Math.cos(a), sa = Math.sin(a);
  const cb = Math.cos(b), sb = Math.sin(b);
  const cg = Math.cos(g), sg = Math.sin(g);

  // Ry(gamma)
  const x1 = cg * vector.x + sg * vector.z;
  const y1 = vector.y;
  const z1 = -sg * vector.x + cg * vector.z;
  // Rx(beta)
  const x2 = x1;
  const y2 = cb * y1 - sb * z1;
  const z2 = sb * y1 + cb * z1;
  // Rz(alpha)
  let x3 = ca * x2 - sa * y2;
  let y3 = sa * x2 + ca * y2;
  const z3 = z2;

  const screenDegrees = typeof screen !== 'undefined'
    ? (screen.orientation?.angle ?? window.orientation ?? 0)
    : 0;
  const s = -toRadians(screenDegrees);
  const cs = Math.cos(s), ss = Math.sin(s);
  const sx = cs * x3 - ss * y3;
  const sy = ss * x3 + cs * y3;
  x3 = sx;
  y3 = sy;

  return { x: x3, y: y3, z: z3 };
}

const magnitude = (v) => Math.hypot(v.x, v.y, v.z);

/**
 * Creates the reusable motion analyser. Detection constants remain grouped in
 * P so P0-8 can tune them using real device data without changing the logic.
 *
 * @param {Object} [P]
 * @returns {{
 *   peakLin:number,
 *   omega:number,
 *   pitchOmega:number,
 *   peakPitchOmega:number,
 *   upness:number,
 *   update:(frame:MotionFrame)=>void,
 *   onStroke:(callback:(stroke:Stroke)=>void)=>()=>void,
 *   calibrate:()=>void,
 *   resetGesture:()=>void
 * }}
 */
export function createMotionTracker(P = {}) {
  const config = {
    calibrationMs: P.calibrationMs ?? 500,
    velocityLeak: P.velocityLeak ?? 4.5,
    strokeStartSpeed: P.strokeStartSpeed ?? 0.35,
    strokeEndSpeed: P.strokeEndSpeed ?? 0.18,
    strokeQuietMs: P.strokeQuietMs ?? 120,
    strokeMaxMs: P.strokeMaxMs ?? 1500,
    minStrokeMs: P.minStrokeMs ?? 50,
  };

  const listeners = new Set();
  let calibrating = true;
  let calibrationStart = null;
  let calibrationSum = { x: 0, y: 0, z: 0 };
  let calibrationCount = 0;
  let bias = { x: 0, y: 0, z: 0 };
  let velocity = { x: 0, y: 0, z: 0 };
  let lastT = null;
  let inStroke = false;
  let strokeStart = 0;
  let quietSince = null;
  let strokePeak = 0;
  let strokeOmega = 0;
  let strokeUpness = 0;

  const tracker = {
    peakLin: 0,
    omega: 0,
    pitchOmega: 0,
    peakPitchOmega: 0,
    upness: 0,
    update,
    onStroke(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    calibrate,
    resetGesture,
  };

  function resetGesture() {
    velocity = { x: 0, y: 0, z: 0 };
    inStroke = false;
    quietSince = null;
    strokePeak = 0;
    strokeOmega = 0;
    strokeUpness = 0;
    tracker.peakLin = 0;
    tracker.pitchOmega = 0;
    tracker.peakPitchOmega = 0;
  }

  function calibrate() {
    calibrating = true;
    calibrationStart = null;
    calibrationSum = { x: 0, y: 0, z: 0 };
    calibrationCount = 0;
    velocity = { x: 0, y: 0, z: 0 };
    lastT = null;
    inStroke = false;
    quietSince = null;
    tracker.peakLin = 0;
    tracker.pitchOmega = 0;
    tracker.peakPitchOmega = 0;
  }

  /** @param {MotionFrame} frame */
  function update(frame) {
    const world = toWorld(frame.acc, frame.ori);

    if (calibrating) {
      calibrationStart ??= frame.t;
      calibrationSum.x += world.x;
      calibrationSum.y += world.y;
      calibrationSum.z += world.z;
      calibrationCount += 1;
      if (frame.t - calibrationStart >= config.calibrationMs) {
        bias = {
          x: calibrationSum.x / calibrationCount,
          y: calibrationSum.y / calibrationCount,
          z: calibrationSum.z / calibrationCount,
        };
        calibrating = false;
        lastT = frame.t;
      }
      return;
    }

    const corrected = {
      x: world.x - bias.x,
      y: world.y - bias.y,
      z: world.z - bias.z,
    };
    const accMagnitude = magnitude(corrected);
    const dt = lastT === null ? 0 : Math.min(Math.max((frame.t - lastT) / 1000, 0), 0.05);
    lastT = frame.t;
    const decay = Math.exp(-config.velocityLeak * dt);
    velocity = {
      x: (velocity.x + corrected.x * dt) * decay,
      y: (velocity.y + corrected.y * dt) * decay,
      z: (velocity.z + corrected.z * dt) * decay,
    };

    const speed = magnitude(velocity);
    const omega = magnitude(frame.rot);
    const screenAngle = typeof screen !== 'undefined'
      ? Math.abs(screen.orientation?.angle ?? window.orientation ?? 0) % 180
      : 0;
    const pitchOmega = screenAngle === 90 ? Math.abs(frame.rot.y) : Math.abs(frame.rot.x);
    const upness = accMagnitude > 0.001 ? corrected.z / accMagnitude : 0;
    tracker.omega = omega;
    tracker.pitchOmega = pitchOmega;
    tracker.peakPitchOmega = Math.max(tracker.peakPitchOmega, pitchOmega);
    tracker.upness = Math.max(-1, Math.min(1, upness));

    if (!inStroke && speed >= config.strokeStartSpeed) {
      inStroke = true;
      strokeStart = frame.t;
      strokePeak = speed;
      strokeOmega = omega;
      strokeUpness = tracker.upness;
      quietSince = null;
    }

    if (!inStroke) return;

    strokePeak = Math.max(strokePeak, speed);
    strokeOmega = Math.max(strokeOmega, omega);
    if (Math.abs(tracker.upness) > Math.abs(strokeUpness)) strokeUpness = tracker.upness;
    tracker.peakLin = strokePeak;

    if (speed <= config.strokeEndSpeed) quietSince ??= frame.t;
    else quietSince = null;

    const durMs = frame.t - strokeStart;
    const endedQuietly = quietSince !== null && frame.t - quietSince >= config.strokeQuietMs;
    if (endedQuietly || durMs >= config.strokeMaxMs) {
      inStroke = false;
      quietSince = null;
      if (durMs >= config.minStrokeMs) {
        const stroke = { peakLin: strokePeak, omega: strokeOmega, upness: strokeUpness, durMs };
        listeners.forEach((listener) => listener(stroke));
      }
    }
  }

  return tracker;
}
