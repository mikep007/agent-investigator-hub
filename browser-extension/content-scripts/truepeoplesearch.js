// OSINT Agent Companion - TruePeopleSearch Content Script

(function() {
  'use strict';
  
  console.log('[OSINT Companion] TruePeopleSearch content script loaded');
  
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
      source: 'truepeoplesearch',
      url: window.location.href,
      timestamp: new Date().toISOString()
    };
    
    // Name
    const nameEl = document.querySelector('h1.oh1, .name-title h1, [data-detail="name"]');
    data.name = nameEl?.textContent?.trim() || null;
    
    // Age & Birth info
    const ageSection = document.querySelector('.content-value[data-detail="age"], .age-info');
    if (ageSection) {
      const ageText = ageSection.textContent;
      const ageMatch = ageText.match(/(\d+)\s*years?\s*old/i);
      data.age = ageMatch ? parseInt(ageMatch[1]) : null;
      
      const birthMatch = ageText.match(/Born\s+(\w+\s+\d{4})/i);
      data.birthDate = birthMatch ? birthMatch[1] : null;
    }
    
    // Current address
    const addressCard = document.querySelector('[data-detail="address"], .current-address-section');
    if (addressCard) {
      data.currentAddress = addressCard.querySelector('.detail-box-address, .address-text')?.textContent?.trim();
    }
    
    // All addresses
    data.addresses = [];
    document.querySelectorAll('.detail-box-address, .address-result').forEach(el => {
      const addr = el.textContent?.trim();
      if (addr && !data.addresses.includes(addr)) {
        data.addresses.push(addr);
      }
    });
    
    // Phone numbers
    data.phones = [];
    document.querySelectorAll('[data-detail="phone"] .detail-box-phone, .phone-number, [itemprop="telephone"]').forEach(el => {
      const phone = el.textContent?.trim();
      if (phone && phone.length >= 10 && !data.phones.find(p => p.number === phone)) {
        const typeEl = el.closest('.card')?.querySelector('.phone-type, .label');
        data.phones.push({
          number: phone,
          type: typeEl?.textContent?.trim() || 'Unknown'
        });
      }
    });
    
    // Email addresses
    data.emails = [];
    document.querySelectorAll('[data-detail="email"] a, .email-link, [itemprop="email"]').forEach(el => {
      const email = el.textContent?.trim();
      if (email && email.includes('@') && !data.emails.includes(email)) {
        data.emails.push(email);
      }
    });
    
    // Relatives
    data.relatives = [];
    document.querySelectorAll('[data-detail="relative"] a, .relative-link, .associates-link').forEach(el => {
      const name = el.textContent?.trim();
      const href = el.getAttribute('href');
      if (name && name.length > 2 && !data.relatives.find(r => r.name === name)) {
        data.relatives.push({
          name,
          profileUrl: href ? new URL(href, window.location.origin).href : null
        });
      }
    });
    
    // Associates
    data.associates = [];
    document.querySelectorAll('[data-detail="associate"] a, .associate-name').forEach(el => {
      const name = el.textContent?.trim();
      const href = el.getAttribute('href');
      if (name && name.length > 2) {
        data.associates.push({
          name,
          profileUrl: href ? new URL(href, window.location.origin).href : null
        });
      }
    });
    
    return data;
  }
  
  function extractSearchResults() {
    const data = {
      type: 'search_results',
      source: 'truepeoplesearch',
      url: window.location.href,
      timestamp: new Date().toISOString(),
      results: []
    };
    
    document.querySelectorAll('.card.card-block, .search-result-card').forEach(el => {
      const nameEl = el.querySelector('h2 a, .name-link');
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
        const locEl = el.querySelector('.location, .address-text');
        result.location = locEl?.textContent?.trim();
        
        // Relatives preview
        const relEl = el.querySelector('.relatives, .related-names');
        result.relativesPreview = relEl?.textContent?.trim();
        
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
      
      if (url.includes('/find/') || url.includes('/results/')) {
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
      
      console.log('[OSINT Companion] Extracted TruePeopleSearch data:', data);
      
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
