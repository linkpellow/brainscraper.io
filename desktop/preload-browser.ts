/**
 * Preload for the target browser WebContentsView. DOM Eye:
 * - Listens for postMessage 'target-action-forward' from the injected script and
 *   forwards to main via ipcRenderer.send('target-action', { type, selector, xpath, timestamp }).
 * - For the initial document, adds global click and mouseover listeners that
 *   generate XPath + CSS selector and send 'target-action'.
 */

const { ipcRenderer, contextBridge } = require('electron');

contextBridge.exposeInMainWorld('__getGlyphMeasure', (font: string, size: number, text: string) =>
  ipcRenderer.sendSync('get-glyph-measure', { font, size, text }));

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

function send(type: string, el: Element | null): void {
  if (!el || el.nodeType !== 1) return;
  ipcRenderer.send('target-action', {
    type,
    selector: getCSSSelector(el),
    xpath: getXPath(el),
    timestamp: Date.now(),
  });
}

// Forward from injected script (runs on every page load via did-finish-load)
window.addEventListener('message', (e: MessageEvent) => {
  if (e.data && e.data.type === 'target-action-forward' && e.data.payload) {
    ipcRenderer.send('target-action', e.data.payload);
  }
  if (e.data && e.data.type === 'SIGNAL_DOM_ACTION_FORWARD' && e.data.payload) {
    ipcRenderer.send('SIGNAL_DOM_ACTION', e.data.payload);
  }
  if (e.data && e.data.type === 'INTEGRITY_HASH' && e.data.payload) {
    ipcRenderer.send('integrity-hash', e.data.payload);
  }
  if (e.data && e.data.type === 'HIDDEN_DOM_DISCOVERY' && e.data.payload) {
    ipcRenderer.send('HIDDEN_DOM_DISCOVERY', e.data.payload);
  }
});

// Global click and mouseover on the initial document (preload runs before first load)
document.addEventListener('click', (e: MouseEvent) => {
  send('click', e.target instanceof Element ? e.target : null);
}, true);
document.addEventListener('mouseover', (e: MouseEvent) => {
  send('mouseover', e.target instanceof Element ? e.target : null);
}, true);
