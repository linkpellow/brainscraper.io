/**
 * DOM Signal Interceptor — mousedown → XPath, CSS, metadata → SIGNAL_DOM_ACTION_FORWARD.
 * Injected on each did-finish-load. PostMessages to preload for IPC to main.
 */
(function () {
  if (window.__domSignalLoaded) return;
  window.__domSignalLoaded = true;

  function getXPath(el) {
    if (!el || !el.ownerDocument) return '';
    if (el.id && /^[a-zA-Z][\w-:.]*$/.test(el.id)) {
      try {
        var byId = el.ownerDocument.getElementById(el.id);
        if (byId === el) return '//*[@id="' + el.id.replace(/"/g, '\\"') + '"]';
      } catch (e) {}
    }
    var segments = [];
    for (; el && el.nodeType === 1; el = el.parentNode) {
      var tag = el.tagName ? el.tagName.toLowerCase() : '';
      var i = 1;
      var sib = el.previousSibling;
      while (sib) {
        if (sib.nodeType === 1 && sib.tagName === el.tagName) i++;
        sib = sib.previousSibling;
      }
      var part = i > 1 ? tag + '[' + i + ']' : tag;
      segments.unshift(part);
    }
    return '/' + (segments.length ? segments.join('/') : '*');
  }

  function getCSSSelector(el) {
    if (!el || !el.ownerDocument) return '';
    if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id)) {
      try {
        if (el.ownerDocument.getElementById(el.id) === el) {
          var esc = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape : function(s) { return s.replace(/([^\w-])/g, '\\$1'); };
          return '#' + esc(el.id);
        }
      } catch (e) {}
    }
    var parts = [];
    for (; el && el.nodeType === 1; el = el.parentNode) {
      var sel = (el.tagName || '').toLowerCase();
      if (el.className && typeof el.className === 'string') {
        var c = el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2);
        var esc = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape : function(s) { return (s || '').replace(/([^\w-])/g, '\\$1'); };
        for (var i = 0; i < c.length; i++) { sel += '.' + esc(c[i]); }
      }
      var parent = el.parentNode;
      if (parent) {
        var sibs = [].filter.call(parent.children, function (n) { return n.tagName === el.tagName; });
        if (sibs.length > 1) {
          var idx = sibs.indexOf(el) + 1;
          sel += ':nth-of-type(' + idx + ')';
        }
      }
      parts.unshift(sel);
      if (sel.indexOf('#') !== -1) break;
    }
    return parts.join(' > ');
  }

  function getVisibility(el) {
    if (!el || typeof window.getComputedStyle !== 'function') return null;
    try {
      var s = window.getComputedStyle(el);
      return {
        display: s ? s.display : null,
        visibility: s ? s.visibility : null,
        opacity: s ? s.opacity : null,
        offsetParent: el.offsetParent != null
      };
    } catch (e) { return null; }
  }

  function getRect(el) {
    if (!el || !el.getBoundingClientRect) return null;
    try {
      var r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    } catch (e) { return null; }
  }

  function onMousedown(e) {
    var el = e.target;
    if (!el || el.nodeType !== 1) return;
    var ts = Date.now();
    var text = (el.textContent || '').trim().slice(0, 500) || undefined;
    var id = (el.id && typeof el.id === 'string') ? el.id : undefined;
    var name = (el.getAttribute && el.getAttribute('name')) || undefined;
    var payload = {
      xpath: getXPath(el),
      selector: getCSSSelector(el),
      timestamp: ts,
      text: text,
      id: id,
      name: name,
      visibility: getVisibility(el),
      rect: getRect(el)
    };
    window.postMessage({ type: 'SIGNAL_DOM_ACTION_FORWARD', payload: payload }, '*');

    /* Gap 4: Intent-to-Execution Delay. Suppress the original so the request does not
       fire immediately; after 30–150ms (human-like) re-dispatch so the request is
       released with a realistic delay. */
    e.preventDefault();
    e.stopImmediatePropagation();
    var delay = 30 + Math.floor(Math.random() * 120);
    setTimeout(function () {
      try {
        if (!el || !el.dispatchEvent) return;
        var opts = { bubbles: true, cancelable: true, view: window, detail: 1, buttons: 1 };
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.click();
      } catch (err) { /* ignore */ }
    }, delay);
  }

  document.addEventListener('mousedown', onMousedown, true);
})();
