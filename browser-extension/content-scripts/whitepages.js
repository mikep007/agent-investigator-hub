// OSINT Agent Companion - Whitepages Content Script

(function() {
  'use strict';
  
  console.log('[OSINT Companion] Whitepages content script loaded');
  
  // Wait for page to fully load
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
  
  // Extract person data from Whitepages person page
  function extractPersonData() {
    const data = {
      type: 'person',
      source: 'whitepages',
      url: window.location.href,
      timestamp: new Date().toISOString()
    };
    
    // Name
    const nameEl = document.querySelector('h1[data-testid="name"], h1.hero-header, .name-header h1');
    data.name = nameEl?.textContent?.trim() || null;
    
    // Age
    const ageEl = document.querySelector('[data-testid="age"], .age-info, .hero-subtitle');
    const ageText = ageEl?.textContent?.trim() || '';
    const ageMatch = ageText.match(/(\d+)\s*(?:years?\s*old|yrs?)/i);
    data.age = ageMatch ? parseInt(ageMatch[1]) : null;
    
    // Current address
    const addressEl = document.querySelector('[data-testid="current-address"], .current-address a, .address-current');
    data.currentAddress = addressEl?.textContent?.trim() || null;
    
    // Previous addresses
    data.previousAddresses = [];
    document.querySelectorAll('[data-testid="past-address"], .past-addresses li, .address-history-item').forEach(el => {
      const addr = el.textContent?.trim();
      if (addr && !data.previousAddresses.includes(addr)) {
        data.previousAddresses.push(addr);
      }
    });
    
    // Phone numbers
    data.phones = [];
    document.querySelectorAll('[data-testid="phone"], .phone-number, .phones-list li').forEach(el => {
      const phone = el.textContent?.trim().replace(/[^\d-()+ ]/g, '');
      if (phone && phone.length >= 10 && !data.phones.includes(phone)) {
        data.phones.push(phone);
      }
    });
    
    // Email addresses
    data.emails = [];
    document.querySelectorAll('[data-testid="email"], .email-address, .emails-list li').forEach(el => {
      const email = el.textContent?.trim();
      if (email && email.includes('@') && !data.emails.includes(email)) {
        data.emails.push(email);
      }
    });
    
    // Relatives/Associates
    data.relatives = [];
    document.querySelectorAll('[data-testid="relative"], .relatives-list a, .associates-section a').forEach(el => {
      const name = el.textContent?.trim();
      const href = el.getAttribute('href');
      if (name && name.length > 2) {
        data.relatives.push({
          name,
          profileUrl: href ? `https://www.whitepages.com${href}` : null
        });
      }
    });
    
    // Property info (if on address page)
    const propertySection = document.querySelector('.property-details, [data-testid="property-info"]');
    if (propertySection) {
      data.property = {
        value: propertySection.querySelector('.property-value, [data-testid="property-value"]')?.textContent?.trim(),
        beds: propertySection.querySelector('.beds, [data-testid="beds"]')?.textContent?.trim(),
        baths: propertySection.querySelector('.baths, [data-testid="baths"]')?.textContent?.trim(),
        sqft: propertySection.querySelector('.sqft, [data-testid="sqft"]')?.textContent?.trim(),
        yearBuilt: propertySection.querySelector('.year-built, [data-testid="year-built"]')?.textContent?.trim()
      };
    }
    
    return data;
  }
  
  // Extract address data from Whitepages address page
  function extractAddressData() {
    const data = {
      type: 'address',
      source: 'whitepages',
      url: window.location.href,
      timestamp: new Date().toISOString()
    };
    
    // Full address
    const addressEl = document.querySelector('h1[data-testid="address"], h1.address-header, .property-address h1');
    data.address = addressEl?.textContent?.trim() || null;
    
    // Residents
    data.residents = [];
    document.querySelectorAll('[data-testid="resident"], .residents-list a, .resident-card').forEach(el => {
      const nameEl = el.querySelector('.resident-name, h3, a');
      const name = nameEl?.textContent?.trim();
      const href = el.querySelector('a')?.getAttribute('href');
      
      if (name) {
        data.residents.push({
          name,
          profileUrl: href ? `https://www.whitepages.com${href}` : null
        });
      }
    });
    
    // Property details
    const details = {};
    document.querySelectorAll('.property-detail, .detail-item, [data-testid="property-detail"]').forEach(el => {
      const label = el.querySelector('.label, dt')?.textContent?.trim()?.toLowerCase();
      const value = el.querySelector('.value, dd')?.textContent?.trim();
      if (label && value) {
        details[label.replace(/[:\s]/g, '_')] = value;
      }
    });
    data.propertyDetails = details;
    
    // Neighborhood info
    const neighborhoodEl = document.querySelector('.neighborhood-info, [data-testid="neighborhood"]');
    if (neighborhoodEl) {
      data.neighborhood = neighborhoodEl.textContent?.trim();
    }
    
    // Previous residents
    data.previousResidents = [];
    document.querySelectorAll('.past-residents a, [data-testid="past-resident"]').forEach(el => {
      const name = el.textContent?.trim();
      const href = el.getAttribute('href');
      if (name) {
        data.previousResidents.push({
          name,
          profileUrl: href ? `https://www.whitepages.com${href}` : null
        });
      }
    });
    
    return data;
  }
  
  // Main extraction function
  async function extractData() {
    try {
      // Wait for main content to load
      await waitForContent('h1, .hero-header, .address-header');
      
      // Give React/JS time to hydrate
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const url = window.location.href;
      let data;
      
      if (url.includes('/address/')) {
        data = extractAddressData();
      } else if (url.includes('/name/') || url.includes('/person/')) {
        data = extractPersonData();
      } else {
        // Generic extraction for search results
        data = {
          type: 'search_results',
          source: 'whitepages',
          url: url,
          results: []
        };
        
        document.querySelectorAll('.search-result, .serp-item, [data-testid="search-result"]').forEach(el => {
          const name = el.querySelector('.name, h2, h3')?.textContent?.trim();
          const href = el.querySelector('a')?.getAttribute('href');
          const location = el.querySelector('.location, .address')?.textContent?.trim();
          const age = el.querySelector('.age')?.textContent?.trim();
          
          if (name) {
            data.results.push({
              name,
              profileUrl: href ? `https://www.whitepages.com${href}` : null,
              location,
              age
            });
          }
        });
      }
      
      // Generate a request ID from URL
      const requestId = btoa(url).slice(0, 20);
      
      // Send data to background script
      chrome.runtime.sendMessage({
        type: 'SCRAPE_RESULT',
        requestId,
        data
      });
      
      console.log('[OSINT Companion] Extracted Whitepages data:', data);
      
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
  
  // Auto-extract when page loads
  if (document.readyState === 'complete') {
    extractData();
  } else {
    window.addEventListener('load', extractData);
  }
  
  // Listen for manual extraction requests
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
