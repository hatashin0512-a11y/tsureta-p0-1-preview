// @ts-check
import { createMotionTracker, requestMotion, startMotion } from './sensors.js?v=3';

const MOVES = [
  { id: 'cast_gentle', demo: '📱 →', title: '弱めのキャスト', detail: 'スマホを胸の前で縦向きに持ちます。「今！」が出たら、画面を自分へ向けたまま手首だけで前へ小さくシュッ。', duration: 1800 },
  { id: 'cast_normal', demo: '📱 ➜', title: '普通のキャスト', detail: '同じ持ち方です。「今！」が出たら、普段投げたい強さで手首を前へシュッ。腕を大きく振りません。', duration: 1800 },
  { id: 'cast_strong', demo: '📱 💨', title: '少し強めのキャスト', detail: '同じ持ち方です。「今！」が出たら、手首だけで少し速く前へシュッ。端末を離さないでください。', duration: 1800 },
  { id: 'tilt_slow', demo: '━📱 ↶', title: 'ゆっくり竿を立てる', detail: '画面を上にしてスマホを平らに持ちます。「今！」が出たら、画面の上側を自分へ約1秒かけてゆっくり起こします。', duration: 2300 },
  { id: 'tilt_quick', demo: '━📱 ⚡↶', title: '素早く竿を立てる', detail: '画面を上にしてスマホを平らに持ちます。「今！」が出たら、画面の上側を手首で自分へ小さくクイッ。', duration: 1800 },
  { id: 'lift_up', demo: '📱 ⬆', title: 'スマホ全体を上げる', detail: '画面を上にして平らに保ちます。「今！」が出たら、傾けずにスマホ全体を上へ小さくクイッ。', duration: 1800 },
].flatMap((move) => [move, move]);

const tracker = createMotionTracker();
const samples = [];
let index = 0;
let samplingFrame = 0;
let maxima = freshMaxima();
let buttonMode = 'ready';

document.getElementById('start').addEventListener('click', startTest);
document.getElementById('trial-start').addEventListener('click', handleTrialButton);
document.getElementById('copy').addEventListener('click', copyResult);
document.getElementById('share').addEventListener('click', shareResult);

async function startTest() {
  const button = document.getElementById('start');
  button.disabled = true;
  button.textContent = 'モーションを準備中…';
  const allowed = await requestMotion();
  if (!allowed) {
    button.disabled = false;
    button.textContent = 'もう一度許可する';
    setStatus('モーションの許可が必要です', 'wait');
    return;
  }
  startMotion((frame) => tracker.update(frame));
  button.hidden = true;
  document.getElementById('intro').textContent = '説明を読んでからボタンを押してください。3・2・1の間は動かしません。';
  showTrial();
}

function showTrial() {
  const move = MOVES[index];
  const repeat = index % 2 + 1;
  document.getElementById('step').textContent = `${index + 1} / ${MOVES.length}　${repeat}回目`;
  document.getElementById('demo').textContent = move.demo;
  document.getElementById('instruction').textContent = move.title;
  document.getElementById('detail').textContent = move.detail;
  document.getElementById('progress').style.width = `${index / MOVES.length * 100}%`;
  setStatus('説明を読む時間です。まだ動かしません', 'wait');
  buttonMode = 'ready';
  const button = document.getElementById('trial-start');
  button.hidden = false;
  button.disabled = false;
  button.textContent = '理解した！この動きを測る';
}

function handleTrialButton() {
  if (buttonMode === 'ready') beginCountdown();
  else if (buttonMode === 'next') {
    index += 1;
    if (index >= MOVES.length) showResult();
    else showTrial();
  }
}

function beginCountdown() {
  const button = document.getElementById('trial-start');
  button.disabled = true;
  tracker.calibrate();
  let count = 3;
  setStatus(`まだ動かさない　${count}`, 'wait');
  const timer = setInterval(() => {
    count -= 1;
    if (count > 0) {
      setStatus(`まだ動かさない　${count}`, 'wait');
      return;
    }
    clearInterval(timer);
    beginSampling();
  }, 700);
}

function beginSampling() {
  const move = MOVES[index];
  tracker.resetGesture();
  maxima = freshMaxima();
  sampleMotion();
  setStatus('今！1回だけ動かす', 'go');
  setTimeout(() => finishTrial(move), move.duration);
}

function freshMaxima() {
  return { peakLin: 0, omega: 0, pitchOmega: 0, upness: -1 };
}

function sampleMotion() {
  maxima.peakLin = Math.max(maxima.peakLin, tracker.peakLin);
  maxima.omega = Math.max(maxima.omega, tracker.omega);
  maxima.pitchOmega = Math.max(maxima.pitchOmega, tracker.peakPitchOmega);
  maxima.upness = Math.max(maxima.upness, tracker.upness);
  samplingFrame = requestAnimationFrame(sampleMotion);
}

function finishTrial(move) {
  cancelAnimationFrame(samplingFrame);
  samples.push({ move: move.id, peakLin: round(maxima.peakLin), omega: round(maxima.omega), pitchOmega: round(maxima.pitchOmega), upness: round(maxima.upness) });
  document.getElementById('progress').style.width = `${(index + 1) / MOVES.length * 100}%`;
  setStatus('記録完了！ここから動かしてOK', 'done');
  buttonMode = 'next';
  const button = document.getElementById('trial-start');
  button.disabled = false;
  button.textContent = index + 1 >= MOVES.length ? '結果を見る' : '次の説明へ';
}

function setStatus(text, className = '') {
  const status = document.getElementById('status');
  status.textContent = text;
  status.className = `status ${className}`;
}

function showResult() {
  document.querySelector('.panel').hidden = true;
  document.getElementById('done').hidden = false;
  document.getElementById('result').textContent = reportText();
}

function reportText() {
  return JSON.stringify({ version: 'p0-8-calibration-2', timestamp: new Date().toISOString(), device: navigator.userAgent, samples });
}

async function copyResult() {
  await navigator.clipboard.writeText(reportText());
  document.getElementById('copy').textContent = 'コピーしました！';
}

async function shareResult() {
  const text = reportText();
  if (navigator.share) await navigator.share({ title: '釣れた！感度テスト結果', text });
  else await navigator.clipboard.writeText(text);
}

const round = (value) => Math.round(value * 100) / 100;
