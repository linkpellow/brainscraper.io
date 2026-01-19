import { NextRequest, NextResponse } from 'next/server';

/**
 * Embedded Browser for Neuromap
 * 
 * This route serves an HTML page with instructions for mitmproxy proxy setup.
 * 
 * Note: Full Playwright browser embedding requires CDP integration.
 * Future enhancement: Launch Playwright browser and expose via CDP WebSocket.
 */
export async function GET(request: NextRequest) {

  // Return HTML page with embedded browser controls
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Neuromap Browser</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0a0a;
      color: #fff;
      font-family: system-ui, -apple-system, sans-serif;
      overflow: hidden;
    }
    #browser-container {
      width: 100vw;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    #url-bar {
      padding: 8px 12px;
      background: #1a1a1a;
      border-bottom: 1px solid #333;
      display: flex;
      gap: 8px;
      align-items: center;
    }
    #url-input {
      flex: 1;
      padding: 6px 12px;
      background: #0a0a0a;
      border: 1px solid #333;
      border-radius: 4px;
      color: #fff;
      font-size: 14px;
    }
    #url-input:focus {
      outline: none;
      border-color: #ff5757;
    }
    #go-button {
      padding: 6px 16px;
      background: #ff5757;
      border: none;
      border-radius: 4px;
      color: #fff;
      cursor: pointer;
      font-size: 14px;
    }
    #go-button:hover {
      background: #ff4444;
    }
    #browser-frame {
      flex: 1;
      border: none;
      background: #fff;
    }
    .status {
      padding: 4px 12px;
      background: #1a1a1a;
      border-bottom: 1px solid #333;
      font-size: 12px;
      color: #888;
    }
  </style>
</head>
<body>
  <div id="browser-container">
    <div class="status">Neuromap Browser • Configure your device to use mitmproxy as proxy</div>
    <div id="url-bar">
      <input type="text" id="url-input" placeholder="Enter URL..." value="https://example.com" />
      <button id="go-button">Go</button>
    </div>
    <iframe id="browser-frame" src="https://example.com"></iframe>
  </div>
  <script>
    const urlInput = document.getElementById('url-input');
    const goButton = document.getElementById('go-button');
    const browserFrame = document.getElementById('browser-frame');
    
    function navigate() {
      const url = urlInput.value.trim();
      if (url) {
        // Ensure URL has protocol
        const fullUrl = url.startsWith('http') ? url : 'https://' + url;
        browserFrame.src = fullUrl;
      }
    }
    
    goButton.addEventListener('click', navigate);
    urlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') navigate();
    });
    
    // Update URL bar when iframe navigates
    browserFrame.addEventListener('load', () => {
      try {
        urlInput.value = browserFrame.contentWindow.location.href;
      } catch (e) {
        // Cross-origin, can't access
      }
    });
  </script>
</body>
</html>
  `;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html',
    },
  });
}
