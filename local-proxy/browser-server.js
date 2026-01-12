/**
 * OSINT Local Proxy Server with Playwright Browser Automation
 * 
 * This Node.js server runs locally and provides headless browser automation
 * for scraping protected sites that block automated access.
 * 
 * INSTALLATION:
 * 1. npm init -y
 * 2. npm install express playwright cors
 * 3. npx playwright install chromium
 * 4. node server.js
 * 
 * The server listens on port 3001 by default.
 */

const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Browser instance management
let browser = null;

async function getBrowser() {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
    });
  }
  return browser;
}

// Site-specific scrapers
const scrapers = {
  async whitepages(page, url, searchType) {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    
    // Wait for content to load
    await page.waitForTimeout(3000);
    
    const data = await page.evaluate((type) => {
      const result = {
        source: 'whitepages',
        url: window.location.href,
        timestamp: new Date().toISOString(),
        exists: true,
      };
      
      if (type === 'address') {
        // Address page extraction
        result.address = document.querySelector('h1')?.textContent?.trim();
        
        result.residents = [];
        document.querySelectorAll('[data-testid="resident"], .resident-card, .occupant-name').forEach(el => {
          const name = el.querySelector('a, .name')?.textContent?.trim();
          const href = el.querySelector('a')?.getAttribute('href');
          if (name) {
            result.residents.push({
              name,
              profileUrl: href ? `https://www.whitepages.com${href}` : null,
            });
          }
        });
        
        // Property details
        result.propertyDetails = {};
        document.querySelectorAll('.property-detail, .detail-row').forEach(el => {
          const label = el.querySelector('.label, dt')?.textContent?.trim();
          const value = el.querySelector('.value, dd')?.textContent?.trim();
          if (label && value) {
            result.propertyDetails[label.toLowerCase().replace(/[:\s]/g, '_')] = value;
          }
        });
        
      } else {
        // Person page extraction
        result.name = document.querySelector('h1[data-testid="name"], h1.hero-header')?.textContent?.trim();
        
        const ageEl = document.querySelector('[data-testid="age"], .age-info');
        if (ageEl) {
          const match = ageEl.textContent.match(/(\d+)/);
          result.age = match ? parseInt(match[1]) : null;
        }
        
        result.currentAddress = document.querySelector('[data-testid="current-address"]')?.textContent?.trim();
        
        result.phones = [];
        document.querySelectorAll('[data-testid="phone"], .phone-number').forEach(el => {
          const phone = el.textContent?.trim();
          if (phone && phone.length >= 10) result.phones.push(phone);
        });
        
        result.emails = [];
        document.querySelectorAll('[data-testid="email"], .email-address').forEach(el => {
          const email = el.textContent?.trim();
          if (email?.includes('@')) result.emails.push(email);
        });
        
        result.relatives = [];
        document.querySelectorAll('[data-testid="relative"] a, .relatives-list a').forEach(el => {
          const name = el.textContent?.trim();
          const href = el.getAttribute('href');
          if (name && name.length > 2) {
            result.relatives.push({
              name,
              profileUrl: href ? `https://www.whitepages.com${href}` : null,
            });
          }
        });
      }
      
      return result;
    }, searchType);
    
    return data;
  },
  
  async spokeo(page, url, searchType) {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    const data = await page.evaluate(() => {
      const result = {
        source: 'spokeo',
        url: window.location.href,
        timestamp: new Date().toISOString(),
        exists: true,
      };
      
      result.name = document.querySelector('h1.name, .profile-name')?.textContent?.trim();
      
      const ageEl = document.querySelector('.age, .age-display');
      if (ageEl) {
        const match = ageEl.textContent.match(/(\d+)/);
        result.age = match ? parseInt(match[1]) : null;
      }
      
      result.addresses = [];
      document.querySelectorAll('.address-section .address, .address-item').forEach(el => {
        const addr = el.textContent?.trim();
        if (addr) result.addresses.push(addr);
      });
      
      result.phones = [];
      document.querySelectorAll('.phone-section .phone, .phone-number').forEach(el => {
        const phone = el.textContent?.trim();
        if (phone) result.phones.push(phone);
      });
      
      result.emails = [];
      document.querySelectorAll('.email-section .email, .email-item').forEach(el => {
        const email = el.textContent?.trim();
        if (email?.includes('@')) result.emails.push(email);
      });
      
      // Profile image
      const imgEl = document.querySelector('.profile-image img, .avatar img');
      result.avatarUrl = imgEl?.getAttribute('src');
      
      return result;
    });
    
    return data;
  },
  
  async truepeoplesearch(page, url, searchType) {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    const data = await page.evaluate(() => {
      const result = {
        source: 'truepeoplesearch',
        url: window.location.href,
        timestamp: new Date().toISOString(),
        exists: true,
      };
      
      result.name = document.querySelector('h1.oh1, .name-title')?.textContent?.trim();
      
      const ageSection = document.querySelector('.content-value[data-detail="age"]');
      if (ageSection) {
        const match = ageSection.textContent.match(/(\d+)/);
        result.age = match ? parseInt(match[1]) : null;
      }
      
      result.addresses = [];
      document.querySelectorAll('.detail-box-address, [data-detail="address"]').forEach(el => {
        const addr = el.textContent?.trim();
        if (addr) result.addresses.push(addr);
      });
      
      result.phones = [];
      document.querySelectorAll('.detail-box-phone, [data-detail="phone"]').forEach(el => {
        const phone = el.textContent?.trim().replace(/\D/g, '');
        if (phone.length >= 10) result.phones.push(phone);
      });
      
      result.emails = [];
      document.querySelectorAll('[data-detail="email"] a').forEach(el => {
        const email = el.textContent?.trim();
        if (email?.includes('@')) result.emails.push(email);
      });
      
      result.relatives = [];
      document.querySelectorAll('[data-detail="relative"] a').forEach(el => {
        const name = el.textContent?.trim();
        const href = el.getAttribute('href');
        if (name) {
          result.relatives.push({
            name,
            profileUrl: href ? new URL(href, window.location.origin).href : null,
          });
        }
      });
      
      return result;
    });
    
    return data;
  },
  
  async fastpeoplesearch(page, url, searchType) {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    const data = await page.evaluate(() => {
      const result = {
        source: 'fastpeoplesearch',
        url: window.location.href,
        timestamp: new Date().toISOString(),
        exists: true,
      };
      
      result.name = document.querySelector('h1.larger, h1.name-header')?.textContent?.trim();
      
      const ageEl = document.querySelector('.age');
      if (ageEl) {
        const match = ageEl.textContent.match(/(\d+)/);
        result.age = match ? parseInt(match[1]) : null;
      }
      
      result.addresses = [];
      document.querySelectorAll('.address-link, .address-item').forEach(el => {
        const addr = el.textContent?.trim();
        if (addr) result.addresses.push(addr);
      });
      
      result.phones = [];
      document.querySelectorAll('.phone-number, .phone-link').forEach(el => {
        const phone = el.textContent?.trim().replace(/\D/g, '');
        if (phone.length >= 10) result.phones.push(phone);
      });
      
      result.emails = [];
      document.querySelectorAll('.email-link, a[href^="mailto:"]').forEach(el => {
        const email = el.textContent?.trim() || el.getAttribute('href')?.replace('mailto:', '');
        if (email?.includes('@')) result.emails.push(email);
      });
      
      result.relatives = [];
      document.querySelectorAll('#relatives a, .relatives-section a').forEach(el => {
        const name = el.textContent?.trim();
        const href = el.getAttribute('href');
        if (name && !name.includes('View')) {
          result.relatives.push({
            name,
            profileUrl: href ? new URL(href, window.location.origin).href : null,
          });
        }
      });
      
      return result;
    });
    
    return data;
  },
  
  async beenverified(page, url, searchType) {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    const data = await page.evaluate(() => {
      const result = {
        source: 'beenverified',
        url: window.location.href,
        timestamp: new Date().toISOString(),
        exists: true,
      };
      
      result.name = document.querySelector('.profile-name, h1')?.textContent?.trim();
      
      const ageEl = document.querySelector('.age-display, .age');
      if (ageEl) {
        const match = ageEl.textContent.match(/(\d+)/);
        result.age = match ? parseInt(match[1]) : null;
      }
      
      result.addresses = [];
      document.querySelectorAll('.address-item, .address-row').forEach(el => {
        const addr = el.textContent?.trim();
        if (addr) result.addresses.push(addr);
      });
      
      result.phones = [];
      document.querySelectorAll('.phone-item, .phone-number').forEach(el => {
        const phone = el.textContent?.trim();
        if (phone) result.phones.push(phone);
      });
      
      result.emails = [];
      document.querySelectorAll('.email-item, .email-address').forEach(el => {
        const email = el.textContent?.trim();
        if (email?.includes('@')) result.emails.push(email);
      });
      
      return result;
    });
    
    return data;
  },
  
  // Generic scraper for unsupported sites
  async generic(page, url, searchType) {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    const data = await page.evaluate(() => {
      const result = {
        source: new URL(window.location.href).hostname,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        exists: true,
      };
      
      result.name = document.querySelector('h1')?.textContent?.trim();
      
      // Extract phones using regex
      const phonePattern = /(\(?[0-9]{3}\)?[\s.-]?[0-9]{3}[\s.-]?[0-9]{4})/g;
      const bodyText = document.body.innerText;
      result.phones = [...new Set(bodyText.match(phonePattern) || [])].slice(0, 10);
      
      // Extract emails using regex
      const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      result.emails = [...new Set(bodyText.match(emailPattern) || [])]
        .filter(e => !e.includes('example'))
        .slice(0, 10);
      
      return result;
    });
    
    return data;
  },
};

