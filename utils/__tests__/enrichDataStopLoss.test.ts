import { afterEach, describe, expect, it } from 'vitest';

import {
  evaluateStopLossTrigger,
  getStopLossConfig,
  wasChargeablePhoneDiscoveryAttempt,
  type EnrichmentResult,
} from '@/utils/enrichData';

describe('enrichment stop-loss controls', () => {
  const originalEnabled = process.env.ENRICH_STOP_LOSS_ENABLED;
  const originalEarlyAttempts = process.env.ENRICH_STOP_LOSS_EARLY_MIN_ATTEMPTS;
  const originalEarlyRate = process.env.ENRICH_STOP_LOSS_EARLY_MIN_PHONE_RECOVERY_RATE;
  const originalAttempts = process.env.ENRICH_STOP_LOSS_MIN_ATTEMPTS;
  const originalRate = process.env.ENRICH_STOP_LOSS_MIN_PHONE_RECOVERY_RATE;

  afterEach(() => {
    if (originalEnabled === undefined) delete process.env.ENRICH_STOP_LOSS_ENABLED;
    else process.env.ENRICH_STOP_LOSS_ENABLED = originalEnabled;
    if (originalEarlyAttempts === undefined) delete process.env.ENRICH_STOP_LOSS_EARLY_MIN_ATTEMPTS;
    else process.env.ENRICH_STOP_LOSS_EARLY_MIN_ATTEMPTS = originalEarlyAttempts;
    if (originalEarlyRate === undefined) delete process.env.ENRICH_STOP_LOSS_EARLY_MIN_PHONE_RECOVERY_RATE;
    else process.env.ENRICH_STOP_LOSS_EARLY_MIN_PHONE_RECOVERY_RATE = originalEarlyRate;
    if (originalAttempts === undefined) delete process.env.ENRICH_STOP_LOSS_MIN_ATTEMPTS;
    else process.env.ENRICH_STOP_LOSS_MIN_ATTEMPTS = originalAttempts;
    if (originalRate === undefined) delete process.env.ENRICH_STOP_LOSS_MIN_PHONE_RECOVERY_RATE;
    else process.env.ENRICH_STOP_LOSS_MIN_PHONE_RECOVERY_RATE = originalRate;
  });

  it('uses defaults and enables stop-loss when phone-discovery station is enabled', () => {
    delete process.env.ENRICH_STOP_LOSS_ENABLED;
    const config = getStopLossConfig(new Set(['linkedin', 'phone-discovery']));
    expect(config.enabled).toBe(true);
    expect(config.minAttempts).toBe(25);
    expect(config.minPhoneRecoveryRate).toBe(0.5);
  });

  it('disables stop-loss globally via env', () => {
    process.env.ENRICH_STOP_LOSS_ENABLED = 'false';
    const config = getStopLossConfig(new Set(['linkedin', 'phone-discovery']));
    expect(config.enabled).toBe(false);
  });

  it('treats blocked skip-tracing dispositions as non-chargeable', () => {
    const enrichment: EnrichmentResult = {
      skipTracingDisposition: 'no_location_skipped',
    };
    expect(
      wasChargeablePhoneDiscoveryAttempt({
        stations: new Set(['linkedin', 'phone-discovery']),
        hadValidPhoneBefore: false,
        enrichment,
      })
    ).toBe(false);
  });

  it('treats skip-tracing data as a chargeable phone-discovery attempt', () => {
    const enrichment: EnrichmentResult = {
      skipTracingDisposition: 'clear_match',
      skipTracingData: { PeopleDetails: [] },
    };
    expect(
      wasChargeablePhoneDiscoveryAttempt({
        stations: new Set(['linkedin', 'phone-discovery']),
        hadValidPhoneBefore: false,
        enrichment,
      })
    ).toBe(true);
  });

  it('triggers main stop-loss when recovery drops below threshold after minimum attempts', () => {
    const trigger = evaluateStopLossTrigger({
      config: {
        enabled: true,
        earlyMinAttempts: 12,
        earlyMinPhoneRecoveryRate: 0.2,
        minAttempts: 25,
        minPhoneRecoveryRate: 0.5,
      },
      attemptedChargeable: 25,
      recoveredChargeable: 8,
    });
    expect(trigger).not.toBeNull();
    expect(trigger?.reason).toContain('Stop-loss');
  });

  it('does not trigger before minimum attempts are reached', () => {
    const trigger = evaluateStopLossTrigger({
      config: {
        enabled: true,
        earlyMinAttempts: 12,
        earlyMinPhoneRecoveryRate: 0.2,
        minAttempts: 25,
        minPhoneRecoveryRate: 0.5,
      },
      attemptedChargeable: 10,
      recoveredChargeable: 0,
    });
    expect(trigger).toBeNull();
  });
});
