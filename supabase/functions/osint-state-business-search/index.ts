import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StateBusinessSearchParams {
  state: 'CA' | 'NY' | 'TX' | 'FL';
  name?: string;
  address?: string;
  officerName?: string;
  fullContext?: {
    fullName?: string;
    phone?: string;
    email?: string;
  };
}

interface BusinessResult {
  entityNumber: string;
  entityName: string;
  status: string;
  entityType: string;
  jurisdiction: string;
  formationDate?: string;
  address?: string;
  agent?: string;
  officers?: Array<{ title: string; name: string }>;
  detailUrl: string;
  matchType: 'address' | 'officer' | 'name';
  confidence: number;
  state: string;
}

// Extract street components from full address
function extractStreetAddress(fullAddress: string): string {
  const parts = fullAddress.split(',');
  if (parts.length > 0) {
    return parts[0].trim();
  }
  return fullAddress.trim();
}

// California Secretary of State - bizfilesonline.sos.ca.gov
async function searchCaliforniaBusiness(params: StateBusinessSearchParams, firecrawlKey: string): Promise<BusinessResult[]> {
  const results: BusinessResult[] = [];
  
  // California uses bizfilesonline.sos.ca.gov
  // Search by entity name or officer
  const searchTerm = params.officerName || params.name || '';
  if (!searchTerm) return results;
  
  console.log('Searching California SOS for:', searchTerm);
  
  try {
    // California's search URL
    const searchUrl = `https://bizfileonline.sos.ca.gov/search/business`;
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: searchUrl,
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        waitFor: 3000,
      }),
    });
    
    if (!response.ok) {
      console.error('California SOS search failed:', response.status);
      return results;
    }
    
    const data = await response.json();
    const content = data.data?.markdown || data.markdown || '';
    
    // Parse California results
    // Format varies, look for entity numbers (C followed by digits)
    const entityPattern = /([C|LP|LLC]\d{7,})/g;
    const entities = new Set<string>();
    let match;
    
    while ((match = entityPattern.exec(content)) !== null) {
      entities.add(match[1]);
    }
    
    // Also try to find entity names with LLC, Inc, Corp patterns
    const namePattern = /([A-Z][A-Z0-9\s&.,'-]+(?:LLC|INC|CORP|LP|LLP|CORPORATION|COMPANY))/gi;
    const names: string[] = [];
    while ((match = namePattern.exec(content)) !== null) {
      names.push(match[1].trim());
    }
    
    // Create results for found entities
    let idx = 0;
    for (const entityNum of entities) {
      const entityName = names[idx] || `Entity ${entityNum}`;
      results.push({
        entityNumber: entityNum,
        entityName: entityName,
        status: 'Unknown',
        entityType: entityNum.startsWith('C') ? 'Corporation' : (entityNum.startsWith('LLC') ? 'LLC' : 'Unknown'),
        jurisdiction: 'California',
        detailUrl: `https://bizfileonline.sos.ca.gov/search/business/${entityNum}`,
        matchType: params.officerName ? 'officer' : 'name',
        confidence: 0.7,
        state: 'CA',
      });
      idx++;
    }
    
    console.log(`California search found ${results.length} results`);
  } catch (error) {
    console.error('California search error:', error);
  }
  
  // Add manual search links
  if (results.length === 0) {
    // Return a placeholder with manual search URL
    results.push({
      entityNumber: 'MANUAL_SEARCH',
      entityName: `Search California SOS for "${searchTerm}"`,
      status: 'Manual Search Required',
      entityType: 'Link',
      jurisdiction: 'California',
      detailUrl: `https://bizfileonline.sos.ca.gov/search/business`,
      matchType: 'name',
      confidence: 0,
      state: 'CA',
    });
  }
  
  return results;
}

