export function screens(ids) {
  const elements = new Map(ids.map((id) => [id, document.getElementById(id)]));
  let current = null;

  function show(id) {
    if (!elements.has(id) || !elements.get(id)) throw new Error(`Unknown screen: ${id}`);
    elements.forEach((element, key) => {
      element.hidden = key !== id;
      element.setAttribute('aria-hidden', String(key !== id));
    });
    current = id;
    return elements.get(id);
  }

  return { show, get current() { return current; } };
}

export function shake(strength = 1) {
  const target = document.documentElement;
  const px = Math.max(1, Math.min(18, strength * 8));
  if (typeof target.animate === 'function') {
    target.animate([
      { transform: 'translate3d(0,0,0)' },
      { transform: `translate3d(${-px}px,${px * 0.35}px,0)` },
      { transform: `translate3d(${px}px,${-px * 0.2}px,0)` },
      { transform: 'translate3d(0,0,0)' },
    ], { duration: 220, easing: 'ease-out' });
  }
}

export function toast(msg) {
  let element = document.getElementById('app-toast');
  if (!element) {
    element = document.createElement('div');
    element.id = 'app-toast';
    element.setAttribute('role', 'status');
    element.setAttribute('aria-live', 'polite');
    Object.assign(element.style, {
      position: 'fixed', left: '50%', bottom: '24px', zIndex: '9999',
      transform: 'translateX(-50%)', padding: '10px 16px', borderRadius: '999px',
      color: '#fff', background: 'rgba(4,15,26,.92)', font: '600 14px system-ui',
      opacity: '0', transition: 'opacity .18s ease', pointerEvents: 'none',
    });
    document.body.append(element);
  }
  element.textContent = msg;
  element.style.opacity = '1';
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { element.style.opacity = '0'; }, 2200);
}

export function showVersion(version) {
  let element = document.getElementById('app-version');
  if (!element) {
    element = document.createElement('div');
    element.id = 'app-version';
    Object.assign(element.style, {
      position: 'fixed', top: 'env(safe-area-inset-top, 0)', right: '8px',
      zIndex: '9999', padding: '4px 7px', borderRadius: '0 0 8px 8px',
      color: 'rgba(255,255,255,.7)', background: 'rgba(0,0,0,.35)',
      font: '11px ui-monospace, SFMono-Regular, Menlo, monospace',
    });
    document.body.append(element);
  }
  element.textContent = `ver ${version}`;
}
