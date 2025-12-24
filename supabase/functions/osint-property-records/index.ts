import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PropertyRecord {
  type: string;
  source: string;
  url: string;
  title: string;
  snippet: string;
  ownerName?: string;
  propertyValue?: string;
  saleDate?: string;
  salePrice?: string;
  parcelId?: string;
  taxAmount?: string;
  propertyType?: string;
  yearBuilt?: string;
  squareFeet?: string;
  bedrooms?: number;
  bathrooms?: number;
  lotSize?: string;
  lastSaleDate?: string;
  lastSalePrice?: string;
  confidence: number;
}

interface PropertySearchResult {
  address: string;
  found: boolean;
  ownershipRecords: PropertyRecord[];
  taxRecords: PropertyRecord[];
  salesHistory: PropertyRecord[];
  propertyDetails: PropertyRecord[];
  zillowData?: any;
  realtorData?: any;
  assessorRecords: PropertyRecord[];
  relatedNames: string[];
  queriesUsed: string[];
  error?: string;
}

// County assessor and property record sites by state
const STATE_PROPERTY_SITES: Record<string, { name: string; domain: string }[]> = {
  'FL': [
    { name: 'Miami-Dade', domain: 'miamidade.gov' },
    { name: 'Broward', domain: 'bcpa.net' },
    { name: 'Palm Beach', domain: 'pbcgov.org' },
    { name: 'Orange', domain: 'ocpafl.org' },
    { name: 'Hillsborough', domain: 'hcpafl.org' },
    { name: 'Pinellas', domain: 'pcpao.org' },
    { name: 'Duval', domain: 'coj.net' },
  ],
  'CA': [
    { name: 'Los Angeles', domain: 'assessor.lacounty.gov' },
    { name: 'San Diego', domain: 'sdcounty.ca.gov' },
    { name: 'Orange', domain: 'ocgov.com' },
    { name: 'San Francisco', domain: 'sfassessor.org' },
    { name: 'Alameda', domain: 'acgov.org' },
  ],
  'NY': [
    { name: 'New York City', domain: 'nyc.gov' },
    { name: 'Nassau', domain: 'nassaucountyny.gov' },
    { name: 'Suffolk', domain: 'suffolkcountyny.gov' },
    { name: 'Westchester', domain: 'westchestergov.com' },
  ],
  'TX': [
    { name: 'Harris', domain: 'hcad.org' },
    { name: 'Dallas', domain: 'dallascad.org' },
    { name: 'Tarrant', domain: 'tad.org' },
    { name: 'Bexar', domain: 'bcad.org' },
    { name: 'Travis', domain: 'traviscad.org' },
  ],
  'NV': [
    { name: 'Clark', domain: 'clarkcountynv.gov' },
    { name: 'Washoe', domain: 'washoecounty.gov' },
  ],
  'GA': [
    { name: 'Fulton', domain: 'fultoncountyga.gov' },
    { name: 'DeKalb', domain: 'dekalbcountyga.gov' },
    { name: 'Cobb', domain: 'cobbcounty.org' },
    { name: 'Gwinnett', domain: 'gwinnettcounty.com' },
  ],
  'AZ': [
    { name: 'Maricopa', domain: 'mcassessor.maricopa.gov' },
    { name: 'Pima', domain: 'pima.gov' },
  ],
};

