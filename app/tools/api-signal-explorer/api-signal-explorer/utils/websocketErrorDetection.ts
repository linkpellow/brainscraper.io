/**
 * WebSocket Error Detection Utility
 * 
 * Provides production-ready detection of meaningless WebSocket errors.
 * WebSocket error events often contain empty objects {} or Event objects
 * with no meaningful error information, which should be silently ignored.
 */

/**
 * Check if a WebSocket error event is meaningful or should be ignored
 * 
 * @param error - The error object from WebSocket.onerror
 * @returns true if the error should be ignored (empty/meaningless), false if it's a real error
 */
export function isMeaninglessWebSocketError(error: Event | Error | any): boolean {
  if (!error) return true;
  
  // Check if it's an empty object
  if (typeof error === 'object') {
    const keys = Object.keys(error);
    const ownKeys = Object.getOwnPropertyNames(error);
    
    // Empty object check
    if (keys.length === 0 && ownKeys.length === 0) {
      return true;
    }
    
    // Check for objects that only have isTrusted: true (common in browser WebSocket errors)
    if (keys.length === 1 && ownKeys.length === 1 && (error as any).isTrusted === true) {
      return true;
    }
    
    // WebSocket Event object check
    // Event objects have standard properties but no meaningful error data
    if (error instanceof Event || (error.type === 'error' && error.target)) {
      // Check if it has meaningful error information
      const hasMessage = error.message && typeof error.message === 'string' && error.message.trim().length > 0;
      const hasCode = error.code !== undefined && error.code !== null && error.code !== 0 && error.code !== '';
      const hasReason = error.reason && typeof error.reason === 'string' && error.reason.trim().length > 0;
      const hasError = error.error && error.error !== null;
      
      // If it's an Event with no meaningful error data, it's meaningless
      if (!hasMessage && !hasCode && !hasReason && !hasError) {
        return true;
      }
    }
    
    // Check for common empty error patterns
    const errorMessage = error.message;
    const errorType = error.type;
    const errorCode = error.code;
    
    // If all error fields are empty/undefined/null, it's meaningless
    const hasTextInfo = 
      (errorMessage && typeof errorMessage === 'string' && errorMessage.trim().length > 0) ||
      (errorType && typeof errorType === 'string' && errorType.trim().length > 0);
    
    const hasErrorCode = errorCode !== undefined && errorCode !== null && errorCode !== 0 && errorCode !== '';
    
    if (!hasTextInfo && !hasErrorCode && !error.error) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if console.error arguments contain a meaningless WebSocket error
 * 
 * @param args - Arguments passed to console.error
 * @returns true if the error should be ignored
 */
export function shouldIgnoreConsoleError(args: any[]): boolean {
  if (!args || args.length === 0) return true;
  
  // Check for the specific pattern: "[BrowserSession] WebSocket error: {}"
  const hasWebSocketErrorMsg = args.some(arg => 
    typeof arg === 'string' && arg.includes('[BrowserSession] WebSocket error')
  );
  
  if (hasWebSocketErrorMsg) {
    // Check if there's an empty object in the args
    const hasEmptyObject = args.some(arg => 
      arg && typeof arg === 'object' && Object.keys(arg).length === 0
    );
    
    // If it's the WebSocket error message with an empty object, ignore it
    if (hasEmptyObject && args.length <= 2) {
      return true;
    }
    
    // Also check if any arg is a meaningless WebSocket error
    const hasMeaninglessError = args.some(arg => isMeaninglessWebSocketError(arg));
    if (hasMeaninglessError) {
      return true;
    }
  }
  
  // Check if any argument is a meaningless WebSocket error
  return args.some(arg => isMeaninglessWebSocketError(arg));
}