// Determine which scraper to use based on URL
function getScraperForUrl(url) {
  const domain = new URL(url).hostname.toLowerCase();
  
  if (domain.includes('whitepages')) return scrapers.whitepages;
  if (domain.includes('spokeo')) return scrapers.spokeo;
  if (domain.includes('truepeoplesearch')) return scrapers.truepeoplesearch;
  if (domain.includes('fastpeoplesearch')) return scrapers.fastpeoplesearch;
  if (domain.includes('beenverified')) return scrapers.beenverified;
  
  return scrapers.generic;
}

// Main scraping endpoint
app.post('/browser-scrape', async (req, res) => {
  const { url, searchType = 'person', waitFor = 3000 } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  
  console.log(`[Browser Scrape] Processing: ${url}`);
  
  let context = null;
  let page = null;
  
  try {
    const browserInstance = await getBrowser();
    
    // Create new context with stealth settings
    context = await browserInstance.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      geolocation: { longitude: -73.935242, latitude: 40.730610 },
      permissions: ['geolocation'],
    });
    
    // Add stealth scripts
    await context.addInitScript(() => {
      // Hide webdriver
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      
      // Mock plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      
      // Mock languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
    });
    
    page = await context.newPage();
    
    // Block unnecessary resources for speed
    await page.route('**/*', (route) => {
      const resourceType = route.request().resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        route.abort();
      } else {
        route.continue();
      }
    });
    
    const scraper = getScraperForUrl(url);
    const data = await scraper(page, url, searchType);
    
    console.log(`[Browser Scrape] Success: ${data.name || 'Data extracted'}`);
    
    res.json({ success: true, data });
    
  } catch (error) {
    console.error(`[Browser Scrape] Error:`, error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      url,
    });
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    browser: browser ? 'running' : 'not started',
    timestamp: new Date().toISOString(),
  });
});

// Supported sites endpoint
app.get('/supported-sites', (req, res) => {
  res.json({
    sites: [
      { domain: 'whitepages.com', name: 'Whitepages', types: ['person', 'address', 'phone'] },
      { domain: 'spokeo.com', name: 'Spokeo', types: ['person', 'email', 'phone'] },
      { domain: 'truepeoplesearch.com', name: 'TruePeopleSearch', types: ['person', 'address', 'phone'] },
      { domain: 'fastpeoplesearch.com', name: 'FastPeopleSearch', types: ['person', 'address', 'phone'] },
      { domain: 'beenverified.com', name: 'BeenVerified', types: ['person', 'phone', 'email'] },
    ],
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  if (browser) await browser.close();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`OSINT Browser Proxy running on http://localhost:${PORT}`);
  console.log('Endpoints:');
  console.log('  POST /browser-scrape - Scrape a URL with Playwright');
  console.log('  GET /health - Health check');
  console.log('  GET /supported-sites - List supported sites');
});
