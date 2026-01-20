/**
 * Biological Movement Engine — Human-like mouse physics for Electron-based automation.
 *
 * Implements:
 * - WindMouse: gravity, wind, friction; overshoot & corrective slide (5%, 2–5px, 30–60ms).
 * - Micro-tremors: 8–12 Hz sub-pixel sine (0.08–0.26 px).
 * - Saccadic suppression: 2–4 ms micro-pauses during high-velocity ballistic moves.
 * - Natural scroll: 10–15 micro-bursts (2–5 px), Gaussian inter-burst delays.
 * - SessionFatigue: linear scaling of wind and delay mu with action count.
 *
 * Designed for WebContents.sendInputEvent so events are treated as native.
 */

// ---------------------------------------------------------------------------
// IInputSink — matches Electron WebContents for sendInputEvent + executeJavaScript
// ---------------------------------------------------------------------------

export type MouseMoveEvent = { type: 'mouseMove'; x: number; y: number };
export type MouseButtonEvent = { type: 'mouseDown' | 'mouseUp'; x: number; y: number; button?: string };
export type MouseWheelEvent = { type: 'mouseWheel'; x: number; y: number; deltaX?: number; deltaY?: number };

export type InputEvent = MouseMoveEvent | MouseButtonEvent | MouseWheelEvent;

export interface IInputSink {
  sendInputEvent(e: InputEvent): void;
  executeJavaScript<T>(script: string): Promise<T>;
}

/** Task 4: Context jitter — vary JS execution before automated click to evade static-environment checks. */
export async function contextJitter(sink: IInputSink): Promise<void> {
  const scripts = [
    'void (document.title || "").length',
    'void (window.getComputedStyle(document.body || document.documentElement).fontFamily || "").length',
  ];
  const s = scripts[Math.floor(Math.random() * scripts.length)];
  await sink.executeJavaScript(s).catch(() => {});
}

/** Idle micro-hover: 1–2 low-displacement moves during API wait to mimic human fidgeting. */
export async function idleMicroHover(
  sink: IInputSink,
  center: { x: number; y: number },
  opts?: { count?: number; intervalMs?: [number, number]; displacementPx?: [number, number]; rng?: () => number }
): Promise<void> {
  const rng = opts?.rng ?? (() => Math.random());
  const count = opts?.count ?? (rng() > 0.5 ? 1 : 2);
  const [iLo, iHi] = opts?.intervalMs ?? [200, 400];
  const [dLo, dHi] = opts?.displacementPx ?? [1, 4];
  let x = center.x;
  let y = center.y;
  for (let i = 0; i < count; i++) {
    const dx = (dLo + (dHi - dLo) * rng()) * (rng() > 0.5 ? 1 : -1);
    const dy = (dLo + (dHi - dLo) * rng()) * (rng() > 0.5 ? 1 : -1);
    x = Math.max(0, x + dx);
    y = Math.max(0, y + dy);
    sink.sendInputEvent({ type: 'mouseMove', x, y });
    if (i < count - 1) await new Promise((r) => setTimeout(r, iLo + (iHi - iLo) * rng()));
  }
}

/** Run idle jitter from (cx, cy). Convenience around idleMicroHover. */
export async function runIdleJitter(
  sink: IInputSink,
  cx: number,
  cy: number,
  opts?: { count?: number }
): Promise<void> {
  return idleMicroHover(sink, { x: cx, y: cy }, { ...opts, intervalMs: [180, 380], displacementPx: [1, 4] });
}

// ---------------------------------------------------------------------------
// SessionFatigue — scales wind and delay mu with action count
// ---------------------------------------------------------------------------

export class SessionFatigue {
  private actionCount = 0;
  /** Linear factor: windScale = 1 + fatigueWindRate * min(actionCount, cap). */
  private readonly fatigueWindRate: number;
  /** Linear factor: delayMuScale = 1 + fatigueDelayRate * min(actionCount, cap). */
  private readonly fatigueDelayRate: number;
  private readonly cap: number;

