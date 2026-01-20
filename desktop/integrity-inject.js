/**
 * Gap 2: Snapshot-Aware Integrity Check (lightweight JS heuristic).
 * Injected on each did-finish-load. Hashes a few Function/Array primitives.
 * If these are ever hooked (e.g. by stealth automation), the hash will change.
 * PostMessages INTEGRITY_HASH to preload for IPC to main.
 *
 * For a full Snapshot-Aware C++ module that hashes V8 heap, see:
 * docs/GAP2-HEAP-INTEGRITY-DESIGN.md
 */
(function () {
  if (window.__integrityLoaded) return;
  window.__integrityLoaded = true;

  function simpleHash(s) {
    if (typeof s !== 'string') return '0';
    var h = 0;
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) - h) + s.charCodeAt(i) | 0;
    }
    return (h >>> 0).toString(16);
  }

  var parts = [];
  try { parts.push(('' + Array.prototype.push).slice(0, 200)); } catch (e) {}
  try { parts.push(('' + Object.keys).slice(0, 200)); } catch (e) {}
  try { parts.push(('' + Function.prototype.apply).slice(0, 200)); } catch (e) {}
  try { parts.push(('' + document.createElement).slice(0, 150)); } catch (e) {}
  var h = simpleHash(parts.join('|'));
  window.postMessage({ type: 'INTEGRITY_HASH', payload: { hash: h, ts: Date.now() } }, '*');
})();
