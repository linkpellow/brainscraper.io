/* @vitest-environment node */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getLocationId } from '@/utils/linkedinLocationDiscovery';
import { locationToFilter } from '@/utils/linkedinLocationIds';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('linkedin location discovery', () => {
  it('uses static state mappings before any external lookup', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await getLocationId('Bonita Springs, Florida', 'unused-key');

    expect(result).toEqual({
      locationId: '101318387',
      fullId: 'urn:li:fs_geo:101318387',
      source: 'static',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('converts state-containing location strings into stable REGION filters', () => {
    expect(locationToFilter('Bonita Springs, Florida')).toEqual({
      type: 'REGION',
      values: [
        {
          id: '101318387',
          text: 'Florida, United States',
          selectionType: 'INCLUDED',
        },
      ],
      selectedSubFilter: 50,
    });
  });
});
