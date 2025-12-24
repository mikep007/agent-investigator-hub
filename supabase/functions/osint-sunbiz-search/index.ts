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
function parseSearchResults(content: string, matchType: 'address' | 'officer' | 'name' | 'zip'): BusinessResult[] {
  const results: BusinessResult[] = [];
  
  // Look for table rows with entity information
  // Sunbiz returns results in a table format
  
  // Pattern for entity rows - they contain Document Number, Entity Name, Status, etc.
  // The format typically has: Document Number | Entity Name | Status | Filing Type | Date
  const tableRowPattern = /\[([A-Z]\d{8,})\]\(([^)]+)\)\s*\|\s*([^|]+)\|/gi;
  let match;
  
  while ((match = tableRowPattern.exec(content)) !== null) {
    const docNumber = match[1];
    const detailUrl = match[2];
    const entityName = match[3].trim();
    
    // Look for status and filing type in the same area
    const contextAfter = content.slice(match.index, match.index + 300);
    
    const statusMatch = contextAfter.match(/(?:Active|Inactive|Dissolved|Revoked)/i);
    const status = statusMatch ? statusMatch[0] : 'Unknown';
    
    const filingTypeMatch = contextAfter.match(/(?:Florida Limited Liability|Domestic Limited Liability|Foreign Limited Liability|Corporation|Fictitious Name|Florida Profit Corporation|Florida Non-Profit|Limited Partnership)/i);
    const filingType = filingTypeMatch ? filingTypeMatch[0] : 'Unknown';
    
    results.push({
      documentNumber: docNumber,
      entityName: entityName,
      status: status,
      filingType: filingType,
      detailUrl: detailUrl.startsWith('http') ? detailUrl : `https://search.sunbiz.org${detailUrl}`,
      matchType: matchType,
      confidence: matchType === 'address' ? 0.85 : (matchType === 'officer' ? 0.9 : 0.75),
    });
  }
  
  // Alternative parsing for plain text results
  if (results.length === 0) {
    // Look for document numbers in the content
    const docNumbers = content.match(/[A-Z]\d{8,}/g) || [];
    const entityNames = content.match(/(?:LLC|INC|CORP|LP|LLP|CORPORATION|COMPANY|ENTERPRISES|GROUP|HOLDINGS)[\w\s,.-]*/gi) || [];
    
    // Match document numbers with entity names where possible
    const seenDocNumbers = new Set<string>();
    for (const docNum of docNumbers) {
      if (!seenDocNumbers.has(docNum)) {
        seenDocNumbers.add(docNum);
        
        // Find entity name near this document number
        const docIndex = content.indexOf(docNum);
        const contextArea = content.slice(Math.max(0, docIndex - 200), docIndex + 200);
        
        // Look for business name patterns
        const nameMatch = contextArea.match(/([A-Z][A-Z0-9\s&.,'-]+(?:LLC|INC|CORP|LP|LLP|CORPORATION|COMPANY|ENTERPRISES|GROUP|HOLDINGS))/i);
        
        if (nameMatch) {
          results.push({
            documentNumber: docNum,
            entityName: nameMatch[1].trim(),
            status: 'Unknown',
            filingType: 'Unknown',
            detailUrl: `https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResultDetail?inquirytype=EntityName&directionType=Initial&searchNameOrder=${docNum}`,
            matchType: matchType,
            confidence: matchType === 'address' ? 0.7 : (matchType === 'officer' ? 0.8 : 0.65),
          });
        }
      }
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
  
  const searchUrl = `https://search.sunbiz.org/Inquiry/CorporationSearch/ByAddress`;
  
  try {
    // First, we need to POST to the search form
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: `${searchUrl}?searchTerm=${encodeURIComponent(streetAddress)}`,
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        waitFor: 3000,
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
    
    // Check for no results message
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
  
  const searchUrl = `https://search.sunbiz.org/Inquiry/CorporationSearch/ByOfficerOrRegisteredAgent`;
  
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: `${searchUrl}?searchTerm=${encodeURIComponent(name)}`,
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        waitFor: 3000,
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
  
  const searchUrl = `https://search.sunbiz.org/Inquiry/CorporationSearch/ByZip`;
  
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: `${searchUrl}?searchTerm=${encodeURIComponent(zipCode)}`,
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        waitFor: 3000,
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
    
    // Limit zip search results as there can be many
    const results = parseSearchResults(markdown + '\n' + html, 'zip');
    return results.slice(0, 20);
  } catch (error) {
    console.error('Error in Sunbiz zip search:', error);
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
