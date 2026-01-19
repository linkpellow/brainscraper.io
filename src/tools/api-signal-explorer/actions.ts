/**
 * Action Event Model
 * 
 * Represents user actions that may trigger network requests.
 */

export type ActionType =
  | "click"
  | "type"
  | "navigate"
  | "submit"
  | "mark_window"; // mobile/manual

export type ActionEvent = {
  id: string;
  ts: number;
  type: ActionType;
  label?: string; // optional UI name, e.g. "Clicked Search Button"
  meta?: {
    url?: string;
    selector?: string;     // for browser mode if available
    textLen?: number;     // for type (length only, not content)
    key?: string;         // key pressed, optional
    durationMs?: number;  // for mark_window
  };
};

/**
 * Create a new action event
 */
export function createActionEvent(
  type: ActionType,
  ts: number,
  label?: string,
  meta?: ActionEvent['meta']
): ActionEvent {
  return {
    id: `action_${ts}_${Math.random().toString(36).substring(7)}`,
    ts,
    type,
    label,
    meta,
  };
}

/**
 * Generate a label for an action based on its type and meta
 */
export function generateActionLabel(action: ActionEvent): string {
  if (action.label) return action.label;

  switch (action.type) {
    case 'click':
      if (action.meta?.selector) {
        const shortSelector = action.meta.selector.length > 50
          ? action.meta.selector.substring(0, 50) + '...'
          : action.meta.selector;
        return `Clicked ${shortSelector}`;
      }
      return 'Click';
    case 'type':
      if (action.meta?.textLen) {
        return `Typed ${action.meta.textLen} characters`;
      }
      return 'Type';
    case 'navigate':
      if (action.meta?.url) {
        try {
          const url = new URL(action.meta.url);
          return `Navigated to ${url.hostname}${url.pathname}`;
        } catch {
          return `Navigated to ${action.meta.url}`;
        }
      }
      return 'Navigate';
    case 'submit':
      return 'Submit Form';
    case 'mark_window':
      const duration = action.meta?.durationMs || 3000;
      return `Interaction Window (${(duration / 1000).toFixed(1)}s)`;
    default:
      return 'Action';
  }
}
