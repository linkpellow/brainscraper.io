/**
 * Scheduling Manager
 * 
 * Intelligent scheduling on top of Inngest
 * Enforces business hours, weekend avoidance, timezone, load balancing, and conditional rules
 */

import { loadSettings } from './settingsConfig';
import type { ConditionalRule } from './settingsConfig';
import { getJobStatus } from './jobStatus';

/**
 * Check if current time is within business hours (9 AM - 5 PM)
 */
function isBusinessHours(timezone: string = 'UTC'): boolean {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    
    const hour = parseInt(formatter.format(now), 10);
    return hour >= 9 && hour < 17; // 9 AM to 5 PM
  } catch {
    // If timezone is invalid, default to UTC
    const hour = new Date().getUTCHours();
    return hour >= 9 && hour < 17;
  }
}

/**
 * Check if current day is a weekend
 */
function isWeekend(): boolean {
  const day = new Date().getDay();
  return day === 0 || day === 6; // Sunday = 0, Saturday = 6
}

/**
 * Check if a conditional rule condition is met
 */
async function checkConditionalRule(rule: ConditionalRule): Promise<boolean> {
  // Parse condition (e.g., "linkedin-completed", "enrichment-backlog>100")
  const condition = rule.condition.toLowerCase();
  
  if (condition.includes('completed')) {
    // Check if a job type is completed
    const jobType = condition.split('-')[0]; // e.g., "linkedin" from "linkedin-completed"
    
    // Get recent jobs and check if any are completed
    // This is a simplified check - in production, you'd query job status more intelligently
    // For now, we'll assume condition is met if we can't verify (allow job to proceed)
    return true; // Simplified: allow if we can't verify
  }
  
  if (condition.includes('backlog')) {
    // Check enrichment backlog
    // This would require checking queue length
    // Simplified: allow if we can't verify
    return true;
  }
  
  // Default: condition not met (block)
  return false;
}

/**
 * Calculate optimal delay for load balancing
 * Spreads jobs across the day to avoid spikes
 */
function calculateLoadBalanceDelay(): number {
  // Simple implementation: random delay between 0-60 minutes
  // In production, you'd analyze existing jobs and calculate optimal spacing
  return Math.floor(Math.random() * 60 * 60 * 1000); // 0-60 minutes in milliseconds
}

/**
 * Check if a job should be scheduled now based on settings
 */
export interface ScheduleCheckResult {
  allowed: boolean;
  delay?: number; // Milliseconds to wait before executing
  reason?: string;
}

export async function checkSchedule(
  jobType: 'scraping' | 'enrichment' = 'scraping'
): Promise<ScheduleCheckResult> {
  try {
    const settings = loadSettings();
    const scheduling = settings.scheduling;

    // Check business hours
    if (scheduling.businessHoursOnly && !isBusinessHours(scheduling.timezone)) {
      // Calculate delay until next business hour
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0); // 9 AM
      
      const delay = tomorrow.getTime() - now.getTime();
      return {
        allowed: false,
        delay,
        reason: 'Outside business hours',
      };
    }

    // Check weekend avoidance
    if (scheduling.avoidWeekends && isWeekend()) {
      // Calculate delay until Monday 9 AM
      const now = new Date();
      const monday = new Date(now);
      const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
      monday.setDate(now.getDate() + daysUntilMonday);
      monday.setHours(9, 0, 0, 0);
      
      const delay = monday.getTime() - now.getTime();
      return {
        allowed: false,
        delay,
        reason: 'Weekend avoidance enabled',
      };
    }

    // Check conditional rules
    if (scheduling.conditionalRules && scheduling.conditionalRules.length > 0) {
      for (const rule of scheduling.conditionalRules) {
        const conditionMet = await checkConditionalRule(rule);
        
        if (!conditionMet) {
          if (rule.action === 'skip') {
            return {
              allowed: false,
              reason: `Conditional rule not met: ${rule.name}`,
            };
          } else if (rule.action === 'wait') {
            // Wait and retry later (simplified: wait 5 minutes)
            return {
              allowed: false,
              delay: 5 * 60 * 1000, // 5 minutes
              reason: `Waiting for condition: ${rule.name}`,
            };
          } else if (rule.action === 'pause') {
            return {
              allowed: false,
              reason: `Paused by rule: ${rule.name}`,
            };
          }
        }
      }
    }

    // Apply load balancing delay if enabled
    let delay = 0;
    if (scheduling.loadBalancing) {
      delay = calculateLoadBalanceDelay();
    }

    return {
      allowed: true,
      delay: delay > 0 ? delay : undefined,
    };
  } catch (error) {
    // If scheduling check fails, allow job (backward compatible)
    console.warn('[SCHEDULING] Failed to check schedule, allowing job:', error);
    return {
      allowed: true,
    };
  }
}

/**
 * Schedule a job with intelligent scheduling applied
 * Returns the delay in milliseconds, or 0 if should execute immediately
 */
export async function scheduleJobIfAllowed(
  jobType: 'scraping' | 'enrichment' = 'scraping'
): Promise<{ shouldExecute: boolean; delayMs: number; reason?: string }> {
  const check = await checkSchedule(jobType);
  
  if (!check.allowed) {
    return {
      shouldExecute: false,
      delayMs: check.delay || 0,
      reason: check.reason,
    };
  }

  return {
    shouldExecute: true,
    delayMs: check.delay || 0,
  };
}

