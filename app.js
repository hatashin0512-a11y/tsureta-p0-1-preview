// @ts-check

import { requestMotion, startMotion, createMotionTracker } from './lib/sensors.js?v=2';
import { unlock, load, play, loopEngine } from './lib/audio.js?v=1';
import { screens, shake, toast, showVersion } from './lib/ui.js?v=2';
import { P as CAST_P, castResult, listenForCasts } from './game/cast.js?v=2';
import { P as HOOK_P, hookResult, randomBiteDelay } from './game/hook.js?v=2';
import { angleDelta, createFight } from './game/fight.js?v=1';
import { drawCatch } from './game/lottery.js?v=1';
import { readDex, recordCatch } from './game/dex.js?v=1';
import { renderCatchCard } from './game/card.js?v=1';
import { shareBlob } from './lib/capture.js?v=1';
import { boostForPlayCount, completePlay, getPlayCount, markSafetySeen, safetySeen } from './game/boost.js?v=1';

/** @typedef {import('./types.js').ScreenId} ScreenId */

const VERSION = 'p0-7.0';
/** @type {ScreenId[]} */
const FLOW = ['title', 'region', 'conditions', 'point', 'cast', 'bite', 'fight', 'result', 'card'];
const view = screens(FLOW);
const state = {
  screen: /** @type {ScreenId} */ ('title'),
  region: '東京湾エリア',
  point: '夕凪堤防',
  castPower: 0,
  catchData: null,
};
const fishDataPromise = fetch(new URL('./data/fish.json?v=1', import.meta.url), { cache: 'force-cache' })
  .then((response) => {
    if (!response.ok) throw new Error(`fish.json: ${response.status}`);
    return response.json();
  });
const tracker = createMotionTracker();
const existingCatchCount = readDex().reduce((sum, entry) => sum + entry.game.count, 0);
getPlayCount(localStorage, existingCatchCount);
let activeBoost = boostForPlayCount(getPlayCount());
let motionReady = false;
let audioReady = false;
let castArmed = false;
let castInFlight = false;
let splashTimer = 0;
let previousDistance = null;
let biteTimer = 0;
let hookTimer = 0;
let retryTimer = 0;
let hookWindowOpen = false;
let hookFinished = false;
let hookFrame = 0;
let fight = null;
let fightFrame = 0;
let fightReturnTimer = 0;
let reelSound = null;
let fightLastPhase = 'calm';
let reelPointerId = null;
let reelLastAngle = 0;
let reelVisualTurns = 0;
let resultPreparing = false;
let cardBlob = null;

showVersion(VERSION);
show('title');

