#!/usr/bin/env node
/**
 * WebSocket Bridge for mitmproxy Streaming
 * 
 * Receives events from mitmproxy and forwards them to browser clients.
 * 
 * Usage:
 *   npm run mitm:bridge
 * 
 * Endpoints:
 *   - ws://localhost:8787/mitm  (mitmproxy connects here)
 *   - ws://localhost:8787/explorer  (browser clients connect here)
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import type { IncomingMessage } from 'http';

const PORT = 8787;
const MAX_EVENTS_HISTORY = 10000;

type MitmFlowEvent = {
  ts: number;
  method: string;
  url: string;
  status?: number;
  reqHeaders?: Record<string, string>;
  resHeaders?: Record<string, string>;
  reqBodySize?: number;
  resBodySize?: number;
  resMime?: string;
  client?: { ip?: string; port?: number };
  server?: { ip?: string; port?: number };
  durationMs?: number;
};

type ClientMessage = 
  | { type: 'ping' }
  | { type: 'get_history' }
  | { type: 'clear_session' }
  | { type: 'action'; action: any };

type ServerMessage =
  | { type: 'pong' }
  | { type: 'event'; data: MitmFlowEvent }
  | { type: 'events_batch'; data: MitmFlowEvent[] }
  | { type: 'history'; data: MitmFlowEvent[] }
  | { type: 'status'; connected: boolean; eventCount: number }
  | { type: 'action'; action: any } // ActionEvent from client
  | { type: 'error'; message: string };

class MitmBridge {
  private mitmClients: Set<WebSocket> = new Set();
  private explorerClients: Set<WebSocket> = new Set();
  private eventHistory: MitmFlowEvent[] = [];
  private eventCount = 0;

  constructor() {
    const server = createServer();
    const wss = new WebSocketServer({ server });

    wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const path = req.url || '/';
      
      if (path === '/mitm') {
        this.handleMitmConnection(ws);
      } else if (path === '/explorer') {
        this.handleExplorerConnection(ws);
      } else {
        ws.close(1008, 'Invalid path');
      }
    });

    server.listen(PORT, () => {
      console.log(`🚀 WebSocket Bridge running on ws://localhost:${PORT}`);
      console.log(`   - mitmproxy endpoint: ws://localhost:${PORT}/mitm`);
      console.log(`   - explorer endpoint: ws://localhost:${PORT}/explorer`);
    });

    // Heartbeat to keep connections alive
    setInterval(() => {
      this.broadcastToExplorers({ type: 'pong' });
    }, 30000); // Every 30 seconds
  }

  private handleMitmConnection(ws: WebSocket) {
    console.log('📡 mitmproxy client connected');
    this.mitmClients.add(ws);

    ws.on('message', (data: Buffer) => {
      try {
        const events = JSON.parse(data.toString()) as MitmFlowEvent[];
        
        // Final safety check: redact any tokens that slipped through
        const sanitized = events.map(event => this.sanitizeEvent(event));
        
        // Add to history
        for (const event of sanitized) {
          this.eventHistory.push(event);
          this.eventCount++;
          
          // Maintain history size
          if (this.eventHistory.length > MAX_EVENTS_HISTORY) {
            this.eventHistory.shift();
          }
        }
        
        // Broadcast to all explorer clients
        this.broadcastToExplorers({
          type: 'events_batch',
          data: sanitized,
        });
        
      } catch (error) {
        console.error('Error processing mitmproxy message:', error);
      }
    });

    ws.on('close', () => {
      console.log('📡 mitmproxy client disconnected');
      this.mitmClients.delete(ws);
      this.broadcastToExplorers({
        type: 'status',
        connected: this.mitmClients.size > 0,
        eventCount: this.eventCount,
      });
    });

    ws.on('error', (error) => {
      console.error('mitmproxy client error:', error);
      this.mitmClients.delete(ws);
    });
  }

  private handleExplorerConnection(ws: WebSocket) {
    console.log('🌐 Explorer client connected');
    this.explorerClients.add(ws);

    // Send initial status
    ws.send(JSON.stringify({
      type: 'status',
      connected: this.mitmClients.size > 0,
      eventCount: this.eventCount,
    }));

    // Send history if requested
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as ClientMessage;
        
        if (message.type === 'get_history') {
          ws.send(JSON.stringify({
            type: 'history',
            data: this.eventHistory,
          }));
        } else if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        } else if (message.type === 'clear_session') {
          this.eventHistory = [];
          this.eventCount = 0;
          this.broadcastToExplorers({
            type: 'status',
            connected: this.mitmClients.size > 0,
            eventCount: 0,
          });
        }
      } catch (error) {
        console.error('Error processing explorer message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format',
        }));
      }
    });

    ws.on('close', () => {
      console.log('🌐 Explorer client disconnected');
      this.explorerClients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('Explorer client error:', error);
      this.explorerClients.delete(ws);
    });
  }

  private broadcastToExplorers(message: ServerMessage) {
    const data = JSON.stringify(message);
    for (const client of this.explorerClients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(data);
        } catch (error) {
          console.error('Error broadcasting to explorer:', error);
        }
      }
    }
  }

  private sanitizeEvent(event: MitmFlowEvent): MitmFlowEvent {
    // Final safety check: detect and redact any tokens that slipped through
    const sanitized = { ...event };

    // Check request headers
    if (sanitized.reqHeaders) {
      const sanitizedHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(sanitized.reqHeaders)) {
        // Check for Bearer tokens
        if (value.startsWith('Bearer ') && value.length > 50) {
          sanitizedHeaders[key] = 'Bearer [REDACTED]';
        }
        // Check for JWT-like patterns
        else if (value.includes('.') && value.split('.').length === 3) {
          const parts = value.split('.');
          if (parts.every(p => p.length > 10)) {
            sanitizedHeaders[key] = '[REDACTED_JWT]';
          } else {
            sanitizedHeaders[key] = value;
          }
        } else {
          sanitizedHeaders[key] = value;
        }
      }
      sanitized.reqHeaders = sanitizedHeaders;
    }

    return sanitized;
  }
}

// Start bridge
new MitmBridge();
