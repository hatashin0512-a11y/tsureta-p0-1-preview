// @ts-check

import { screens, toast, showVersion } from './lib/ui.js?v=2';

/** @typedef {import('./types.js').ScreenId} ScreenId */

const VERSION = 'p0-2.0';
/** @type {ScreenId[]} */
const FLOW = ['title', 'region', 'conditions', 'point', 'cast', 'bite', 'fight', 'result', 'card'];
const view = screens(FLOW);
const state = {
  screen: /** @type {ScreenId} */ ('title'),
  region: '東京湾エリア',
  point: '夕凪堤防',
};

showVersion(VERSION);
show('title');

document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;

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
}

function updateSelections() {
  document.querySelectorAll('[data-selected-region]').forEach((element) => {
    element.textContent = state.region;
  });
  document.querySelectorAll('[data-selected-point]').forEach((element) => {
    element.textContent = state.point;
  });
}
