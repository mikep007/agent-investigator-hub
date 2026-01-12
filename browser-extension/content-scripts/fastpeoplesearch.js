// OSINT Agent Companion - FastPeopleSearch Content Script

(function() {
  'use strict';
  
  console.log('[OSINT Companion] FastPeopleSearch content script loaded');
  
  function waitForContent(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      function check() {
        const element = document.querySelector(selector);
        if (element) {
          resolve(element);
        } else if (Date.now() - startTime > timeout) {
          reject(new Error('Timeout waiting for content'));
        } else {
          setTimeout(check, 500);
        }
      }
      
      check();
    });
  }
  
  function extractPersonData() {
    const data = {
      type: 'person',
      source: 'fastpeoplesearch',
      url: window.location.href,
      timestamp: new Date().toISOString()
    };
    
    // Name from page title or header
    const nameEl = document.querySelector('h1.larger, h1.name-header, #name-header');
    data.name = nameEl?.textContent?.trim() || null;
    
    // Age
    const ageEl = document.querySelector('.age, [data-age]');
    if (ageEl) {
      const ageMatch = ageEl.textContent.match(/(\d+)/);
      data.age = ageMatch ? parseInt(ageMatch[1]) : null;
    }
    
    // Current address
    const currentAddrSection = document.querySelector('#current-address, .current-address-section');
    if (currentAddrSection) {
      const addrText = currentAddrSection.querySelector('.detail-value, .address-text, a');
      data.currentAddress = addrText?.textContent?.trim();
    }
    
    // All addresses
    data.addresses = [];
    document.querySelectorAll('.address-link, .address-item a, [data-link-to-more="address"]').forEach(el => {
      const addr = el.textContent?.trim();
      if (addr && addr.length > 5 && !data.addresses.includes(addr)) {
        data.addresses.push(addr);
      }
    });
    
    // Phone numbers
    data.phones = [];
    document.querySelectorAll('.phone-number, [data-link-to-more="phone"] a, .phone-link').forEach(el => {
      const phone = el.textContent?.trim().replace(/[^\d-()+ ]/g, '');
      if (phone && phone.length >= 10) {
        const existing = data.phones.find(p => p.number === phone);
        if (!existing) {
          // Try to get phone type
          const container = el.closest('.detail-box, .card');
          const typeEl = container?.querySelector('.phone-type, .badge');
          data.phones.push({
            number: phone,
            type: typeEl?.textContent?.trim() || 'Unknown'
          });
        }
      }
    });
    
    // Email addresses
    data.emails = [];
    document.querySelectorAll('.email-link, [data-link-to-more="email"] a, a[href^="mailto:"]').forEach(el => {
      const email = el.textContent?.trim() || el.getAttribute('href')?.replace('mailto:', '');
      if (email && email.includes('@') && !data.emails.includes(email)) {
        data.emails.push(email);
      }
    });
    
    // Relatives
    data.relatives = [];
    const relativesSection = document.querySelector('#relatives, .relatives-section, [data-section="relatives"]');
    if (relativesSection) {
      relativesSection.querySelectorAll('a').forEach(el => {
        const name = el.textContent?.trim();
        const href = el.getAttribute('href');
        if (name && name.length > 2 && !name.includes('View') && !data.relatives.find(r => r.name === name)) {
          data.relatives.push({
            name,
            profileUrl: href ? new URL(href, window.location.origin).href : null
          });
        }
      });
    }
    
    // Associates
    data.associates = [];
    const associatesSection = document.querySelector('#associates, .associates-section, [data-section="associates"]');
    if (associatesSection) {
      associatesSection.querySelectorAll('a').forEach(el => {
        const name = el.textContent?.trim();
        const href = el.getAttribute('href');
        if (name && name.length > 2 && !name.includes('View')) {
          data.associates.push({
            name,
            profileUrl: href ? new URL(href, window.location.origin).href : null
          });
        }
      });
    }
    
    return data;
  }
  
  function extractSearchResults() {
    const data = {
      type: 'search_results',
      source: 'fastpeoplesearch',
      url: window.location.href,
      timestamp: new Date().toISOString(),
      results: []
    };
    
    document.querySelectorAll('.card.search-result, .people-search-result').forEach(el => {
      const nameEl = el.querySelector('h2 a, .name a, .result-name');
      const name = nameEl?.textContent?.trim();
      const href = nameEl?.getAttribute('href');
      
      if (name) {
        const result = {
          name,
          profileUrl: href ? new URL(href, window.location.origin).href : null
        };
        
        // Age
        const ageEl = el.querySelector('.age');
        if (ageEl) {
          const ageMatch = ageEl.textContent.match(/(\d+)/);
          result.age = ageMatch ? parseInt(ageMatch[1]) : null;
        }
        
        // Location
        const locEl = el.querySelector('.location, .address');
        result.location = locEl?.textContent?.trim();
        
        // Quick info
        const infoEl = el.querySelector('.card-summary, .quick-info');
        result.summary = infoEl?.textContent?.trim();
        
        data.results.push(result);
      }
    });
    
    return data;
  }
  
  async function extractData() {
    try {
      await waitForContent('h1, .card, .search-results');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const url = window.location.href;
      let data;
      
      if (url.includes('/name/') || url.includes('/search/')) {
        data = extractSearchResults();
      } else {
        data = extractPersonData();
      }
      
      const requestId = btoa(url).slice(0, 20);
      
      chrome.runtime.sendMessage({
        type: 'SCRAPE_RESULT',
        requestId,
        data
      });
      
      console.log('[OSINT Companion] Extracted FastPeopleSearch data:', data);
      
      return data;
      
    } catch (error) {
      console.error('[OSINT Companion] Extraction error:', error);
      chrome.runtime.sendMessage({
        type: 'SCRAPE_RESULT',
        requestId: btoa(window.location.href).slice(0, 20),
        data: { error: error.message, url: window.location.href }
      });
    }
  }
  
  if (document.readyState === 'complete') {
    extractData();
  } else {
    window.addEventListener('load', extractData);
  }
  
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'EXTRACT_NOW') {
      extractData().then(data => {
        sendResponse({ success: true, data });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }
  });
})();
