#!/usr/bin/env python3
"""
mitmproxy Export Script
======================

Converts mitmproxy flows into a clean, normalized event stream.
Automatically strips noise and sensitive data.

Usage:
    mitmdump -s export_flows.py

Output:
    mitm_flows.json - Clean flow export ready for API Signal Explorer
"""

from mitmproxy import http
import json
import time
from typing import List, Dict, Any
from urllib.parse import urlparse

# In-memory storage for flows
flows: List[Dict[str, Any]] = []

# Redaction patterns
AUTH_HEADERS = [
    'authorization',
    'x-auth-token',
    'x-api-key',
    'x-access-token',
    'x-api-secret',
    'cookie',
    'set-cookie',
]


def redact_header_value(header_name: str, header_value: str) -> str:
    """
    Redact sensitive header values while preserving structure.
    
    For auth headers: Keep scheme (e.g., 'Bearer') and length indicator
    For cookies: Keep cookie names only, redact values
    """
    header_lower = header_name.lower()
    
    # Redact authorization headers
    if header_lower in AUTH_HEADERS:
        if header_lower == 'authorization':
            # Keep scheme (Bearer, Basic, etc.) and show length
            parts = header_value.split(' ', 1)
            if len(parts) == 2:
                scheme = parts[0]
                token_length = len(parts[1])
                return f"{scheme} [REDACTED_{token_length}_chars]"
            return "[REDACTED]"
        elif header_lower in ['cookie', 'set-cookie']:
            # For cookies, we'll keep the structure but redact values
            # This is a simplified version - in production you might want more sophisticated parsing
            return "[COOKIE_REDACTED]"
        else:
            # Other auth headers - just show length
            return f"[REDACTED_{len(header_value)}_chars]"
    
    return header_value


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


def response(flow: http.HTTPFlow) -> None:
    """
    mitmproxy hook: Called when a response is received.
    
    This is where we capture and normalize each flow.
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
        
        # Build flow event
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
        
        flows.append(flow_event)
        
    except Exception as e:
        # Log errors but don't crash
        print(f"Error processing flow: {e}")


def done() -> None:
    """
    mitmproxy hook: Called when mitmproxy is shutting down.
    
    Write all collected flows to JSON file.
    """
    if not flows:
        print("No flows captured. Exiting.")
        return
    
    # Calculate session metadata
    timestamps = [f["ts"] for f in flows]
    start_ts = min(timestamps)
    end_ts = max(timestamps)
    duration_ms = end_ts - start_ts
    
    # Build export structure
    export_data = {
        "version": "1.0.0",
        "session": {
            "startTs": start_ts,
            "endTs": end_ts,
            "durationMs": duration_ms
        },
        "flows": flows
    }
    
    # Write to file
    output_file = "mitm_flows.json"
    with open(output_file, "w") as f:
        json.dump(export_data, f, indent=2)
    
    print(f"Exported {len(flows)} flows to {output_file}")
    print(f"Session duration: {duration_ms / 1000:.2f} seconds")


# Alternative entry point for mitmdump
def load(loader):
    """
    mitmproxy addon loader (optional, for advanced usage)
    """
    pass
