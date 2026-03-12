'use client';

import { useEffect, useRef } from 'react';

type Node = { x: number; y: number };
type Edge = { points: Node[]; layer: 0 | 1 | 2 };
type Pulse = { edgeIndex: number; t: number; speed: number; glyph: '*' | ':' | '·'; layer: 0 | 1 | 2 };

const TARGET_FPS = 12;
const MAX_COLS = 190;
const MAX_ROWS = 78;
const MIN_COLS = 84;
const MIN_ROWS = 38;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function edgeGlyph(a: Node, b: Node): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx > ady * 1.5) return '-';
  if (ady > adx * 1.5) return '|';
  return dx * dy >= 0 ? '\\' : '/';
}

function createGrid(cols: number, rows: number): string[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ' '));
}

function drawChar(grid: string[][], x: number, y: number, glyph: string) {
  if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) return;
  const existing = grid[y][x];
  if (existing !== ' ' && existing !== glyph) {
    grid[y][x] = '+';
    return;
  }
  grid[y][x] = glyph;
}

function linePoints(a: Node, b: Node, jitterSeed: number): Node[] {
  const rng = mulberry32(jitterSeed);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps === 0) return [a];
  const points: Node[] = [];
  const phase = rng() * Math.PI * 2;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const wave = Math.sin(t * Math.PI * 2 + phase) * 0.55;
    const x = Math.round(a.x + dx * t + (Math.abs(dx) > Math.abs(dy) ? 0 : wave));
    const y = Math.round(a.y + dy * t + (Math.abs(dy) > Math.abs(dx) ? 0 : wave));
    points.push({ x, y });
  }
  return points;
}

function buildAsciiNetwork(cols: number, rows: number, seed: number) {
  const rng = mulberry32(seed);
  const nodeTarget = clamp(Math.floor((cols * rows) / 360), 26, 68);
  const minNodeDist = clamp(Math.floor(Math.min(cols, rows) * 0.11), 5, 10);
  const maxEdgeDist = Math.floor(Math.min(cols, rows) * 0.58);

  const nodes: Node[] = [];
  const tries = nodeTarget * 40;
  for (let i = 0; i < tries && nodes.length < nodeTarget; i++) {
    const x = 4 + Math.floor(rng() * (cols - 8));
    const y = 3 + Math.floor(rng() * (rows - 6));
    const tooClose = nodes.some((n) => {
      const dx = n.x - x;
      const dy = n.y - y;
      return dx * dx + dy * dy < minNodeDist * minNodeDist;
    });
    if (!tooClose) nodes.push({ x, y });
  }

  const edgeKeys = new Set<string>();
  const edges: Edge[] = [];
  const degrees = Array.from({ length: nodes.length }, () => 0);

  nodes.forEach((node, i) => {
    const nearest = nodes
      .map((other, j) => ({ j, d: Math.hypot(node.x - other.x, node.y - other.y) }))
      .filter((entry) => entry.j !== i && entry.d < maxEdgeDist)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);

    for (const entry of nearest) {
      const a = Math.min(i, entry.j);
      const b = Math.max(i, entry.j);
      const key = `${a}:${b}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      degrees[a] += 1;
      degrees[b] += 1;

      const points = linePoints(nodes[a], nodes[b], seed + a * 101 + b * 307);
      edges.push({
        points,
        layer: (Math.floor(rng() * 3) as 0 | 1 | 2),
      });
    }
  });

  const layers = [createGrid(cols, rows), createGrid(cols, rows), createGrid(cols, rows)] as const;

  edges.forEach((edge) => {
    for (let i = 0; i < edge.points.length - 1; i++) {
      const p = edge.points[i];
      const n = edge.points[i + 1];
      drawChar(layers[edge.layer], p.x, p.y, edgeGlyph(p, n));
    }
  });

  nodes.forEach((node, i) => {
    const degree = degrees[i];
    const glyph = degree >= 4 ? '@' : degree >= 2 ? 'O' : 'o';
    drawChar(layers[2], node.x, node.y, glyph);
  });

  return { layers, edges };
}

function paintLayerToCanvas(layer: string[][], cell: number): HTMLCanvasElement {
  const rows = layer.length;
  const cols = layer[0].length;
  const canvas = document.createElement('canvas');
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.font = `${cell}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
  ctx.textBaseline = 'top';
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const ch = layer[y][x];
      if (ch !== ' ') ctx.fillText(ch, x * cell, y * cell);
    }
  }
  return canvas;
}

