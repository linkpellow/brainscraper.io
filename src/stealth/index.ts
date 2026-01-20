/**
 * Stealth / biological interaction layer for automation.
 */

export { HumanController, SessionFatigue, contextJitter, idleMicroHover, runIdleJitter } from './physics-mouse';
export type {
  WindMouseParams,
  IInputSink,
  InputEvent,
  MouseMoveEvent,
  MouseButtonEvent,
  MouseWheelEvent,
} from './physics-mouse';
export { TREMOR_AMP_PX } from './physics-mouse';