  private readonly sessionStartMs: number;

  constructor(opts?: { fatigueWindRate?: number; fatigueDelayRate?: number; cap?: number; sessionStartMs?: number }) {
    this.fatigueWindRate = opts?.fatigueWindRate ?? 0.015;
    this.fatigueDelayRate = opts?.fatigueDelayRate ?? 0.02;
    this.cap = opts?.cap ?? 60;
    this.sessionStartMs = opts?.sessionStartMs ?? Date.now();
  }

  recordAction(): void {
    this.actionCount++;
  }

  /** After 15 min, add a small time-based scale (movement slower, more jitter). */
  private getTimeScale(): number {
    const elapsed = Date.now() - this.sessionStartMs;
    if (elapsed < 15 * 60 * 1000) return 1;
    return 1 + 0.05 * Math.min(1, (elapsed - 15 * 60 * 1000) / (15 * 60 * 1000));
  }

  getWindScale(): number {
    const n = Math.min(this.actionCount, this.cap);
    return (1 + this.fatigueWindRate * n) * this.getTimeScale();
  }

  getDelayMuScale(): number {
    const n = Math.min(this.actionCount, this.cap);
    return (1 + this.fatigueDelayRate * n) * this.getTimeScale();
  }

  getActionCount(): number {
    return this.actionCount;
  }
}

