#!/usr/bin/env node
/**
 * Test Stealth Patches — Run this from terminal to verify patches work
 * 
 * Usage:
 *   npm run test:stealth
 *   OR
 *   electron desktop/test-stealth-patches.js
 * 
 * This script launches Electron, loads the stealth-inject.js script, and verifies
 * that stealth patches are working correctly.
 */

// Check if running under Electron
if (typeof require !== 'undefined') {
  try {
    var electron = require('electron');
    var app = electron.app;
    var BrowserWindow = electron.BrowserWindow;
  } catch (e) {
    console.error('Error: This script must be run with Electron, not Node.js.');
    console.error('Try: npm run test:stealth');
    console.error('Or: electron desktop/test-stealth-patches.js');
    process.exit(1);
  }
} else {
  console.error('Error: require is not available. This script must run in Electron.');
  process.exit(1);
}

const path = require('path');
const fs = require('fs');

let mainWindow = null;

function loadStealthScript() {
  const stealthPath = path.join(__dirname, 'stealth-inject.js');
  return fs.readFileSync(stealthPath, 'utf-8');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load a proper test page (file:// allows localStorage)
  const testPagePath = path.join(__dirname, 'test-stealth.html');
  mainWindow.loadFile(testPagePath);

  // Open DevTools automatically
  mainWindow.webContents.openDevTools();

  mainWindow.webContents.on('did-finish-load', () => {
    // Load stealth script first (same way main.ts does)
    const stealthScript = loadStealthScript();
    
    // Inject stealth script
    mainWindow.webContents.executeJavaScript(stealthScript).catch((err) => {
      console.error('Error loading stealth script:', err);
    });
    
    // Wait a moment for stealth patches to inject, then test
    setTimeout(() => {
      const testScript = `
        (function() {
          console.log('=== TESTING STEALTH PATCHES ===');
          
          try {
            var results = {};
            
            // Test 1: navigator.webdriver
            try {
              results.webdriver = navigator.webdriver === false ? '✅ PASS' : '❌ FAIL (got: ' + navigator.webdriver + ')';
            } catch (e) {
              results.webdriver = '❌ ERROR: ' + e.message;
            }
            
            // Test 2: $cdc_ in window
            try {
              var cdcProps = Object.keys(window).filter(function(k) { return /^\\$cdc_/.test(k); });
              results.cdcInWindow = cdcProps.length === 0 ? '✅ PASS' : '❌ FAIL (found: ' + cdcProps.join(', ') + ')';
            } catch (e) {
              results.cdcInWindow = '❌ ERROR: ' + e.message;
            }
            
            // Test 3: Function.toString clean
            try {
              var fnStr = Function.prototype.toString.call(function() {});
              results.functionToStringClean = !fnStr.includes('$cdc_') ? '✅ PASS' : '❌ FAIL';
            } catch (e) {
              results.functionToStringClean = '❌ ERROR: ' + e.message;
            }
            
            // Test 4: chrome.runtime.id
            try {
              var hasChromeRuntimeId = typeof window.chrome !== 'undefined' && 
                                       typeof window.chrome.runtime !== 'undefined' && 
                                       window.chrome.runtime.id !== undefined;
              results.chromeRuntimeId = !hasChromeRuntimeId ? '✅ PASS' : '❌ FAIL (got: ' + window.chrome.runtime.id + ')';
            } catch (e) {
              results.chromeRuntimeId = '❌ ERROR: ' + e.message;
            }
            
            // Test 5: plugins normalized
            try {
              var pluginLength = navigator.plugins.length;
              results.pluginsNormalized = pluginLength > 0 && pluginLength < 20 ? 
                '✅ PASS (length: ' + pluginLength + ')' : 
                '❌ FAIL (length: ' + pluginLength + ')';
            } catch (e) {
              results.pluginsNormalized = '❌ ERROR: ' + e.message;
            }
            
            // Test 6: Notification.permission (skip localStorage check)
            try {
              var notifPerm = Notification.permission;
              results.notificationPermission = ['default', 'granted'].indexOf(notifPerm) !== -1 ? 
                '✅ PASS (permission: ' + notifPerm + ')' : 
                '❌ FAIL (permission: ' + notifPerm + ')';
            } catch (e) {
              results.notificationPermission = '❌ ERROR: ' + e.message;
            }
            
            console.log('\\n=== RESULTS ===');
            Object.keys(results).forEach(function(test) {
              console.log(test + ':', results[test]);
            });
            console.log('===============\\n');
            
            var allPassed = Object.keys(results).every(function(key) {
              return results[key].indexOf('✅') !== -1;
            });
            var summary = allPassed ? '✅ All stealth patches are working!' : '❌ Some patches failed. Check results above.';
            console.log(summary);
            
            return {
              allPassed: allPassed,
              results: results,
              summary: summary
            };
          } catch (e) {
            console.error('Test error:', e);
            return {
              allPassed: false,
              error: e.message,
              results: {}
            };
          }
        })();
      `;
      
      mainWindow.webContents.executeJavaScript(testScript).then((testResult) => {
        console.log('\n=== TERMINAL OUTPUT ===');
        if (testResult && testResult.allPassed !== undefined) {
          console.log('Test completed. Results:', JSON.stringify(testResult, null, 2));
          console.log('\n' + testResult.summary);
          console.log('========================\n');
          
          // Exit with code 0 if all passed, 1 if failed
          process.exit(testResult.allPassed ? 0 : 1);
        } else {
          console.log('Tests completed. Check DevTools console for detailed results.');
          setTimeout(() => app.quit(), 5000);
        }
      }).catch((err) => {
        console.error('Error running tests:', err);
        app.quit();
        process.exit(1);
      });
    }, 500); // Wait 500ms for patches to load
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  
  app.on('activate', () => {
    if (mainWindow === null) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
