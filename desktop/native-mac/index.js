/**
 * Node wrapper for mac_fonts native addon.
 * On macOS: NSScreen backingScaleFactor, CoreText getGlyphMetrics, NSLocale, NSTimeZone, getDeviceMemory.
 * On other platforms or if addon fails to load: no-op stubs.
 */

let binding = null;
try {
  if (process.platform === 'darwin') {
    binding = require('./build/Release/mac_fonts.node');
  }
} catch (_) {}

function getBackingScaleFactor() {
  if (binding && typeof binding.getBackingScaleFactor === 'function') {
    return binding.getBackingScaleFactor();
  }
  return 2; // common Retina default when unavailable
}

function getGlyphMetrics(fontName, fontSize, text) {
  if (binding && typeof binding.getGlyphMetrics === 'function') {
    return binding.getGlyphMetrics(String(fontName), Number(fontSize), String(text));
  }
  return { width: 0, ok: false };
}

function getLocale() {
  if (binding && typeof binding.getLocale === 'function') {
    return binding.getLocale();
  }
  return 'en-US';
}

function getTimezone() {
  if (binding && typeof binding.getTimezone === 'function') {
    return binding.getTimezone();
  }
  return 'America/Los_Angeles';
}

function getDeviceMemory() {
  if (binding && typeof binding.getDeviceMemory === 'function') {
    return binding.getDeviceMemory();
  }
  return 8;
}

module.exports = {
  getBackingScaleFactor,
  getGlyphMetrics,
  getLocale,
  getTimezone,
  getDeviceMemory,
  available: !!binding,
};
