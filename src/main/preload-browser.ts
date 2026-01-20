/**
 * Preload for the target browser (DOM Signal Interceptor + target-action bridge).
 *
 * - Clock jitter: +/- 2 µs on performance.now (Task 4).
 * - Listens for SIGNAL_DOM_ACTION_FORWARD from dom-signal-inject → ipcRenderer.send('SIGNAL_DOM_ACTION', payload).
 * - Listens for target-action-forward from dom-eye-inject → ipcRenderer.send('target-action', payload).
 * - Fallback: document click/mouseover on initial doc for target-action.
 */

const { ipcRenderer } = require('electron');

// --- Task 4: Clock jitter — +/- 2 µs on performance.now ---
(function () {
  const p = typeof performance !== 'undefined' ? performance : null;
  if (p && typeof p.now === 'function') {
    const orig = p.now.bind(p);
    (p as { now: () => number }).now = function now() {
      return orig() + (Math.random() - 0.5) * 0.004; // ±2 µs (0.004 ms)
    };
  }
})();

// --- Forward: SIGNAL_DOM_ACTION_FORWARD → SIGNAL_DOM_ACTION (Task 1) ---
window.addEventListener('message', (e: MessageEvent) => {
  if (e.data && e.data.type === 'SIGNAL_DOM_ACTION_FORWARD' && e.data.payload) {
    ipcRenderer.send('SIGNAL_DOM_ACTION', e.data.payload);
  }
  if (e.data && e.data.type === 'target-action-forward' && e.data.payload) {
    ipcRenderer.send('target-action', e.data.payload);
  }
});

// --- Fallback: target-action from preload document (initial doc only) ---
function getXPath(el: Element | null): string {
  if (!el || !el.ownerDocument) return '';
  if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id)) {
    const byId = el.ownerDocument.getElementById(el.id);
    if (byId === el) return '//*[@id="' + el.id + '"]';
  }
  const segments: string[] = [];
  let e: Element | null = el;
  while (e && e.nodeType === 1) {
    const tag = (e as Element).tagName.toLowerCase();
    let i = 1;
    let sib = e.previousSibling;
    while (sib) {
      if (sib.nodeType === 1 && (sib as Element).tagName === (e as Element).tagName) i++;
      sib = sib.previousSibling;
    }
    segments.unshift(i > 1 ? tag + '[' + i + ']' : tag);
    e = e.parentElement;
  }
  return '/' + segments.join('/');
}

function getCSSSelector(el: Element | null): string {
  if (!el || !el.ownerDocument) return '';
  if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id)) {
    if (el.ownerDocument.getElementById(el.id) === el) return '#' + el.id;
  }
  const parts: string[] = [];
  let e: Element | null = el;
  while (e && e.nodeType === 1) {
    let sel = (e as Element).tagName.toLowerCase();
    if (e.className && typeof e.className === 'string') {
      const c = e.className.trim().split(/\s+/).filter(Boolean).slice(0, 2);
      if (c.length) sel += '.' + c.join('.');
    }
    const parent = e.parentNode;
    if (parent) {
      const sibs = [].filter.call(parent.children, (n: Element) => n.tagName === (e as Element).tagName) as Element[];
      if (sibs.length > 1) {
        const idx = sibs.indexOf(e as Element) + 1;
        sel += ':nth-of-type(' + idx + ')';
      }
    }
    parts.unshift(sel);
    if (sel.indexOf('#') !== -1) break;
    e = e.parentElement;
  }
  return parts.join(' > ');
}

function sendTargetAction(type: string, el: Element | null): void {
  if (!el || el.nodeType !== 1) return;
  ipcRenderer.send('target-action', { type, selector: getCSSSelector(el), xpath: getXPath(el), timestamp: Date.now() });
}

document.addEventListener('click', (e: MouseEvent) => {
  sendTargetAction('click', e.target instanceof Element ? e.target : null);
}, true);
document.addEventListener('mouseover', (e: MouseEvent) => {
  sendTargetAction('mouseover', e.target instanceof Element ? e.target : null);
}, true);