// ---------------------------------------------------------------------------
// Helpers: PRNG, Gaussian, sleep
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller: sample from N(mu, sigma). */
function gaussian(mu: number, sigma: number, rng: () => number): number {
  const u1 = rng();
  const u2 = rng();
  if (u1 <= 0) return mu;
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mu + sigma * z;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// WindMouse physics: v_next = v_curr + (G·dist) + (W·noise) - (f·v_curr)
// ---------------------------------------------------------------------------

export type WindMouseParams = {
  G?: number;   // gravity
  W?: number;   // wind magnitude (base)
  f?: number;   // friction
  dt?: number;  // timestep (affects step size)
  stepMs?: number; // ms per physics step (before fatigue)
  arriveThresh?: number;
  maxSteps?: number;
};

const DEFAULT_WIND: WindMouseParams = {
  G: 0.18,
  W: 0.42,
  f: 0.92,
  dt: 1,
  stepMs: 10,
  arriveThresh: 0.5,
  maxSteps: 200,
};

// ---------------------------------------------------------------------------
// Micro-tremors: 8–12 Hz, amplitude 0.08–0.26 px (anti-bot criterion)
// ---------------------------------------------------------------------------

export const TREMOR_AMP_PX = { min: 0.08, max: 0.26 } as const;

function getTremorOffset(tMs: number, rng: () => number): { dx: number; dy: number } {
  const freq = 8 + 4 * rng();           // 8–12 Hz
  const amp = TREMOR_AMP_PX.min + (TREMOR_AMP_PX.max - TREMOR_AMP_PX.min) * rng();
  const phaseY = (Math.PI / 4) * (2 * rng() - 1);
  const dx = amp * Math.sin((2 * Math.PI * freq * tMs) / 1000);
  const dy = amp * Math.sin((2 * Math.PI * freq * tMs) / 1000 + phaseY);
  return { dx, dy };
}

// ---------------------------------------------------------------------------
// Saccadic suppression: 2–4 ms pause when |v| is high
// ---------------------------------------------------------------------------

const SACCADIC_VEL_THRESH = 2.8;
const SACCADIC_PROB = 0.12;

function shouldSaccadicPause(vx: number, vy: number, rng: () => number): boolean {
  const speed = Math.hypot(vx, vy);
  return speed > SACCADIC_VEL_THRESH && rng() < SACCADIC_PROB;
}

function saccadicPauseMs(rng: () => number): number {
  return 2 + 2 * rng(); // 2–4 ms
}

// ---------------------------------------------------------------------------
// HumanController
// ---------------------------------------------------------------------------

export type HumanControllerOpts = {
  input: IInputSink;
  /** RNG seed for reproducibility; omit for Date.now(). */
  seed?: number;
  wind?: WindMouseParams;
  fatigue?: SessionFatigue;
};

export class HumanController {
  private readonly input: IInputSink;
  private readonly rng: () => number;
  private readonly wind: Required<WindMouseParams>;
  private readonly fatigue: SessionFatigue;

  /** Last known cursor position (viewport). Updated after moveTo and after click's move. */
  private lastX = 0;
  private lastY = 0;
  private lastInitialized = false;

  /** Elapsed ms for tremor phase (monotonic across moves). */
  private tMs = 0;

  constructor(opts: HumanControllerOpts) {
    this.input = opts.input;
    this.rng = mulberry32(opts.seed ?? (Date.now() & 0x7fff_ffff));
    this.wind = { ...DEFAULT_WIND, ...opts.wind } as Required<WindMouseParams>;
    this.fatigue = opts.fatigue ?? new SessionFatigue();
  }

  /** Set the current cursor position when it is known (e.g. after focus or a prior move). */
  setCursor(x: number, y: number): void {
    this.lastX = x;
    this.lastY = y;
    this.lastInitialized = true;
  }

  /**
   * Move the cursor to (x, y) using WindMouse physics, micro-tremors, saccadic
   * suppression, and 5% overshoot+correction. Sends native mouseMove events.
   */
  async moveTo(x: number, y: number): Promise<void> {
    this.fatigue.recordAction();

    let sx = this.lastX;
    let sy = this.lastY;
    if (!this.lastInitialized) {
      sx = x;
      sy = y;
      this.lastInitialized = true;
    }

    const { G, W, f, dt, arriveThresh, maxSteps } = this.wind;
    const windScale = this.fatigue.getWindScale();
    const delayMuScale = this.fatigue.getDelayMuScale();
    const stepMs = Math.round(this.wind.stepMs * delayMuScale);
    const Ws = W * windScale;

    let vx = 0;
    let vy = 0;
    let px = sx;
    let py = sy;
    const tx = x;
    const ty = y;
    let steps = 0;
    let arrived = false;
    let didOvershoot = false;

    // —— WindMouse loop ——
    while (steps < maxSteps) {
      const dx = tx - px;
      const dy = ty - py;
      const dist = Math.hypot(dx, dy);

      if (dist < arriveThresh) {
        arrived = true;
        // 5% overshoot: go 2–5 px past in movement direction, then corrective slide (30–60 ms)
        if (!didOvershoot && this.rng() < 0.05) {
          didOvershoot = true;
          const over = 2 + 3 * this.rng();
          const nv = Math.hypot(vx, vy) || 1;
          const ux = vx / nv;
          const uy = vy / nv;
          px = tx + ux * over;
          py = ty + uy * over;
          vx *= 0.3;
          vy *= 0.3;
          const correctiveMs = 30 + 30 * this.rng();
          const correctiveSteps = Math.max(4, Math.round(correctiveMs / (stepMs * 0.7)));
          const fc = 0.88;
          const Gc = 0.35;
          for (let i = 0; i < correctiveSteps; i++) {
            const cdx = tx - px;
            const cdy = ty - py;
            vx = vx + Gc * cdx - fc * vx;
            vy = vy + Gc * cdy - fc * vy;
            px += vx * dt;
            py += vy * dt;
            const tremor = getTremorOffset(this.tMs, this.rng);
            const ox = clamp(px + tremor.dx, 0, 1e6);
            const oy = clamp(py + tremor.dy, 0, 1e6);
            this.input.sendInputEvent({ type: 'mouseMove', x: ox, y: oy });
            this.tMs += stepMs;
            await delay(stepMs);
          }
          this.input.sendInputEvent({ type: 'mouseMove', x: tx, y: ty });
        } else {
          this.input.sendInputEvent({ type: 'mouseMove', x: tx, y: ty });
        }
        break;
      }

      // v_next = v_curr + (G·dist) + (W·noise) - (f·v_curr)
      const nx = (this.rng() - 0.5) * 2;
      const ny = (this.rng() - 0.5) * 2;
      vx = vx + G * dx + Ws * nx - f * vx;
      vy = vy + G * dy + Ws * ny - f * vy;
      px += vx * dt;
      py += vy * dt;

      const tremor = getTremorOffset(this.tMs, this.rng);
      const outX = clamp(px + tremor.dx, 0, 1e6);
      const outY = clamp(py + tremor.dy, 0, 1e6);
      this.input.sendInputEvent({ type: 'mouseMove', x: outX, y: outY });

      this.tMs += stepMs;
      await delay(stepMs);

      if (shouldSaccadicPause(vx, vy, this.rng)) {
        const pause = saccadicPauseMs(this.rng);
        await delay(pause);
        this.tMs += pause;
      }
      steps++;
    }

    if (!arrived) {
      // Final snap to target
      this.input.sendInputEvent({ type: 'mouseMove', x: tx, y: ty });
      this.lastX = tx;
      this.lastY = ty;
      return;
    }

    this.lastX = tx;
    this.lastY = ty;
  }

  /**
   * Resolve selector to a viewport point, move there, then send mouseDown + mouseUp
   * so the event is handled as a native click.
   */
  async click(selector: string): Promise<void> {
    this.fatigue.recordAction();
    await contextJitter(this.input);

    const script = `
      (function(sel) {
        var e = document.querySelector(sel);
        if (!e) return null;
        var r = e.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return null;
        var x = r.left + r.width/2  + (Math.random()-0.5) * Math.min(4, r.width/4);
        var y = r.top  + r.height/2 + (Math.random()-0.5) * Math.min(4, r.height/4);
        return { x: x, y: y };
      })(${JSON.stringify(selector)})
    `;

    const pt = await this.input.executeJavaScript<{ x: number; y: number } | null>(script);
    if (pt == null) {
      throw new Error(`HumanController.click: element not found for selector "${selector}"`);
    }

    await this.moveTo(pt.x, pt.y);

    const x = this.lastX;
    const y = this.lastY;

    this.input.sendInputEvent({ type: 'mouseDown', x, y, button: 'left' });
    await delay( clamp(gaussian(12, 6, this.rng), 4, 35) );
    this.input.sendInputEvent({ type: 'mouseUp', x, y, button: 'left' });
  }

  /**
   * Human-like scroll: 10–15 micro-bursts of 2–5 px each, Gaussian inter-burst delays.
   * Positive `pixels` = scroll down (content moves up, deltaY negative).
   */
  async naturalScroll(pixels: number): Promise<void> {
    this.fatigue.recordAction();

    const total = Math.abs(pixels);
    const sign = pixels >= 0 ? -1 : 1; // positive pixels => deltaY negative
    const delayMuScale = this.fatigue.getDelayMuScale();

    let scrolled = 0;
    const rng = this.rng;

    while (scrolled < total) {
      const numBursts = Math.floor(10 + 6 * rng()); // 10–15
      let burstSum = 0;
      const bursts: number[] = [];
      for (let i = 0; i < numBursts; i++) {
        const b = 2 + 3 * rng(); // 2–5
        bursts.push(b);
        burstSum += b;
      }

      for (let i = 0; i < bursts.length && scrolled < total; i++) {
        const b = Math.min(bursts[i], total - scrolled);
        const deltaY = sign * b;
        this.input.sendInputEvent({
          type: 'mouseWheel',
          x: this.lastX,
          y: this.lastY,
          deltaY,
        });

        scrolled += b;

        const mu = 18 * delayMuScale;
        const sigma = 6;
        const d = clamp(gaussian(mu, sigma, rng), 4, 80);
        await delay(d);
      }
    }
  }

  /** Alias for naturalScroll. */
  async humanScroll(pixels: number): Promise<void> {
    return this.naturalScroll(pixels);
  }
}
