#!/usr/bin/env python3
"""
mitmproxy WebSocket Stream Addon
================================

Streams sanitized network events to a WebSocket server in real time.
Automatically redacts sensitive data before sending.

Usage:
    mitmproxy -s stream_ws.py

Configuration:
    Set WS_URL environment variable to change WebSocket endpoint
    Default: ws://127.0.0.1:8787/mitm
"""

import json
import time
import asyncio
import os
import websockets
from mitmproxy import http
from typing import List, Dict, Any, Optional
from urllib.parse import urlparse

# Configuration
WS_URL = os.getenv('MITM_WS_URL', 'ws://127.0.0.1:8787/mitm')
BATCH_SIZE = 25  # Send batch when this many events queued
BATCH_INTERVAL_MS = 100  # Or send after this many milliseconds
MAX_BUFFER_SIZE = 2000  # Max events to buffer before dropping oldest

# Redaction patterns
AUTH_HEADERS = [
    'authorization',
    'x-auth-token',
    'x-api-key',
    'x-access-token',
    'x-api-secret',
]


def redact_header_value(header_name: str, header_value: str) -> str:
    """
    Redact sensitive header values while preserving structure.
    """
    header_lower = header_name.lower()
    
    if header_lower in AUTH_HEADERS:
        if header_lower == 'authorization':
            # Keep scheme (Bearer, Basic, etc.) and show length
            parts = header_value.split(' ', 1)
            if len(parts) == 2:
                scheme = parts[0]
                token_length = len(parts[1])
                return f"{scheme} [REDACTED_{token_length}_chars]"
            return "[REDACTED]"
        else:
            # Other auth headers - show length
            return f"[REDACTED_{len(header_value)}_chars]"
    
    # Check for JWT-like patterns (xxxxx.yyyyy.zzzzz)
    if '.' in header_value and len(header_value.split('.')) == 3:
        parts = header_value.split('.')
        if all(len(p) > 10 for p in parts):
            return "[REDACTED_JWT]"
    
    return header_value


def redact_cookie_value(cookie_string: str) -> str:
    """
    Redact cookie values, keep names only.
    """
    # Simple cookie parsing - keep name, redact value
    cookies = cookie_string.split(';')
    redacted = []
    for cookie in cookies:
        cookie = cookie.strip()
        if '=' in cookie:
            name = cookie.split('=', 1)[0]
            redacted.append(f"{name}=[REDACTED]")
        else:
            redacted.append(cookie)
    return '; '.join(redacted)


def extract_headers(headers: http.Headers, redact: bool = True) -> Dict[str, str]:
    """
    Extract headers as a dictionary, optionally redacting sensitive values.
    """
    result = {}
    for name, value in headers.items():
        if redact:
            result[name] = redact_header_value(name, value)
        else:
            result[name] = value
    return result


def get_mime_type(headers: http.Headers) -> str:
    """
    Extract MIME type from Content-Type header.
    """
    content_type = headers.get('content-type', '')
    if ';' in content_type:
        return content_type.split(';')[0].strip()
    return content_type.strip()


