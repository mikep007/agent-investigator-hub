import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SubjectInput {
  id: string;
  name: { first: string; last: string; middle?: string };
  state?: string;
  anchor_addresses?: string[];
  anchor_relatives?: string[];
}

interface EnrichOptions {
  max_relatives?: number;
  min_relationship_confidence?: number;
  include_timeline?: boolean;
}

interface RelativeLink {
  relationship_type: string;
  sources: string[];
  score: {
    relationship_confidence: number;
    co_residence_years: number;
    co_residence_addresses: number;
    multi_source_confirmed: boolean;
  };
  timeline?: {
    first_seen_year: number | null;
    last_seen_year: number | null;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { subject, options = {} }: { subject: SubjectInput; options: EnrichOptions } = await req.json();
    console.log('[enrich-familytreenow] Subject:', JSON.stringify(subject));

    const { 
      max_relatives = 50, 
      min_relationship_confidence = 0.5,
      include_timeline = true 
    } = options;

    if (!subject.name?.first || !subject.name?.last) {
      return new Response(
        JSON.stringify({ error: 'Subject name (first and last) is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fullName = `${subject.name.first} ${subject.name.middle || ''} ${subject.name.last}`.replace(/\s+/g, ' ').trim();
    const relatives: any[] = [];
    const enrichedAddresses: any[] = [];

    // 1. Query web search for FamilyTreeNow-style data
    try {
      console.log('[enrich-familytreenow] Searching for relatives...');
      
      // Search for the subject + relatives context
      const webSearchPayload = {
        query: `"${fullName}" relatives family ${subject.state || ''}`,
        searchType: 'person'
      };

      const webResponse = await supabase.functions.invoke('osint-web-search', {
        body: webSearchPayload
      });

      if (webResponse.data?.items) {
        // Extract relative mentions from search results
        const extractedRelatives = extractRelativesFromWebResults(
          webResponse.data.items,
          subject,
          subject.anchor_relatives || []
        );
        relatives.push(...extractedRelatives);
      }
    } catch (err) {
      console.error('[enrich-familytreenow] Web search error:', err);
    }

    // 2. Search for each anchor relative to find their details
    if (subject.anchor_relatives && subject.anchor_relatives.length > 0) {
      for (const relativeName of subject.anchor_relatives.slice(0, 10)) {
        try {
          console.log(`[enrich-familytreenow] Enriching relative: ${relativeName}`);
          
          const relativeSearch = await supabase.functions.invoke('osint-people-search', {
            body: { 
              fullName: relativeName,
              location: subject.state || ''
            }
          });

          if (relativeSearch.data) {
            const enrichedRelative = processRelativeSearchResult(
              relativeSearch.data,
              relativeName,
              subject
            );
            
            if (enrichedRelative && enrichedRelative.link.score.relationship_confidence >= min_relationship_confidence) {
              relatives.push(enrichedRelative);
            }
          }
        } catch (err) {
          console.error(`[enrich-familytreenow] Relative search error for ${relativeName}:`, err);
        }
      }
    }

    // 3. Enrich addresses with timeline data
    if (subject.anchor_addresses && subject.anchor_addresses.length > 0) {
      for (const address of subject.anchor_addresses) {
        try {
          console.log(`[enrich-familytreenow] Enriching address: ${address}`);
          
          const addressSearch = await supabase.functions.invoke('osint-address-search', {
            body: { address }
          });

          if (addressSearch.data) {
            const enrichedAddr = processAddressResult(addressSearch.data, address);
            enrichedAddresses.push(enrichedAddr);
          }
        } catch (err) {
          console.error(`[enrich-familytreenow] Address search error:`, err);
        }
      }
    }

    // 4. Calculate timeline depth
    const timelineStats = calculateTimelineStats(enrichedAddresses, relatives);

    // 5. Cross-reference relatives with addresses for co-residence
    const crossReferencedRelatives = crossReferenceWithAddresses(relatives, enrichedAddresses, subject);

    // 6. Deduplicate and sort relatives
    const uniqueRelatives = deduplicateRelatives(crossReferencedRelatives);
    uniqueRelatives.sort((a, b) => 
      b.link.score.relationship_confidence - a.link.score.relationship_confidence
    );

    const response = {
      subject: {
        id: subject.id,
        name: subject.name,
        dob: { year: null, confidence: 0 }, // Would need additional source
        addresses: enrichedAddresses,
        scores: {
          timeline_depth_years: timelineStats.depth_years,
          historical_address_coverage: timelineStats.coverage,
          relative_network_size: uniqueRelatives.length
        }
      },
      relatives: uniqueRelatives.slice(0, max_relatives),
      enrichment_metadata: {
        sources_used: ['web_search', 'people_search', 'address_search'],
        relatives_found: uniqueRelatives.length,
        addresses_enriched: enrichedAddresses.length
      }
    };

    console.log(`[enrich-familytreenow] Found ${uniqueRelatives.length} relatives, ${enrichedAddresses.length} addresses`);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[enrich-familytreenow] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function extractRelativesFromWebResults(
  items: any[],
  subject: SubjectInput,
  anchorRelatives: string[]
): any[] {
  const relatives: any[] = [];
  const subjectFullName = `${subject.name.first} ${subject.name.last}`.toLowerCase();

  for (const item of items) {
    const snippet = (item.snippet || '').toLowerCase();
    const title = (item.title || '').toLowerCase();

    // Look for relationship keywords
    const relationshipPatterns = [
      { pattern: /(?:married to|spouse|husband|wife)\s+([a-z]+\s+[a-z]+)/gi, type: 'spouse' },
      { pattern: /(?:son|daughter)\s+of\s+([a-z]+\s+[a-z]+)/gi, type: 'parent' },
      { pattern: /(?:father|mother)\s+of\s+([a-z]+\s+[a-z]+)/gi, type: 'child' },
      { pattern: /(?:brother|sister|sibling)\s+([a-z]+\s+[a-z]+)/gi, type: 'sibling' },
    ];

    for (const { pattern, type } of relationshipPatterns) {
      const matches = snippet.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[1] !== subjectFullName) {
          const nameParts = match[1].trim().split(' ');
          relatives.push({
            person: {
              id: `web_${crypto.randomUUID().slice(0, 8)}`,
              name: {
                first: nameParts[0] || '',
                last: nameParts[nameParts.length - 1] || ''
              },
              current_location: null
            },
            link: {
              relationship_type: type,
              sources: ['web_search'],
              score: {
                relationship_confidence: 0.5,
                co_residence_years: 0,
                co_residence_addresses: 0,
                multi_source_confirmed: false
              }
            }
          });
        }
      }
    }

    // Check if any anchor relatives are mentioned
    for (const anchorName of anchorRelatives) {
      if (snippet.includes(anchorName.toLowerCase()) || title.includes(anchorName.toLowerCase())) {
        const nameParts = anchorName.split(' ');
        const existing = relatives.find(r => 
          r.person.name.first?.toLowerCase() === nameParts[0]?.toLowerCase() &&
          r.person.name.last?.toLowerCase() === nameParts[nameParts.length - 1]?.toLowerCase()
        );

        if (!existing) {
          relatives.push({
            person: {
              id: `anchor_${crypto.randomUUID().slice(0, 8)}`,
              name: {
                first: nameParts[0] || '',
                last: nameParts[nameParts.length - 1] || ''
              },
              current_location: null
            },
            link: {
              relationship_type: inferRelationshipFromName(subject.name, nameParts),
              sources: ['web_search', 'user_input'],
              score: {
                relationship_confidence: 0.7,
                co_residence_years: 0,
                co_residence_addresses: 0,
                multi_source_confirmed: true
              }
            }
          });
        }
      }
    }
  }

  return relatives;
}

function processRelativeSearchResult(
  searchData: any,
  relativeName: string,
  subject: SubjectInput
): any | null {
  const nameParts = relativeName.split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts[nameParts.length - 1] || '';

  // Find best match from search results
  let bestMatch: any = null;
  let bestScore = 0;

  const sources = ['truePeopleSearch', 'fastPeopleSearch'];
  for (const source of sources) {
    const persons = searchData[source]?.persons || [];
    for (const person of persons) {
      const personNameParts = (person.name || '').split(' ');
      const personFirst = personNameParts[0] || '';
      const personLast = personNameParts[personNameParts.length - 1] || '';

      if (
        personFirst.toLowerCase() === firstName.toLowerCase() &&
        personLast.toLowerCase() === lastName.toLowerCase()
      ) {
        const score = calculateRelativeMatchScore(person, subject);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = { person, source };
        }
      }
    }
  }

  if (!bestMatch) return null;

  const person = bestMatch.person;
  const locationParts = (person.location || '').split(',').map((s: string) => s.trim());

  return {
    person: {
      id: `rel_${crypto.randomUUID().slice(0, 8)}`,
      name: {
        first: firstName,
        last: lastName
      },
      dob: person.age ? { year: new Date().getFullYear() - person.age, confidence: 0.6 } : null,
      age_band: person.age ? `${Math.floor(person.age / 5) * 5}-${Math.floor(person.age / 5) * 5 + 4}` : null,
      current_location: {
        city: locationParts[0] || '',
        state: locationParts[1] || subject.state || '',
        country: 'US'
      },
      addresses: (person.addresses || []).map((addr: string, idx: number) => ({
        id: `addr_${idx}`,
        ...parseAddress(addr),
        source: bestMatch.source.toLowerCase()
      })),
      phones: person.phones || [],
      emails: person.emails || []
    },
    link: {
      relationship_type: inferRelationshipFromName(subject.name, [firstName, lastName]),
      sources: [bestMatch.source.toLowerCase()],
      score: {
        relationship_confidence: bestScore,
        co_residence_years: 0,
        co_residence_addresses: 0,
        multi_source_confirmed: false
      },
      timeline: {
        first_seen_year: null,
        last_seen_year: new Date().getFullYear()
      }
    }
  };
}

function processAddressResult(addressData: any, addressString: string): any {
  const parts = addressString.split(',').map(s => s.trim());
  const stateZip = (parts[parts.length - 1] || '').split(' ');

  return {
    id: `addr_${crypto.randomUUID().slice(0, 8)}`,
    street: parts[0] || '',
    city: parts.length > 2 ? parts[parts.length - 2] : '',
    state: stateZip[0] || '',
    zip: stateZip[1] || '',
    country: 'US',
    from_year: addressData.from_year || null,
    to_year: addressData.to_year || null,
    is_current: addressData.is_current ?? true,
    source: 'familytreenow',
    confidence: 0.8,
    residents: addressData.residents || [],
    property_data: addressData.property || null
  };
}

function calculateRelativeMatchScore(person: any, subject: SubjectInput): number {
  let score = 0.4; // Lower base, earn confidence through evidence
  let hasSharedAddress = false;

  // Same state bonus (minor)
  const personLocation = (person.location || '').toLowerCase();
  if (subject.state && personLocation.includes(subject.state.toLowerCase())) {
    score += 0.1;
  }

  // SHARED ADDRESS BONUS - HIGHEST WEIGHT
  // Spouses/partners often have different last names but share an address
  // This is STRONG evidence of a household relationship
  if (subject.anchor_addresses && subject.anchor_addresses.length > 0) {
    for (const anchorAddr of subject.anchor_addresses) {
      const anchorNormalized = normalizeAddressForMatch(anchorAddr);
      for (const personAddr of (person.addresses || [])) {
        const personNormalized = normalizeAddressForMatch(personAddr);
        // Check if street address matches (before first comma or first few words)
        if (anchorNormalized && personNormalized && 
            (anchorNormalized.includes(personNormalized) || personNormalized.includes(anchorNormalized))) {
          score += 0.40; // HIGH boost - shared address is strong evidence
          hasSharedAddress = true;
          console.log(`[MATCH] Shared address detected: "${personAddr}" matches anchor "${anchorAddr}"`);
          break;
        }
      }
      if (hasSharedAddress) break;
    }
  }

  // Same last name bonus (child, sibling, parent)
  const personNameParts = (person.name || '').split(' ');
  const personLast = personNameParts[personNameParts.length - 1]?.toLowerCase();
  const subjectLast = subject.name.last?.toLowerCase();
  
  if (personLast === subjectLast) {
    score += 0.15; // Same surname = likely blood relative
  } else if (hasSharedAddress) {
    // Different surname BUT shared address = likely spouse/partner
    score += 0.10; // Additional boost for spouse pattern
    console.log(`[MATCH] Potential spouse detected: ${person.name} (different surname, shared address)`);
  }

  return Math.min(score, 0.95);
}

// Normalize address for comparison (extract street portion)
function normalizeAddressForMatch(addr: string): string {
  if (!addr) return '';
  // Take everything before the first comma, lowercase, remove extra spaces
  const street = addr.split(',')[0].toLowerCase().trim();
  // Remove common abbreviations to normalize
  return street
    .replace(/\bstreet\b/gi, 'st')
    .replace(/\bavenue\b/gi, 'ave')
    .replace(/\bdrive\b/gi, 'dr')
    .replace(/\broad\b/gi, 'rd')
    .replace(/\blane\b/gi, 'ln')
    .replace(/\bcourt\b/gi, 'ct')
    .replace(/\bapartment\b/gi, 'apt')
    .replace(/\bsuite\b/gi, 'ste')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferRelationshipFromName(subjectName: any, relativeNameParts: string[], hasSharedAddress: boolean = false): string {
  const relativeLast = relativeNameParts[relativeNameParts.length - 1]?.toLowerCase();
  const subjectLast = subjectName.last?.toLowerCase();

  if (relativeLast === subjectLast) {
    return 'family_same_surname';
  }
  // Different surname but shares address = likely spouse/partner
  if (hasSharedAddress) {
    return 'spouse_or_partner';
  }
  return 'family_different_surname';
}

function parseAddress(addrStr: string): any {
  const parts = addrStr.split(',').map(s => s.trim());
  const stateZip = (parts[parts.length - 1] || '').split(' ');

  return {
    street: parts[0] || '',
    city: parts.length > 2 ? parts[parts.length - 2] : '',
    state: stateZip[0] || '',
    zip: stateZip[1] || '',
    country: 'US',
    is_current: true,
    confidence: 0.7
  };
}

function calculateTimelineStats(addresses: any[], relatives: any[]): { depth_years: number; coverage: number } {
  let minYear = new Date().getFullYear();
  let maxYear = new Date().getFullYear();

  for (const addr of addresses) {
    if (addr.from_year && addr.from_year < minYear) minYear = addr.from_year;
    if (addr.to_year && addr.to_year > maxYear) maxYear = addr.to_year;
  }

  for (const rel of relatives) {
    if (rel.link?.timeline?.first_seen_year && rel.link.timeline.first_seen_year < minYear) {
      minYear = rel.link.timeline.first_seen_year;
    }
  }

  const depthYears = maxYear - minYear;
  const coverage = Math.min(addresses.length / 5, 1); // Assume 5 addresses = full coverage

  return { depth_years: depthYears, coverage };
}

function crossReferenceWithAddresses(relatives: any[], addresses: any[], subject: SubjectInput): any[] {
  for (const relative of relatives) {
    let coResidenceCount = 0;
    let coResidenceYears = 0;

    for (const addr of addresses) {
      // Check if relative lived at same address
      const relativeAddresses = relative.person.addresses || [];
      for (const relAddr of relativeAddresses) {
        if (
          relAddr.street?.toLowerCase() === addr.street?.toLowerCase() &&
          relAddr.city?.toLowerCase() === addr.city?.toLowerCase()
        ) {
          coResidenceCount++;
          if (addr.from_year && addr.to_year) {
            coResidenceYears += (addr.to_year - addr.from_year);
          }
        }
      }

      // Check if relative is listed as resident
      if (addr.residents) {
        const relativeFullName = `${relative.person.name.first} ${relative.person.name.last}`.toLowerCase();
        if (addr.residents.some((r: string) => r.toLowerCase().includes(relativeFullName))) {
          coResidenceCount++;
          relative.link.score.multi_source_confirmed = true;
        }
      }
    }

    relative.link.score.co_residence_addresses = coResidenceCount;
    relative.link.score.co_residence_years = coResidenceYears;

    // Boost confidence for co-residence
    if (coResidenceCount > 0) {
      relative.link.score.relationship_confidence = Math.min(
        relative.link.score.relationship_confidence + (coResidenceCount * 0.1),
        0.95
      );
    }
  }

  return relatives;
}

function deduplicateRelatives(relatives: any[]): any[] {
  const seen = new Map<string, any>();

  for (const rel of relatives) {
    const key = `${rel.person.name.first}_${rel.person.name.last}`.toLowerCase();
    
    if (seen.has(key)) {
      const existing = seen.get(key);
      // Merge sources
      existing.link.sources = [...new Set([...existing.link.sources, ...rel.link.sources])];
      // Take higher confidence
      if (rel.link.score.relationship_confidence > existing.link.score.relationship_confidence) {
        existing.link.score = rel.link.score;
      }
      // Merge co-residence data
      existing.link.score.co_residence_addresses = Math.max(
        existing.link.score.co_residence_addresses,
        rel.link.score.co_residence_addresses
      );
      existing.link.score.multi_source_confirmed = 
        existing.link.score.multi_source_confirmed || rel.link.score.multi_source_confirmed;
    } else {
      seen.set(key, rel);
    }
  }

  return Array.from(seen.values());
}