document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;

  if (button.id === 'start-button') {
    if (!safetySeen()) {
      document.getElementById('safety-overlay').hidden = false;
      return;
    }
    initializeExperience(button);
    return;
  }

  if (button.id === 'safety-start') {
    markSafetySeen();
    document.getElementById('safety-overlay').hidden = true;
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

  if (button.id === 'bite-debug-toggle') {
    const debug = document.getElementById('bite-debug');
    debug.hidden = !debug.hidden;
    button.setAttribute('aria-expanded', String(!debug.hidden));
    return;
  }

  if (button.id === 'save-card') {
    saveCatchCard(button);
    return;
  }

  if (button.id === 'share-card') {
    shareCatchCard(button);
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
  if (state.screen === 'bite' && id !== 'bite') clearBiteTimers();
  if (state.screen === 'fight' && id !== 'fight') clearFight();
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
  if (id === 'bite') prepareBite();
  if (id === 'fight') prepareFight();
  if (id === 'result') prepareResult();
  if (id === 'card') updateCardPreview();
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
        load('bite', new URL('./sounds/bite.wav?v=1', import.meta.url).href),
        load('reel-loop', new URL('./sounds/reel_loop.wav?v=1', import.meta.url).href),
        load('drag', new URL('./sounds/drag.wav?v=1', import.meta.url).href),
        load('landing', new URL('./sounds/landing_splash.wav?v=1', import.meta.url).href),
        load('fanfare-n', new URL('./sounds/fanfare_n.wav?v=1', import.meta.url).href),
        load('fanfare-r', new URL('./sounds/fanfare_r.wav?v=1', import.meta.url).href),
        load('fanfare-sr', new URL('./sounds/fanfare_sr.wav?v=1', import.meta.url).href),
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
  state.catchData = null;
  cardBlob = null;
  activeBoost = boostForPlayCount(getPlayCount());
  document.getElementById('cast-tutorial').hidden = activeBoost.level !== 'full';
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

listenForCasts(tracker, (rawResult) => {
  const castMin = activeBoost.level === 'full' ? CAST_P.castMin * .5
    : activeBoost.level === 'half' ? CAST_P.castMin * .75 : CAST_P.castMin;
  const result = {
    ...rawResult,
    ...castResult(rawResult.peakLin, { ...CAST_P, castMin }),
  };
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
  state.castPower = result.power;
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

function clearBiteTimers() {
  clearTimeout(biteTimer);
  clearTimeout(hookTimer);
  clearTimeout(retryTimer);
  cancelAnimationFrame(hookFrame);
  hookWindowOpen = false;
}

function prepareBite() {
  clearBiteTimers();
  hookFinished = false;
  tracker.calibrate();
  const scene = document.getElementById('bite-scene');
  scene.className = 'scene bite-stage bite-waiting';
  document.getElementById('bite-heading').textContent = 'ウキを見て！';
  document.getElementById('bite-icon').textContent = '🔴';
  document.getElementById('bite-prompt').textContent = '静かに構えて待つ';
  document.getElementById('bite-subprompt').textContent = '「アタリ！」が出たら、手首でスマホの先を自分側へクイッ！';
  document.getElementById('bite-result').textContent = '胸の前で平らに構え、まだ動かさずウキに集中。';
  document.getElementById('bite-next').hidden = true;
  document.getElementById('bite-tutorial').hidden = activeBoost.level !== 'full';
  biteTimer = setTimeout(triggerBite, randomBiteDelay({ ...HOOK_P, biteMaxMs: activeBoost.biteMaxMs }));
}

function triggerBite() {
  if (state.screen !== 'bite' || hookFinished) return;
  tracker.resetGesture();
  hookWindowOpen = true;
  const scene = document.getElementById('bite-scene');
  scene.className = 'scene bite-stage bite-now';
  document.getElementById('bite-heading').textContent = 'アタリ！！';
  document.getElementById('bite-icon').textContent = '⚡';
  document.getElementById('bite-prompt').textContent = '今！竿を立てる！';
  document.getElementById('bite-subprompt').textContent = 'スマホの先を、手首で自分側へクイッと起こす';
  document.getElementById('bite-result').textContent = '判定時間は1.2秒！';
  if (audioReady) play('bite', { gain: 1 });
  shake(1.8);
  hookFrame = requestAnimationFrame(checkHookMotion);
  hookTimer = setTimeout(() => activeBoost.autoHook ? finishHook(true) : failHook(), activeBoost.hookWindowMs);
}

function checkHookMotion() {
  if (state.screen !== 'bite' || !hookWindowOpen || hookFinished) return;
  const result = hookResult({
    peakLin: tracker.peakLin,
    omega: tracker.omega,
    pitchOmega: tracker.peakPitchOmega,
    upness: tracker.upness,
    durMs: 0,
  }, {
    ...HOOK_P,
    hookMinPeak: HOOK_P.hookMinPeak * activeBoost.hookScale,
    hookMinUpness: HOOK_P.hookMinUpness * activeBoost.hookScale,
    hookMinPitchOmega: HOOK_P.hookMinPitchOmega * activeBoost.hookScale,
  });
  document.getElementById('bite-debug-peak').textContent = result.peakLin.toFixed(2);
  document.getElementById('bite-debug-upness').textContent = result.upness.toFixed(2);
  document.getElementById('bite-debug-pitch').textContent = result.pitchOmega.toFixed(2);
  if (result.ok) {
    finishHook(true);
    return;
  }
  hookFrame = requestAnimationFrame(checkHookMotion);
}

function failHook() {
  if (state.screen !== 'bite' || hookFinished) return;
  finishHook(false);
}

/** @param {boolean} success */
function finishHook(success) {
  hookFinished = true;
  hookWindowOpen = false;
  clearTimeout(hookTimer);
  cancelAnimationFrame(hookFrame);
  const scene = document.getElementById('bite-scene');
  if (success) {
    scene.className = 'scene bite-stage bite-success';
    document.getElementById('bite-heading').textContent = 'アワセ成功！';
    document.getElementById('bite-icon').textContent = '🐟';
    document.getElementById('bite-prompt').textContent = 'かかった！！';
    document.getElementById('bite-subprompt').textContent = '魚がルアーをくわえました';
    document.getElementById('bite-result').textContent = '成功！次はリールを巻いて魚と勝負です。';
    document.getElementById('bite-next').hidden = false;
    shake(.7);
    return;
  }

  scene.className = 'scene bite-stage bite-fail';
  document.getElementById('bite-heading').textContent = 'バレた…惜しい！';
  document.getElementById('bite-icon').textContent = '💨';
  document.getElementById('bite-prompt').textContent = '魚が逃げた！';
  document.getElementById('bite-subprompt').textContent = '次は「アタリ！」が出てから、手首で竿を立てる';
  document.getElementById('bite-result').textContent = '2秒後に、もう一度投げられます。';
  retryTimer = setTimeout(() => {
    if (state.screen === 'bite') show('cast');
  }, 2000);
}

const reel = document.getElementById('reel-control');
reel.addEventListener('pointerdown', (event) => {
  if (state.screen !== 'fight' || !fight) return;
  reelPointerId = event.pointerId;
  reel.setPointerCapture(event.pointerId);
  reelLastAngle = pointerAngle(event, reel);
  reel.classList.add('reeling');
});
reel.addEventListener('pointermove', (event) => {
  if (event.pointerId !== reelPointerId || !fight) return;
  const angle = pointerAngle(event, reel);
  const turns = Math.abs(angleDelta(reelLastAngle, angle)) / (Math.PI * 2);
  reelLastAngle = angle;
  fight.reel(turns);
  reelVisualTurns += turns;
  reel.style.setProperty('--reel-angle', `${reelVisualTurns * 360}deg`);
});
reel.addEventListener('pointerup', stopReeling);
reel.addEventListener('pointercancel', stopReeling);

function stopReeling(event) {
  if (event.pointerId !== reelPointerId) return;
  reelPointerId = null;
  reel.classList.remove('reeling');
}

function pointerAngle(event, element) {
  const rect = element.getBoundingClientRect();
  return Math.atan2(event.clientY - rect.top - rect.height / 2, event.clientX - rect.left - rect.width / 2);
}

function prepareFight() {
  clearFight();
  fight = createFight({
    rushCountMax: activeBoost.rushCountMax,
    tensionMultiplier: activeBoost.tensionMultiplier,
  });
  fightLastPhase = 'calm';
  reelVisualTurns = 0;
  reel.style.setProperty('--reel-angle', '0deg');
  reel.classList.remove('reeling');
  document.getElementById('fight-scene').className = 'panel fight-panel';
  document.getElementById('fight-heading').textContent = '魚とファイト！';
  document.getElementById('fight-command').textContent = 'ぐるぐる巻け！';
  document.getElementById('fight-guide').textContent = '円の上を指でぐるぐる回すと、魚が近づきます。';
  document.getElementById('fight-result').hidden = true;
  document.getElementById('fish-distance').textContent = '100%';
  document.getElementById('fight-timer').textContent = '20.0秒';
  document.getElementById('fight-tutorial').hidden = activeBoost.level !== 'full';
  fight.start();
  if (audioReady) {
    reelSound = loopEngine('reel-loop');
    reelSound.setGain(0);
  }
  fightFrame = requestAnimationFrame(updateFight);
}

function updateFight(now) {
  if (state.screen !== 'fight' || !fight) return;
  const status = fight.update(now);
  document.getElementById('tension-fill').style.width = `${status.tension * 100}%`;
  document.getElementById('distance-fill').style.width = `${(1 - status.remaining) * 100}%`;
  document.getElementById('fish-distance').textContent = `${Math.ceil(status.remaining * 100)}%`;
  document.getElementById('fight-timer').textContent = `${Math.max(0, (20000 - status.elapsedMs) / 1000).toFixed(1)}秒`;
  if (reelSound) {
    reelSound.setGain(status.reelSpeed * .34);
    reelSound.setRate(.72 + status.reelSpeed * 1.35);
  }

  const panel = document.getElementById('fight-scene');
  panel.classList.toggle('fight-warning', status.phase === 'warning');
  panel.classList.toggle('fight-rush', status.phase === 'rush');
  panel.classList.toggle('fight-danger', status.tension >= .78);
  if (status.phase !== fightLastPhase) {
    if (status.phase === 'warning') {
      document.getElementById('fight-command').textContent = '来るぞ…指を離して！';
      document.getElementById('fight-guide').textContent = '赤く光ったら巻くのを止めます。';
      if (audioReady) play('drag', { gain: .85 });
      shake(.9);
    } else if (status.phase === 'rush') {
      document.getElementById('fight-command').textContent = '魚が走る！止めて！';
      document.getElementById('fight-guide').textContent = '今は巻かない！テンションを下げてください。';
      shake(1.35);
    } else {
      document.getElementById('fight-command').textContent = '今だ！ぐるぐる巻け！';
      document.getElementById('fight-guide').textContent = '危険が去りました。指で円を回してください。';
    }
    fightLastPhase = status.phase;
  }

  if (status.outcome !== 'playing') {
    finishFight(status.outcome);
    return;
  }
  fightFrame = requestAnimationFrame(updateFight);
}

function finishFight(outcome) {
  cancelAnimationFrame(fightFrame);
  if (reelSound) reelSound.stop();
  reelSound = null;
  const panel = document.getElementById('fight-scene');
  const result = document.getElementById('fight-result');
  result.hidden = false;
  if (outcome === 'caught') {
    panel.className = 'panel fight-panel fight-caught';
    document.getElementById('fight-heading').textContent = '勝負あり！';
    document.getElementById('fight-command').textContent = '魚を寄せた！！';
    document.getElementById('fight-guide').textContent = 'ランディング成功！釣果を確認します。';
    result.textContent = '釣り上げ成功！';
    shake(1.1);
    fightReturnTimer = setTimeout(() => {
      if (state.screen === 'fight') show('result');
    }, 1200);
    return;
  }
  panel.className = 'panel fight-panel fight-broken';
  document.getElementById('fight-heading').textContent = 'ラインブレイク！';
  document.getElementById('fight-command').textContent = '巻きすぎた！';
  document.getElementById('fight-guide').textContent = '赤い時は指を止めるとラインを守れます。';
  result.textContent = '2秒後にもう一投できます。';
  fightReturnTimer = setTimeout(() => {
    if (state.screen === 'fight') show('cast');
  }, 2000);
}

function clearFight() {
  cancelAnimationFrame(fightFrame);
  clearTimeout(fightReturnTimer);
  if (reelSound) reelSound.stop();
  reelSound = null;
  fight = null;
  reelPointerId = null;
  reel.classList.remove('reeling');
}

async function prepareResult() {
  if (state.catchData) {
    updateResultScreen(state.catchData, false);
    return;
  }
  if (resultPreparing) return;
  resultPreparing = true;
  document.getElementById('result-heading').textContent = '水面に何かいる…！';
  document.getElementById('result-fish').hidden = true;
  document.getElementById('result-name').textContent = '釣果を確認中';
  document.getElementById('result-card-button').disabled = true;
  try {
    const fish = await fishDataPromise;
    const catchResult = drawCatch(fish, {
      pointId: 'pier', castPower: state.castPower, boost: activeBoost.lotteryBoost,
    });
    const dex = recordCatch(catchResult.species, catchResult.cm);
    completePlay();
    const badge = catchResult.monster ? 'モンスター級！'
      : dex.first ? '初ゲット！'
        : dex.best ? '自己ベスト！' : 'ナイスキャッチ！';
    state.catchData = { ...catchResult, dex, badge };
    updateResultScreen(state.catchData, true);
  } catch (error) {
    console.error(error);
    document.getElementById('result-heading').textContent = '釣果を読み込めませんでした';
    document.getElementById('result-name').textContent = 'もう一度お試しください';
    toast('魚データを読み込めませんでした');
  } finally {
    resultPreparing = false;
  }
}

function updateResultScreen(caught, animate) {
  document.getElementById('result-heading').textContent = '釣れた！';
  document.getElementById('result-fish').src = caught.species.art;
  document.getElementById('result-fish').alt = caught.species.name_ja;
  document.getElementById('result-fish').hidden = false;
  document.getElementById('result-rarity').textContent = caught.rarity;
  document.getElementById('result-size').textContent = `${caught.cm.toFixed(1)} cm`;
  document.getElementById('result-name').textContent = caught.species.name_ja;
  document.getElementById('result-badge').textContent = caught.badge;
  document.getElementById('result-dex').textContent = `${caught.dex.speciesCount} / 3種`;
  document.getElementById('result-count').textContent = `${caught.dex.entry.game.count}匹目`;
  document.getElementById('result-card-button').disabled = false;
  const scene = document.getElementById('result-catch');
  scene.className = `catch rarity-${caught.rarity.toLowerCase()}${animate ? ' catch-reveal' : ''}`;
  if (animate) {
    if (audioReady) play('landing', { gain: .9 });
    shake(1.15);
    setTimeout(() => {
      if (state.screen !== 'result' || !audioReady) return;
      play(`fanfare-${caught.rarity.toLowerCase()}`, { gain: .8 });
    }, 520);
  }
}

function appUrl() {
  const url = new URL('./', location.href);
  url.search = '';
  url.hash = '';
  return url.href;
}

function updateCardPreview() {
  const caught = state.catchData;
  if (!caught) return;
  document.getElementById('card-fish').src = caught.species.art;
  document.getElementById('card-fish').alt = caught.species.name_ja;
  document.getElementById('card-name').textContent = caught.species.name_ja;
  document.getElementById('card-size').textContent = `${caught.cm.toFixed(1)} cm`;
  document.getElementById('card-badge').textContent = caught.badge;
  document.getElementById('card-rarity').textContent = caught.rarity;
  document.getElementById('card-point').textContent = state.point;
  document.getElementById('card-url').textContent = appUrl();
  document.getElementById('card-preview').className = `card-preview rarity-${caught.rarity.toLowerCase()}`;
}

async function ensureCardBlob() {
  if (cardBlob) return cardBlob;
  const caught = state.catchData;
  if (!caught) throw new Error('Catch result is not ready');
  cardBlob = await renderCatchCard({
    species: caught.species,
    cm: caught.cm,
    rarity: caught.rarity,
    badge: caught.badge,
    point: state.point,
    condition: '夕まずめ・晴れ・上げ潮',
    appUrl: appUrl(),
  });
  return cardBlob;
}

async function saveCatchCard(button) {
  button.disabled = true;
  button.textContent = '画像を作成中…';
  try {
    const blob = await ensureCardBlob();
    const result = await shareBlob(blob, `${state.catchData.species.name_ja} ${state.catchData.cm.toFixed(1)}cmを釣った！ #釣れた`);
    toast(result === 'shared' ? '共有メニューから画像を保存できます' : 'カード画像を保存しました');
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.error(error);
      toast('カードを保存できませんでした');
    }
  } finally {
    button.disabled = false;
    button.textContent = 'カード保存';
  }
}

async function shareCatchCard(button) {
  button.disabled = true;
  button.textContent = '準備中…';
  try {
    const blob = await ensureCardBlob();
    await shareBlob(blob, `${state.catchData.species.name_ja} ${state.catchData.cm.toFixed(1)}cmを釣った！ #釣れた`);
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.error(error);
      toast('共有を開始できませんでした');
    }
  } finally {
    button.disabled = false;
    button.textContent = 'シェア';
  }
}
