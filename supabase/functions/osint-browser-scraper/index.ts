import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Sites that require browser automation
const BROWSER_REQUIRED_SITES = [
  'whitepages.com',
  'spokeo.com',
  'beenverified.com',
  'intelius.com',
  'truepeoplesearch.com',
  'fastpeoplesearch.com',
  'peoplefinders.com',
  'usphonebook.com',
];

interface BrowserScrapeRequest {
  url: string;
  searchType: 'address' | 'person' | 'phone' | 'email';
  waitFor?: string;
  extractors?: Record<string, string>;
}

interface ScrapeResult {
  success: boolean;
  source: string;
  url: string;
  data?: any;
  error?: string;
  method: 'browserless' | 'local_proxy' | 'direct';
}

// Browserless.io integration for cloud-based headless browser
async function scrapeWithBrowserless(request: BrowserScrapeRequest): Promise<ScrapeResult> {
  const browserlessKey = Deno.env.get('BROWSERLESS_API_KEY');
  
  if (!browserlessKey) {
    return {
      success: false,
      source: getDomainName(request.url),
      url: request.url,
      error: 'BROWSERLESS_API_KEY not configured',
      method: 'browserless',
    };
  }

  try {
    // Use Browserless scrape API
    const response = await fetch(`https://chrome.browserless.io/scrape?token=${browserlessKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: request.url,
        waitFor: request.waitFor || 5000,
        elements: getExtractorsForSite(request.url, request.searchType),
        gotoOptions: {
          waitUntil: 'networkidle2',
          timeout: 30000,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Browserless error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const parsedData = parseScrapedData(request.url, request.searchType, result);

    return {
      success: true,
      source: getDomainName(request.url),
      url: request.url,
      data: parsedData,
      method: 'browserless',
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Browserless scrape error:', error);
    return {
      success: false,
      source: getDomainName(request.url),
      url: request.url,
      error: errorMessage,
      method: 'browserless',
    };
  }
}

// Alternative: ScrapingBee integration
async function scrapeWithScrapingBee(request: BrowserScrapeRequest): Promise<ScrapeResult> {
  const scrapingBeeKey = Deno.env.get('SCRAPINGBEE_API_KEY');
  
  if (!scrapingBeeKey) {
    return {
      success: false,
      source: getDomainName(request.url),
      url: request.url,
      error: 'SCRAPINGBEE_API_KEY not configured',
      method: 'browserless',
    };
  }

  try {
    const params = new URLSearchParams({
      api_key: scrapingBeeKey,
      url: request.url,
      render_js: 'true',
      wait: '5000',
      block_ads: 'true',
      premium_proxy: 'true', // Use residential proxies
    });

    const response = await fetch(`https://app.scrapingbee.com/api/v1?${params}`);
    
    if (!response.ok) {
      throw new Error(`ScrapingBee error: ${response.status}`);
    }

    const html = await response.text();
    const parsedData = parseHtmlContent(request.url, request.searchType, html);

    return {
      success: true,
      source: getDomainName(request.url),
      url: request.url,
      data: parsedData,
      method: 'browserless',
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('ScrapingBee scrape error:', error);
    return {
      success: false,
      source: getDomainName(request.url),
      url: request.url,
      error: errorMessage,
      method: 'browserless',
    };
  }
}

// Local proxy fallback (connects to user's local Playwright server)
async function scrapeWithLocalProxy(request: BrowserScrapeRequest): Promise<ScrapeResult> {
  const localProxyUrl = Deno.env.get('LOCAL_PROXY_URL') || 'http://localhost:3001';
  
  try {
    const response = await fetch(`${localProxyUrl}/browser-scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: request.url,
        searchType: request.searchType,
        waitFor: request.waitFor,
      }),
    });

    if (!response.ok) {
      throw new Error(`Local proxy error: ${response.status}`);
    }

    const result = await response.json();

    return {
      success: true,
      source: getDomainName(request.url),
      url: request.url,
      data: result.data,
      method: 'local_proxy',
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Local proxy scrape error:', error);
    return {
      success: false,
      source: getDomainName(request.url),
      url: request.url,
      error: errorMessage,
      method: 'local_proxy',
    };
  }
}

// Get CSS selectors for extracting data from specific sites
function getExtractorsForSite(url: string, searchType: string): any[] {
  const domain = getDomainName(url).toLowerCase();
  
  // Whitepages extractors
  if (domain.includes('whitepages')) {
    if (url.includes('/address/')) {
      return [
        { selector: 'h1', property: 'text' },
        { selector: '[data-testid="resident"], .resident-name', property: 'text' },
        { selector: '.property-detail', property: 'text' },
        { selector: '.resident-card a', property: 'href' },
        { selector: '.property-value', property: 'text' },
      ];
    }
    return [
      { selector: 'h1[data-testid="name"], h1.hero-header', property: 'text' },
      { selector: '[data-testid="age"]', property: 'text' },
      { selector: '[data-testid="current-address"]', property: 'text' },
      { selector: '[data-testid="phone"]', property: 'text' },
      { selector: '[data-testid="email"]', property: 'text' },
      { selector: '[data-testid="relative"] a', property: 'text' },
      { selector: '[data-testid="relative"] a', property: 'href' },
    ];
  }
  
  // Spokeo extractors
  if (domain.includes('spokeo')) {
    return [
      { selector: 'h1.name', property: 'text' },
      { selector: '.age-info', property: 'text' },
      { selector: '.address-section', property: 'text' },
      { selector: '.phone-section', property: 'text' },
      { selector: '.email-section', property: 'text' },
      { selector: '.relative-link', property: 'text' },
      { selector: '.profile-image img', property: 'src' },
    ];
  }
  
  // TruePeopleSearch extractors
  if (domain.includes('truepeoplesearch')) {
    return [
      { selector: 'h1.oh1', property: 'text' },
      { selector: '[data-detail="age"]', property: 'text' },
      { selector: '[data-detail="address"]', property: 'text' },
      { selector: '[data-detail="phone"]', property: 'text' },
      { selector: '[data-detail="email"]', property: 'text' },
      { selector: '[data-detail="relative"] a', property: 'text' },
    ];
  }
  
  // FastPeopleSearch extractors
  if (domain.includes('fastpeoplesearch')) {
    return [
      { selector: 'h1.larger', property: 'text' },
      { selector: '.age', property: 'text' },
      { selector: '.address-link', property: 'text' },
      { selector: '.phone-number', property: 'text' },
      { selector: '.email-link', property: 'text' },
      { selector: '#relatives a', property: 'text' },
    ];
  }
  
  // BeenVerified extractors
  if (domain.includes('beenverified')) {
    return [
      { selector: '.profile-name', property: 'text' },
      { selector: '.age-display', property: 'text' },
      { selector: '.address-item', property: 'text' },
      { selector: '.phone-item', property: 'text' },
      { selector: '.email-item', property: 'text' },
    ];
  }
  
  // Generic fallback
  return [
    { selector: 'h1', property: 'text' },
    { selector: 'h2', property: 'text' },
    { selector: '.address, [class*="address"]', property: 'text' },
    { selector: '.phone, [class*="phone"]', property: 'text' },
    { selector: '.email, [class*="email"]', property: 'text' },
  ];
}

// Parse scraped data into structured format
function parseScrapedData(url: string, searchType: string, rawResult: any): any {
  const domain = getDomainName(url).toLowerCase();
  const data: any = {
    source: domain,
    url,
    timestamp: new Date().toISOString(),
    exists: true,
  };
  
  if (!rawResult?.data || rawResult.data.length === 0) {
    return { ...data, exists: false, error: 'No data extracted' };
  }

  // Process extracted elements
  const elements = rawResult.data;
  
  // Extract name from h1
  const nameElement = elements.find((e: any) => 
    e.selector?.includes('h1') || e.selector?.includes('name')
  );
  if (nameElement?.results?.[0]?.text) {
    data.name = nameElement.results[0].text.trim();
  }
  
  // Extract age
  const ageElement = elements.find((e: any) => e.selector?.includes('age'));
  if (ageElement?.results?.[0]?.text) {
    const ageMatch = ageElement.results[0].text.match(/(\d+)/);
    data.age = ageMatch ? parseInt(ageMatch[1]) : null;
  }
  
  // Extract addresses
  data.addresses = [];
  const addressElements = elements.filter((e: any) => e.selector?.includes('address'));
  addressElements.forEach((ae: any) => {
    ae.results?.forEach((r: any) => {
      if (r.text && r.text.length > 5) {
        data.addresses.push(r.text.trim());
      }
    });
  });
  
  // Extract phones
  data.phones = [];
  const phoneElements = elements.filter((e: any) => e.selector?.includes('phone'));
  phoneElements.forEach((pe: any) => {
    pe.results?.forEach((r: any) => {
      const phone = r.text?.replace(/[^\d-()+ ]/g, '').trim();
      if (phone && phone.length >= 10) {
        data.phones.push(phone);
      }
    });
  });
  
  // Extract emails
  data.emails = [];
  const emailElements = elements.filter((e: any) => e.selector?.includes('email'));
  emailElements.forEach((ee: any) => {
    ee.results?.forEach((r: any) => {
      if (r.text?.includes('@')) {
        data.emails.push(r.text.trim());
      }
    });
  });
  
  // Extract relatives
  data.relatives = [];
  const relativeElements = elements.filter((e: any) => e.selector?.includes('relative'));
  relativeElements.forEach((re: any) => {
    re.results?.forEach((r: any) => {
      if (r.text && r.text.length > 2) {
        const relative: any = { name: r.text.trim() };
        if (r.attributes?.href) {
          relative.profileUrl = r.attributes.href.startsWith('http') 
            ? r.attributes.href 
            : `https://${domain}${r.attributes.href}`;
        }
        data.relatives.push(relative);
      }
    });
  });
  
  // Extract residents (for address searches)
  if (searchType === 'address') {
    data.residents = [];
    const residentElements = elements.filter((e: any) => 
      e.selector?.includes('resident') || e.selector?.includes('occupant')
    );
    residentElements.forEach((re: any) => {
      re.results?.forEach((r: any) => {
        if (r.text && r.text.length > 2) {
          data.residents.push({
            name: r.text.trim(),
            profileUrl: r.attributes?.href || null,
          });
        }
      });
    });
  }
  
  // Extract profile image
  const imageElement = elements.find((e: any) => 
    e.selector?.includes('img') || e.selector?.includes('avatar') || e.selector?.includes('image')
  );
  if (imageElement?.results?.[0]?.attributes?.src) {
    data.avatarUrl = imageElement.results[0].attributes.src;
  }
  
  return data;
}

