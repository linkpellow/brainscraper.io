/**
 * DOM Flip Book Injection Script
 * 
 * Captures the ENTIRE DOM (not just visible viewport) and creates an "HTML flip book"
 * for AI analysis. Features:
 * 
 * 1. Full DOM Snapshot - Captures complete document including off-screen elements
 * 2. Change Detection - MutationObserver tracks DOM modifications
 * 3. Smart Pagination - Detects and auto-navigates pagination patterns
 * 4. Scroll-based Discovery - Handles infinite scroll and lazy-loaded content
 * 5. Page Mapping - Creates structured snapshots for Playwright navigation
 * 6. AI Context - Makes all snapshots available for LLM analysis
 */

(function() {
  if (window.__domFlipbookLoaded) return;
  window.__domFlipbookLoaded = true;

  // ════════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ════════════════════════════════════════════════════════════════════

  const CONFIG = {
    // Snapshot settings
    captureInterval: 2000,        // Min ms between snapshots
    changeThreshold: 50,          // Min mutations to trigger snapshot
    maxSnapshotsPerPage: 100,     // Max snapshots per URL
    
    // Pagination detection
    paginationSelectors: [
      'a[rel="next"]',
      'a:contains("Next")',
      'button:contains("Next")',
      'button:contains("Load More")',
      '.pagination a:not(.active):not(.disabled)',
      '[aria-label*="next" i]',
      '[data-testid*="next" i]',
      '.next-page',
      '.load-more',
    ],
    
    // Scroll detection
    scrollThreshold: 0.8,         // Trigger at 80% scroll
    scrollDebounce: 500,          // ms to wait after scroll
    maxAutoScroll: 20,            // Max auto-scroll iterations
    
    // Content detection
    contentSelectors: [
      'article',
      '[role="article"]',
      '.post',
      '.product',
      '.item',
      '.card',
      '[data-testid*="item"]',
      '[data-testid*="post"]',
      '[data-testid*="product"]',
    ],
    
    // Performance
    debounceMs: 300,
    maxDomSize: 10 * 1024 * 1024, // 10MB max per snapshot
  };

  // ════════════════════════════════════════════════════════════════════
  // STATE MANAGEMENT
  // ════════════════════════════════════════════════════════════════════

  const state = {
    snapshots: [],
    currentSnapshotIndex: 0,
    lastCaptureTime: 0,
    mutationCount: 0,
    isCapturing: false,
    observer: null,
    scrollObserver: null,
    autoScrollCount: 0,
    detectedPagination: [],
    visitedUrls: new Set([window.location.href]),
    pageStructure: {},
  };

  // ════════════════════════════════════════════════════════════════════
  // FORM STATE EXTRACTION (Mode #1: Full Map)
  // ════════════════════════════════════════════════════════════════════

  /**
   * Extract form state from current page (VIEWSTATE, EVENTVALIDATION, etc.)
   * Specifically designed for .ASPX and legacy form-based apps
   */
  function extractFormState() {
    const formState = {
      viewstate: null,
      viewstateGenerator: null,
      eventValidation: null,
      eventTarget: null,
      eventArgument: null,
      customFields: {}
    };

    // Find all hidden input fields
    const hiddenFields = document.querySelectorAll('input[type="hidden"]');
    
    hiddenFields.forEach(field => {
      const name = field.name;
      const value = field.value;
      
      if (!name) return;
      
      // Extract standard ASP.NET fields
      if (name === '__VIEWSTATE') {
        formState.viewstate = value;
      } else if (name === '__VIEWSTATEGENERATOR') {
        formState.viewstateGenerator = value;
      } else if (name === '__EVENTVALIDATION') {
        formState.eventValidation = value;
      } else if (name === '__EVENTTARGET') {
        formState.eventTarget = value;
      } else if (name === '__EVENTARGUMENT') {
        formState.eventArgument = value;
      } else if (!name.startsWith('__')) {
        // Store custom hidden fields
        formState.customFields[name] = value;
      }
    });

    return formState;
  }

  /**
   * Extract all interactive elements (buttons, inputs, selects, etc.)
   * Maps UI elements to their potential API triggers
   */
  function extractInteractiveElements() {
    const elements = [];

    // Extract all buttons and submit inputs
    document.querySelectorAll('button, input[type="button"], input[type="submit"]').forEach(el => {
      const element = {
        type: el.type === 'submit' ? 'submit' : 'button',
        id: el.id || null,
        name: el.name || null,
        value: el.value || el.textContent?.trim() || null,
        onclick: el.getAttribute('onclick') || null,
        xpath: getXPath(el),
        text: el.textContent?.trim() || el.value || null,
        disabled: el.disabled,
        visible: isElementVisible(el)
      };

      elements.push(element);
    });

    // Extract all select dropdowns
    document.querySelectorAll('select').forEach(el => {
      const element = {
        type: 'select',
        id: el.id || null,
        name: el.name || null,
        onchange: el.getAttribute('onchange') || null,
        xpath: getXPath(el),
        options: Array.from(el.options).map(opt => ({
          value: opt.value,
          text: opt.textContent?.trim()
        })),
        selectedIndex: el.selectedIndex,
        visible: isElementVisible(el)
      };

      elements.push(element);
    });

    // Extract text inputs (for completeness)
    document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input[type="password"]').forEach(el => {
      const element = {
        type: 'input',
        inputType: el.type,
        id: el.id || null,
        name: el.name || null,
        placeholder: el.placeholder || null,
        xpath: getXPath(el),
        required: el.required,
        visible: isElementVisible(el)
      };

      elements.push(element);
    });

    // Extract radio buttons and checkboxes
    document.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(el => {
      const element = {
        type: el.type,
        id: el.id || null,
        name: el.name || null,
        value: el.value || null,
        checked: el.checked,
        xpath: getXPath(el),
        visible: isElementVisible(el)
      };

      elements.push(element);
    });

    return elements;
  }

  /**
   * Get XPath for an element (for precise targeting)
   */
  function getXPath(element) {
    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }

    const parts = [];
    let current = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let index = 0;
      let sibling = current.previousSibling;

      while (sibling) {
        if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === current.nodeName) {
          index++;
        }
        sibling = sibling.previousSibling;
      }

      const tagName = current.nodeName.toLowerCase();
      const part = index > 0 ? `${tagName}[${index + 1}]` : tagName;
      parts.unshift(part);

      current = current.parentNode;
    }

    return parts.length ? `/${parts.join('/')}` : '';
  }

  /**
   * Check if element is actually visible on the page
   */
  function isElementVisible(el) {
    if (!el) return false;
    
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }

    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // ════════════════════════════════════════════════════════════════════
  // CORE: FULL DOM CAPTURE
  // ════════════════════════════════════════════════════════════════════

  /**
   * Captures the ENTIRE DOM, including:
   * - Off-screen elements
   * - Hidden elements (display: none)
   * - Shadow DOM
   * - Computed styles for positioning
   */
  function captureFullDOM() {
    if (state.isCapturing) return null;
    state.isCapturing = true;

    try {
      const snapshot = {
        id: `snap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        url: window.location.href,
        timestamp: Date.now(),
        scrollPosition: {
          x: window.scrollX || window.pageXOffset,
          y: window.scrollY || window.pageYOffset,
        },
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        document: {
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
        },
        title: document.title,
        html: null,
        dom: null,
        metadata: {},
        changes: state.mutationCount,
      };

      // Capture full HTML (serialized)
      snapshot.html = document.documentElement.outerHTML;

      // Capture structured DOM tree with metadata
      snapshot.dom = captureElementTree(document.documentElement);

      // Detect page structure
      snapshot.metadata = detectPageStructure();
      
      // Extract form state (for Mode #1: Full Map)
      snapshot.formState = extractFormState();
      
      // Extract interactive elements (buttons, forms, inputs)
      snapshot.interactions = extractInteractiveElements();

      // Reset mutation counter
      state.mutationCount = 0;
      state.lastCaptureTime = Date.now();

      // Check size limit
      const snapshotSize = JSON.stringify(snapshot).length;
      if (snapshotSize > CONFIG.maxDomSize) {
        console.warn('[FlipBook] Snapshot exceeds size limit:', snapshotSize);
        // Fallback: capture without full HTML
        snapshot.html = `<!-- DOM too large: ${snapshotSize} bytes -->`;
      }

      return snapshot;
    } catch (err) {
      console.error('[FlipBook] Capture error:', err);
      return null;
    } finally {
      state.isCapturing = false;
    }
  }

  /**
   * Captures element tree with positioning and visibility metadata
   */
  function captureElementTree(el, depth = 0, maxDepth = 50) {
    if (depth > maxDepth || !el || el.nodeType !== 1) return null;

    const rect = el.getBoundingClientRect();
    const computed = window.getComputedStyle(el);
    
    const node = {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      classes: el.className && typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean) : [],
      attributes: {},
      position: {
        x: rect.left + window.scrollX,
        y: rect.top + window.scrollY,
        width: rect.width,
        height: rect.height,
        visible: rect.width > 0 && rect.height > 0,
        inViewport: isInViewport(rect),
      },
      style: {
        display: computed.display,
        visibility: computed.visibility,
        opacity: computed.opacity,
        position: computed.position,
        zIndex: computed.zIndex,
      },
      text: getDirectText(el),
      children: [],
    };

    // Capture important attributes
    ['href', 'src', 'alt', 'title', 'data-testid', 'aria-label', 'role', 'type', 'name', 'value'].forEach(attr => {
      if (el.hasAttribute(attr)) {
        node.attributes[attr] = el.getAttribute(attr);
      }
    });

    // Capture children (limit depth)
    if (el.children && depth < maxDepth - 1) {
      for (let i = 0; i < Math.min(el.children.length, 1000); i++) {
        const child = captureElementTree(el.children[i], depth + 1, maxDepth);
        if (child) node.children.push(child);
      }
    }

    // Shadow DOM
    if (el.shadowRoot) {
      node.shadowRoot = captureElementTree(el.shadowRoot, depth + 1, maxDepth);
    }

    return node;
  }

  /**
   * Get direct text content (not including children)
   */
  function getDirectText(el) {
    let text = '';
    for (let i = 0; i < el.childNodes.length; i++) {
      const node = el.childNodes[i];
      if (node.nodeType === 3) { // Text node
        text += node.textContent;
      }
    }
    return text.trim().slice(0, 200); // Limit text length
  }

  /**
   * Check if element is in viewport
   */
  function isInViewport(rect) {
    return (
      rect.top < window.innerHeight &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.right > 0
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // PAGE STRUCTURE DETECTION
  // ════════════════════════════════════════════════════════════════════

  /**
   * Detects page structure: content items, pagination, navigation
   */
  function detectPageStructure() {
    const structure = {
      contentItems: [],
      pagination: detectPagination(),
      navigation: detectNavigation(),
      forms: detectForms(),
      lists: detectLists(),
      mediaCount: detectMedia(),
      hasInfiniteScroll: detectInfiniteScroll(),
    };

    // Detect content items (products, articles, posts)
    CONFIG.contentSelectors.forEach(selector => {
      try {
        const items = document.querySelectorAll(selector);
        items.forEach((item, idx) => {
          const rect = item.getBoundingClientRect();
          structure.contentItems.push({
            selector: selector,
            index: idx,
            text: item.textContent.trim().slice(0, 100),
            visible: isInViewport(rect),
            position: {
              x: rect.left + window.scrollX,
              y: rect.top + window.scrollY,
            },
          });
        });
      } catch (e) {
        // Selector might not be valid
      }
    });

    return structure;
  }

  /**
   * Detect pagination elements
   */
  function detectPagination() {
    const pagination = [];
    
    CONFIG.paginationSelectors.forEach(selector => {
      try {
        // Handle :contains() pseudo-selector manually
        if (selector.includes(':contains(')) {
          const match = selector.match(/(.*):contains\("(.+)"\)/);
          if (match) {
            const [, baseSelector, text] = match;
            const elements = document.querySelectorAll(baseSelector || '*');
            elements.forEach(el => {
              if (el.textContent.includes(text)) {
                pagination.push(extractPaginationInfo(el));
              }
            });
          }
        } else {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => pagination.push(extractPaginationInfo(el)));
        }
      } catch (e) {
        // Selector might not be valid
      }
    });

    return pagination;
  }

  function extractPaginationInfo(el) {
    const rect = el.getBoundingClientRect();
    return {
      type: el.tagName.toLowerCase(),
      text: el.textContent.trim(),
      href: el.getAttribute('href'),
      selector: getCSSSelector(el),
      xpath: getXPath(el),
      visible: isInViewport(rect),
      clickable: el.tagName === 'A' || el.tagName === 'BUTTON' || el.onclick || el.hasAttribute('role'),
    };
  }

  /**
   * Detect navigation elements
   */
  function detectNavigation() {
    const nav = [];
    const navElements = document.querySelectorAll('nav, [role="navigation"], .navigation, .menu, .navbar');
    
    navElements.forEach(el => {
      const links = el.querySelectorAll('a');
      links.forEach(link => {
        nav.push({
          text: link.textContent.trim(),
          href: link.getAttribute('href'),
          selector: getCSSSelector(link),
        });
      });
    });

    return nav.slice(0, 50); // Limit
  }

  /**
   * Detect forms
   */
  function detectForms() {
    const forms = [];
    document.querySelectorAll('form').forEach(form => {
      const inputs = form.querySelectorAll('input, select, textarea');
      forms.push({
        action: form.getAttribute('action'),
        method: form.getAttribute('method'),
        inputCount: inputs.length,
        selector: getCSSSelector(form),
      });
    });
    return forms;
  }

  /**
   * Detect lists (ul, ol)
   */
  function detectLists() {
    const lists = [];
    document.querySelectorAll('ul, ol').forEach(list => {
      const items = list.querySelectorAll('li');
      if (items.length > 2) { // Only significant lists
        lists.push({
          type: list.tagName.toLowerCase(),
          itemCount: items.length,
          selector: getCSSSelector(list),
        });
      }
    });
    return lists.slice(0, 20);
  }

  /**
   * Detect media (images, videos)
   */
  function detectMedia() {
    return {
      images: document.querySelectorAll('img').length,
      videos: document.querySelectorAll('video').length,
      iframes: document.querySelectorAll('iframe').length,
    };
  }

  /**
   * Detect infinite scroll pattern
   */
  function detectInfiniteScroll() {
    // Look for common infinite scroll indicators
    const indicators = [
      '[data-infinite-scroll]',
      '[data-testid*="infinite"]',
      '.infinite-scroll',
      '[class*="InfiniteScroll"]',
    ];

    for (const selector of indicators) {
      if (document.querySelector(selector)) return true;
    }

    // Check for scroll event listeners (heuristic)
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      if (script.textContent.includes('scroll') && script.textContent.includes('load')) {
        return true;
      }
    }

    return false;
  }

  // ════════════════════════════════════════════════════════════════════
  // MUTATION OBSERVER (Change Detection)
  // ════════════════════════════════════════════════════════════════════

  function startMutationObserver() {
    if (state.observer) return;

    state.observer = new MutationObserver(mutations => {
      state.mutationCount += mutations.length;

      // Trigger snapshot if threshold reached
      const timeSinceLastCapture = Date.now() - state.lastCaptureTime;
      if (
        state.mutationCount >= CONFIG.changeThreshold &&
        timeSinceLastCapture >= CONFIG.captureInterval
      ) {
        console.log(`[FlipBook] Changes detected (${state.mutationCount} mutations), capturing...`);
        captureAndSend();
      }
    });

    state.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: false,
      characterData: true,
      characterDataOldValue: false,
    });

    console.log('[FlipBook] MutationObserver started');
  }

  // ════════════════════════════════════════════════════════════════════
  // SCROLL DETECTION & AUTO-PAGINATION
  // ════════════════════════════════════════════════════════════════════

  let scrollTimeout = null;
  let lastScrollY = 0;

  function handleScroll() {
    clearTimeout(scrollTimeout);
    
    scrollTimeout = setTimeout(() => {
      const currentScrollY = window.scrollY || window.pageYOffset;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = document.documentElement.clientHeight;
      const scrollPercentage = (currentScrollY + clientHeight) / scrollHeight;

      // Trigger snapshot if scrolled significantly
      if (Math.abs(currentScrollY - lastScrollY) > clientHeight * 0.5) {
        console.log(`[FlipBook] Significant scroll detected (${Math.round(scrollPercentage * 100)}%)`);
        captureAndSend();
        lastScrollY = currentScrollY;
      }

      // Auto-scroll for discovery (infinite scroll)
      if (
        scrollPercentage >= CONFIG.scrollThreshold &&
        state.autoScrollCount < CONFIG.maxAutoScroll
      ) {
        console.log('[FlipBook] Near bottom, checking for more content...');
        checkForMoreContent();
      }
    }, CONFIG.scrollDebounce);
  }

  /**
   * Check for "Load More" buttons or pagination links
   */
  function checkForMoreContent() {
    const snapshot = captureFullDOM();
    if (!snapshot) return;

    const { pagination } = snapshot.metadata;

    // Find clickable pagination
    const clickableNext = pagination.find(p => p.clickable && p.visible && 
      (p.text.toLowerCase().includes('next') || 
       p.text.toLowerCase().includes('more') ||
       p.text.toLowerCase().includes('load')));

    if (clickableNext) {
      console.log('[FlipBook] Found pagination:', clickableNext.text);
      
      // Send snapshot before navigation
      sendSnapshot(snapshot);

      // Auto-click after delay (simulate human)
      setTimeout(() => {
        try {
          const el = clickableNext.xpath ? 
            document.evaluate(clickableNext.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue :
            document.querySelector(clickableNext.selector);

          if (el) {
            console.log('[FlipBook] Auto-clicking pagination:', clickableNext.text);
            el.click();
            state.autoScrollCount++;
          }
        } catch (e) {
          console.error('[FlipBook] Auto-click error:', e);
        }
      }, 500 + Math.random() * 1000); // Random delay: 500-1500ms
    } else {
      // No pagination found, try scrolling more
      if (state.autoScrollCount < CONFIG.maxAutoScroll) {
        setTimeout(() => {
          window.scrollBy(0, window.innerHeight * 0.8);
          state.autoScrollCount++;
        }, 800);
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // CAPTURE & SEND
  // ════════════════════════════════════════════════════════════════════

  function captureAndSend() {
    const snapshot = captureFullDOM();
    if (snapshot) {
      sendSnapshot(snapshot);
    }
  }

  function sendSnapshot(snapshot) {
    // Check limits
    if (state.snapshots.length >= CONFIG.maxSnapshotsPerPage) {
      console.warn('[FlipBook] Max snapshots reached for this page');
      return;
    }

    state.snapshots.push(snapshot);
    state.currentSnapshotIndex = state.snapshots.length - 1;

    console.log(`[FlipBook] Snapshot #${state.snapshots.length} captured:`, {
      url: snapshot.url,
      domSize: snapshot.html.length,
      contentItems: snapshot.metadata.contentItems.length,
      pagination: snapshot.metadata.pagination.length,
    });

    // Send to main process
    window.postMessage({
      type: 'DOM_FLIPBOOK_SNAPSHOT',
      payload: {
        snapshot: snapshot,
        totalSnapshots: state.snapshots.length,
        sessionId: getSessionId(),
      }
    }, '*');
  }

  // ════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ════════════════════════════════════════════════════════════════════

  function getCSSSelector(el) {
    if (!el || !el.ownerDocument) return '';
    if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id)) {
      if (document.getElementById(el.id) === el) return '#' + el.id;
    }
    const parts = [];
    for (; el && el.nodeType === 1; el = el.parentNode) {
      let sel = el.tagName.toLowerCase();
      if (el.className && typeof el.className === 'string') {
        const c = el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2);
        if (c.length) sel += '.' + c.join('.');
      }
      parts.unshift(sel);
      if (sel.indexOf('#') !== -1) break;
    }
    return parts.join(' > ');
  }

  function getXPath(el) {
    if (!el || !el.ownerDocument) return '';
    if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id)) {
      const id = document.getElementById(el.id);
      if (id === el) return '//*[@id="' + el.id + '"]';
    }
    const segments = [];
    for (; el && el.nodeType === 1; el = el.parentNode) {
      const tag = el.tagName.toLowerCase();
      let i = 1;
      let sib = el.previousSibling;
      while (sib) {
        if (sib.nodeType === 1 && sib.tagName === el.tagName) i++;
        sib = sib.previousSibling;
      }
      segments.unshift(i > 1 ? tag + '[' + i + ']' : tag);
    }
    return '/' + segments.join('/');
  }

  function getSessionId() {
    if (!window.__flipbookSessionId) {
      window.__flipbookSessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    return window.__flipbookSessionId;
  }

  // ════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ════════════════════════════════════════════════════════════════════

  function init() {
    console.log('[FlipBook] Initializing DOM Flip Book system...');

    // Initial capture
    setTimeout(() => {
      captureAndSend();
    }, 1000); // Wait for page to settle

    // Start mutation observer
    startMutationObserver();

    // Start scroll detection
    window.addEventListener('scroll', handleScroll, { passive: true });

    // Periodic capture (fallback)
    setInterval(() => {
      const timeSinceLastCapture = Date.now() - state.lastCaptureTime;
      if (timeSinceLastCapture >= CONFIG.captureInterval * 3) {
        console.log('[FlipBook] Periodic capture');
        captureAndSend();
      }
    }, CONFIG.captureInterval * 3);

    console.log('[FlipBook] System ready');
  }

  // Start on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose API for manual control
  window.__domFlipbook = {
    capture: captureAndSend,
    getSnapshots: () => state.snapshots,
    getState: () => ({ ...state, observer: null }), // Don't serialize observer
    config: CONFIG,
  };

})();
