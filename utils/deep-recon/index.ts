/**
 * Deep Recon — Binary & Memory Suite (utils)
 *
 * wasm-recon: no Electron deps. Intercept .wasm, wasm2wat, scan (endpoints, keys, crypto), JS stubs.
 *
 * Electron-only (use from desktop/ or import directly):
 * - heap-miner: WebContents, takeHeapSnapshot / Runtime.evaluate
 * - native-net: net, app, applyProtocolShadow
 * - integrity-shield: app, configureMacOSRendering, runIntegrityChecks
 */

export * from './wasm-recon';
