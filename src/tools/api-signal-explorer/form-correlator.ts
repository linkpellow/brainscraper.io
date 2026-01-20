/**
 * Form Correlator - Maps DOM elements to Network requests
 * Used for Mode #1: Full Map (Legacy Forms)
 * 
 * @module form-correlator
 * @description Provides utilities to correlate DOM interactions with network traffic
 * for legacy form-based applications (ASP.NET, PHP, etc.)
 * 
 * @example
 * ```typescript
 * import { generateButtonMap, extractFormState } from './form-correlator';
 * 
 * const formState = extractFormState(htmlString);
 * const buttonMap = generateButtonMap(domSnapshots, networkEvents);
 * ```
 */

/**
 * Represents an interactive DOM element (button, input, select, etc.)
 */
export type FormElement = {
  type: 'button' | 'submit' | 'input' | 'select' | 'radio' | 'checkbox';
  id: string;
  name?: string;
  value?: string;
  onclick?: string;
  xpath?: string;
  text?: string;
};

export type FormState = {
  viewstate?: string;
  viewstateGenerator?: string;
  eventValidation?: string;
  eventTarget?: string;
  eventArgument?: string;
  customFields: Record<string, string>;
};

export type FormActionMap = {
  element: FormElement;
  triggerPattern: string; // e.g., "__doPostBack('btnCalculate','')"
  expectedEndpoint?: string;
  formState?: FormState;
  timestamp?: number;
};

/**
 * Represents a captured DOM element in the tree structure
 */
export type DOMElement = {
  tag: string;
  id: string | null;
  classes: string[];
  attributes: Record<string, string>;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
    visible: boolean;
    inViewport: boolean;
  };
  text?: string;
  children?: DOMElement[];
};

/**
 * Complete DOM snapshot captured at a specific point in time
 */
export type DOMSnapshot = {
  id: string;
  timestamp: number;
  url: string;
  html: string;
  elements: DOMElement[];
  formState?: FormState;
  interactions?: FormElement[];
  scrollPosition?: { x: number; y: number };
  viewport?: { width: number; height: number };
};

/**
 * Network request associated with a form interaction
 */
export type NetworkRequest = {
  method: string;
  url: string;
  path: string;
  timestamp: number;
  payload?: string;
  headers?: Record<string, string>;
  status?: number;
  responseTime?: number;
};

/**
 * Result of correlating a DOM element with network traffic
 */
export type CorrelationResult = {
  element: FormElement;
  networkRequest?: NetworkRequest;
  confidence: number; // 0-1 (1 = perfect match)
  timeDeltaMs: number;
  matchReasons: string[]; // Why this correlation was made
};

/**
 * Extract form state from DOM snapshot (VIEWSTATE, EVENTVALIDATION, etc.)
 */
export function extractFormState(html: string): FormState {
  const formState: FormState = {
    customFields: {}
  };

  // Extract __VIEWSTATE
  const viewstateMatch = html.match(/name="__VIEWSTATE"[^>]*value="([^"]*)"/);
  if (viewstateMatch) {
    formState.viewstate = viewstateMatch[1];
  }

  // Extract __VIEWSTATEGENERATOR
  const viewstateGenMatch = html.match(/name="__VIEWSTATEGENERATOR"[^>]*value="([^"]*)"/);
  if (viewstateGenMatch) {
    formState.viewstateGenerator = viewstateGenMatch[1];
  }

  // Extract __EVENTVALIDATION
  const eventValMatch = html.match(/name="__EVENTVALIDATION"[^>]*value="([^"]*)"/);
  if (eventValMatch) {
    formState.eventValidation = eventValMatch[1];
  }

  // Extract __EVENTTARGET
  const eventTargetMatch = html.match(/name="__EVENTTARGET"[^>]*value="([^"]*)"/);
  if (eventTargetMatch) {
    formState.eventTarget = eventTargetMatch[1];
  }

  // Extract __EVENTARGUMENT
  const eventArgMatch = html.match(/name="__EVENTARGUMENT"[^>]*value="([^"]*)"/);
  if (eventArgMatch) {
    formState.eventArgument = eventArgMatch[1];
  }

  // Extract any other hidden fields
  const hiddenFields = html.matchAll(/name="([^"]*)"[^>]*type="hidden"[^>]*value="([^"]*)"/g);
  for (const match of hiddenFields) {
    const fieldName = match[1];
    const fieldValue = match[2];
    if (!fieldName.startsWith('__')) {
      formState.customFields[fieldName] = fieldValue;
    }
  }

  return formState;
}

/**
 * Extract all interactive elements from DOM snapshot
 */
