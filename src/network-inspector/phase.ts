/**
 * Phase classification engine
 * Automatically classifies network requests by lifecycle phase
 */

export type Phase = "page_load" | "interaction" | "background";

export type ActionWindow = {
  label: string; // e.g. "search_submit"
  startTs: number;
  endTs: number;
};

export type ActionWindowsConfig = {
  sessionStartTs: number;
  actions: ActionWindow[];
};

/**
 * Classify a network event's phase based on temporal patterns
 */
export function classifyPhase(
  eventTs: number,
  sessionStartTs: number,
  actionWindows: ActionWindow[] = []
): Phase {
  // Check if event falls within any action window
  for (const action of actionWindows) {
    if (eventTs >= action.startTs && eventTs <= action.endTs) {
      return "interaction";
    }
  }

  // If within 4 seconds of session start, consider it page_load
  const pageLoadWindow = sessionStartTs + 4000;
  if (eventTs <= pageLoadWindow) {
    return "page_load";
  }

  // Everything else is background
  return "background";
}

/**
 * Find matching action tag for an event timestamp
 */
export function findActionTag(
  eventTs: number,
  actionWindows: ActionWindow[] = []
): string | undefined {
  for (const action of actionWindows) {
    if (eventTs >= action.startTs && eventTs <= action.endTs) {
      return action.label;
    }
  }
  return undefined;
}

/**
 * Load action windows from JSON file
 */
export function loadActionWindows(filePath: string): ActionWindowsConfig {
  const fs = require('fs');
  const content = fs.readFileSync(filePath, 'utf-8');
  const config: ActionWindowsConfig = JSON.parse(content);

  // Validate structure
  if (typeof config.sessionStartTs !== 'number') {
    throw new Error('Invalid action windows config: sessionStartTs must be a number');
  }

  if (!Array.isArray(config.actions)) {
    throw new Error('Invalid action windows config: actions must be an array');
  }

  // Validate each action
  for (const action of config.actions) {
    if (!action.label || typeof action.label !== 'string') {
      throw new Error('Invalid action: label must be a string');
    }
    if (typeof action.startTs !== 'number' || typeof action.endTs !== 'number') {
      throw new Error('Invalid action: startTs and endTs must be numbers');
    }
    if (action.startTs > action.endTs) {
      throw new Error('Invalid action: startTs must be <= endTs');
    }
  }

  return config;
}

/**
 * Detect polling loops in background phase events
 */
export function detectPollingLoop(
  events: Array<{ ts: number; phase?: Phase }>,
  minCount: number = 5,
  intervalTolerance: number = 0.15 // ±15%
): boolean {
  // Filter to background phase events
  const backgroundEvents = events.filter((e) => e.phase === 'background');
  
  if (backgroundEvents.length < minCount) {
    return false;
  }

  // Sort by timestamp
  const sorted = [...backgroundEvents].sort((a, b) => a.ts - b.ts);

  // Calculate intervals between consecutive events
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    intervals.push(sorted[i].ts - sorted[i - 1].ts);
  }

  if (intervals.length < minCount - 1) {
    return false;
  }

  // Calculate average interval
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

  // Check if intervals are consistent (within tolerance)
  const consistentCount = intervals.filter((interval) => {
    const ratio = interval / avgInterval;
    return ratio >= 1 - intervalTolerance && ratio <= 1 + intervalTolerance;
  }).length;

  // If most intervals are consistent, it's a polling loop
  const consistencyRatio = consistentCount / intervals.length;
  return consistencyRatio >= 0.7; // 70% of intervals must be consistent
}

/**
 * Calculate phase distribution for a group of events
 */
export function calculatePhaseDistribution(
  events: Array<{ phase?: Phase }>
): { page_load: number; interaction: number; background: number } {
  const distribution = {
    page_load: 0,
    interaction: 0,
    background: 0,
  };

  for (const event of events) {
    const phase = event.phase || 'background';
    if (phase in distribution) {
      distribution[phase as keyof typeof distribution]++;
    }
  }

  return distribution;
}
