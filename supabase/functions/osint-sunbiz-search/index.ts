import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SunbizSearchParams {
  // Search by name
  name?: string;
  // Search by address
  address?: string;
  // Search by officer/registered agent name
  officerName?: string;
  // Search by zip code
  zipCode?: string;
  // All relevant data for matching
  fullContext?: {
    fullName?: string;
    phone?: string;
    email?: string;
  };
}

interface BusinessResult {
  documentNumber: string;
  entityName: string;
  status: string;
  filingType: string;
  dateField?: string;
  address?: string;
  registeredAgent?: string;
  officers?: Array<{ title: string; name: string }>;
  detailUrl: string;
  matchType: 'address' | 'officer' | 'name' | 'zip';
  confidence: number;
}

// Extract street components from full address for Sunbiz address search
function extractStreetAddress(fullAddress: string): string {
  // Sunbiz address search works best with just street address (no city/state/zip)
  // Examples: "123 Main Street" from "123 Main Street, Miami, FL 33101"
  const parts = fullAddress.split(',');
  if (parts.length > 0) {
    // Take just the street portion
    return parts[0].trim();
  }
  return fullAddress.trim();
}

// Extract zip code from full address
function extractZipCode(fullAddress: string) {
  const zipMatch = fullAddress.match(/\b(\d{5})(?:-\d{4})?\b/);
  return zipMatch ? zipMatch[1] : null;
}

// Parse Sunbiz search results from HTML/markdown
function parseSearchResults(
  content: string,
  matchType: 'address' | 'officer' | 'name' | 'zip'
): BusinessResult[] {
  const results: BusinessResult[] = [];

  // Firecrawl markdown for SearchResults typically looks like:
  // | Corporate Name | Document Number | Status |
  // | [THE COMPANY, LLC](https://...SearchResultDetail?...searchNameOrder=...&listNameOrder=...) | L00000005662 | Active |

  const rowPattern = /\|\s*\[([^\]]+?)\]\((https?:\/\/[^)]+SearchResultDetail[^)]+)\)\s*\|\s*([A-Z0-9]{4,})\s*\|\s*([^|\n]+?)\s*\|/g;
  let match: RegExpExecArray | null;

  while ((match = rowPattern.exec(content)) !== null) {
    const entityName = match[1].trim();
    const detailUrl = match[2].trim();
    const documentNumber = match[3].trim();
    const status = match[4].trim();

    results.push({
      documentNumber,
      entityName,
      status,
      filingType: 'Unknown',
      detailUrl,
      matchType,
      confidence: matchType === 'address' ? 0.85 : matchType === 'officer' ? 0.9 : matchType === 'zip' ? 0.7 : 0.75,
    });
  }

  // Fallback: try to infer from SearchResultDetail links even if table separators are missing
  if (results.length === 0) {
    const linkPattern = /\[([^\]]+?)\]\((https?:\/\/[^)]+SearchResultDetail[^)]+)\)/g;
    while ((match = linkPattern.exec(content)) !== null) {
      const entityName = match[1].trim();
      const detailUrl = match[2].trim();

      // Best-effort doc number extraction from querystring
      const docMatch = detailUrl.match(/searchNameOrder=([^&]+)/i);
      const documentNumber = docMatch ? decodeURIComponent(docMatch[1]).trim() : `SUNBIZ_${Date.now()}_${results.length}`;

      results.push({
        documentNumber,
        entityName,
        status: 'Unknown',
        filingType: 'Unknown',
        detailUrl,
        matchType,
        confidence: matchType === 'address' ? 0.7 : matchType === 'officer' ? 0.8 : 0.65,
      });
    }
  }

  return results;
}