// New York Department of State - appext20.dos.ny.gov
async function searchNewYorkBusiness(params: StateBusinessSearchParams, firecrawlKey: string): Promise<BusinessResult[]> {
  const results: BusinessResult[] = [];
  
  const searchTerm = params.officerName || params.name || '';
  if (!searchTerm) return results;
  
  console.log('Searching New York DOS for:', searchTerm);
  
  try {
    // NY uses appext20.dos.ny.gov/corp_public
    const searchUrl = `https://appext20.dos.ny.gov/corp_public/corpsearch.entity_search_entry`;
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: searchUrl,
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        waitFor: 3000,
      }),
    });
    
    if (!response.ok) {
      console.error('New York DOS search failed:', response.status);
      return results;
    }
    
    const data = await response.json();
    const content = data.data?.markdown || data.markdown || '';
    
    // Parse NY results - entity numbers are typically numeric
    const entityPattern = /(\d{6,8})/g;
    const entities = new Set<string>();
    let match;
    
    while ((match = entityPattern.exec(content)) !== null) {
      // NY entity numbers are typically 6-8 digits
      if (match[1].length >= 6 && match[1].length <= 8) {
        entities.add(match[1]);
      }
    }
    
    const namePattern = /([A-Z][A-Z0-9\s&.,'-]+(?:LLC|INC|CORP|LP|LLP|CORPORATION|COMPANY))/gi;
    const names: string[] = [];
    while ((match = namePattern.exec(content)) !== null) {
      names.push(match[1].trim());
    }
    
    let idx = 0;
    for (const entityNum of entities) {
      const entityName = names[idx] || `Entity ${entityNum}`;
      results.push({
        entityNumber: entityNum,
        entityName: entityName,
        status: 'Unknown',
        entityType: 'Business Entity',
        jurisdiction: 'New York',
        detailUrl: `https://appext20.dos.ny.gov/corp_public/CORPSEARCH.ENTITY_INFORMATION?p_nameid=${entityNum}&p_corpid=${entityNum}&p_entity_name=&p_name_type=&p_search_type=BEGINS&p_srch_results_page=0`,
        matchType: params.officerName ? 'officer' : 'name',
        confidence: 0.7,
        state: 'NY',
      });
      idx++;
    }
    
    console.log(`New York search found ${results.length} results`);
  } catch (error) {
    console.error('New York search error:', error);
  }
  
  if (results.length === 0) {
    results.push({
      entityNumber: 'MANUAL_SEARCH',
      entityName: `Search New York DOS for "${searchTerm}"`,
      status: 'Manual Search Required',
      entityType: 'Link',
      jurisdiction: 'New York',
      detailUrl: `https://appext20.dos.ny.gov/corp_public/corpsearch.entity_search_entry`,
      matchType: 'name',
      confidence: 0,
      state: 'NY',
    });
  }
  
  return results;
}

// Texas Secretary of State - direct.sos.state.tx.us
async function searchTexasBusiness(params: StateBusinessSearchParams, firecrawlKey: string): Promise<BusinessResult[]> {
  const results: BusinessResult[] = [];
  
  const searchTerm = params.officerName || params.name || '';
  if (!searchTerm) return results;
  
  console.log('Searching Texas SOS for:', searchTerm);
  
  try {
    // Texas SOSDirect search
    // The main search page for Texas entities
    const searchUrl = `https://mycpa.cpa.state.tx.us/coa/coaSearchBtn`;
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: `https://direct.sos.state.tx.us/corp_search/index.htm`,
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        waitFor: 3000,
      }),
    });
    
    if (!response.ok) {
      console.error('Texas SOS search failed:', response.status);
      return results;
    }
    
    const data = await response.json();
    const content = data.data?.markdown || data.markdown || '';
    
    // Texas filing numbers typically start with digits
    const entityPattern = /(\d{10,12})/g;
    const entities = new Set<string>();
    let match;
    
    while ((match = entityPattern.exec(content)) !== null) {
      entities.add(match[1]);
    }
    
    const namePattern = /([A-Z][A-Z0-9\s&.,'-]+(?:LLC|INC|CORP|LP|LLP|CORPORATION|COMPANY))/gi;
    const names: string[] = [];
    while ((match = namePattern.exec(content)) !== null) {
      names.push(match[1].trim());
    }
    
    let idx = 0;
    for (const entityNum of entities) {
      const entityName = names[idx] || `Entity ${entityNum}`;
      results.push({
        entityNumber: entityNum,
        entityName: entityName,
        status: 'Unknown',
        entityType: 'Business Entity',
        jurisdiction: 'Texas',
        detailUrl: `https://direct.sos.state.tx.us/corp_search/`,
        matchType: params.officerName ? 'officer' : 'name',
        confidence: 0.7,
        state: 'TX',
      });
      idx++;
    }
    
    console.log(`Texas search found ${results.length} results`);
  } catch (error) {
    console.error('Texas search error:', error);
  }
  
  if (results.length === 0) {
    results.push({
      entityNumber: 'MANUAL_SEARCH',
      entityName: `Search Texas SOS for "${searchTerm}"`,
      status: 'Manual Search Required',
      entityType: 'Link',
      jurisdiction: 'Texas',
      detailUrl: `https://direct.sos.state.tx.us/corp_search/`,
      matchType: 'name',
      confidence: 0,
      state: 'TX',
    });
  }
  
  return results;
}

