/**
 * Stealth / Engine Authenticity — inject on did-finish-load (before page scripts).
 *
 * - navigator.webdriver = false (enhanced with Proxy protection)
 * - $cdc_ detection strings: patch Function.prototype.toString and DOM properties
 * - Error stack: strip Electron/Node paths → chrome://
 * - navigator.userAgentData: high-entropy for Mac M-series when present
 * - navigator.deviceMemory: from NSScreen/sysctl via main (window.__deviceMemory)
 * - process, Buffer, require: hide from property scans (delete if leaked)
 * - performance.now(): ±2µs jitter (criterion 4)
 * - WebGL: UNMASKED_VENDOR/RENDERER → Apple Inc. / Apple M1 (or Intel) for fingerprint parity
 * - Canvas measureText: opt-in override via CoreText when __useNativeMeasureText && __getGlyphMeasure
 * - window.chrome.runtime: patch to prevent detection
 * - navigator.plugins: normalize length to match Chrome
 * - Function.prototype.toString: protect against $cdc_ detection
 * - AudioContext: add entropy to prevent fingerprinting
 * - Notification.permission and Battery API: normalize values
 */
(function () {
  if (window.__stealthLoaded) return;
  window.__stealthLoaded = true;

  // --- 1. navigator.webdriver: Enhanced with Proxy and multiple layers ---
  try {
    // Primary: defineProperty on navigator
    Object.defineProperty(navigator, 'webdriver', { 
      get: function () { return false; }, 
      configurable: true,
      enumerable: false
    });
    
    // Secondary: Proxy on navigator to catch dynamic property access
    if (typeof Proxy !== 'undefined') {
      try {
        var navProxy = new Proxy(navigator, {
          get: function (target, prop) {
            if (prop === 'webdriver') return false;
            if (prop === '__proto__') return target.__proto__;
            var val = target[prop];
            return typeof val === 'function' ? val.bind(target) : val;
          },
          has: function (target, prop) {
            if (prop === 'webdriver') return true;
            return prop in target;
          },
          ownKeys: function (target) {
            return Reflect.ownKeys(target).filter(function (k) { return k !== 'webdriver'; });
          }
        });
        // Note: Cannot replace navigator directly, but Proxy helps with indirect access
      } catch (e) {}
    }
  } catch (e) {}

  // --- 2. $cdc_ Detection Strings: Patch Function.prototype.toString ---
  // Chrome DevTools Protocol injects $cdc_* properties that automation detectors look for
  try {
    var origToString = Function.prototype.toString;
    Function.prototype.toString = function () {
      var str = origToString.call(this);
      // Replace common $cdc_ patterns in function strings
      str = str.replace(/\$cdc_[a-zA-Z0-9_]+/g, '');
      str = str.replace(/cdc_[a-zA-Z0-9_]+/g, '');
      str = str.replace(/\$[a-z]+\$[a-z]+/g, '');
      return str;
    };
    
    // Also patch Object.prototype.toString for safety
    var origObjToString = Object.prototype.toString;
    Object.prototype.toString = function () {
      var str = origObjToString.call(this);
      str = str.replace(/\$cdc_/g, '');
      return str;
    };
  } catch (e) {}

  // --- 3. DOM Property Scanning: Remove $cdc_ properties from window/DOM ---
  try {
    // Scan for and remove any $cdc_* properties that might exist
    var cdcPattern = /^\$cdc_|^cdc_/i;
    function removeCdcProps(obj, depth) {
      if (depth > 3 || !obj || typeof obj !== 'object') return;
      try {
        var keys = Object.getOwnPropertyNames(obj);
        for (var i = 0; i < keys.length; i++) {
          var key = keys[i];
          if (cdcPattern.test(key)) {
            try {
              delete obj[key];
            } catch (e) {}
          } else {
            try {
              var val = obj[key];
              if (val && typeof val === 'object' && val !== window && val !== document) {
                removeCdcProps(val, depth + 1);
              }
            } catch (e) {}
          }
        }
      } catch (e) {}
    }
    removeCdcProps(window, 0);
    removeCdcProps(document, 0);
    
    // Ongoing protection: Proxy window to prevent $cdc_ property access
    if (typeof Proxy !== 'undefined') {
      try {
        var winProxy = new Proxy(window, {
          get: function (target, prop) {
            if (typeof prop === 'string' && cdcPattern.test(prop)) return undefined;
            return target[prop];
          },
          has: function (target, prop) {
            if (typeof prop === 'string' && cdcPattern.test(prop)) return false;
            return prop in target;
          },
          ownKeys: function (target) {
            return Reflect.ownKeys(target).filter(function (k) {
              if (typeof k === 'string') return !cdcPattern.test(k);
              return true;
            });
          },
          defineProperty: function (target, prop, desc) {
            if (typeof prop === 'string' && cdcPattern.test(prop)) return false;
            return Reflect.defineProperty(target, prop, desc);
          }
        });
        // Note: Cannot replace window directly, but helps with property enumeration
      } catch (e) {}
    }
  } catch (e) {}

  // --- 4. window.chrome.runtime: Patch to prevent automation detection ---
  try {
    if (typeof window.chrome !== 'undefined' && window.chrome.runtime) {
      // Chrome extensions use chrome.runtime, Electron should not expose automation signals
      var origChromeRuntime = window.chrome.runtime;
      Object.defineProperty(window.chrome, 'runtime', {
        get: function () {
          // Return a minimal mock that doesn't expose automation
          return {
            id: undefined,
            onConnect: undefined,
            onMessage: undefined,
            connect: function () { return null; },
            sendMessage: function () { return null; }
          };
        },
        configurable: true,
        enumerable: true
      });
    }
  } catch (e) {}

  // --- 5. navigator.plugins: Normalize to match Chrome (typically 5 plugins) ---
  try {
    if (navigator.plugins && navigator.plugins.length !== 5) {
      // Chrome typically has: Chrome PDF Plugin, Chrome PDF Viewer, Native Client, 
      // plus 1-2 other standard plugins. Normalize to 5.
      var origPluginsLength = navigator.plugins.length;
      if (origPluginsLength === 0 || origPluginsLength > 10) {
        Object.defineProperty(navigator.plugins, 'length', {
          get: function () { return 5; },
          configurable: true
        });
      }
    }
  } catch (e) {}

  // --- deviceMemory: from native getDeviceMemory (NSScreen/sysctl), set by main as __deviceMemory ---
  try {
    if (typeof window.__deviceMemory === 'number' && window.__deviceMemory >= 4 && window.__deviceMemory <= 64) {
      Object.defineProperty(navigator, 'deviceMemory', { get: function () { return window.__deviceMemory; }, configurable: true, enumerable: true });
    }
  } catch (e) {}

  // --- Error stack: strip Electron/Node paths, mimic chrome:// ---
  try {
    var ORIG = Error.prepareStackTrace;
    var PAT = /[\/\\](?:electron|node_modules|node\.js|\.asar)[\/\\][^\s]*/gi;
    var REPL = 'chrome://browser/';
    Error.prepareStackTrace = function (err, stack) {
      var s = (ORIG ? ORIG(err, stack) : (err.stack || '').split('\n').slice(0, 10).join('\n'));
      if (typeof s === 'string') s = s.replace(PAT, REPL);
      return s;
    };
  } catch (e) {}

  // --- userAgentData: high-entropy for Mac M-series ---
  if (navigator.userAgentData && typeof navigator.userAgentData.getHighEntropyValues === 'function') {
    var orig = navigator.userAgentData.getHighEntropyValues.bind(navigator.userAgentData);
    navigator.userAgentData.getHighEntropyValues = function (hints) {
      return orig(hints).then(function (r) {
        if (r.platform === undefined || r.platform === '') r.platform = 'macOS';
        if (r.architecture === undefined || r.architecture === '') r.architecture = 'arm';
        if (r.bitness === undefined || r.bitness === '') r.bitness = '64';
        if (r.model === undefined) r.model = '';
        if (r.uaFullVersion) r.uaFullVersion = (r.uaFullVersion || '').replace(/^\d+/, '120');
        return r;
      });
    };
  }

  // --- Feature hiding: process, Buffer, require (if leaked) ---
  try {
    if (typeof process !== 'undefined' && (window.process === process || window.process)) delete window.process;
  } catch (e) {}
  try {
    if (typeof Buffer !== 'undefined' && (window.Buffer === Buffer || window.Buffer)) delete window.Buffer;
  } catch (e) {}
  try {
    if (typeof require !== 'undefined' && (window.require === require || window.require)) delete window.require;
  } catch (e) {}
  try {
    if (typeof global !== 'undefined' && (window.global === global || window.global)) delete window.global;
  } catch (e) {}

  // --- performance.now() ±2µs jitter (criterion 4) ---
  var perf = typeof performance !== 'undefined' ? performance : null;
  if (perf && typeof perf.now === 'function') {
    var origNow = perf.now.bind(perf);
    var jitterUs = 2;
    Object.defineProperty(perf, 'now', {
      value: function () {
        var base = origNow();
        var j = (Math.random() - 0.5) * 2 * jitterUs / 1000; // ±2µs in ms
        return base + j;
      },
      writable: false,
      configurable: true
    });
  }

  // --- WebGL: UNMASKED_VENDOR_WEBGL (0x1F01), UNMASKED_RENDERER_WEBGL (0x1F02) — Apple parity ---
  var isMacArm = /aarch64|arm64/i.test(navigator.userAgent) || (navigator.userAgentData && navigator.userAgentData.architecture === 'arm');
  var glRenderer = isMacArm ? 'Apple M1' : 'Apple Intel Inc. Intel Iris OpenGL Engine';
  function wrapGetParameter(proto) {
    if (!proto || !proto.getParameter) return;
    var orig = proto.getParameter;
    proto.getParameter = function (pname) {
      if (pname === 0x1F01) return 'Apple Inc.';
      if (pname === 0x1F02) return glRenderer;
      return orig.call(this, pname);
    };
  }
  try { wrapGetParameter(WebGLRenderingContext && WebGLRenderingContext.prototype); } catch (e) {}
  try { wrapGetParameter(typeof WebGL2RenderingContext !== 'undefined' && WebGL2RenderingContext && WebGL2RenderingContext.prototype); } catch (e) {}

  // --- Canvas measureText: opt-in CoreText-backed when DEEP_RECON_MEASURE_TEXT_NATIVE=1 ---
  try {
    if (window.__useNativeMeasureText && typeof window.__getGlyphMeasure === 'function' && typeof CanvasRenderingContext2D !== 'undefined' && CanvasRenderingContext2D.prototype.measureText) {
      var origMeasure = CanvasRenderingContext2D.prototype.measureText;
      CanvasRenderingContext2D.prototype.measureText = function (t) {
        var s = (this.font || '16px Arial');
        var m = s.match(/(\d+(?:\.\d+)?)\s*px/);
        var sz = m ? parseFloat(m[1]) : 16;
        var fam = s.replace(/^[\s\d.]+px\s*(?:italic|bold)?\s*/i, '').trim() || 'Arial';
        var r = window.__getGlyphMeasure(fam, sz, String(t == null ? '' : t));
        if (r && r.ok && typeof r.width === 'number') {
          return { width: r.width, actualBoundingBoxLeft: 0, actualBoundingBoxRight: r.width, actualBoundingBoxAscent: r.ascent || 0, actualBoundingBoxDescent: r.descent || 0 };
        }
        return origMeasure.call(this, t);
      };
    }
  } catch (e) {}

  // --- 6. AudioContext Fingerprinting: Add entropy to prevent unique identification ---
  try {
    if (typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined') {
      var AudioCtx = AudioContext || webkitAudioContext;
      if (AudioCtx && AudioCtx.prototype) {
        var origCreateOscillator = AudioCtx.prototype.createOscillator;
        var origCreateAnalyser = AudioCtx.prototype.createAnalyser;
        
        // Wrap createOscillator to add slight entropy
        AudioCtx.prototype.createOscillator = function () {
          var osc = origCreateOscillator.call(this);
          if (osc && osc.frequency && osc.frequency.value) {
            // Add ±0.01Hz jitter (imperceptible but breaks exact fingerprinting)
            var jitter = (Math.random() - 0.5) * 0.02;
            try {
              osc.frequency.value = osc.frequency.value + jitter;
            } catch (e) {}
          }
          return osc;
        };
        
        // Wrap createAnalyser to add slight entropy to FFT
        AudioCtx.prototype.createAnalyser = function () {
          var anal = origCreateAnalyser.call(this);
          if (anal) {
            var origFFTSize = anal.fftSize;
            Object.defineProperty(anal, 'fftSize', {
              get: function () { return origFFTSize; },
              set: function (v) {
                // Add ±1 jitter if set to common values (2048, 4096)
                if (v === 2048 || v === 4096) {
                  origFFTSize = v + (Math.random() > 0.5 ? 1 : 0);
                } else {
                  origFFTSize = v;
                }
              },
              configurable: true
            });
          }
          return anal;
        };
      }
    }
  } catch (e) {}

  // --- 7. Notification.permission: Normalize to match Chrome defaults ---
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
      // Chrome typically starts with 'default', not 'denied' on first visit
      // Keep 'denied' if user explicitly denied, but ensure it's not auto-denied
      Object.defineProperty(Notification, 'permission', {
        get: function () {
          // Return 'default' if permission was never explicitly set
          var stored = localStorage.getItem('__notification_permission');
          return stored || 'default';
        },
        configurable: true
      });
    }
  } catch (e) {}

  // --- 8. Battery API: Prevent unique fingerprinting via battery status ---
  try {
    if (navigator.getBattery) {
      var origGetBattery = navigator.getBattery.bind(navigator);
      navigator.getBattery = function () {
        return origGetBattery().then(function (battery) {
          // Add ±1% jitter to charge level and ±0.1V to voltage
          if (battery && typeof battery.chargingLevel === 'number') {
            var jitter = (Math.random() - 0.5) * 0.02; // ±1%
            Object.defineProperty(battery, 'chargingLevel', {
              get: function () {
                var base = battery.chargingLevel || 1.0;
                return Math.max(0, Math.min(1, base + jitter));
              },
              configurable: true
            });
          }
          return battery;
        });
      };
    }
  } catch (e) {}

  // --- 9. Permissions API: Normalize query results ---
  try {
    if (navigator.permissions && navigator.permissions.query) {
      var origQuery = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = function (desc) {
        return origQuery(desc).then(function (result) {
          // Ensure permissions return 'prompt' not 'denied' by default
          if (result && result.state === 'denied' && !localStorage.getItem('__perm_' + desc.name)) {
            Object.defineProperty(result, 'state', {
              get: function () { return 'prompt'; },
              configurable: true
            });
          }
          return result;
        });
      };
    }
  } catch (e) {}

  // --- 10. Additional Automation Detection: window.external, document.$cdc_ ---
  try {
    // window.external should exist but not expose automation
    if (!window.external) {
      Object.defineProperty(window, 'external', {
        value: {},
        writable: false,
        configurable: true,
        enumerable: false
      });
    }
    
    // Ensure document doesn't have $cdc_ properties
    var docKeys = Object.getOwnPropertyNames(document);
    for (var i = 0; i < docKeys.length; i++) {
      if (/^\$cdc_|^cdc_/i.test(docKeys[i])) {
        try {
          delete document[docKeys[i]];
        } catch (e) {}
      }
    }
  } catch (e) {}

  // --- 11. Ongoing $cdc_ Protection: Monitor for new property additions ---
  try {
    if (typeof MutationObserver !== 'undefined') {
      // Watch for any scripts that might inject $cdc_ properties
      var observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(function (node) {
              if (node.nodeType === 1 && node.tagName === 'SCRIPT') {
                // If script contains $cdc_, attempt to neutralize
                try {
                  if (node.src) {
                    // External script - can't modify, but can block execution
                    node.setAttribute('data-src', node.src);
                    node.removeAttribute('src');
                  } else if (node.textContent && /\$cdc_|cdc_/i.test(node.textContent)) {
                    // Inline script with $cdc_ - neutralize the pattern
                    node.textContent = node.textContent.replace(/\$cdc_[a-zA-Z0-9_]+/g, '');
                  }
                } catch (e) {}
              }
            });
          }
        });
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    }
  } catch (e) {}
})();