// Fetch detail page for a business to get officers and registered agent
async function fetchBusinessDetails(detailUrl: string, firecrawlKey: string): Promise<{
  officers?: Array<{ title: string; name: string }>;
  registeredAgent?: string;
  principalAddress?: string;
  mailingAddress?: string;
  filingDate?: string;
  lastEventDate?: string;
} | null> {
  try {
    console.log('Fetching business details from:', detailUrl);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: detailUrl,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 2000,
      }),
    });
    
    if (!response.ok) {
      console.error('Failed to fetch business details:', response.status);
      return null;
    }
    
    const data = await response.json();
    const content = data.data?.markdown || data.markdown || '';
    
    // Extract officers
    const officers: Array<{ title: string; name: string }> = [];
    
    // Look for officer patterns: Title: Name or Name (Title)
    const officerPatterns = [
      /(?:President|CEO|CFO|Secretary|Treasurer|Director|Manager|Member|Chairman|Vice President|VP|Managing Member)\s*[:\-]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/gi,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s*\((?:President|CEO|CFO|Secretary|Treasurer|Director|Manager|Member|Chairman|Vice President|VP|Managing Member)\)/gi,
    ];
    
    for (const pattern of officerPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const titleMatch = content.slice(Math.max(0, match.index - 50), match.index + match[0].length + 50)
          .match(/(?:President|CEO|CFO|Secretary|Treasurer|Director|Manager|Member|Chairman|Vice President|VP|Managing Member)/i);
        
        if (titleMatch) {
          officers.push({
            title: titleMatch[0],
            name: match[1]?.trim() || '',
          });
        }
      }
    }
    
    // Extract registered agent
    const raMatch = content.match(/Registered Agent(?:\s+Name)?[:\s]+([A-Z][A-Z0-9\s&.,'-]+?)(?:\n|Principal|Mailing|Address)/i);
    const registeredAgent = raMatch ? raMatch[1].trim() : undefined;
    
    // Extract addresses
    const principalMatch = content.match(/Principal Address[:\s]+(.+?)(?:Mailing|Registered|Officer|Changed)/is);
    const principalAddress = principalMatch ? principalMatch[1].trim().replace(/\n/g, ', ') : undefined;
    
    const mailingMatch = content.match(/Mailing Address[:\s]+(.+?)(?:Principal|Registered|Officer|Changed)/is);
    const mailingAddress = mailingMatch ? mailingMatch[1].trim().replace(/\n/g, ', ') : undefined;
    
    // Extract dates
    const filingDateMatch = content.match(/(?:Date Filed|Filing Date)[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i);
    const filingDate = filingDateMatch ? filingDateMatch[1] : undefined;
    
    const lastEventMatch = content.match(/(?:Last Event|Event Date)[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i);
    const lastEventDate = lastEventMatch ? lastEventMatch[1] : undefined;
    
    return {
      officers: officers.length > 0 ? officers : undefined,
      registeredAgent,
      principalAddress,
      mailingAddress,
      filingDate,
      lastEventDate,
    };
  } catch (error) {
    console.error('Error fetching business details:', error);
    return null;
  }
}

// Search Sunbiz by address
async function searchByAddress(address: string, firecrawlKey: string): Promise<BusinessResult[]> {
  const streetAddress = extractStreetAddress(address);
  console.log('Searching Sunbiz by address:', streetAddress);

  // IMPORTANT: /ByAddress is a form page; results are served from /SearchResults.
  const resultsUrl = `https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResults?InquiryType=ByAddress&SearchTerm=${encodeURIComponent(streetAddress)}`;

  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: resultsUrl,
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        waitFor: 2000,
      }),
    });

    if (!response.ok) {
      console.error('Sunbiz address search request failed:', response.status);
      return [];
    }

    const data = await response.json();
    const markdown = data.data?.markdown || data.markdown || '';
    const html = data.data?.html || data.html || '';

    console.log('Sunbiz address search response length:', markdown.length);

    if (markdown.includes('No records found') || markdown.includes('No entities found') || markdown.length < 100) {
      console.log('No Sunbiz results found for address');
      return [];
    }

    return parseSearchResults(markdown + '\n' + html, 'address');
  } catch (error) {
    console.error('Error in Sunbiz address search:', error);
    return [];
  }
}

