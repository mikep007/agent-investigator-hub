import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SearchParams {
  firstName: string;
  lastName: string;
  city?: string;
  state?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { firstName, lastName, city, state } = await req.json() as SearchParams;
    console.log('People search request:', { firstName, lastName, city, state });

    // Get Firecrawl API key
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      throw new Error('FIRECRAWL_API_KEY not configured');
    }

    // Construct TruePeopleSearch URL
    const searchName = `${firstName}-${lastName}`.toLowerCase().replace(/\s+/g, '-');
    let searchUrl = `https://www.truepeoplesearch.com/results?name=${encodeURIComponent(firstName + ' ' + lastName)}`;
    
    if (city && state) {
      searchUrl += `&citystatezip=${encodeURIComponent(`${city}, ${state}`)}`;
    }

    console.log('Scraping URL:', searchUrl);

    // Scrape both TruePeopleSearch and FastPeopleSearch in parallel
    const [truePeopleResponse, fastPeopleResponse] = await Promise.allSettled([
      fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: searchUrl,
          formats: ['markdown', 'html'],
          onlyMainContent: true,
          waitFor: 3000,
        }),
      }),
      fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: `https://www.fastpeoplesearch.com/name/${encodeURIComponent(firstName + '-' + lastName)}${city && state ? `_${encodeURIComponent(city + '-' + state)}` : ''}`,
          formats: ['markdown', 'html'],
          onlyMainContent: true,
          waitFor: 3000,
        }),
      }),
    ]);

    let allResults: any[] = [];

    // Process TruePeopleSearch results
    if (truePeopleResponse.status === 'fulfilled' && truePeopleResponse.value.ok) {
      const data = await truePeopleResponse.value.json();
      const markdown = data.data?.markdown || '';
      const html = data.data?.html || '';
      const truePeopleResults = parseSearchResults(markdown, html, firstName, lastName, 'TruePeopleSearch');
      allResults = allResults.concat(truePeopleResults);
      console.log(`TruePeopleSearch: Found ${truePeopleResults.length} results`);
    } else {
      console.error('TruePeopleSearch scraping failed:', truePeopleResponse.status === 'rejected' ? truePeopleResponse.reason : 'HTTP error');
    }

    // Process FastPeopleSearch results
    if (fastPeopleResponse.status === 'fulfilled' && fastPeopleResponse.value.ok) {
      const data = await fastPeopleResponse.value.json();
      const markdown = data.data?.markdown || '';
      const html = data.data?.html || '';
      const fastPeopleResults = parseSearchResults(markdown, html, firstName, lastName, 'FastPeopleSearch');
      allResults = allResults.concat(fastPeopleResults);
      console.log(`FastPeopleSearch: Found ${fastPeopleResults.length} results`);
    } else {
      console.error('FastPeopleSearch scraping failed:', fastPeopleResponse.status === 'rejected' ? fastPeopleResponse.reason : 'HTTP error');
    }

    // Cross-reference and merge results
    const results = crossReferenceResults(allResults);
    console.log(`Total combined results: ${results.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        results,
        source: 'TruePeopleSearch',
        searchParams: { firstName, lastName, city, state },
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error in people search:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        success: false,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

function parseSearchResults(markdown: string, html: string, firstName: string, lastName: string, source: string) {
  const results: any[] = [];
  
  // Extract phone numbers (various formats)
  const phoneRegex = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  const phones = [...new Set(markdown.match(phoneRegex) || [])];
  
  // Extract email addresses
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = [...new Set(markdown.match(emailRegex) || [])];
  
  // Extract addresses (simplified pattern)
  const addressRegex = /\d+\s+[\w\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Way|Circle|Cir|Place|Pl)[,\s]+[\w\s]+,\s*[A-Z]{2}\s+\d{5}/gi;
  const addresses = [...new Set(markdown.match(addressRegex) || [])];
  
  // Extract ages
  const ageRegex = /\b(?:age|Age)\s*:?\s*(\d{1,3})\b/g;
  const ageMatches = [...markdown.matchAll(ageRegex)];
  const ages = [...new Set(ageMatches.map(m => m[1]))];
  
  // Extract relatives/associated names (simplified)
  const relativeRegex = /(?:Relative|Related|Associate|Family)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi;
  const relativeMatches = [...markdown.matchAll(relativeRegex)];
  const relatives = [...new Set(relativeMatches.map(m => m[1].trim()))];
  
  // Create result objects for each combination found
  if (phones.length > 0 || emails.length > 0 || addresses.length > 0) {
    const result: any = {
      name: `${firstName} ${lastName}`,
      phones: phones.slice(0, 5), // Limit to 5
      emails: emails.slice(0, 5),
      addresses: addresses.slice(0, 3),
      ages: ages.slice(0, 3),
      relatives: relatives.slice(0, 10),
      source: source,
    };
    
    results.push(result);
  }
  
  // If no structured data found, return a basic result indicating the search was performed
  if (results.length === 0) {
    results.push({
      name: `${firstName} ${lastName}`,
      phones: [],
      emails: [],
      addresses: [],
      ages: [],
      relatives: [],
      source: source,
      note: 'No public records found or data extraction needs refinement',
    });
  }
  
  return results;
}

function crossReferenceResults(allResults: any[]) {
  if (allResults.length === 0) return [];
  
  // Merge results from different sources
  const mergedData: any = {
    name: allResults[0].name,
    phones: new Set<string>(),
    emails: new Set<string>(),
    addresses: new Set<string>(),
    ages: new Set<string>(),
    relatives: new Set<string>(),
    sources: new Set<string>(),
    crossReferenced: new Map<string, number>(), // Track which data appears in multiple sources
  };

  // Collect all data and track cross-references
  allResults.forEach(result => {
    mergedData.sources.add(result.source);
    
    result.phones?.forEach((phone: string) => {
      mergedData.phones.add(phone);
      mergedData.crossReferenced.set(`phone:${phone}`, (mergedData.crossReferenced.get(`phone:${phone}`) || 0) + 1);
    });
    
    result.emails?.forEach((email: string) => {
      mergedData.emails.add(email);
      mergedData.crossReferenced.set(`email:${email}`, (mergedData.crossReferenced.get(`email:${email}`) || 0) + 1);
    });
    
    result.addresses?.forEach((address: string) => {
      mergedData.addresses.add(address);
      mergedData.crossReferenced.set(`address:${address}`, (mergedData.crossReferenced.get(`address:${address}`) || 0) + 1);
    });
    
    result.ages?.forEach((age: string) => {
      mergedData.ages.add(age);
      mergedData.crossReferenced.set(`age:${age}`, (mergedData.crossReferenced.get(`age:${age}`) || 0) + 1);
    });
    
    result.relatives?.forEach((relative: string) => {
      mergedData.relatives.add(relative);
      mergedData.crossReferenced.set(`relative:${relative}`, (mergedData.crossReferenced.get(`relative:${relative}`) || 0) + 1);
    });
  });

  // Mark cross-referenced items (appeared in multiple sources)
  const phonesArray = Array.from(mergedData.phones).map(phone => ({
    value: phone,
    verified: (mergedData.crossReferenced.get(`phone:${phone}`) || 0) > 1
  }));
  
  const emailsArray = Array.from(mergedData.emails).map(email => ({
    value: email,
    verified: (mergedData.crossReferenced.get(`email:${email}`) || 0) > 1
  }));
  
  const addressesArray = Array.from(mergedData.addresses).map(address => ({
    value: address,
    verified: (mergedData.crossReferenced.get(`address:${address}`) || 0) > 1
  }));
  
  const agesArray = Array.from(mergedData.ages).map(age => ({
    value: age,
    verified: (mergedData.crossReferenced.get(`age:${age}`) || 0) > 1
  }));
  
  const relativesArray = Array.from(mergedData.relatives).map(relative => ({
    value: relative,
    verified: (mergedData.crossReferenced.get(`relative:${relative}`) || 0) > 1
  }));

  return [{
    name: mergedData.name,
    phones: phonesArray,
    emails: emailsArray,
    addresses: addressesArray,
    ages: agesArray,
    relatives: relativesArray,
    sources: Array.from(mergedData.sources).join(', '),
  }];
}