export function extractInteractiveElements(html: string): FormElement[] {
  const elements: FormElement[] = [];

  // Extract buttons
  const buttons = html.matchAll(/<(input|button)[^>]*type="(button|submit)"[^>]*>/gi);
  for (const match of buttons) {
    const fullTag = match[0];
    const idMatch = fullTag.match(/id="([^"]*)"/);
    const nameMatch = fullTag.match(/name="([^"]*)"/);
    const valueMatch = fullTag.match(/value="([^"]*)"/);
    const onclickMatch = fullTag.match(/onclick="([^"]*)"/);

    if (idMatch || nameMatch) {
      elements.push({
        type: match[2].toLowerCase() as 'button' | 'submit',
        id: idMatch?.[1] || '',
        name: nameMatch?.[1],
        value: valueMatch?.[1],
        onclick: onclickMatch?.[1],
        text: valueMatch?.[1]
      });
    }
  }

  // Extract select dropdowns
  const selects = html.matchAll(/<select[^>]*>/gi);
  for (const match of selects) {
    const fullTag = match[0];
    const idMatch = fullTag.match(/id="([^"]*)"/);
    const nameMatch = fullTag.match(/name="([^"]*)"/);
    const onchangeMatch = fullTag.match(/onchange="([^"]*)"/);

    if (idMatch || nameMatch) {
      elements.push({
        type: 'select',
        id: idMatch?.[1] || '',
        name: nameMatch?.[1],
        onclick: onchangeMatch?.[1]
      });
    }
  }

  // Extract regular inputs
  const inputs = html.matchAll(/<input[^>]*type="(text|email|tel|number)"[^>]*>/gi);
  for (const match of inputs) {
    const fullTag = match[0];
    const idMatch = fullTag.match(/id="([^"]*)"/);
    const nameMatch = fullTag.match(/name="([^"]*)"/);

    if (idMatch || nameMatch) {
      elements.push({
        type: 'input',
        id: idMatch?.[1] || '',
        name: nameMatch?.[1]
      });
    }
  }

  return elements;
}

/**
 * Correlate DOM interactions with network requests
 * Matches elements to endpoints based on timing and patterns
 * 
 * @param domSnapshot - Single DOM snapshot to analyze
 * @param networkEvents - Array of network events to correlate
 * @param timeWindowMs - Time window for correlation (default: 2000ms)
 * @returns Array of correlation results sorted by confidence
 * 
 * @description
 * Uses multiple heuristics to match UI elements with network requests:
 * - Timing proximity (closer events = higher confidence)
 * - Element name/ID in request payload
 * - __doPostBack pattern matching
 * - HTTP method matching (POST for submits)
 * 
 * @example
 * ```typescript
 * const correlations = correlateInteractions(snapshot, events, 1500);
 * const bestMatch = correlations[0]; // Highest confidence
 * ```
 */
export function correlateInteractions(
  domSnapshot: DOMSnapshot,
  networkEvents: Array<{
    ts: number;
    method: string;
    url: string;
    path: string;
    reqBodyText?: string;
    reqHeaders?: Record<string, string>;
  }>,
  timeWindowMs: number = 2000
): CorrelationResult[] {
  const results: CorrelationResult[] = [];
  const elements = domSnapshot.interactions || extractInteractiveElements(domSnapshot.html);

  for (const element of elements) {
    // Find network events that occurred shortly after this snapshot
    const candidateEvents = networkEvents.filter(
      event => event.ts >= domSnapshot.timestamp && 
               event.ts <= domSnapshot.timestamp + timeWindowMs
    );

    if (candidateEvents.length === 0) continue;

    // Try to match element to network event
    for (const event of candidateEvents) {
      let confidence = 0;
      const matchReasons: string[] = [];
      const timeDelta = event.ts - domSnapshot.timestamp;

      // Check if element name appears in request body
      if (event.reqBodyText && element.name) {
        if (event.reqBodyText.includes(element.name)) {
          confidence += 0.4;
          matchReasons.push(`Element name '${element.name}' found in payload`);
        }
        if (element.id && event.reqBodyText.includes(element.id)) {
          confidence += 0.3;
          matchReasons.push(`Element ID '${element.id}' found in payload`);
        }
      }

      // Check for __doPostBack pattern (ASP.NET)
      if (element.onclick && element.onclick.includes('__doPostBack')) {
        const targetMatch = element.onclick.match(/__doPostBack\('([^']*)',/);
        if (targetMatch && event.reqBodyText) {
          if (event.reqBodyText.includes(`__EVENTTARGET=${targetMatch[1]}`)) {
            confidence += 0.5;
            matchReasons.push(`ASP.NET postback target matched: ${targetMatch[1]}`);
          }
        }
      }

      // POST requests are more likely to be form submissions
      if (event.method === 'POST' && element.type === 'submit') {
        confidence += 0.2;
        matchReasons.push('POST method + submit button');
      }

      // Closer in time = higher confidence
      if (timeDelta < 500) {
        confidence += 0.3;
        matchReasons.push(`Very close timing (${timeDelta}ms)`);
      } else if (timeDelta < 1000) {
        confidence += 0.2;
        matchReasons.push(`Close timing (${timeDelta}ms)`);
      } else if (timeDelta < 1500) {
        confidence += 0.1;
        matchReasons.push(`Near timing (${timeDelta}ms)`);
      }

      // Check for form ID match (if element is inside a form)
      if (event.reqBodyText && element.id) {
        const formMatch = event.reqBodyText.match(/form[_-]?id=([^&]+)/i);
        if (formMatch && element.id.includes(formMatch[1])) {
          confidence += 0.2;
          matchReasons.push(`Form ID matched: ${formMatch[1]}`);
        }
      }

      // Only add if we have reasonable confidence
      if (confidence >= 0.3) {
        results.push({
          element,
          networkRequest: {
            method: event.method,
            url: event.url,
            path: event.path,
            timestamp: event.ts,
            payload: event.reqBodyText,
            headers: event.reqHeaders
          },
          confidence: Math.min(confidence, 1.0),
          timeDeltaMs: timeDelta,
          matchReasons
        });
      }
    }
  }

  // Sort by confidence (highest first), then by time delta (closest first)
  return results.sort((a, b) => {
    if (Math.abs(a.confidence - b.confidence) < 0.05) {
      return a.timeDeltaMs - b.timeDeltaMs;
    }
    return b.confidence - a.confidence;
  });
}

