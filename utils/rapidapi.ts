/**
 * RapidAPI client utility using JavaScript fetch
 * 
 * For RapidAPI setup instructions:
 * - target: "server" (for Next.js API routes) or "browser" (for client-side)
 * - client: "fetch" (JavaScript fetch API)
 * 
 * Now includes automatic fallback support via RapidAPI Key Manager
 */

import { fetchWithRapidAPIFallback, getPrimaryRapidAPIKey } from './rapidapiKeyManager';

export interface RapidAPIConfig {
  apiKey?: string; // Optional - will use key manager if not provided
  host: string;
  baseUrl: string;
  useFallback?: boolean; // Enable automatic fallback (default: true)
}

export class RapidAPIClient {
  private apiKey?: string;
  private host: string;
  private baseUrl: string;
  private useFallback: boolean;

  constructor(config: RapidAPIConfig) {
    this.apiKey = config.apiKey;
    this.host = config.host;
    this.baseUrl = config.baseUrl;
    this.useFallback = config.useFallback !== false; // Default to true
  }

  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    // Use fallback mechanism if enabled
    if (this.useFallback) {
      const result = await fetchWithRapidAPIFallback(url, this.host, {
        ...options,
        method: options.method || 'GET',
      });

      if (result.error) {
        throw new Error(result.error);
      }

      return result.data as T;
    }

    // Legacy behavior: use single key
    const apiKey = this.apiKey || getPrimaryRapidAPIKey();
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': this.host,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`RapidAPI error: ${response.statusText}`);
    }

    return response.json();
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

