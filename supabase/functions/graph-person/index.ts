import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type RelativeTier = 'confirmed' | 'likely' | 'possible';

interface TieredRelative {
  person: any;
  link: any;
  tier: RelativeTier;
  scores: {
    overall: number;
    current_us_location: number;
    global_presence: number;
  };
}

interface TieredAddress {
  id: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  household_members: string[];
  is_primary_household: boolean;
  scores: {
    address_currentness: number;
    multi_source_confirmed: boolean;
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

    // Support both GET with path param and POST with body
    let personId: string;
    let includeAddresses = true;
    let maxDepth = 2;

    if (req.method === 'GET') {
      const url = new URL(req.url);
      const pathParts = url.pathname.split('/');
      personId = pathParts[pathParts.length - 1];
      includeAddresses = url.searchParams.get('include_addresses') !== 'false';
      maxDepth = parseInt(url.searchParams.get('max_depth') || '2');
    } else {
      const body = await req.json();
      personId = body.person_id;
      includeAddresses = body.include_addresses ?? true;
      maxDepth = body.max_depth ?? 2;
    }

    console.log(`[graph-person] Building graph for person: ${personId}`);

    if (!personId) {
      return new Response(
        JSON.stringify({ error: 'person_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For this implementation, we'll build the graph from investigation findings
    // In a production system, this would query a dedicated persons table

    // Get investigation findings that might contain this person's data
    const { data: findings, error: findingsError } = await supabase
      .from('findings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (findingsError) {
      console.error('[graph-person] Findings query error:', findingsError);
    }

    // Build subject from findings
    const subject = buildSubjectFromFindings(personId, findings || []);
    
    // Build relatives list with tiering
    const relatives = buildTieredRelatives(subject, findings || []);
    
    // Build addresses with household clustering
    const addresses = includeAddresses ? buildTieredAddresses(subject, relatives, findings || []) : [];

    // Calculate graph statistics
    const statistics = calculateGraphStatistics(subject, relatives, addresses);

    const response = {
      subject,
      relatives,
      addresses,
      statistics
    };

    console.log(`[graph-person] Built graph with ${relatives.length} relatives, ${addresses.length} addresses`);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[graph-person] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function buildSubjectFromFindings(personId: string, findings: any[]): any {
  const subject: any = {
    id: personId,
    name: { first: '', last: '' },
    addresses: [],
    phones: [],
    emails: [],
    source_ids: {},
    scores: {
      overall_confidence: 0.5,
      current_us_presence: 0.5,
      global_presence: 0.1,
      data_completeness: 0
    }
  };

  // Extract person data from findings
  for (const finding of findings) {
    const data = finding.data;
    if (!data) continue;

    // Check People_search findings
    if (finding.agent_type === 'People_search') {
      if (data.truePeopleSearch?.persons?.[0]) {
        const person = data.truePeopleSearch.persons[0];
        extractPersonData(subject, person, 'truepeoplesearch');
      }
      if (data.fastPeopleSearch?.persons?.[0]) {
        const person = data.fastPeopleSearch.persons[0];
        extractPersonData(subject, person, 'fastpeoplesearch');
      }
    }

    // Check IDCrawl findings for social
    if (finding.agent_type === 'IDCrawl' && data.profiles) {
      subject.social_profiles = subject.social_profiles || [];
      subject.social_profiles.push(...data.profiles);
      subject.source_ids.idcrawl = true;
    }

    // Check email intelligence
    if (finding.agent_type === 'Email_Intelligence' || finding.agent_type === 'Holehe') {
      if (data.accounts) {
        subject.verified_accounts = subject.verified_accounts || [];
        subject.verified_accounts.push(...data.accounts.filter((a: any) => a.exists));
      }
    }
  }

  // Calculate data completeness
  let completeness = 0;
  if (subject.name.first && subject.name.last) completeness += 0.2;
  if (subject.addresses.length > 0) completeness += 0.2;
  if (subject.phones.length > 0) completeness += 0.2;
  if (subject.emails.length > 0) completeness += 0.2;
  if (subject.social_profiles?.length > 0) completeness += 0.2;
  
  subject.scores.data_completeness = completeness;
  subject.scores.overall_confidence = Math.min(0.5 + (completeness * 0.4), 0.95);

  return subject;
}

function extractPersonData(subject: any, person: any, source: string): void {
  // Extract name
  if (person.name && !subject.name.first) {
    const nameParts = person.name.split(' ');
    subject.name = {
      first: nameParts[0] || '',
      middle: nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : null,
      last: nameParts[nameParts.length - 1] || ''
    };
  }

  // Extract age
  if (person.age && !subject.age) {
    subject.age = person.age;
    subject.age_band = `${Math.floor(person.age / 5) * 5}-${Math.floor(person.age / 5) * 5 + 4}`;
  }

  // Extract location
  if (person.location && !subject.current_location) {
    const locParts = person.location.split(',').map((s: string) => s.trim());
    subject.current_location = {
      city: locParts[0] || '',
      state: locParts[1] || '',
      country: 'US',
      confidence: 0.7
    };
  }

  // Extract addresses
  if (person.addresses) {
    for (const addr of person.addresses) {
      const parsed = parseAddress(addr);
      const exists = subject.addresses.some((a: any) => 
        a.street?.toLowerCase() === parsed.street?.toLowerCase()
      );
      if (!exists) {
        subject.addresses.push({ ...parsed, source });
      }
    }
  }

  // Extract phones
  if (person.phones) {
    for (const phone of person.phones) {
      if (!subject.phones.some((p: any) => p.number === phone)) {
        subject.phones.push({ number: phone, source, is_current: true });
      }
    }
  }

  // Extract emails
  if (person.emails) {
    for (const email of person.emails) {
      if (!subject.emails.some((e: any) => e.address === email)) {
        subject.emails.push({ address: email, source, is_current: true });
      }
    }
  }

  // Extract relatives
  if (person.relatives) {
    subject.known_relatives = subject.known_relatives || [];
    for (const rel of person.relatives) {
      if (!subject.known_relatives.includes(rel)) {
        subject.known_relatives.push(rel);
      }
    }
  }

  subject.source_ids[source] = true;
}

function parseAddress(addrStr: string): any {
  const parts = addrStr.split(',').map(s => s.trim());
  const lastPart = parts[parts.length - 1] || '';
  const stateZip = lastPart.split(' ');

  return {
    street: parts[0] || '',
    city: parts.length > 2 ? parts[parts.length - 2] : '',
    state: stateZip[0] || '',
    zip: stateZip[1] || '',
    country: 'US',
    is_current: true
  };
}

function buildTieredRelatives(subject: any, findings: any[]): TieredRelative[] {
  const relatives: Map<string, TieredRelative> = new Map();
  const knownRelatives = subject.known_relatives || [];

  // Process relatives from known list
  for (const relativeName of knownRelatives) {
    const nameParts = relativeName.split(' ');
    const key = relativeName.toLowerCase();

    if (!relatives.has(key)) {
      relatives.set(key, {
        person: {
          id: `rel_${crypto.randomUUID().slice(0, 8)}`,
          name: {
            first: nameParts[0] || '',
            last: nameParts[nameParts.length - 1] || ''
          },
          current_location: null
        },
        link: {
          relationship_type: inferRelationshipType(subject.name, nameParts),
          sources: ['people_search'],
          score: {
            relationship_confidence: 0.6,
            co_residence_years: 0,
            co_residence_addresses: 0,
            multi_source_confirmed: false
          }
        },
        tier: 'possible',
        scores: {
          overall: 0.6,
          current_us_location: 0.5,
          global_presence: 0.1
        }
      });
    }
  }

  // Enrich relatives from findings
  for (const finding of findings) {
    const data = finding.data;
    if (!data) continue;

    // Check for relative data in people search results
    if (finding.agent_type === 'People_search') {
      for (const source of ['truePeopleSearch', 'fastPeopleSearch']) {
        const persons = data[source]?.persons || [];
        for (const person of persons) {
          if (person.relatives) {
            for (const relativeName of person.relatives) {
              const key = relativeName.toLowerCase();
              if (relatives.has(key)) {
                const rel = relatives.get(key)!;
                if (!rel.link.sources.includes(source.toLowerCase())) {
                  rel.link.sources.push(source.toLowerCase());
                  rel.link.score.multi_source_confirmed = rel.link.sources.length > 1;
                  rel.link.score.relationship_confidence = Math.min(
                    rel.link.score.relationship_confidence + 0.15,
                    0.95
                  );
                }
              }
            }
          }
        }
      }
    }

    // Check for relative confirmations in web search
    if (finding.agent_type === 'Web') {
      const items = data.items || data.results || [];
      for (const item of items) {
        const snippet = (item.snippet || '').toLowerCase();
        
        for (const [key, rel] of relatives) {
          const relName = `${rel.person.name.first} ${rel.person.name.last}`.toLowerCase();
          if (snippet.includes(relName)) {
            if (!rel.link.sources.includes('web_search')) {
              rel.link.sources.push('web_search');
              rel.link.score.relationship_confidence = Math.min(
                rel.link.score.relationship_confidence + 0.1,
                0.95
              );
            }
          }
        }
      }
    }
  }

  // Apply tiering logic
  for (const rel of relatives.values()) {
    rel.tier = calculateTier(rel);
    rel.scores.overall = rel.link.score.relationship_confidence;
  }

  // Sort by tier and confidence
  const sortedRelatives = Array.from(relatives.values());
  const tierOrder: Record<RelativeTier, number> = { confirmed: 0, likely: 1, possible: 2 };
  sortedRelatives.sort((a, b) => {
    const tierDiff = tierOrder[a.tier] - tierOrder[b.tier];
    if (tierDiff !== 0) return tierDiff;
    return b.scores.overall - a.scores.overall;
  });

  return sortedRelatives;
}

function inferRelationshipType(subjectName: any, relativeNameParts: string[]): string {
  const subjectLast = subjectName.last?.toLowerCase();
  const relativeLast = relativeNameParts[relativeNameParts.length - 1]?.toLowerCase();

  if (subjectLast === relativeLast) {
    return 'sibling_or_parent';
  }
  return 'possible_relative';
}

function calculateTier(relative: TieredRelative): RelativeTier {
  const { link } = relative;
  
  // CONFIRMED: Multi-source with high confidence
  if (
    link.score.multi_source_confirmed &&
    link.score.relationship_confidence >= 0.8
  ) {
    return 'confirmed';
  }

  // CONFIRMED: Strong people search + social/public record confirmation
  if (
    link.sources.includes('people_search') &&
    (link.sources.includes('web_search') || link.sources.includes('social')) &&
    link.score.relationship_confidence >= 0.7
  ) {
    return 'confirmed';
  }

  // CONFIRMED: Co-residence evidence
  if (
    link.score.co_residence_addresses >= 2 ||
    link.score.co_residence_years >= 5
  ) {
    return 'confirmed';
  }

  // LIKELY: Good people search match without full confirmation
  if (
    link.sources.length >= 2 &&
    link.score.relationship_confidence >= 0.6
  ) {
    return 'likely';
  }

  if (
    link.sources.includes('people_search') &&
    link.score.relationship_confidence >= 0.65
  ) {
    return 'likely';
  }

  // POSSIBLE: Everything else
  return 'possible';
}

function buildTieredAddresses(
  subject: any,
  relatives: TieredRelative[],
  findings: any[]
): TieredAddress[] {
  const addresses: Map<string, TieredAddress> = new Map();

  // Add subject's addresses
  for (const addr of (subject.addresses || [])) {
    const key = `${addr.street}_${addr.city}`.toLowerCase();
    
    if (!addresses.has(key)) {
      addresses.set(key, {
        id: addr.id || `addr_${crypto.randomUUID().slice(0, 8)}`,
        street: addr.street,
        city: addr.city,
        state: addr.state,
        zip: addr.zip || '',
        household_members: [subject.id],
        is_primary_household: addr.is_current === true,
        scores: {
          address_currentness: addr.is_current ? 0.9 : 0.5,
          multi_source_confirmed: false
        }
      });
    }
  }

  // Add relatives to household if they share addresses
  for (const rel of relatives) {
    const relAddresses = rel.person.addresses || [];
    for (const relAddr of relAddresses) {
      const key = `${relAddr.street}_${relAddr.city}`.toLowerCase();
      
      if (addresses.has(key)) {
        const addr = addresses.get(key)!;
        if (!addr.household_members.includes(rel.person.id)) {
          addr.household_members.push(rel.person.id);
        }
        addr.scores.multi_source_confirmed = true;
      }
    }
  }

  // Sort by primary/current first, then by number of household members
  const sortedAddresses = Array.from(addresses.values());
  sortedAddresses.sort((a, b) => {
    if (a.is_primary_household !== b.is_primary_household) {
      return a.is_primary_household ? -1 : 1;
    }
    return b.household_members.length - a.household_members.length;
  });

  // Mark first as primary if none marked
  if (sortedAddresses.length > 0 && !sortedAddresses.some(a => a.is_primary_household)) {
    sortedAddresses[0].is_primary_household = true;
  }

  return sortedAddresses;
}

function calculateGraphStatistics(
  subject: any,
  relatives: TieredRelative[],
  addresses: TieredAddress[]
): any {
  const confirmedCount = relatives.filter(r => r.tier === 'confirmed').length;
  const likelyCount = relatives.filter(r => r.tier === 'likely').length;
  const possibleCount = relatives.filter(r => r.tier === 'possible').length;

  const avgConfidence = relatives.length > 0
    ? relatives.reduce((sum, r) => sum + r.scores.overall, 0) / relatives.length
    : 0;

  const sharedAddresses = addresses.filter(a => a.household_members.length > 1).length;

  return {
    total_relatives: relatives.length,
    confirmed_relatives: confirmedCount,
    likely_relatives: likelyCount,
    possible_relatives: possibleCount,
    average_relationship_confidence: Math.round(avgConfidence * 100) / 100,
    total_addresses: addresses.length,
    shared_addresses: sharedAddresses,
    data_sources: Object.keys(subject.source_ids || {}).length,
    subject_completeness: subject.scores?.data_completeness || 0
  };
}
