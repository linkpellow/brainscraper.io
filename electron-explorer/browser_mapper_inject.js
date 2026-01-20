/**
 * Injected into the left (proxied) browser on each did-finish-load.
 * Runs in page context: hover outline, click -> XPath/CSS -> postMessage.
 * Preload listens for 'explorer-action-signal' and forwards to main via IPC.
 */
(function () {
  if (window.__explorerMapperLoaded) return;
  window.__explorerMapperLoaded = true;

  function getXPath(el) {
    if (!el || !el.ownerDocument) return '';
    if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id)) {
      var id = document.getElementById(el.id);
      if (id === el) return '//*[@id="' + el.id + '"]';
    }
    var segments = [];
    for (; el && el.nodeType === 1; el = el.parentNode) {
      var tag = el.tagName.toLowerCase();
      var i = 1;
      var sib = el.previousSibling;
      while (sib) {
        if (sib.nodeType === 1 && sib.tagName === el.tagName) i++;
        sib = sib.previousSibling;
      }
      var part = i > 1 ? tag + '[' + i + ']' : tag;
      segments.unshift(part);
    }
    return '/' + segments.join('/');
  }

  function getCSSSelector(el) {
    if (!el || !el.ownerDocument) return '';
    if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id)) {
      if (document.getElementById(el.id) === el) return '#' + el.id;
    }
    var parts = [];
    for (; el && el.nodeType === 1; el = el.parentNode) {
      var sel = el.tagName.toLowerCase();
      if (el.className && typeof el.className === 'string') {
        var c = el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2);
        if (c.length) sel += '.' + c.join('.');
      }
      var sibs = el.parentNode ? [].filter.call(el.parentNode.children, function (n) { return n.tagName === el.tagName; }) : [];
      if (sibs.length > 1) {
        var idx = sibs.indexOf(el) + 1;
        sel += ':nth-of-type(' + idx + ')';
      }
      parts.unshift(sel);
      if (sel.indexOf('#') !== -1) break;
    }
    return parts.join(' > ');
  }

  var currentOutline = null;

  function onMouseOver(e) {
    var el = e.target;
    if (!el || el.nodeType !== 1) return;
    if (currentOutline && currentOutline !== el) {
      currentOutline.style.outline = '';
    }
    currentOutline = el;
    el.style.outline = '2px solid #ff5757';
  }

  function onMouseOut(e) {
    if (currentOutline) {
      currentOutline.style.outline = '';
      currentOutline = null;
    }
  }

  function onClick(e) {
    var el = e.target;
    if (!el || el.nodeType !== 1) return;
    var payload = {
      type: 'click',
      xpath: getXPath(el),
      cssSelector: getCSSSelector(el),
      tagName: el.tagName ? el.tagName.toLowerCase() : '',
      href: (typeof el.href === 'string' ? el.href : null) || (el.getAttribute ? el.getAttribute('href') : null) || undefined,
      text: (el.textContent || '').trim().slice(0, 200) || undefined,
      timestamp: Date.now()
    };
    window.postMessage({ type: 'explorer-action-signal', payload: payload }, '*');
  }

  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('mouseout', onMouseOut, true);
  document.addEventListener('click', onClick, true);
})();
