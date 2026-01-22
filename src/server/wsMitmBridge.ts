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

const PORT = (typeof process !== 'undefined' && process.env && process.env.BRIDGE_PORT) ? (parseInt(process.env.BRIDGE_PORT, 10) || 8787) : 8787;
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
  /** Gap 7: path to saved .wasm when resMime is application/wasm */
  wasmPath?: string;
  /** Browser View: source of the event */
  source?: 'mobile' | 'browser';
  /** Browser View: request body text (if available) */
  reqBodyText?: string;
  /** Browser View: response body text (truncated, size limits apply) */
  resBodyText?: string;
  /** Browser View: action that triggered this event */
  actionId?: string;
  /** Browser View: phase indicator */
  phase?: 'page_load' | 'interaction' | 'background';
};

type ClientMessage = 
  | { type: 'ping' }
  | { type: 'get_history' }
  | { type: 'clear_session' }
  | { type: 'action'; action: any }
  | { type: 'target-action'; eventType: string; selector: string; xpath: string; timestamp: number }
  | { type: 'browser_events'; data: MitmFlowEvent[]; source: 'browser' }
  | { type: 'browser_action'; action: ActionEvent }
  | { type: 'browser_capture_start'; sessionId: string }
  | { type: 'browser_capture_stop'; sessionId: string }
  | { type: 'session_lifecycle_event'; event: SessionLifecycleEvent };

type ActionEvent = {
  id: string;
  ts: number;
  type: string;
  label?: string;
  meta?: Record<string, any>;
};

type ServerMessage =
  | { type: 'pong' }
  | { type: 'event'; data: MitmFlowEvent }
  | { type: 'events_batch'; data: MitmFlowEvent[] }
  | { type: 'history'; data: MitmFlowEvent[] }
  | { type: 'status'; connected: boolean; eventCount: number }
  | { type: 'action'; action: any }
  | { type: 'target-action'; eventType: string; selector: string; xpath: string; timestamp: number }
  | { type: 'wss_frame'; flow_id?: string; from_client?: boolean; content?: string; is_text?: boolean; ts?: number }
  | { type: 'error'; message: string }
  | { type: 'browser_action'; action: ActionEvent }
  | { type: 'browser_capture_session'; sessionId: string; status: 'started' | 'stopped' }
  | { type: 'session_lifecycle_event'; event: SessionLifecycleEvent };

type SessionLifecycleEvent = {
  type: 'session_started' | 'browser_opened' | 'browser_closed' | 'session_stopped' | 'har_exported' | 'error';
  sessionId: string;
  ts: number;
  data?: {
    url?: string;
    message?: string;
    code?: string;
    details?: any;
  };
};

class MitmBridge {
  private mitmClients: Set<WebSocket> = new Set();
  private explorerClients: Set<WebSocket> = new Set();
  private browserClients: Set<WebSocket> = new Set(); // Browser capture service connections
  private eventHistory: MitmFlowEvent[] = [];
  private actionHistory: ActionEvent[] = [];
  private eventCount = 0;
  private activeBrowserSessions: Set<string> = new Set();