// Parse raw HTML content (for ScrapingBee fallback)
function parseHtmlContent(url: string, searchType: string, html: string): any {
  const domain = getDomainName(url).toLowerCase();
  const data: any = {
    source: domain,
    url,
    timestamp: new Date().toISOString(),
    exists: true,
    rawHtmlLength: html.length,
  };
  
  // Check for common "not found" indicators
  const notFoundPatterns = [
    'no results found',
    'person not found',
    'address not found',
    'we couldn\'t find',
    '0 results',
    'no records',
  ];
  
  const lowerHtml = html.toLowerCase();
  if (notFoundPatterns.some(p => lowerHtml.includes(p))) {
    return { ...data, exists: false };
  }
  
  // Extract name (look for h1 tags)
  const h1Match = html.match(/<h1[^>]*>([^<]+)</i);
  if (h1Match) {
    data.name = h1Match[1].trim();
  }
  
  // Extract age
  const agePatterns = [
    /(\d{2,3})\s*(?:years?\s*old|yrs?)/i,
    /age[:\s]*(\d{2,3})/i,
  ];
  for (const pattern of agePatterns) {
    const match = html.match(pattern);
    if (match) {
      data.age = parseInt(match[1]);
      break;
    }
  }
  
  // Extract phone numbers
  data.phones = [];
  const phonePattern = /(\(?[0-9]{3}\)?[\s.-]?[0-9]{3}[\s.-]?[0-9]{4})/g;
  const phoneMatches = html.match(phonePattern);
  if (phoneMatches) {
    data.phones = [...new Set(phoneMatches)].slice(0, 10);
  }
  
  // Extract emails
  data.emails = [];
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emailMatches = html.match(emailPattern);
  if (emailMatches) {
    data.emails = [...new Set(emailMatches)]
      .filter(e => !e.includes('example') && !e.includes('domain'))
      .slice(0, 10);
  }
  
  return data;
}