// Search Sunbiz by officer/registered agent name
async function searchByOfficer(name: string, firecrawlKey: string): Promise<BusinessResult[]> {
  console.log('Searching Sunbiz by officer/registered agent:', name);

  // /ByOfficerOrRegisteredAgent is a form page; results are served from /SearchResults.
  const resultsUrl = `https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResults?InquiryType=OfficerRegisteredAgent&SearchTerm=${encodeURIComponent(name)}`;

  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: resultsUrl,
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        waitFor: 2000,
      }),
    });

    if (!response.ok) {
      console.error('Sunbiz officer search request failed:', response.status);
      return [];
    }

    const data = await response.json();
    const markdown = data.data?.markdown || data.markdown || '';
    const html = data.data?.html || data.html || '';

    console.log('Sunbiz officer search response length:', markdown.length);

    if (markdown.includes('No records found') || markdown.includes('No entities found') || markdown.length < 100) {
      console.log('No Sunbiz results found for officer');
      return [];
    }

    return parseSearchResults(markdown + '\n' + html, 'officer');
  } catch (error) {
    console.error('Error in Sunbiz officer search:', error);
    return [];
  }
}

// Search Sunbiz by zip code
async function searchByZip(zipCode: string, firecrawlKey: string): Promise<BusinessResult[]> {
  console.log('Searching Sunbiz by zip code:', zipCode);

  // /ByZip is a form page; results are served from /SearchResults.
  const resultsUrl = `https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResults?InquiryType=ZipCode&SearchTerm=${encodeURIComponent(zipCode)}`;

  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: resultsUrl,
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        waitFor: 2000,
      }),
    });

    if (!response.ok) {
      console.error('Sunbiz zip search request failed:', response.status);
      return [];
    }

    const data = await response.json();
    const markdown = data.data?.markdown || data.markdown || '';
    const html = data.data?.html || data.html || '';

    console.log('Sunbiz zip search response length:', markdown.length);

    if (markdown.includes('No records found') || markdown.includes('No entities found') || markdown.length < 100) {
      console.log('No Sunbiz results found for zip');
      return [];
    }

    const results = parseSearchResults(markdown + '\n' + html, 'zip');
    return results.slice(0, 20);
  } catch (error) {
    console.error('Error in Sunbiz zip search:', error);
    return [];
  }
}

