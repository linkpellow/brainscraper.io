'use client';

export default function BrainScraperStartPage() {
  return (
    <div className="brainscraper-start-container">
      <style jsx global>{`
        .brainscraper-start-container {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          background: linear-gradient(135deg, #0a0a0a 0%, #1a0a1a 50%, #0a0a1a 100%);
          color: #fff;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          position: fixed;
          inset: 0;
        }

        /* Animated grid background */
        .brainscraper-start-container::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image: 
            linear-gradient(rgba(0, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 255, 255, 0.03) 1px, transparent 1px);
          background-size: 50px 50px;
          animation: gridMove 20s linear infinite;
          z-index: 0;
        }

        @keyframes gridMove {
          0% { transform: translate(0, 0); }
          100% { transform: translate(50px, 50px); }
        }

        /* Glowing orbs */
        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.3;
          animation: float 8s ease-in-out infinite;
          z-index: 1;
        }

        .orb-1 {
          width: 400px;
          height: 400px;
          background: radial-gradient(circle, rgba(255, 87, 87, 0.4), transparent);
          top: -200px;
          left: -200px;
          animation-delay: 0s;
        }

        .orb-2 {
          width: 300px;
          height: 300px;
          background: radial-gradient(circle, rgba(0, 255, 255, 0.4), transparent);
          bottom: -150px;
          right: -150px;
          animation-delay: 2s;
        }

        .orb-3 {
          width: 350px;
          height: 350px;
          background: radial-gradient(circle, rgba(138, 43, 226, 0.3), transparent);
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          animation-delay: 4s;
        }

        @keyframes float {
          0%, 100% { transform: translate(0, 0); }
          33% { transform: translate(30px, -30px); }
          66% { transform: translate(-20px, 20px); }
        }

        .brainscraper-content {
          position: relative;
          z-index: 10;
          text-align: center;
          max-width: 800px;
          padding: 40px;
        }

        .brainscraper-logo {
          font-size: 72px;
          font-weight: 900;
          background: linear-gradient(135deg, #ff5757 0%, #ff3399 50%, #00ffff 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin-bottom: 16px;
          letter-spacing: -2px;
          animation: logoGlow 3s ease-in-out infinite;
        }

        @keyframes logoGlow {
          0%, 100% { filter: brightness(1) drop-shadow(0 0 20px rgba(255, 87, 87, 0.3)); }
          50% { filter: brightness(1.3) drop-shadow(0 0 40px rgba(255, 87, 87, 0.6)); }
        }

        .brainscraper-tagline {
          font-size: 24px;
          color: rgba(255, 255, 255, 0.6);
          margin-bottom: 48px;
          font-weight: 300;
          letter-spacing: 2px;
        }

        .brainscraper-status-card {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(0, 255, 255, 0.2);
          border-radius: 16px;
          padding: 32px;
          margin-bottom: 32px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        .brainscraper-status-indicator {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-bottom: 16px;
        }

        .brainscraper-status-dot {
          width: 12px;
          height: 12px;
          background: #00ff00;
          border-radius: 50%;
          box-shadow: 0 0 20px #00ff00;
          animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.2); }
        }

        .brainscraper-status-text {
          font-size: 18px;
          color: #00ff88;
          font-weight: 600;
          letter-spacing: 1px;
        }

        .brainscraper-instructions {
          color: rgba(255, 255, 255, 0.5);
          font-size: 14px;
          line-height: 1.8;
          margin-top: 16px;
        }

        .brainscraper-feature-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin-top: 32px;
        }

        .brainscraper-feature-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 20px;
          transition: all 0.3s ease;
        }

        .brainscraper-feature-card:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(0, 255, 255, 0.4);
          transform: translateY(-4px);
        }

        .brainscraper-feature-icon {
          font-size: 32px;
          margin-bottom: 8px;
        }

        .brainscraper-feature-title {
          font-size: 14px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.9);
          margin-bottom: 4px;
        }

        .brainscraper-feature-desc {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.4);
          line-height: 1.4;
        }

        .brainscraper-footer {
          margin-top: 48px;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.3);
          letter-spacing: 1px;
        }

        .brainscraper-shortcut-hint {
          display: inline-block;
          background: rgba(0, 255, 255, 0.1);
          border: 1px solid rgba(0, 255, 255, 0.3);
          padding: 4px 8px;
          border-radius: 6px;
          font-family: 'Courier New', monospace;
          font-size: 11px;
          color: #00ffff;
          margin: 0 4px;
        }
      `}</style>

      <div className="orb orb-1"></div>
      <div className="orb orb-2"></div>
      <div className="orb orb-3"></div>

      <div className="brainscraper-content">
        <div className="brainscraper-logo">BRAINSCRAPER</div>
        <div className="brainscraper-tagline">API Signal Intelligence • Reverse Engineering Platform</div>

        <div className="brainscraper-status-card">
          <div className="brainscraper-status-indicator">
            <div className="brainscraper-status-dot"></div>
            <div className="brainscraper-status-text">PROXY ACTIVE • CAPTURE READY</div>
          </div>
          <div className="brainscraper-instructions">
            All traffic from this browser is being intercepted and analyzed in real-time.
            <br />
            Navigate to any website to begin capturing API signals.
          </div>
        </div>

        <div className="brainscraper-feature-grid">
          <div className="brainscraper-feature-card">
            <div className="brainscraper-feature-icon">🔍</div>
            <div className="brainscraper-feature-title">Smart Detection</div>
            <div className="brainscraper-feature-desc">Auto-identifies auth patterns and critical endpoints</div>
          </div>
          <div className="brainscraper-feature-card">
            <div className="brainscraper-feature-icon">⚡</div>
            <div className="brainscraper-feature-title">Real-Time</div>
            <div className="brainscraper-feature-desc">Live network traffic analysis with zero delay</div>
          </div>
          <div className="brainscraper-feature-card">
            <div className="brainscraper-feature-icon">💻</div>
            <div className="brainscraper-feature-title">Code Gen</div>
            <div className="brainscraper-feature-desc">Instant curl, fetch, axios, python snippets</div>
          </div>
          <div className="brainscraper-feature-card">
            <div className="brainscraper-feature-icon">🎯</div>
            <div className="brainscraper-feature-title">Stealth Mode</div>
            <div className="brainscraper-feature-desc">Anti-detection patches pre-configured</div>
          </div>
        </div>

        <div className="brainscraper-footer">
          Press <span className="brainscraper-shortcut-hint">Cmd+L</span> or <span className="brainscraper-shortcut-hint">Ctrl+L</span> to navigate
          <br />
          <br />
          Powered by Next.js
        </div>
      </div>
    </div>
  );
}
