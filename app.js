// @ts-check

import { requestMotion, startMotion, createMotionTracker } from './lib/sensors.js?v=1';
import { unlock, load, play } from './lib/audio.js?v=1';
import { screens, shake, toast, showVersion } from './lib/ui.js?v=2';
import { listenForCasts } from './game/cast.js?v=2';

/** @typedef {import('./types.js').ScreenId} ScreenId */

const VERSION = 'p0-3.1';
/** @type {ScreenId[]} */
const FLOW = ['title', 'region', 'conditions', 'point', 'cast', 'bite', 'fight', 'result', 'card'];
const view = screens(FLOW);
const state = {
  screen: /** @type {ScreenId} */ ('title'),
  region: '東京湾エリア',
  point: '夕凪堤防',
};
const tracker = createMotionTracker();
let motionReady = false;
let audioReady = false;
let castArmed = false;
let castInFlight = false;
let splashTimer = 0;
let previousDistance = null;

showVersion(VERSION);
show('title');

document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;

  if (button.id === 'start-button') {
    initializeExperience(button);
    return;
  }

  if (button.id === 'cast-recalibrate') {
    prepareCast();
    return;
  }

  if (button.id === 'debug-toggle') {
    const debug = document.getElementById('cast-debug');
    debug.hidden = !debug.hidden;
    button.setAttribute('aria-expanded', String(!debug.hidden));
    return;
  }

  if (button.dataset.region) {
    state.region = button.dataset.region;
    selectChoice('[data-region]', button);
    updateSelections();
  }

  if (button.dataset.point) {
    state.point = button.dataset.point;
    selectChoice('[data-point]', button);
    updateSelections();
  }

  if (button.dataset.notice) toast(button.dataset.notice);
  if (button.dataset.go) show(/** @type {ScreenId} */ (button.dataset.go));
});

/**
 * @param {string} selector
 * @param {HTMLButtonElement} selected
 */
function selectChoice(selector, selected) {
  document.querySelectorAll(selector).forEach((item) => {
    const isSelected = item === selected;
    item.classList.toggle('selected', isSelected);
    item.setAttribute('aria-pressed', String(isSelected));
    const arrow = item.querySelector('.arrow');
    if (arrow) arrow.textContent = isSelected ? '✓' : '›';
  });
}

/** @param {ScreenId} id */
function show(id) {
  state.screen = id;
  view.show(id);
  const index = FLOW.indexOf(id);
  const progress = document.getElementById('flow-progress');
  const label = document.getElementById('flow-label');
  progress.style.width = `${((index + 1) / FLOW.length) * 100}%`;
  label.textContent = `${index + 1} / ${FLOW.length}`;
  document.body.dataset.screen = id;
  window.scrollTo({ top: 0, behavior: 'auto' });
  updateSelections();
  if (id === 'cast') prepareCast();
}

function updateSelections() {
  document.querySelectorAll('[data-selected-region]').forEach((element) => {
    element.textContent = state.region;
  });
  document.querySelectorAll('[data-selected-point]').forEach((element) => {
    element.textContent = state.point;
  });
}

/** @param {HTMLButtonElement} button */
async function initializeExperience(button) {
  button.disabled = true;
  button.textContent = '準備しています…';

  // Both permission-sensitive calls start in the same user tap.
  const motionPromise = requestMotion();
  const audioPromise = unlock();
  const [motionResult, audioResult] = await Promise.allSettled([motionPromise, audioPromise]);
  motionReady = motionResult.status === 'fulfilled' && motionResult.value;
  audioReady = audioResult.status === 'fulfilled';

  if (motionReady) startMotion((frame) => tracker.update(frame));
  if (audioReady) {
    try {
      await Promise.all([
        load('cast-whoosh', new URL('./sounds/cast_whoosh.wav?v=1', import.meta.url).href),
        load('splash', new URL('./sounds/splash.wav?v=1', import.meta.url).href),
      ]);
    } catch (error) {
      audioReady = false;
      console.error(error);
    }
  }

  if (!motionReady) toast('モーションを許可すると実際に振って遊べます');
  if (!audioReady) toast('音声を準備できませんでした');
  button.disabled = false;
  button.textContent = 'はじめる';
  show('region');
}

