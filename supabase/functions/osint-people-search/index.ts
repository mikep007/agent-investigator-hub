import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SearchParams {
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  phone?: string;
  email?: string;
  address?: string;
  validateData?: boolean; // If true, check if provided phone/email/address appears in results
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { firstName, lastName, city, state, phone, email, address, validateData } = await req.json() as SearchParams;
    console.log('People search request:', { firstName, lastName, city, state, phone, email, address, validateData });

    // Validate that at least firstName+lastName OR phone is provided
    if ((!firstName || !lastName) && !phone) {
      return new Response(
        JSON.stringify({ error: 'Either (firstName and lastName) or phone is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Store validation targets for cross-referencing
    const validationTargets = {
      phone: phone ? phone.replace(/\D/g, '') : null,
      email: email ? email.toLowerCase() : null,
      address: address ? address.toLowerCase() : null,
    };

    // Get Firecrawl API key
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      throw new Error('FIRECRAWL_API_KEY not configured');
    }

    // Build search URLs based on whether we have name or phone
    let truePeopleSearchUrl, fastPeopleSearchUrl;
    
    if (phone) {
      // Phone number search
      const cleanPhone = phone.replace(/\D/g, '');
      truePeopleSearchUrl = `https://www.truepeoplesearch.com/results?phoneno=${encodeURIComponent(cleanPhone)}`;
      fastPeopleSearchUrl = `https://www.fastpeoplesearch.com/phone/${encodeURIComponent(cleanPhone)}`;
    } else {
      // Name search
      truePeopleSearchUrl = `https://www.truepeoplesearch.com/results?name=${encodeURIComponent(`${firstName} ${lastName}`)}${city ? `&citystatezip=${encodeURIComponent(`${city}, ${state || ''}`)}` : ''}`;
      fastPeopleSearchUrl = `https://www.fastpeoplesearch.com/name/${encodeURIComponent(firstName!)}-${encodeURIComponent(lastName!)}${city ? `_${encodeURIComponent(city)}` : ''}${state ? `-${encodeURIComponent(state)}` : ''}`;
    }
    
    console.log('TruePeopleSearch URL:', truePeopleSearchUrl);
    console.log('FastPeopleSearch URL:', fastPeopleSearchUrl);

    // Scrape both TruePeopleSearch and FastPeopleSearch in parallel
    const [truePeopleResponse, fastPeopleResponse] = await Promise.allSettled([
      fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: truePeopleSearchUrl,
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
          url: fastPeopleSearchUrl,
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
      
      // Log first 2000 chars of scraped content to debug extraction
      console.log('TruePeopleSearch markdown (first 2000 chars):', markdown.substring(0, 2000));
      console.log('TruePeopleSearch HTML contains phone patterns:', (html.match(/\d{3}.*?\d{3}.*?\d{4}/g) || []).length);
      
      const truePeopleResults = parseSearchResults(markdown, html, firstName || 'Unknown', lastName || 'Unknown', 'TruePeopleSearch');
      console.log(`TruePeopleSearch extracted: phones=${truePeopleResults[0]?.phones?.length || 0}, emails=${truePeopleResults[0]?.emails?.length || 0}, relatives=${truePeopleResults[0]?.relatives?.length || 0}`);
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
      
      // Log first 2000 chars of scraped content to debug extraction
      console.log('FastPeopleSearch markdown (first 2000 chars):', markdown.substring(0, 2000));
      
      const fastPeopleResults = parseSearchResults(markdown, html, firstName || 'Unknown', lastName || 'Unknown', 'FastPeopleSearch');
      console.log(`FastPeopleSearch extracted: phones=${fastPeopleResults[0]?.phones?.length || 0}, emails=${fastPeopleResults[0]?.emails?.length || 0}, relatives=${fastPeopleResults[0]?.relatives?.length || 0}`);
      allResults = allResults.concat(fastPeopleResults);
      console.log(`FastPeopleSearch: Found ${fastPeopleResults.length} results`);
    } else {
      console.error('FastPeopleSearch scraping failed:', fastPeopleResponse.status === 'rejected' ? fastPeopleResponse.reason : 'HTTP error');
    }

    // Cross-reference and merge results
    const results = crossReferenceResults(allResults);
    console.log(`Total combined results: ${results.length}`);

    // If validation data was provided, check for matches
    const validationResults = {
      phoneFound: false,
      emailFound: false,
      addressFound: false,
      matchScore: 0,
    };

    if (validateData && results.length > 0) {
      const result = results[0];
      
      // Check if provided phone matches any found phone
      if (validationTargets.phone) {
        const foundPhones = result.phones?.map((p: any) => 
          (typeof p === 'string' ? p : p.value).replace(/\D/g, '')
        ) || [];
        validationResults.phoneFound = foundPhones.some((p: string) => 
          p.includes(validationTargets.phone!) || validationTargets.phone!.includes(p)
        );
        if (validationResults.phoneFound) {
          validationResults.matchScore += 40;
          console.log(`VALIDATED: Phone ${validationTargets.phone} found in results`);
        }
      }

      // Check if provided email matches any found email
      if (validationTargets.email) {
        const foundEmails = result.emails?.map((e: any) => 
          (typeof e === 'string' ? e : e.value).toLowerCase()
        ) || [];
        validationResults.emailFound = foundEmails.some((e: string) => 
          e === validationTargets.email || e.includes(validationTargets.email!)
        );
        if (validationResults.emailFound) {
          validationResults.matchScore += 30;
          console.log(`VALIDATED: Email ${validationTargets.email} found in results`);
        }
      }

      // Check if provided address matches any found address
      if (validationTargets.address) {
        const foundAddresses = result.addresses?.map((a: any) => 
          (typeof a === 'string' ? a : a.value).toLowerCase()
        ) || [];
        validationResults.addressFound = foundAddresses.some((a: string) => 
          a.includes(validationTargets.address!) || validationTargets.address!.includes(a)
        );
        if (validationResults.addressFound) {
          validationResults.matchScore += 30;
          console.log(`VALIDATED: Address found in results`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
        validation: validateData ? validationResults : undefined,
        source: 'TruePeopleSearch',
        searchParams: { firstName, lastName, city, state, phone, email, address },
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
  
  // Detect CAPTCHA or bot protection pages - return empty if blocked
  const isCaptchaBlocked = 
    markdown.toLowerCase().includes('captcha') ||
    markdown.includes('geo.captcha-delivery') ||
    markdown.includes('challenge-platform') ||
    markdown.includes('cf-turnstile') ||
    markdown.includes('hcaptcha') ||
    markdown.includes('recaptcha') ||
    markdown.includes('bot detection') ||
    markdown.includes('access denied') ||
    (markdown.length < 500 && markdown.includes('iframe'));
  
  if (isCaptchaBlocked) {
    console.log(`${source}: CAPTCHA/bot protection detected, skipping extraction`);
    return [{
      name: `${firstName} ${lastName}`,
      phones: [],
      emails: [],
      addresses: [],
      ages: [],
      relatives: [],
      source: source,
      note: 'Site blocked by CAPTCHA - manual verification required',
      blocked: true,
    }];
  }
  
  // Extract phone numbers (various formats) - US numbers only
  const phoneRegex = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  const rawPhones = markdown.match(phoneRegex) || [];
  
  // Validate phone numbers - must be valid US format
  const validPhones = rawPhones.filter(phone => {
    const digits = phone.replace(/\D/g, '');
    // Must be exactly 10 digits
    if (digits.length !== 10) return false;
    // First digit of area code must be 2-9 (valid US area codes)
    if (digits[0] === '0' || digits[0] === '1') return false;
    // First digit of exchange must be 2-9
    if (digits[3] === '0' || digits[3] === '1') return false;
    // Reject obviously fake patterns like 1234567890, 0000000000
    if (/^(\d)\1{9}$/.test(digits)) return false;
    if (digits === '1234567890' || digits === '0123456789') return false;
    return true;
  });
  
  const phones = [...new Set(validPhones)];
  
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
  
  // Extract relatives/associated names (multiple patterns)
  const relatives: string[] = [];
  
  // Pattern 1: "Relatives: Name Name" or "Related To: Name"
  const relativeRegex1 = /(?:Relative|Related\s*(?:To)?|Associate|Family|Known\s*Associate)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi;
  const relativeMatches1 = [...markdown.matchAll(relativeRegex1)];
  relativeMatches1.forEach(m => relatives.push(m[1].trim()));
  
  // Pattern 2: Names in "Possible Relatives" or "May Know" sections
  const relativeSection = markdown.match(/(?:Possible\s+Relatives|May\s+(?:Also\s+)?Know|Associated\s+With)[:\s]*([^\n]+(?:\n[^\n]+)*?)(?=\n\n|\n[A-Z]|\$)/gi);
  if (relativeSection) {
    relativeSection.forEach(section => {
      const names = section.match(/[A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/g);
      if (names) {
        names.forEach(name => {
          // Filter out common non-name patterns
          if (!name.match(/^(View|Show|See|More|Click|Phone|Email|Address|Current|Previous)/i)) {
            relatives.push(name.trim());
          }
        });
      }
    });
  }
  
  // Pattern 3: Names with relationship indicators
  const relativeRegex3 = /([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*\((?:spouse|wife|husband|mother|father|son|daughter|brother|sister|sibling|parent|child|relative)\)/gi;
  const relativeMatches3 = [...markdown.matchAll(relativeRegex3)];
  relativeMatches3.forEach(m => relatives.push(m[1].trim()));
  
  // Deduplicate relatives and filter out the target name
  const targetNameLower = `${firstName} ${lastName}`.toLowerCase();
  const uniqueRelatives = [...new Set(relatives)]
    .filter(r => r.toLowerCase() !== targetNameLower && r.length > 3);
  
  // Create result objects for each combination found
  if (phones.length > 0 || emails.length > 0 || addresses.length > 0 || uniqueRelatives.length > 0) {
    const result: any = {
      name: `${firstName} ${lastName}`,
      phones: phones.slice(0, 5), // Limit to 5
      emails: emails.slice(0, 5),
      addresses: addresses.slice(0, 3),
      ages: ages.slice(0, 3),
      relatives: uniqueRelatives.slice(0, 15), // Increased limit for relatives
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
