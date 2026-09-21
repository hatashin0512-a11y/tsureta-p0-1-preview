// @ts-check
import { createMotionTracker, requestMotion, startMotion } from './sensors.js?v=3';

const MOVES = [
  { id: 'cast_gentle', icon: '🎣', text: '弱めに、手首で前へシュッ' },
  { id: 'cast_normal', icon: '🎣', text: 'いつもの強さで前へシュッ' },
  { id: 'cast_strong', icon: '💨', text: '少し強めに前へシュッ' },
  { id: 'tilt_slow', icon: '📱', text: 'スマホの先をゆっくり手前へ' },
  { id: 'tilt_quick', icon: '⚡', text: 'スマホの先を小さく素早く手前へ' },
  { id: 'lift_up', icon: '⬆️', text: 'スマホ全体を上へクイッ' },
].flatMap((move) => [move, move]);

const tracker = createMotionTracker();
const samples = [];
let index = 0;
let samplingFrame = 0;
let maxima = freshMaxima();

document.getElementById('start').addEventListener('click', startTest);
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
    document.getElementById('status').textContent = 'モーションの許可が必要です';
    return;
  }
  startMotion((frame) => tracker.update(frame));
  button.hidden = true;
  document.getElementById('intro').textContent = '「今！」が出たら、表示された動きを1回だけ行ってください。';
  runTrial();
}

function runTrial() {
  const move = MOVES[index];
  document.getElementById('icon').textContent = move.icon;
  document.getElementById('instruction').textContent = move.text;
  document.getElementById('status').textContent = 'スマホを止めて構えます…';
  document.getElementById('progress').style.width = `${index / MOVES.length * 100}%`;
  tracker.calibrate();
  setTimeout(() => {
    tracker.resetGesture();
    maxima = freshMaxima();
    sampleMotion();
    document.getElementById('status').textContent = '今！動かしてください';
    setTimeout(() => finishTrial(move), 1800);
  }, 750);
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
  samples.push({
    move: move.id,
    peakLin: round(maxima.peakLin),
    omega: round(maxima.omega),
    pitchOmega: round(maxima.pitchOmega),
    upness: round(maxima.upness),
  });
  index += 1;
  document.getElementById('progress').style.width = `${index / MOVES.length * 100}%`;
  document.getElementById('status').textContent = '記録しました！';
  if (index >= MOVES.length) {
    setTimeout(showResult, 450);
    return;
  }
  setTimeout(runTrial, 650);
}

function showResult() {
  document.querySelector('.panel').hidden = true;
  document.getElementById('done').hidden = false;
  document.getElementById('result').textContent = reportText();
}

function reportText() {
  return JSON.stringify({
    version: 'p0-8-calibration-1',
    timestamp: new Date().toISOString(),
    device: navigator.userAgent,
    samples,
  });
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