function prepareCast() {
  clearTimeout(splashTimer);
  castArmed = false;
  castInFlight = false;
  tracker.calibrate();
  const scene = document.getElementById('cast-scene');
  scene.classList.remove('cast-fired', 'cast-splash');
  scene.style.setProperty('--cast-power', '0');
  document.getElementById('cast-distance').textContent = '--.- m';
  document.getElementById('cast-label').textContent = '0.5秒だけ止めて構えます';
  document.getElementById('cast-next').hidden = true;
  document.getElementById('cast-recalibrate').hidden = false;
  document.getElementById('cast-recalibrate').textContent = previousDistance === null ? '構え直す' : 'もう一度投げる';
  setTimeout(() => {
    if (state.screen !== 'cast') return;
    castArmed = motionReady;
    document.getElementById('cast-label').textContent = motionReady
      ? '準備OK！手首で前へシュッと振ってください'
      : 'モーションが使えません。タイトルから許可してください';
  }, 650);
}

listenForCasts(tracker, (result) => {
  if (state.screen !== 'cast' || !castArmed || castInFlight) return;
  document.getElementById('debug-peak').textContent = result.peakLin.toFixed(2);
  document.getElementById('debug-omega').textContent = result.omega.toFixed(2);
  document.getElementById('debug-duration').textContent = `${Math.round(result.durMs)} ms`;

  if (!result.accepted) {
    castArmed = false;
    document.getElementById('cast-distance').textContent = 'もう一度';
    document.getElementById('cast-label').textContent = `少し弱すぎました（速さ ${result.peakLin.toFixed(2)} m/s）`;
    document.getElementById('cast-comparison').textContent = 'もう少しだけ速く、手首を前へシュッと動かしてください。';
    setTimeout(() => {
      if (state.screen !== 'cast' || castInFlight) return;
      castArmed = true;
      document.getElementById('cast-label').textContent = '再挑戦できます！手首で前へシュッと振ってください';
    }, 600);
    return;
  }

  castArmed = false;
  castInFlight = true;
  const scene = document.getElementById('cast-scene');
  scene.style.setProperty('--cast-power', result.power.toFixed(3));
  scene.style.setProperty('--cast-x', `${54 + result.power * 34}%`);
  const delayMs = 240 + result.power * 560;
  scene.style.setProperty('--flight-ms', `${delayMs}ms`);
  scene.classList.add('cast-fired');
  document.getElementById('cast-label').textContent = 'ルアーが飛んでいます…';
  if (audioReady) play('cast-whoosh', { gain: .45 + result.power * .45, rate: .82 + result.power * .5 });

  splashTimer = setTimeout(() => {
    scene.classList.add('cast-splash');
    if (audioReady) play('splash', { gain: .9 - result.power * .3, rate: .95 + result.power * .12 });
    shake(.45 + result.power * .35);
    document.getElementById('cast-distance').textContent = `${result.distance.toFixed(1)} m`;
    document.getElementById('cast-label').textContent = `${result.label}！`;
    const comparison = document.getElementById('cast-comparison');
    if (previousDistance === null) {
      comparison.textContent = '1回目を記録しました。「もう一度投げる」で強さを変えて比べられます。';
    } else {
      const difference = result.distance - previousDistance;
      comparison.textContent = Math.abs(difference) < .5
        ? '前回とほぼ同じ飛距離です。'
        : `前回より ${Math.abs(difference).toFixed(1)} m ${difference > 0 ? '遠く' : '短く'}飛びました。`;
    }
    previousDistance = result.distance;
    document.getElementById('cast-next').hidden = false;
    document.getElementById('cast-recalibrate').textContent = 'もう一度投げる';
  }, delayMs);
});