// Alternative: Use Google to search state business databases
async function searchViaGoogle(params: StateBusinessSearchParams, firecrawlKey: string): Promise<BusinessResult[]> {
  const results: BusinessResult[] = [];
  const searchTerm = params.officerName || params.name || '';
  if (!searchTerm) return results;
  
  const stateConfig = {
    CA: {
      site: 'bizfileonline.sos.ca.gov',
      name: 'California',
      searchUrl: 'https://bizfileonline.sos.ca.gov/search/business',
    },
    NY: {
      site: 'appext20.dos.ny.gov',
      name: 'New York',
      searchUrl: 'https://appext20.dos.ny.gov/corp_public/corpsearch.entity_search_entry',
    },
    TX: {
      site: 'sos.state.tx.us',
      name: 'Texas',
      searchUrl: 'https://direct.sos.state.tx.us/corp_search/',
    },
    FL: {
      site: 'sunbiz.org',
      name: 'Florida',
      searchUrl: 'https://search.sunbiz.org/Inquiry/CorporationSearch/ByName',
    },
  };
  
  const config = stateConfig[params.state];
  if (!config) return results;
  
  console.log(`Searching Google for ${config.name} business records: ${searchTerm}`);
  
  try {
    // Use Firecrawl search capability
    const googleSearchUrl = `https://www.google.com/search?q=site:${config.site}+${encodeURIComponent(searchTerm)}`;
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: googleSearchUrl,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 2000,
      }),
    });
    
    if (!response.ok) {
      console.error('Google search failed:', response.status);
      return results;
    }
    
    const data = await response.json();
    const content = data.data?.markdown || data.markdown || '';
    
    // Parse Google results for business entities
    const urlPattern = new RegExp(`https?://[^\\s\\)\\]]+${config.site.replace('.', '\\.')}[^\\s\\)\\]]*`, 'gi');
    const urls = content.match(urlPattern) || [];
    
    // Extract business names near the URLs
    const namePattern = /([A-Z][A-Z0-9\s&.,'-]+(?:LLC|INC|CORP|LP|LLP|CORPORATION|COMPANY))/gi;
    const names: string[] = [];
    let match;
    while ((match = namePattern.exec(content)) !== null) {
      names.push(match[1].trim());
    }
    
    // Create results from found URLs
    const uniqueUrls = [...new Set(urls)].slice(0, 10) as string[];
    uniqueUrls.forEach((url: string, idx: number) => {
      const entityName = names[idx] || `${config.name} Business Entity`;
      
      // Try to extract entity number from URL
      const numMatch = url.match(/[A-Z]?\d{6,12}/i);
      const entityNumber = numMatch ? numMatch[0] : `RESULT_${idx + 1}`;
      
      results.push({
        entityNumber,
        entityName,
        status: 'Found via Search',
        entityType: 'Business Entity',
        jurisdiction: config.name,
        detailUrl: url,
        matchType: params.officerName ? 'officer' : 'name',
        confidence: 0.6,
        state: params.state,
      });
    });
    
    console.log(`Google search found ${results.length} results for ${config.name}`);
  } catch (error) {
    console.error('Google search error:', error);
  }
  
  return results;
}