function getDomainName(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch {
    return url;
  }
}

function requiresBrowser(url: string): boolean {
  const domain = getDomainName(url).toLowerCase();
  return BROWSER_REQUIRED_SITES.some(site => domain.includes(site));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, searchType = 'person', method = 'auto' } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Browser Scraper] Processing ${url} (type: ${searchType}, method: ${method})`);

    let result: ScrapeResult;

    // Method selection logic
    if (method === 'browserless' || (method === 'auto' && Deno.env.get('BROWSERLESS_API_KEY'))) {
      result = await scrapeWithBrowserless({ url, searchType });
    } else if (method === 'scrapingbee' || (method === 'auto' && Deno.env.get('SCRAPINGBEE_API_KEY'))) {
      result = await scrapeWithScrapingBee({ url, searchType });
    } else if (method === 'local_proxy') {
      result = await scrapeWithLocalProxy({ url, searchType });
    } else {
      // Try methods in order
      result = await scrapeWithBrowserless({ url, searchType });
      
      if (!result.success && result.error?.includes('not configured')) {
        result = await scrapeWithScrapingBee({ url, searchType });
      }
      
      if (!result.success && result.error?.includes('not configured')) {
        result = await scrapeWithLocalProxy({ url, searchType });
      }
    }

    console.log(`[Browser Scraper] Result: ${result.success ? 'Success' : 'Failed'} via ${result.method}`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Browser Scraper] Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
