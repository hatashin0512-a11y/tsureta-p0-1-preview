let context = null;
const buffers = new Map();
let silenceSource = null;

/** @type {GainNode|null} */
export let master = null;
/** @type {MediaStreamAudioDestinationNode|null} */
export let recordTap = null;

function ensureGraph() {
  if (context) return context;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error('Web Audio API is not supported');
  context = new AudioContextClass();
  master = context.createGain();
  recordTap = context.createMediaStreamDestination();
  master.connect(context.destination);
  master.connect(recordTap);
  return context;
}

/**
 * Unlocks Web Audio and starts the local silent keep-alive loop.
 * Call directly from a user gesture.
 */
export async function unlock() {
  const ctx = ensureGraph();
  await ctx.resume();

  if (!buffers.has('__silence')) {
    const url = new URL('../sounds/silence.wav?v=1', import.meta.url);
    await load('__silence', url.href);
  }
  if (!silenceSource) silenceSource = play('__silence', { loop: true, gain: 0 });
  return true;
}

/**
 * @param {string} name
 * @param {string} url
 */
export async function load(name, url) {
  const ctx = ensureGraph();
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Audio load failed (${response.status}): ${url}`);
  const buffer = await response.arrayBuffer();
  const decoded = await ctx.decodeAudioData(buffer.slice(0));
  buffers.set(name, decoded);
  return decoded;
}

/**
 * @param {string} name
 * @param {{rate?:number, gain?:number, loop?:boolean}} [options]
 */
export function play(name, options = {}) {
  const ctx = ensureGraph();
  const buffer = buffers.get(name);
  if (!buffer) throw new Error(`Audio is not loaded: ${name}`);

  const source = ctx.createBufferSource();
  const gainNode = ctx.createGain();
  source.buffer = buffer;
  source.loop = Boolean(options.loop);
  source.playbackRate.value = options.rate ?? 1;
  gainNode.gain.value = options.gain ?? 1;
  source.connect(gainNode);
  gainNode.connect(master);
  source.start();

  let stopped = false;
  const handle = {
    stop() {
      if (stopped) return;
      stopped = true;
      try { source.stop(); } catch { /* already stopped */ }
      source.disconnect();
      gainNode.disconnect();
      if (handle === silenceSource) silenceSource = null;
    },
    setRate(value) {
      source.playbackRate.setTargetAtTime(Math.max(0.05, value), ctx.currentTime, 0.015);
    },
    setGain(value) {
      gainNode.gain.setTargetAtTime(Math.max(0, value), ctx.currentTime, 0.015);
    },
  };
  source.addEventListener('ended', () => {
    if (!source.loop) stopped = true;
  }, { once: true });
  return handle;
}

export function loopEngine(name) {
  return play(name, { loop: true, gain: 1 });
}