// Score results based on context
function scoreResults(
  results: BusinessResult[],
  context?: { fullName?: string; phone?: string; email?: string; address?: string }
): BusinessResult[] {
  if (!context) return results;
  
  const nameParts = context.fullName?.toLowerCase().split(/\s+/).filter(p => p.length > 1) || [];
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : (nameParts[0] || '');
  
  return results.map(result => {
    let boost = 0;
    
    const entityLower = result.entityName.toLowerCase();
    if (lastName && entityLower.includes(lastName)) {
      boost += 0.15;
    }
    
    for (const part of nameParts) {
      if (entityLower.includes(part)) {
        boost += 0.05;
      }
    }
    
    if (result.officers && context.fullName) {
      for (const officer of result.officers) {
        if (officer.name.toLowerCase().includes(lastName)) {
          boost += 0.2;
        }
      }
    }
    
    if (result.agent && context.fullName) {
      if (result.agent.toLowerCase().includes(lastName)) {
        boost += 0.15;
      }
    }
    
    return {
      ...result,
      confidence: Math.min(1, result.confidence + boost),
    };
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const params: StateBusinessSearchParams = await req.json();
    console.log('State business search params:', JSON.stringify(params));

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Firecrawl API key not configured',
          results: [],
          manualSearchLinks: []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let allResults: BusinessResult[] = [];
    const errors: string[] = [];

    // Search based on state
    switch (params.state) {
      case 'CA':
        try {
          const caResults = await searchCaliforniaBusiness(params, firecrawlKey);
          allResults.push(...caResults);
          
          // Also try Google search as backup
          if (caResults.length <= 1 || caResults[0]?.entityNumber === 'MANUAL_SEARCH') {
            const googleResults = await searchViaGoogle(params, firecrawlKey);
            allResults.push(...googleResults);
          }
        } catch (err) {
          errors.push(`California search failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
        break;
        
      case 'NY':
        try {
          const nyResults = await searchNewYorkBusiness(params, firecrawlKey);
          allResults.push(...nyResults);
          
          if (nyResults.length <= 1 || nyResults[0]?.entityNumber === 'MANUAL_SEARCH') {
            const googleResults = await searchViaGoogle(params, firecrawlKey);
            allResults.push(...googleResults);
          }
        } catch (err) {
          errors.push(`New York search failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
        break;
        
      case 'TX':
        try {
          const txResults = await searchTexasBusiness(params, firecrawlKey);
          allResults.push(...txResults);
          
          if (txResults.length <= 1 || txResults[0]?.entityNumber === 'MANUAL_SEARCH') {
            const googleResults = await searchViaGoogle(params, firecrawlKey);
            allResults.push(...googleResults);
          }
        } catch (err) {
          errors.push(`Texas search failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
        break;
        
      default:
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Unsupported state: ${params.state}. Use osint-sunbiz-search for Florida.`,
            results: [],
            manualSearchLinks: []
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // Deduplicate by entity number
    const uniqueResults = new Map<string, BusinessResult>();
    for (const result of allResults) {
      const key = `${result.state}-${result.entityNumber}`;
      if (!uniqueResults.has(key) || result.entityNumber !== 'MANUAL_SEARCH') {
        uniqueResults.set(key, result);
      }
    }

    // Score results
    let scoredResults = Array.from(uniqueResults.values());
    if (params.fullContext) {
      scoredResults = scoreResults(scoredResults, {
        ...params.fullContext,
        address: params.address,
      });
    }

    // Sort by confidence, excluding manual search placeholders
    scoredResults.sort((a, b) => {
      if (a.entityNumber === 'MANUAL_SEARCH') return 1;
      if (b.entityNumber === 'MANUAL_SEARCH') return -1;
      return b.confidence - a.confidence;
    });

    // Generate manual search links
    const stateNames: Record<string, { name: string; url: string }> = {
      CA: { 
        name: 'California Secretary of State', 
        url: 'https://bizfileonline.sos.ca.gov/search/business' 
      },
      NY: { 
        name: 'New York Department of State', 
        url: 'https://appext20.dos.ny.gov/corp_public/corpsearch.entity_search_entry' 
      },
      TX: { 
        name: 'Texas Secretary of State', 
        url: 'https://direct.sos.state.tx.us/corp_search/' 
      },
    };

    const stateInfo = stateNames[params.state];
    const manualSearchLinks = stateInfo ? [{
      label: `Search ${stateInfo.name}`,
      url: stateInfo.url,
      description: `Manually search for "${params.officerName || params.name || 'business'}" on ${stateInfo.name}`,
    }] : [];

    console.log(`Total state business results: ${scoredResults.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        results: scoredResults.filter(r => r.entityNumber !== 'MANUAL_SEARCH'),
        manualSearchLinks,
        state: params.state,
        searchTerms: {
          name: params.name,
          officerName: params.officerName,
          address: params.address,
        },
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('State business search error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        results: [],
        manualSearchLinks: []
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
