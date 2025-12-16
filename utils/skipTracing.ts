/**
 * Client-side utility for calling the skip-tracing API
 * This calls our Next.js API route which securely handles the RapidAPI key
 */

export interface SkipTracingParams {
  email?: string;
  phone?: string;
}

export interface SkipTracingResponse {
  data?: unknown;
  raw?: string;
  error?: string;
}

/**
 * Search using email and/or phone number
 * @param params - Email and/or phone number
 * @returns Promise with skip-tracing results
 */
export async function searchSkipTracing(
  params: SkipTracingParams
): Promise<SkipTracingResponse> {
  try {
    const searchParams = new URLSearchParams();
    if (params.email) searchParams.append('email', params.email);
    if (params.phone) searchParams.append('phone', params.phone);

    const response = await fetch(`/api/skip-tracing?${searchParams.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch skip-tracing data');
    }

    return await response.json();
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Search using POST method (alternative to GET)
 */
export async function searchSkipTracingPost(
  params: SkipTracingParams
): Promise<SkipTracingResponse> {
  try {
    const response = await fetch('/api/skip-tracing', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch skip-tracing data');
    }

    return await response.json();
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