export default function AsciiNeuronBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let raf = 0;
    let mounted = true;
    let lastFrame = 0;
    let cols = 0;
    let rows = 0;
    let cell = 10;
    let layerCanvases: HTMLCanvasElement[] = [];
    let edges: Edge[] = [];
    let pulses: Pulse[] = [];
    let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.6);

    const layerColors = ['rgba(95, 12, 28, 0.52)', 'rgba(163, 22, 56, 0.45)', 'rgba(255, 136, 86, 0.4)'];
    const pulseColors = ['rgba(148, 21, 46, 0.92)', 'rgba(216, 58, 84, 0.95)', 'rgba(255, 155, 97, 0.98)'];
    const interval = 1000 / (reducedMotion ? 2 : TARGET_FPS);

    const resize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      cell = width < 900 ? 10 : 11;
      cols = clamp(Math.floor(width / cell), MIN_COLS, MAX_COLS);
      rows = clamp(Math.floor(height / cell), MIN_ROWS, MAX_ROWS);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const network = buildAsciiNetwork(cols, rows, 1337 + cols * 7 + rows * 13);
      edges = network.edges;

      layerCanvases = network.layers.map((layer, i) => {
        const layerCanvas = paintLayerToCanvas(layer, cell);
        const layerCtx = layerCanvas.getContext('2d');
        if (layerCtx) {
          layerCtx.globalCompositeOperation = 'source-in';
          layerCtx.fillStyle = layerColors[i];
          layerCtx.fillRect(0, 0, layerCanvas.width, layerCanvas.height);
        }
        return layerCanvas;
      });

      const rng = mulberry32(90210 + cols * 5 + rows * 11);
      const pulseCount = reducedMotion ? 0 : clamp(Math.floor(edges.length / 6), 16, 34);
      pulses = Array.from({ length: pulseCount }, () => ({
        edgeIndex: Math.floor(rng() * edges.length),
        t: rng(),
        speed: 0.00015 + rng() * 0.00045,
        glyph: rng() < 0.33 ? '*' : rng() < 0.66 ? ':' : '·',
        layer: (Math.floor(rng() * 3) as 0 | 1 | 2),
      }));
    };

    const getPointOnEdge = (edge: Edge, t: number): Node => {
      if (edge.points.length === 0) return { x: 0, y: 0 };
      if (edge.points.length === 1) return edge.points[0];
      const scaled = t * (edge.points.length - 1);
      const i = Math.floor(scaled);
      const frac = scaled - i;
      const a = edge.points[i];
      const b = edge.points[Math.min(edge.points.length - 1, i + 1)];
      return {
        x: a.x + (b.x - a.x) * frac,
        y: a.y + (b.y - a.y) * frac,
      };
    };

    const render = (now: number) => {
      if (!mounted) return;
      if (document.hidden) {
        raf = window.requestAnimationFrame(render);
        return;
      }
      if (now - lastFrame < interval) {
        raf = window.requestAnimationFrame(render);
        return;
      }
      const delta = now - lastFrame;
      lastFrame = now;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        raf = window.requestAnimationFrame(render);
        return;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = window.innerWidth;
      const h = window.innerHeight;

      const bg = ctx.createRadialGradient(w * 0.82, -h * 0.14, 20, w * 0.5, h * 0.5, w * 0.9);
      bg.addColorStop(0, 'rgba(255, 132, 88, 0.15)');
      bg.addColorStop(0.32, 'rgba(145, 25, 53, 0.16)');
      bg.addColorStop(0.68, 'rgba(89, 12, 30, 0.22)');
      bg.addColorStop(1, 'rgba(8, 2, 3, 1)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const drift = now * 0.00009;
      layerCanvases.forEach((layerCanvas, i) => {
        const x = Math.sin(drift * (1 + i * 0.18) + i * 0.5) * (5 + i * 2) - (layerCanvas.width - w) * 0.5;
        const y = Math.cos(drift * (1.2 + i * 0.15) + i * 0.4) * (4 + i * 2) - (layerCanvas.height - h) * 0.5;
        ctx.globalAlpha = 0.92 - i * 0.08;
        ctx.drawImage(layerCanvas, x, y);
      });

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 12;
      ctx.textBaseline = 'top';
      ctx.font = `${cell}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;

      for (const pulse of pulses) {
        const edge = edges[pulse.edgeIndex];
        if (!edge) continue;
        pulse.t += pulse.speed * delta;
        if (pulse.t >= 1) {
          pulse.t = 0;
          pulse.edgeIndex = (pulse.edgeIndex + 1 + (pulse.layer % 3)) % edges.length;
        }
        const point = getPointOnEdge(edge, pulse.t);
        const px = point.x * cell - (cols * cell - w) * 0.5;
        const py = point.y * cell - (rows * cell - h) * 0.5;
        ctx.fillStyle = pulseColors[pulse.layer];
        ctx.shadowColor = pulseColors[pulse.layer];
        ctx.fillText(pulse.glyph, px, py);
      }
      ctx.shadowBlur = 0;

      const vignette = ctx.createRadialGradient(w * 0.5, h * 0.5, h * 0.22, w * 0.5, h * 0.5, w * 0.75);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.38)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);

      raf = window.requestAnimationFrame(render);
    };

    const motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotionChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      resize();
    };

    motionMedia.addEventListener('change', onMotionChange);
    window.addEventListener('resize', resize);
    resize();
    raf = window.requestAnimationFrame(render);

    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      motionMedia.removeEventListener('change', onMotionChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
}
