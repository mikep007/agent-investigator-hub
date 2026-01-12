// OSINT Agent Companion - Background Service Worker

// Store for pending scrape requests
const pendingRequests = new Map();

// Listen for messages from the web app
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  console.log('[OSINT Companion] Received external message:', message);
  
  if (message.type === 'PING') {
    // Health check from web app
    sendResponse({ 
      success: true, 
      version: chrome.runtime.getManifest().version,
      name: 'OSINT Agent Companion'
    });
    return true;
  }
  
  if (message.type === 'SCRAPE_REQUEST') {
    handleScrapeRequest(message, sendResponse);
    return true; // Keep channel open for async response
  }
  
  if (message.type === 'GET_SUPPORTED_SITES') {
    sendResponse({
      success: true,
      sites: [
        { domain: 'whitepages.com', name: 'Whitepages', types: ['address', 'person', 'phone'] },
        { domain: 'truepeoplesearch.com', name: 'TruePeopleSearch', types: ['person', 'phone', 'address'] },
        { domain: 'fastpeoplesearch.com', name: 'FastPeopleSearch', types: ['person', 'phone', 'address'] }
      ]
    });
    return true;
  }
  
  sendResponse({ success: false, error: 'Unknown message type' });
  return true;
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[OSINT Companion] Message from content script:', message);
  
  if (message.type === 'SCRAPE_RESULT') {
    const requestId = message.requestId;
    const callback = pendingRequests.get(requestId);
    
    if (callback) {
      callback(message.data);
      pendingRequests.delete(requestId);
    }
    
    // Store the result for the web app to retrieve
    chrome.storage.local.set({
      [`result_${requestId}`]: {
        data: message.data,
        timestamp: Date.now(),
        url: sender.tab?.url
      }
    });
  }
  
  sendResponse({ received: true });
  return true;
});

async function handleScrapeRequest(message, sendResponse) {
  const { url, requestId, searchType } = message;
  
  try {
    // Open the URL in a new tab
    const tab = await chrome.tabs.create({ 
      url: url,
      active: false // Open in background
    });
    
    // Store the request callback
    pendingRequests.set(requestId, (data) => {
      sendResponse({ success: true, data });
      // Close the tab after scraping
      chrome.tabs.remove(tab.id);
    });
    
    // Set a timeout for the request
    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        sendResponse({ 
          success: false, 
          error: 'Scraping timeout - page may require manual verification' 
        });
        chrome.tabs.remove(tab.id);
      }
    }, 30000); // 30 second timeout
    
  } catch (error) {
    console.error('[OSINT Companion] Scrape error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Clean up old results periodically
chrome.alarms.create('cleanup', { periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cleanup') {
    chrome.storage.local.get(null, (items) => {
      const now = Date.now();
      const keysToRemove = [];
      
      for (const [key, value] of Object.entries(items)) {
        if (key.startsWith('result_') && value.timestamp) {
          // Remove results older than 1 hour
          if (now - value.timestamp > 3600000) {
            keysToRemove.push(key);
          }
        }
      }
      
      if (keysToRemove.length > 0) {
        chrome.storage.local.remove(keysToRemove);
      }
    });
  }
});

console.log('[OSINT Companion] Background service worker initialized');