// Search Sunbiz via Google (fallback when direct scraping fails)
async function searchSunbizViaGoogle(
  searchTerms: { name?: string; address?: string; officerName?: string },
  googleApiKey: string,
  googleSearchEngineId: string
): Promise<BusinessResult[]> {
  const results: BusinessResult[] = [];
  
  try {
    const queries: string[] = [];
    
    // Build search queries for Sunbiz - more comprehensive queries
    if (searchTerms.name) {
      queries.push(`site:search.sunbiz.org "${searchTerms.name}"`);
      // Also search for last name + LLC/Inc patterns
      const nameParts = searchTerms.name.split(/\s+/);
      if (nameParts.length > 1) {
        const lastName = nameParts[nameParts.length - 1];
        queries.push(`site:search.sunbiz.org "${lastName}" LLC OR Inc OR Corp`);
      }
    }
    if (searchTerms.officerName) {
      queries.push(`site:search.sunbiz.org "${searchTerms.officerName}"`);
      queries.push(`site:search.sunbiz.org "${searchTerms.officerName}" officer OR agent OR member OR manager`);
    }
    if (searchTerms.address) {
      const street = extractStreetAddress(searchTerms.address);
      queries.push(`site:search.sunbiz.org "${street}"`);
      // Also try just the street number and name without unit/apt
      const streetParts = street.match(/^(\d+\s+[\w\s]+?)(?:\s+(?:apt|unit|#|suite|ste).*)?$/i);
      if (streetParts && streetParts[1]) {
        queries.push(`site:sunbiz.org "${streetParts[1]}"`);
      }
    }
    
    console.log('Searching Sunbiz via Google with queries:', queries);
    
    for (const query of queries) {
      try {
        const url = `https://www.googleapis.com/customsearch/v1?key=${googleApiKey}&cx=${googleSearchEngineId}&q=${encodeURIComponent(query)}&num=10`;
        
        const response = await fetch(url);
        if (!response.ok) {
          console.error('Google search failed:', response.status);
          continue;
        }
        
        const data = await response.json();
        const items = data.items || [];
        
        console.log(`Google Sunbiz search returned ${items.length} results for: ${query}`);
        
        for (const item of items) {
          const link = item.link || '';
          const title = item.title || '';
          const snippet = item.snippet || '';
          
          // Accept any sunbiz.org page - don't filter too strictly
          if (!link.includes('sunbiz.org')) {
            continue;
          }
          
          console.log(`Processing Sunbiz result: ${title} - ${link}`);
          
          // Extract document number from URL or content
          const docNumMatch = link.match(/[A-Z]\d{8,}/) || title.match(/[A-Z]\d{8,}/) || snippet.match(/[A-Z]\d{8,}/);
          const docNumber = docNumMatch ? docNumMatch[0] : `SUNBIZ_${Date.now()}_${results.length}`;
          
          // Extract entity name from title - improved parsing
          let entityName = title
            .replace(/\s*-\s*Florida.*$/i, '')
            .replace(/\s*\|\s*Florida.*$/i, '')
            .replace(/\s*Corporation Search.*$/i, '')
            .replace(/\s*FeiEin.*$/i, '')
            .replace(/\s*Detail.*$/i, '')
            .trim();
          
          // If title doesn't have good entity name, try snippet
          if (!entityName || entityName.length < 3 || entityName.toLowerCase().includes('search')) {
            // Look for LLC, Inc, Corp patterns in snippet
            const entityMatch = snippet.match(/([A-Z][A-Z0-9\s&.,'-]+(?:LLC|L\.L\.C\.|INC|CORP|LP|LLP|COMPANY|CO\.))/i);
            if (entityMatch) {
              entityName = entityMatch[1].trim();
            }
          }
          
          if (!entityName || entityName.length < 2) {
            entityName = 'Unknown Entity';
          }
          
          // Determine status from snippet
          const statusMatch = snippet.match(/(?:Status|Filing Status)[:\s]*(Active|Inactive|Dissolved|Revoked)/i) 
            || snippet.match(/\b(Active|Inactive|Dissolved|Revoked)\b/i);
          const status = statusMatch ? statusMatch[1] : 'Unknown';
          
          // Determine filing type - improved patterns
          const filingMatch = snippet.match(/(?:Florida Limited Liability|Limited Liability Company|LLC|L\.L\.C\.|Corporation|Inc\.|LP|LLP|Profit Corporation|Non-Profit)/i)
            || title.match(/(?:LLC|L\.L\.C\.|Inc\.|Corp\.)/i);
          const filingType = filingMatch ? filingMatch[0] : 'Unknown';
          
          // Determine match type
          let matchType: 'address' | 'officer' | 'name' = 'name';
          const snippetLower = snippet.toLowerCase();
          const titleLower = title.toLowerCase();
          
          if (searchTerms.officerName) {
            const officerLower = searchTerms.officerName.toLowerCase();
            const officerParts = officerLower.split(/\s+/);
            const hasOfficerMatch = officerParts.some(part => 
              part.length > 2 && (snippetLower.includes(part) || titleLower.includes(part))
            );
            if (hasOfficerMatch) {
              matchType = 'officer';
            }
          }
          
          if (searchTerms.address && matchType === 'name') {
            const streetLower = extractStreetAddress(searchTerms.address).toLowerCase();
            const streetParts = streetLower.split(/\s+/).filter(p => p.length > 2 && !/^\d+$/.test(p));
            const hasAddressMatch = streetParts.some(part => snippetLower.includes(part));
            if (hasAddressMatch || snippetLower.includes(streetLower)) {
              matchType = 'address';
            }
          }
          
          // Build proper detail URL if we have a document number
          let detailUrl = link;
          if (docNumMatch && !link.includes('SearchResultDetail')) {
            detailUrl = `https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResultDetail?inquirytype=EntityName&directionType=Initial&searchNameOrder=${docNumber}`;
          }
          
          results.push({
            documentNumber: docNumber,
            entityName: entityName,
            status: status,
            filingType: filingType,
            detailUrl: detailUrl,
            matchType: matchType,
            confidence: matchType === 'address' ? 0.85 : (matchType === 'officer' ? 0.9 : 0.75),
          });
        }
      } catch (err) {
        console.error('Error in Google Sunbiz search query:', err);
      }
    }
    
    // Deduplicate by document number
    const uniqueResults = new Map<string, BusinessResult>();
    for (const result of results) {
      const key = result.documentNumber.startsWith('SUNBIZ_') 
        ? result.entityName.toLowerCase().replace(/[^a-z0-9]/g, '')
        : result.documentNumber;
      if (!uniqueResults.has(key)) {
        uniqueResults.set(key, result);
      }
    }
    
    return Array.from(uniqueResults.values());
  } catch (error) {
    console.error('Error in searchSunbizViaGoogle:', error);
    return [];
  }
}

// Match and score results against provided context
function scoreResults(
  results: BusinessResult[],
  context?: { fullName?: string; phone?: string; email?: string; address?: string }
): BusinessResult[] {
  if (!context) return results;
  
  const nameParts = context.fullName?.toLowerCase().split(/\s+/).filter(p => p.length > 1) || [];
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : (nameParts[0] || '');
  
  return results.map(result => {
    let boost = 0;
    
    // Check if person's name appears in entity name
    const entityLower = result.entityName.toLowerCase();
    if (lastName && entityLower.includes(lastName)) {
      boost += 0.15;
    }
    
    // Check if any name part appears
    for (const part of nameParts) {
      if (entityLower.includes(part)) {
        boost += 0.05;
      }
    }
    
    // Check officers if available
    if (result.officers && context.fullName) {
      for (const officer of result.officers) {
        if (officer.name.toLowerCase().includes(lastName)) {
          boost += 0.2;
        }
      }
    }
    
    // Check registered agent if available
    if (result.registeredAgent && context.fullName) {
      if (result.registeredAgent.toLowerCase().includes(lastName)) {
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
    const params: SunbizSearchParams = await req.json();
    console.log('Sunbiz search params:', JSON.stringify(params));

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

    const allResults: BusinessResult[] = [];
    const errors: string[] = [];

    // Get Google API keys for fallback search
    const googleApiKey = Deno.env.get('GOOGLE_API_KEY');
    const googleSearchEngineId = Deno.env.get('GOOGLE_SEARCH_ENGINE_ID');

    // Run address search if address provided
    if (params.address) {
      try {
        const addressResults = await searchByAddress(params.address, firecrawlKey);
        console.log(`Address search found ${addressResults.length} results`);
        allResults.push(...addressResults);
        
        // Also try zip code search as backup
        const zipCode = extractZipCode(params.address);
        if (zipCode && addressResults.length === 0) {
          const zipResults = await searchByZip(zipCode, firecrawlKey);
          console.log(`Zip code search found ${zipResults.length} results`);
          allResults.push(...zipResults);
        }
      } catch (err) {
        console.error('Address search error:', err);
        errors.push(`Address search failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    // Run officer/registered agent search if name provided
    if (params.officerName || params.name) {
      try {
        const officerResults = await searchByOfficer(params.officerName || params.name!, firecrawlKey);
        console.log(`Officer search found ${officerResults.length} results`);
        allResults.push(...officerResults);
      } catch (err) {
        console.error('Officer search error:', err);
        errors.push(`Officer search failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    // If direct scraping found no results, use Google search fallback
    if (allResults.length === 0 && googleApiKey && googleSearchEngineId) {
      console.log('No results from direct scraping, trying Google search fallback');
      try {
        const googleResults = await searchSunbizViaGoogle(
          {
            name: params.name,
            address: params.address,
            officerName: params.officerName,
          },
          googleApiKey,
          googleSearchEngineId
        );
        console.log(`Google Sunbiz fallback found ${googleResults.length} results`);
        allResults.push(...googleResults);
      } catch (err) {
        console.error('Google Sunbiz search error:', err);
        errors.push(`Google fallback search failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    // Deduplicate by document number
    const uniqueResults = new Map<string, BusinessResult>();
    for (const result of allResults) {
      if (!uniqueResults.has(result.documentNumber)) {
        uniqueResults.set(result.documentNumber, result);
      } else {
        // If we have duplicate, keep the one with higher confidence or more data
        const existing = uniqueResults.get(result.documentNumber)!;
        if (result.confidence > existing.confidence || result.officers) {
          uniqueResults.set(result.documentNumber, { ...existing, ...result });
        }
      }
    }

    // Score results based on context
    let scoredResults = Array.from(uniqueResults.values());
    if (params.fullContext) {
      scoredResults = scoreResults(scoredResults, {
        ...params.fullContext,
        address: params.address,
      });
    }

    // Sort by confidence
    scoredResults.sort((a, b) => b.confidence - a.confidence);

    // Fetch details for top results (limit to save API calls)
    const detailedResults: BusinessResult[] = [];
    for (const result of scoredResults.slice(0, 5)) {
      const details = await fetchBusinessDetails(result.detailUrl, firecrawlKey);
      if (details) {
        detailedResults.push({
          ...result,
          officers: details.officers || result.officers,
          registeredAgent: details.registeredAgent || result.registeredAgent,
          address: details.principalAddress || result.address,
          dateField: details.filingDate,
        });
      } else {
        detailedResults.push(result);
      }
    }

    // Add remaining results without details
    detailedResults.push(...scoredResults.slice(5));

    // Generate manual search links for verification
    const manualSearchLinks = [];
    
    if (params.address) {
      const street = extractStreetAddress(params.address);
      manualSearchLinks.push({
        name: 'Sunbiz - Search by Address',
        url: `https://search.sunbiz.org/Inquiry/CorporationSearch/ByAddress`,
        searchTerm: street,
      });
    }
    
    if (params.officerName || params.name) {
      const searchName = params.officerName || params.name;
      manualSearchLinks.push({
        name: 'Sunbiz - Search by Officer/Agent',
        url: `https://search.sunbiz.org/Inquiry/CorporationSearch/ByOfficerOrRegisteredAgent`,
        searchTerm: searchName,
      });
    }
    
    manualSearchLinks.push({
      name: 'Sunbiz - All Search Options',
      url: 'https://search.sunbiz.org/Inquiry/CorporationSearch/ByName',
      searchTerm: null,
    });

    const response = {
      success: true,
      source: 'Florida Sunbiz',
      state: 'FL',
      totalResults: detailedResults.length,
      results: detailedResults,
      manualSearchLinks: manualSearchLinks,
      searchTypes: {
        addressSearch: !!params.address,
        officerSearch: !!(params.officerName || params.name),
        zipSearch: params.address ? !!extractZipCode(params.address) : false,
      },
      errors: errors.length > 0 ? errors : undefined,
    };

    console.log(`Sunbiz search complete: ${detailedResults.length} results found`);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in osint-sunbiz-search:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        results: [],
        manualSearchLinks: [
          {
            name: 'Sunbiz - All Search Options',
            url: 'https://search.sunbiz.org/Inquiry/CorporationSearch/ByName',
            searchTerm: null,
          }
        ],
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