/**
 * Build a complete form action map from DOM snapshot and network events
 */
export function buildFormActionMap(
  domSnapshot: DOMSnapshot,
  networkEvents: Array<{
    ts: number;
    method: string;
    url: string;
    path: string;
    reqBodyText?: string;
    reqHeaders?: Record<string, string>;
  }>
): FormActionMap[] {
  const formState = extractFormState(domSnapshot.html);
  const elements = extractInteractiveElements(domSnapshot.html);
  const correlations = correlateInteractions(domSnapshot, networkEvents);

  return correlations.map(corr => ({
    element: corr.element,
    triggerPattern: corr.element.onclick || `click:${corr.element.id}`,
    expectedEndpoint: corr.networkRequest?.path,
    formState,
    timestamp: corr.networkRequest?.timestamp
  }));
}

/**
 * Mapped button/element with correlation data
 */
export type MappedElement = {
  id: string;
  type: string;
  text?: string;
  endpoint?: string;
  method?: string;
  confidence?: number;
  formState?: FormState;
  xpath?: string;
  snapshotId?: string;
};

/**
 * Complete button map result
 */
export type ButtonMapResult = {
  totalButtons: number;
  mappedButtons: number;
  unmappedButtons: number;
  buttons: MappedElement[];
  coverage: number; // 0-1 (percentage mapped)
  generatedAt: number; // timestamp
  snapshotsAnalyzed: number;
  networkEventsAnalyzed: number;
};

/**
 * Generate a complete button map for UI display
 * 
 * @param domSnapshots - Array of captured DOM snapshots
 * @param networkEvents - Array of captured network events
 * @returns Complete button map with correlation data
 * 
 * @example
 * ```typescript
 * const buttonMap = generateButtonMap(snapshots, events);
 * console.log(`Mapped ${buttonMap.mappedButtons}/${buttonMap.totalButtons} elements`);
 * ```
 */
export function generateButtonMap(
  domSnapshots: DOMSnapshot[],
  networkEvents: Array<{
    ts: number;
    method: string;
    url: string;
    path: string;
    reqBodyText?: string;
    reqHeaders?: Record<string, string>;
  }>
): ButtonMapResult {
  const allMaps: FormActionMap[] = [];
  
  for (const snapshot of domSnapshots) {
    const maps = buildFormActionMap(snapshot, networkEvents);
    allMaps.push(...maps);
  }

  const buttonMap: MappedElement[] = allMaps.map(map => ({
    id: map.element.id || map.element.name || 'unknown',
    type: map.element.type,
    text: map.element.text || map.element.value,
    endpoint: map.expectedEndpoint,
    method: 'POST', // Most .ASPX forms use POST
    formState: map.formState,
    xpath: map.element.xpath,
    snapshotId: domSnapshots.find(s => s.timestamp === map.timestamp)?.id
  }));

  const mapped = buttonMap.filter(b => b.endpoint).length;
  const coverage = buttonMap.length > 0 ? mapped / buttonMap.length : 0;

  return {
    totalButtons: buttonMap.length,
    mappedButtons: mapped,
    unmappedButtons: buttonMap.length - mapped,
    buttons: buttonMap,
    coverage,
    generatedAt: Date.now(),
    snapshotsAnalyzed: domSnapshots.length,
    networkEventsAnalyzed: networkEvents.length
  };
}
