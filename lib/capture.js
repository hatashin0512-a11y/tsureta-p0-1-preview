import { recordTap } from './audio.js?v=1';

let active = null;

function preferredMimeType() {
  const candidates = [
    'video/mp4;codecs=h264,aac',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

export function isRecordingSupported() {
  return typeof MediaRecorder !== 'undefined'
    && typeof HTMLCanvasElement !== 'undefined'
    && typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

/** @param {HTMLCanvasElement} canvas */
export function startRecording(canvas) {
  if (!isRecordingSupported()) throw new Error('Recording is not supported on this browser');
  if (active) throw new Error('A recording is already active');

  const canvasStream = canvas.captureStream(30);
  const tracks = [...canvasStream.getVideoTracks()];
  // Record with clones so stopping one capture never closes the shared Web
  // Audio tap. A second recording must work without rebuilding the graph.
  if (recordTap) tracks.push(...recordTap.stream.getAudioTracks().map((track) => track.clone()));
  const stream = new MediaStream(tracks);
  const mimeType = preferredMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data?.size) chunks.push(event.data);
  });
  recorder.start(250);
  active = { recorder, chunks, stream, mimeType };
  return true;
}

export async function stopRecording() {
  if (!active) throw new Error('No recording is active');
  const session = active;
  active = null;

  const blob = await new Promise((resolve, reject) => {
    session.recorder.addEventListener('stop', () => {
      resolve(new Blob(session.chunks, { type: session.recorder.mimeType || session.mimeType || 'video/webm' }));
    }, { once: true });
    session.recorder.addEventListener('error', (event) => reject(event.error || new Error('Recording failed')), { once: true });
    session.recorder.stop();
  });
  session.stream.getTracks().forEach((track) => track.stop());
  return blob;
}

/**
 * @param {Blob} blob
 * @param {string} text
 */
export async function shareBlob(blob, text) {
  const extension = blob.type.includes('png') ? 'png' : blob.type.includes('mp4') ? 'mp4' : 'webm';
  const file = new File([blob], `tsureta-${Date.now()}.${extension}`, { type: blob.type });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], text });
    return 'shared';
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return 'downloaded';
}

/**
 * @param {(context:CanvasRenderingContext2D, canvas:HTMLCanvasElement)=>void|Promise<void>} drawFn
 * @returns {Promise<Blob>}
 */
export async function renderResultCard(drawFn) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is not supported');
  await drawFn(context, canvas);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG generation failed')), 'image/png');
  });
}
