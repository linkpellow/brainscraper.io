/**
 * RapidAPI client utility using JavaScript fetch
 * 
 * For RapidAPI setup instructions:
 * - target: "server" (for Next.js API routes) or "browser" (for client-side)
 * - client: "fetch" (JavaScript fetch API)
 */

export interface RapidAPIConfig {
  apiKey: string;
  host: string;
  baseUrl: string;
}

export class RapidAPIClient {
  private apiKey: string;
  private host: string;
  private baseUrl: string;

  constructor(config: RapidAPIConfig) {
    this.apiKey = config.apiKey;
    this.host = config.host;
    this.baseUrl = config.baseUrl;
  }

  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'X-RapidAPI-Key': this.apiKey,
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

