/**
 * Hidden DOM Discovery — find hidden inputs, data-* key-like values, inline-encoded keys.
 * PostMessage HIDDEN_DOM_DISCOVERY with array of { type, selector, valueSnippet, attr? }.
 * Criterion: at least 3 per run (audit asserts on count).
 */
(function () {
  if (window.__hiddenDomLoaded) return;
  window.__hiddenDomLoaded = true;

  function esc(s) { return (s || '').slice(0, 80); }
  function keyLike(v) {
    if (typeof v !== 'string' || v.length < 8) return false;
    return /^(eyJ|Bearer |[a-fA-F0-9]{16,})/i.test(v) || /token|key|secret|api[_-]?key|auth|password/i.test(v);
  }

  var out = [];

  // 1) Hidden inputs: type=hidden, or [hidden], or display:none / visibility:hidden
  try {
    var inps = document.querySelectorAll('input[type="hidden"], input[type="password"], [hidden]');
    for (var i = 0; i < inps.length; i++) {
      var el = inps[i];
      var n = (el.name || el.id || el.getAttribute('name') || el.getAttribute('id') || '');
      var v = (el.value || el.getAttribute('value') || '');
      out.push({ type: 'hidden_input', selector: (el.id ? '#' + el.id : el.tagName + '[name="' + n + '"]'), valueSnippet: esc(v || n), attr: n ? 'name=' + n : undefined });
    }
    var all = document.querySelectorAll('input, select, textarea');
    for (var j = 0; j < all.length; j++) {
      var e = all[j];
      if (out.some(function (o) { return o.selector === (e.id ? '#' + e.id : '') && o.type === 'hidden_input'; })) continue;
      var st = window.getComputedStyle ? window.getComputedStyle(e) : null;
      if (st && (st.display === 'none' || st.visibility === 'hidden' || (e.offsetParent == null && st.position !== 'fixed'))) {
        var name = e.name || e.id || e.getAttribute('name') || e.getAttribute('id') || '';
        out.push({ type: 'hidden_input', selector: e.id ? '#' + e.id : e.tagName + '[name="' + name + '"]', valueSnippet: esc(e.value || name), attr: name ? 'name=' + name : undefined });
      }
    }
  } catch (err) {}

  // 2) data-* with key-like value
  try {
    var nodes = document.querySelectorAll('[data-token],[data-key],[data-secret],[data-api-key],[data-auth],[data-csrf],[data-csrf-token]');
    for (var k = 0; k < nodes.length; k++) {
      var n = nodes[k];
      var attrs = n.attributes;
      for (var a = 0; a < attrs.length; a++) {
        var A = attrs[a];
        if (A.name.indexOf('data-') !== 0) continue;
        var val = A.value || '';
        if (keyLike(val) || val.length > 12) {
          out.push({ type: 'data_attr', selector: (n.id ? '#' + n.id : n.tagName + '[' + A.name + ']'), valueSnippet: esc(val), attr: A.name });
        }
      }
    }
  } catch (err) {}

  // 3) Inline script with key-like string
  try {
    var scripts = document.querySelectorAll('script:not([src])');
    for (var s = 0; s < scripts.length; s++) {
      var txt = (scripts[s].textContent || '');
      var m = txt.match(/(["'])(?:(?=(\\?))\2.)*?\1/g);
      if (m) {
        for (var p = 0; p < m.length; p++) {
          var v = m[p].slice(1, -1).replace(/\\./g, ' ');
          if (keyLike(v) || (v.length > 20 && /[a-f0-9]{16,}/i.test(v))) {
            out.push({ type: 'inline_script', selector: 'script[nr=' + s + ']', valueSnippet: esc(v), attr: 'inline' });
            break;
          }
        }
      }
    }
  } catch (err) {}

  if (out.length > 0) {
    window.postMessage({ type: 'HIDDEN_DOM_DISCOVERY', payload: out }, '*');
  }
})();