  constructor() {
    const server = createServer();
    const wss = new WebSocketServer({ server });

    wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const path = req.url || '/';
      
      if (path === '/mitm') {
        this.handleMitmConnection(ws);
      } else if (path === '/explorer') {
        this.handleExplorerConnection(ws);
      } else if (path === '/browser') {
        this.handleBrowserConnection(ws);
      } else {
        ws.close(1008, 'Invalid path');
      }
    });

    server.listen(PORT, () => {
      console.log(`🚀 WebSocket Bridge running on ws://localhost:${PORT}`);
      console.log(`   - mitmproxy endpoint: ws://localhost:${PORT}/mitm`);
      console.log(`   - explorer endpoint: ws://localhost:${PORT}/explorer`);
      console.log(`   - browser endpoint: ws://localhost:${PORT}/browser`);
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
        const parsed = JSON.parse(data.toString());

        // WSS frame (Gap 6: WebSocket sniffing) — from stream_ws websocket_message
        if (parsed && typeof parsed === 'object' && (parsed as { _wss?: boolean })._wss === true) {
          const p = parsed as { flow_id?: string; from_client?: boolean; content?: string; is_text?: boolean; ts?: number };
          this.broadcastToExplorers({
            type: 'wss_frame',
            flow_id: p.flow_id,
            from_client: p.from_client,
            content: p.content,
            is_text: p.is_text,
            ts: p.ts,
          });
          return;
        }

        const events = Array.isArray(parsed) ? (parsed as MitmFlowEvent[]) : [];
        if (events.length === 0) return;

        const sanitized = events.map(event => this.sanitizeEvent(event));
        this.addEventsToHistory(sanitized);
        this.broadcastToExplorers({ type: 'events_batch', data: sanitized });
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
        } else if (message.type === 'action' && message.action) {
          this.broadcastToExplorers({ type: 'action', action: message.action });
        } else if (message.type === 'target-action' && message.selector != null && message.xpath != null) {
          this.broadcastToExplorers({
            type: 'target-action',
            eventType: message.eventType || 'click',
            selector: message.selector,
            xpath: message.xpath,
            timestamp: message.timestamp,
          });
        } else if (message.type === 'browser_events' && message.data) {
          // Browser-source events: normalize and add to unified stream
          const normalized = message.data.map(event => ({
            ...event,
            source: 'browser' as const,
          }));
          this.addEventsToHistory(normalized);
          this.broadcastToExplorers({ type: 'events_batch', data: normalized });
        } else if (message.type === 'browser_action' && message.action) {
          // Browser action events: add to action history and broadcast
          this.actionHistory.push(message.action);
          this.broadcastToExplorers({ type: 'browser_action', action: message.action });
        } else if (message.type === 'browser_capture_start' && message.sessionId) {
          this.activeBrowserSessions.add(message.sessionId);
          this.broadcastToExplorers({
            type: 'browser_capture_session',
            sessionId: message.sessionId,
            status: 'started',
          });
        } else if (message.type === 'browser_capture_stop' && message.sessionId) {
          this.activeBrowserSessions.delete(message.sessionId);
          this.broadcastToExplorers({
            type: 'browser_capture_session',
            sessionId: message.sessionId,
            status: 'stopped',
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

  private addEventsToHistory(events: MitmFlowEvent[]) {
    for (const event of events) {
      // Ensure default source
      if (!event.source) {
        event.source = 'mobile';
      }
      this.eventHistory.push(event);
      this.eventCount++;
      if (this.eventHistory.length > MAX_EVENTS_HISTORY) this.eventHistory.shift();
    }
  }

  private handleBrowserConnection(ws: WebSocket) {
    console.log('🌐 Browser capture client connected');
    this.browserClients.add(ws);

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as ClientMessage;
        
        if (message.type === 'browser_events' && message.data) {
          const normalized = message.data.map(event => ({
            ...this.sanitizeEvent(event),
            source: 'browser' as const,
          }));
          this.addEventsToHistory(normalized);
          this.broadcastToExplorers({ type: 'events_batch', data: normalized });
        } else if (message.type === 'browser_action' && message.action) {
          this.actionHistory.push(message.action);
          this.broadcastToExplorers({ type: 'browser_action', action: message.action });
        } else if (message.type === 'browser_capture_start' && message.sessionId) {
          this.activeBrowserSessions.add(message.sessionId);
          this.broadcastToExplorers({
            type: 'browser_capture_session',
            sessionId: message.sessionId,
            status: 'started',
          });
        } else if (message.type === 'browser_capture_stop' && message.sessionId) {
          this.activeBrowserSessions.delete(message.sessionId);
          this.broadcastToExplorers({
            type: 'browser_capture_session',
            sessionId: message.sessionId,
            status: 'stopped',
          });
        } else if (message.type === 'session_lifecycle_event' && (message as any).event) {
          // Broadcast lifecycle events from browser capture service
          const lifecycleMessage = message as { type: 'session_lifecycle_event'; event: SessionLifecycleEvent };
          this.broadcastToExplorers({
            type: 'session_lifecycle_event',
            event: lifecycleMessage.event,
          });
        }
      } catch (error) {
        console.error('Error processing browser message:', error);
      }
    });

    ws.on('close', () => {
      console.log('🌐 Browser capture client disconnected');
      this.browserClients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('Browser capture client error:', error);
      this.browserClients.delete(ws);
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