class StreamWS:
    """
    mitmproxy addon that streams events to a WebSocket server.
    """
    
    def __init__(self):
        self.queue: List[Dict[str, Any]] = []
        self.ws = None
        self.connected = False
        self.last_send_time = time.time()
        self.loop = None
        self.pump_task = None
        
    def load(self, loader):
        """
        Called when addon is loaded.
        """
        # Start async event loop
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        self.pump_task = self.loop.create_task(self.connect_and_pump())
        
    def response(self, flow: http.HTTPFlow) -> None:
        """
        mitmproxy hook: Called when a response is received.
        """
        try:
            # Skip incomplete flows
            if not flow.request or not flow.response:
                return
            
            # Parse URL
            url = flow.request.pretty_url
            parsed = urlparse(url)
            
            # Extract request body size
            req_body_size = len(flow.request.raw_content or b"")
            
            # Extract response body size
            res_body_size = len(flow.response.raw_content or b"")
            
            # Get MIME type
            res_mime = get_mime_type(flow.response.headers)
            
            # Calculate duration (if available)
            duration_ms = None
            if hasattr(flow, 'request') and hasattr(flow.request, 'timestamp_start'):
                if hasattr(flow.response, 'timestamp_end'):
                    duration_ms = int((flow.response.timestamp_end - flow.request.timestamp_start) * 1000)
            
            # Extract client info
            client_info = {}
            if flow.client_conn:
                if hasattr(flow.client_conn, 'address'):
                    client_info['ip'] = flow.client_conn.address[0] if flow.client_conn.address else None
                    client_info['port'] = flow.client_conn.address[1] if flow.client_conn.address else None
            
            # Extract server info
            server_info = {}
            if flow.server_conn:
                if hasattr(flow.server_conn, 'address'):
                    server_info['ip'] = flow.server_conn.address[0] if flow.server_conn.address else None
                    server_info['port'] = flow.server_conn.address[1] if flow.server_conn.address else None
            
            # Build flow event (same schema as export_flows.py)
            flow_event: Dict[str, Any] = {
                "ts": int(time.time() * 1000),  # Current timestamp (epoch ms)
                "method": flow.request.method,
                "url": url,
                "status": flow.response.status_code,
                "reqHeaders": extract_headers(flow.request.headers, redact=True),
                "resHeaders": extract_headers(flow.response.headers, redact=False),  # Response headers usually safe
                "reqBodySize": req_body_size,
                "resBodySize": res_body_size,
                "resMime": res_mime,
            }
            
            # Redact Set-Cookie in response headers
            if 'set-cookie' in flow_event['resHeaders']:
                flow_event['resHeaders']['set-cookie'] = redact_cookie_value(
                    flow_event['resHeaders']['set-cookie']
                )
            
            # Add optional fields if available
            if client_info.get('ip'):
                flow_event["client"] = client_info
            
            if server_info.get('ip'):
                flow_event["server"] = server_info
            
            if duration_ms is not None:
                flow_event["durationMs"] = duration_ms
            
            # Use request timestamp if available (more accurate)
            if hasattr(flow.request, 'timestamp_start'):
                flow_event["ts"] = int(flow.request.timestamp_start * 1000)
            
            # Add to queue
            self.queue.append(flow_event)
            
            # Enforce buffer limit
            if len(self.queue) > MAX_BUFFER_SIZE:
                self.queue.pop(0)  # Drop oldest
            
        except Exception as e:
            # Log errors but don't crash
            print(f"Error processing flow: {e}")
    
    async def connect_and_pump(self):
        """
        Connect to WebSocket and pump events.
        """
        while True:
            try:
                # Connect to WebSocket
                async with websockets.connect(WS_URL) as ws:
                    self.ws = ws
                    self.connected = True
                    print(f"Connected to WebSocket: {WS_URL}")
                    
                    # Send queued events first
                    if self.queue:
                        await self.send_batch()
                    
                    # Pump events
                    while True:
                        await asyncio.sleep(BATCH_INTERVAL_MS / 1000.0)
                        
                        # Send if we have events and either:
                        # - Queue is full (BATCH_SIZE)
                        # - Enough time has passed (BATCH_INTERVAL_MS)
                        if self.queue:
                            if len(self.queue) >= BATCH_SIZE:
                                await self.send_batch()
                            elif time.time() - self.last_send_time >= (BATCH_INTERVAL_MS / 1000.0):
                                await self.send_batch()
                        
                        # Send ping to keep connection alive
                        await ws.ping()
                        
            except websockets.exceptions.ConnectionClosed:
                self.connected = False
                print("WebSocket connection closed, reconnecting...")
                await asyncio.sleep(1)
            except Exception as e:
                self.connected = False
                print(f"WebSocket error: {e}, reconnecting...")
                await asyncio.sleep(1)
    
    async def send_batch(self):
        """
        Send a batch of events from the queue.
        """
        if not self.ws or not self.queue:
            return
        
        # Take up to BATCH_SIZE events
        batch = self.queue[:BATCH_SIZE]
        self.queue = self.queue[BATCH_SIZE:]
        
        # Send as JSON array
        try:
            message = json.dumps(batch)
            await self.ws.send(message)
            self.last_send_time = time.time()
        except Exception as e:
            print(f"Error sending batch: {e}")
            # Put events back in queue (at front, so they're retried)
            self.queue = batch + self.queue


# Create addon instance
addons = [StreamWS()]