// Extract potential owner names from search results
function extractOwnerNames(text: string, addressParts: string[]): string[] {
  const names: string[] = [];
  
  // Common patterns for owner names in property records
  const ownerPatterns = [
    /owner[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi,
    /owned\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi,
    /property\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi,
    /grantor[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi,
    /grantee[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi,
    /([A-Z][a-z]+(?:\s+[A-Z]\.?\s+)?[A-Z][a-z]+)\s+(?:trust|estate|llc|inc)/gi,
  ];
  
  for (const pattern of ownerPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (match[1] && match[1].length > 3 && match[1].length < 50) {
        // Filter out common false positives
        const name = match[1].trim();
        if (!addressParts.some(part => name.toLowerCase().includes(part.toLowerCase()))) {
          names.push(name);
        }
      }
    }
  }
  
  return [...new Set(names)]; // Remove duplicates
}

// Extract property values from text
function extractPropertyValue(text: string): string | undefined {
  const valuePatterns = [
    /\$([0-9,]+(?:\.[0-9]{2})?)/g,
    /assessed\s+(?:value|at)\s+\$?([0-9,]+)/gi,
    /market\s+value\s+\$?([0-9,]+)/gi,
    /appraised\s+at\s+\$?([0-9,]+)/gi,
  ];
  
  for (const pattern of valuePatterns) {
    const match = pattern.exec(text);
    if (match && match[1]) {
      const value = match[1].replace(/,/g, '');
      const numValue = parseInt(value);
      // Filter out unrealistic values (less than $10k or more than $100M)
      if (numValue >= 10000 && numValue <= 100000000) {
        return `$${numValue.toLocaleString()}`;
      }
    }
  }
  return undefined;
}

// Extract sale dates from text
function extractSaleDate(text: string): string | undefined {
  const datePatterns = [
    /sold\s+(?:on\s+)?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi,
    /sale\s+date[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi,
    /recorded[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi,
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/g, // Generic date pattern
  ];
  
  for (const pattern of datePatterns) {
    const match = pattern.exec(text);
    if (match && match[1]) {
      return match[1];
    }
  }
  return undefined;
}

// Build Google Dork queries for property records
function buildPropertyQueries(
  address: string,
  state?: string,
  ownerName?: string
): { query: string; type: string; priority: number }[] {
  const queries: { query: string; type: string; priority: number }[] = [];
  const encodedAddress = address.replace(/[^\w\s,]/g, '');
  
  // High priority: Real estate sites with exact address
  queries.push({
    query: `"${encodedAddress}" site:zillow.com`,
    type: 'zillow',
    priority: 1,
  });
  
  queries.push({
    query: `"${encodedAddress}" site:realtor.com`,
    type: 'realtor',
    priority: 1,
  });
  
  queries.push({
    query: `"${encodedAddress}" site:redfin.com`,
    type: 'redfin',
    priority: 1,
  });
  
  // Property ownership and tax records
  queries.push({
    query: `"${encodedAddress}" property records owner`,
    type: 'ownership',
    priority: 2,
  });
  
  queries.push({
    query: `"${encodedAddress}" tax records assessment`,
    type: 'tax',
    priority: 2,
  });
  
  queries.push({
    query: `"${encodedAddress}" deed transfer sale history`,
    type: 'sales',
    priority: 2,
  });
  
  // County assessor searches
  if (state && STATE_PROPERTY_SITES[state]) {
    for (const site of STATE_PROPERTY_SITES[state].slice(0, 3)) {
      queries.push({
        query: `"${encodedAddress}" site:${site.domain}`,
        type: 'assessor',
        priority: 3,
      });
    }
  }
  
  // Generic property assessor search
  queries.push({
    query: `"${encodedAddress}" property appraiser assessor`,
    type: 'assessor',
    priority: 3,
  });
  
  // People search sites for address residents
  queries.push({
    query: `"${encodedAddress}" site:truepeoplesearch.com`,
    type: 'residents',
    priority: 4,
  });
  
  queries.push({
    query: `"${encodedAddress}" site:fastpeoplesearch.com`,
    type: 'residents',
    priority: 4,
  });
  
  queries.push({
    query: `"${encodedAddress}" site:whitepages.com`,
    type: 'residents',
    priority: 4,
  });
  
  // If owner name is provided, search for their properties
  if (ownerName) {
    queries.push({
      query: `"${ownerName}" property owner "${state || ''}"`,
      type: 'owner_search',
      priority: 3,
    });
    
    queries.push({
      query: `"${ownerName}" real estate "${encodedAddress}"`,
      type: 'owner_verification',
      priority: 2,
    });
  }
  
  // Court records for property-related filings
  queries.push({
    query: `"${encodedAddress}" court records foreclosure lien`,
    type: 'legal',
    priority: 5,
  });
  
  return queries.sort((a, b) => a.priority - b.priority);
}

// Execute Google Custom Search
async function executeGoogleSearch(
  query: string,
  apiKey: string,
  searchEngineId: string
): Promise<any[]> {
  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}&num=10`;
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Google Search API error: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('Error executing Google search:', error);
    return [];
  }
}

// Classify search result by type
function classifyResult(item: any, queryType: string): PropertyRecord {
  const url = item.link || '';
  const title = item.title || '';
  const snippet = item.snippet || '';
  const combinedText = `${title} ${snippet}`;
  
  let type = 'general';
  let confidence = 0.5;
  
  // Determine type based on source and content
  if (url.includes('zillow.com')) {
    type = 'zillow_listing';
    confidence = 0.9;
  } else if (url.includes('realtor.com')) {
    type = 'realtor_listing';
    confidence = 0.9;
  } else if (url.includes('redfin.com')) {
    type = 'redfin_listing';
    confidence = 0.9;
  } else if (url.includes('truepeoplesearch.com') || url.includes('fastpeoplesearch.com') || url.includes('whitepages.com')) {
    type = 'resident_lookup';
    confidence = 0.7;
  } else if (combinedText.toLowerCase().includes('assessor') || combinedText.toLowerCase().includes('appraiser')) {
    type = 'assessor_record';
    confidence = 0.8;
  } else if (combinedText.toLowerCase().includes('tax') && (combinedText.toLowerCase().includes('property') || combinedText.toLowerCase().includes('record'))) {
    type = 'tax_record';
    confidence = 0.8;
  } else if (combinedText.toLowerCase().includes('deed') || combinedText.toLowerCase().includes('transfer') || combinedText.toLowerCase().includes('sale')) {
    type = 'deed_record';
    confidence = 0.7;
  } else if (combinedText.toLowerCase().includes('foreclosure') || combinedText.toLowerCase().includes('lien')) {
    type = 'legal_record';
    confidence = 0.7;
  } else if (queryType === 'ownership') {
    type = 'ownership_info';
    confidence = 0.6;
  }
  
  const record: PropertyRecord = {
    type,
    source: new URL(url).hostname.replace('www.', ''),
    url,
    title,
    snippet,
    confidence,
  };
  
  // Extract structured data from snippet
  const extractedValue = extractPropertyValue(combinedText);
  if (extractedValue) {
    record.propertyValue = extractedValue;
  }
  
  const extractedDate = extractSaleDate(combinedText);
  if (extractedDate) {
    record.saleDate = extractedDate;
  }
  
  // Extract property details from Zillow/Realtor snippets
  const bedroomMatch = combinedText.match(/(\d+)\s*(?:bed|bedroom|br)/i);
  if (bedroomMatch) {
    record.bedrooms = parseInt(bedroomMatch[1]);
  }
  
  const bathroomMatch = combinedText.match(/(\d+(?:\.\d)?)\s*(?:bath|bathroom|ba)/i);
  if (bathroomMatch) {
    record.bathrooms = parseFloat(bathroomMatch[1]);
  }
  
  const sqftMatch = combinedText.match(/([0-9,]+)\s*(?:sq\.?\s*ft|sqft|square\s*feet)/i);
  if (sqftMatch) {
    record.squareFeet = sqftMatch[1].replace(/,/g, '');
  }
  
  const yearMatch = combinedText.match(/built\s+(?:in\s+)?(\d{4})/i);
  if (yearMatch) {
    record.yearBuilt = yearMatch[1];
  }
  
  return record;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { address, ownerName, state: providedState } = await req.json();
    
    if (!address) {
      return new Response(
        JSON.stringify({ error: 'Address is required', found: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('Property records search for:', address);
    console.log('Owner name hint:', ownerName);
    
    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY');
    const GOOGLE_SEARCH_ENGINE_ID = Deno.env.get('GOOGLE_SEARCH_ENGINE_ID');
    
    if (!GOOGLE_API_KEY || !GOOGLE_SEARCH_ENGINE_ID) {
      console.error('Missing Google API credentials');
      return new Response(
        JSON.stringify({ error: 'Search service not configured', found: false }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Extract state from address if not provided
    let state = providedState;
    if (!state) {
      const stateMatch = address.match(/,\s*([A-Z]{2})\s*\d{5}/i) ||
                         address.match(/,\s*([A-Z]{2})\s*$/i);
      state = stateMatch ? stateMatch[1].toUpperCase() : null;
      
      // Check for full state names
      if (!state) {
        const stateNameMatch = address.match(/,\s*(Florida|California|New York|Texas|Nevada|Georgia|Arizona)\s*/i);
        if (stateNameMatch) {
          const stateMap: Record<string, string> = {
            'florida': 'FL',
            'california': 'CA',
            'new york': 'NY',
            'texas': 'TX',
            'nevada': 'NV',
            'georgia': 'GA',
            'arizona': 'AZ',
          };
          state = stateMap[stateNameMatch[1].toLowerCase()];
        }
      }
    }
    console.log('Detected state:', state);
    
    // Extract address parts for filtering
    const addressParts = address.split(/[,\s]+/).filter((p: string) => p.length > 2);
    
    // Build queries
    const queries = buildPropertyQueries(address, state, ownerName);
    console.log(`Built ${queries.length} search queries`);
    
    // Execute searches (limit to top 8 queries to stay within rate limits)
    const searchPromises = queries.slice(0, 8).map(async (q) => {
      const results = await executeGoogleSearch(q.query, GOOGLE_API_KEY, GOOGLE_SEARCH_ENGINE_ID);
      return { queryType: q.type, results };
    });
    
    const searchResults = await Promise.all(searchPromises);
    
    // Process and categorize results
    const ownershipRecords: PropertyRecord[] = [];
    const taxRecords: PropertyRecord[] = [];
    const salesHistory: PropertyRecord[] = [];
    const propertyDetails: PropertyRecord[] = [];
    const assessorRecords: PropertyRecord[] = [];
    const allNames: string[] = [];
    const seenUrls = new Set<string>();
    
    for (const { queryType, results } of searchResults) {
      for (const item of results) {
        const url = item.link || '';
        
        // Skip duplicates
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);
        
        const record = classifyResult(item, queryType);
        const combinedText = `${item.title || ''} ${item.snippet || ''}`;
        
        // Extract names
        const names = extractOwnerNames(combinedText, addressParts);
        allNames.push(...names);
        
        // Categorize record
        switch (record.type) {
          case 'zillow_listing':
          case 'realtor_listing':
          case 'redfin_listing':
            propertyDetails.push(record);
            break;
          case 'tax_record':
            taxRecords.push(record);
            break;
          case 'deed_record':
          case 'legal_record':
            salesHistory.push(record);
            break;
          case 'assessor_record':
            assessorRecords.push(record);
            break;
          case 'ownership_info':
          case 'owner_verification':
          case 'resident_lookup':
            ownershipRecords.push(record);
            break;
          default:
            // Add to appropriate category based on content
            if (record.propertyValue || record.bedrooms) {
              propertyDetails.push(record);
            } else if (record.saleDate) {
              salesHistory.push(record);
            } else {
              ownershipRecords.push(record);
            }
        }
      }
    }
    
    // Deduplicate and sort names by frequency
    const nameCounts = allNames.reduce((acc, name) => {
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const relatedNames = Object.entries(nameCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name]) => name);
    
    // Sort records by confidence
    const sortByConfidence = (a: PropertyRecord, b: PropertyRecord) => b.confidence - a.confidence;
    ownershipRecords.sort(sortByConfidence);
    taxRecords.sort(sortByConfidence);
    salesHistory.sort(sortByConfidence);
    propertyDetails.sort(sortByConfidence);
    assessorRecords.sort(sortByConfidence);
    
    const result: PropertySearchResult = {
      address,
      found: ownershipRecords.length > 0 || propertyDetails.length > 0 || taxRecords.length > 0,
      ownershipRecords: ownershipRecords.slice(0, 10),
      taxRecords: taxRecords.slice(0, 5),
      salesHistory: salesHistory.slice(0, 10),
      propertyDetails: propertyDetails.slice(0, 10),
      assessorRecords: assessorRecords.slice(0, 5),
      relatedNames,
      queriesUsed: queries.slice(0, 8).map(q => q.query),
    };
    
    console.log(`Property search complete: ${ownershipRecords.length} ownership, ${taxRecords.length} tax, ${salesHistory.length} sales, ${propertyDetails.length} details`);
    console.log(`Found ${relatedNames.length} related names:`, relatedNames.slice(0, 5));
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in osint-property-records:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage, found: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
