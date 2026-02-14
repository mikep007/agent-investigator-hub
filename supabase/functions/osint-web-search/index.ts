import "https://deno.land/x/xhr@0.1.0/mod.ts";
import {
  corsHeaders,
  STATE_BUSINESS_REGISTRIES,
  STATE_PROPERTY_ASSESSORS,
  getPropertyAssessors,
  getStateRegistry,
  checkNameMatch,
  extractPotentialRelatives,
  isKeywordPotentialRelative,
  isValidFirstName,
  normalizeAddressForSearch,
  normalizeUrl,
} from '../_shared/osint-utils.ts';

const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY');
const GOOGLE_SEARCH_ENGINE_ID = Deno.env.get('GOOGLE_SEARCH_ENGINE_ID');

function buildDorkQueries(
  name: string,
  location?: string,
  email?: string,
  phone?: string,
  keywords?: string,
  seedQuery?: string,
  username?: string,
  relatives?: string[],
): { query: string; type: string; priority: number; description: string; category?: string }[] {
  const queries: { query: string; type: string; priority: number; description: string; category?: string }[] = [];

  const stripOuterQuotes = (value: string) => value.replace(/^"+|"+$/g, '').trim();

  // Handle multiple names separated by / or &
  const names = stripOuterQuotes(name)
    .split(/[\/&]/)
    .map((n) => n.trim())
    .filter((n) => n.length > 1);
  const primaryName = names[0] || stripOuterQuotes(name);
  const quotedPrimary = `"${primaryName}"`;

  // Parse name parts for individual keyword combinations
  const nameParts = primaryName.split(/\s+/).filter(p => p.length > 1);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';

  // If we got a richer "seed" query from the orchestrator, run it first
  const normalizedSeed = seedQuery?.trim();
  if (normalizedSeed && normalizedSeed.length > 1 && stripOuterQuotes(normalizedSeed) !== primaryName) {
    queries.push({
      query: normalizedSeed,
      type: 'seed',
      priority: 1,
      description: 'Seed query (from investigation context)',
    });
  }

  // Parse location for city/state
  let city = '';
  let state = '';
  if (location && location !== 'provided') {
    const locationParts = location.split(',').map((p) => p.trim()).filter((p) => p.length > 2);
    city = locationParts[0] || '';
    state = locationParts.length > 1 ? locationParts[1] : '';
  }

  // Parse keywords into array and extract site-specific domains
  const rawKeywords = keywords
    ? keywords.split(',').map((k) => k.trim()).filter((k) => k.length > 1)
    : [];
  
  // Detect domain patterns (e.g., "alltrails.com", "athlinks.com", "strava.com")
  const domainPattern = /^[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}$/;
  const urlPattern = /^(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,})/i;
  
  const customSites: string[] = [];
  const keywordList: string[] = [];
  
  for (const kw of rawKeywords) {
    // Check if it's a domain or URL
    if (domainPattern.test(kw)) {
      customSites.push(kw.toLowerCase());
    } else {
      const urlMatch = kw.match(urlPattern);
      if (urlMatch) {
        customSites.push(urlMatch[1].toLowerCase());
      } else {
        keywordList.push(kw);
      }
    }
  }
  
  console.log('Detected custom sites from keywords:', customSites);
  console.log('Remaining keywords:', keywordList);

  // Add secondary names as keywords
  if (names.length > 1) {
    for (let i = 1; i < names.length; i++) {
      keywordList.push(names[i]);
    }
  }

  // Clean phone number
  const cleanPhone = phone ? phone.replace(/\D/g, '') : '';
  const hasValidPhone = cleanPhone.length >= 10;

  // Clean email
  const cleanEmail = email && email !== 'provided' ? stripOuterQuotes(email) : '';

  // Clean username
  const cleanUsername = username ? stripOuterQuotes(username).replace(/^@/, '') : '';

// ========== PRIMARY GOOGLE DORK SEARCHES (HIGHEST PRIORITY) ==========
  // These follow the exact Google Dork patterns requested

  // 1. Core pattern: "FIRST LAST" "CITY" "STATE" - most important
  if (city && state) {
    queries.push({
      query: `"${firstName} ${lastName}" "${city}" "${state}"`,
      type: 'core_dork',
      priority: 1,
      category: 'core',
      description: `Core Dork: Name + City + State`,
    });
  } else if (city) {
    queries.push({
      query: `"${firstName} ${lastName}" "${city}"`,
      type: 'core_dork_city',
      priority: 1,
      category: 'core',
      description: `Core Dork: Name + City`,
    });
  } else {
    queries.push({
      query: `"${firstName} ${lastName}"`,
      type: 'core_dork_name',
      priority: 1,
      category: 'core',
      description: `Core Dork: Name only`,
    });
  }

  // 2. Name + Location excluding common aggregator sites (cleaner results)
  if (city && state) {
    queries.push({
      query: `"${firstName} ${lastName}" "${city}" "${state}" -whitepages -mylife -spokeo -beenverified -intelius -peoplefinder`,
      type: 'core_dork_clean',
      priority: 1,
      category: 'core',
      description: 'Core Dork: Clean (no aggregators)',
    });
  }

  // 3. Name + Location + Phone keyword
  if (city && state) {
    queries.push({
      query: `"${firstName} ${lastName}" "${city}" "${state}" "phone"`,
      type: 'dork_phone_keyword',
      priority: 1,
      category: 'contact',
      description: 'Dork: Name + Location + Phone keyword',
    });
  }

  // 4. Name + Location + Email keyword
  if (city && state) {
    queries.push({
      query: `"${firstName} ${lastName}" "${city}" "${state}" "email"`,
      type: 'dork_email_keyword',
      priority: 1,
      category: 'contact',
      description: 'Dork: Name + Location + Email keyword',
    });
  }

  // 5. Name + Location + Profile/Resume/CV keywords
  if (city && state) {
    queries.push({
      query: `"${firstName} ${lastName}" "${city}" "${state}" "profile" | "resume" | "cv"`,
      type: 'dork_profile_resume',
      priority: 1,
      category: 'professional',
      description: 'Dork: Profile/Resume/CV',
    });
  } else {
    queries.push({
      query: `"${firstName} ${lastName}" "profile" | "resume" | "cv"`,
      type: 'dork_profile_resume_nostate',
      priority: 2,
      category: 'professional',
      description: 'Dork: Profile/Resume/CV (no location)',
    });
  }

  // 6. Social media multi-site search
  if (city && state) {
    queries.push({
      query: `"${firstName} ${lastName}" "${city}" "${state}" site:facebook.com | site:linkedin.com | site:x.com | site:instagram.com`,
      type: 'dork_social_all',
      priority: 1,
      category: 'social_media',
      description: 'Dork: All Social Media',
    });
  } else {
    queries.push({
      query: `"${firstName} ${lastName}" site:facebook.com | site:linkedin.com | site:x.com | site:instagram.com`,
      type: 'dork_social_all_nostate',
      priority: 1,
      category: 'social_media',
      description: 'Dork: All Social Media (no location)',
    });
  }

  // 7. Video platforms (YouTube, TikTok)
  if (city && state) {
    queries.push({
      query: `"${firstName} ${lastName}" "${city}" "${state}" site:youtube.com | site:tiktok.com`,
      type: 'dork_video_platforms',
      priority: 2,
      category: 'social_media',
      description: 'Dork: Video Platforms',
    });
  } else {
    queries.push({
      query: `"${firstName} ${lastName}" site:youtube.com | site:tiktok.com`,
      type: 'dork_video_nostate',
      priority: 2,
      category: 'social_media',
      description: 'Dork: Video Platforms (no location)',
    });
  }

  // ========== ADDITIONAL USEFUL GOOGLE DORK QUERIES ==========

  // 8. Name + Address keyword (for property associations)
  if (city && state) {
    queries.push({
      query: `"${firstName} ${lastName}" "${city}" "${state}" "address"`,
      type: 'dork_address_keyword',
      priority: 1,
      category: 'contact',
      description: 'Dork: Name + Address keyword',
    });
  }

  // 9. Name + Age keyword (for identity confirmation)
  if (city && state) {
    queries.push({
      query: `"${firstName} ${lastName}" "${city}" "${state}" "age" | "born" | "DOB"`,
      type: 'dork_age_keyword',
      priority: 2,
      category: 'identity',
      description: 'Dork: Age/DOB identifiers',
    });
  }

  // 10. Name + Employer/Work keywords
  queries.push({
    query: `"${firstName} ${lastName}" "works at" | "employed by" | "employee" | "staff"`,
    type: 'dork_employer',
    priority: 2,
    category: 'professional',
    description: 'Dork: Employer/Work history',
  });

  // 11. Name + Education keywords
  queries.push({
    query: `"${firstName} ${lastName}" "graduated" | "alumni" | "university" | "college" | "school"`,
    type: 'dork_education',
    priority: 2,
    category: 'professional',
    description: 'Dork: Education history',
  });

  // 12. Name + Marriage/Family keywords
  queries.push({
    query: `"${firstName} ${lastName}" "married" | "wife" | "husband" | "spouse" | "wedding"`,
    type: 'dork_marriage',
    priority: 2,
    category: 'family',
    description: 'Dork: Marriage/Family records',
  });

  // 13. Name + Arrest/Criminal keywords
  if (city && state) {
    queries.push({
      query: `"${firstName} ${lastName}" "${city}" "${state}" "arrest" | "charged" | "convicted" | "mugshot"`,
      type: 'dork_criminal',
      priority: 2,
      category: 'legal',
      description: 'Dork: Criminal/Arrest records',
    });
  }

  // 14. Name + Real Estate/Property keywords
  if (city && state) {
    queries.push({
      query: `"${firstName} ${lastName}" "${city}" "${state}" "property" | "deed" | "mortgage" | "homeowner"`,
      type: 'dork_property_keyword',
      priority: 2,
      category: 'property',
      description: 'Dork: Property/Real Estate',
    });
  }

  // 15. Name + Voting/Voter record
  if (state) {
    queries.push({
      query: `"${firstName} ${lastName}" "${state}" "voter" | "registered voter" | "voting record"`,
      type: 'dork_voter',
      priority: 2,
      category: 'official_records',
      description: 'Dork: Voter records',
    });
  }

  // 16. Name + Donation/Political contribution
  queries.push({
    query: `"${firstName} ${lastName}" "donation" | "contributed" | "donor" site:fec.gov | site:opensecrets.org`,
    type: 'dork_donations',
    priority: 3,
    category: 'official_records',
    description: 'Dork: Political donations',
  });

  // 17. Name + License (various professional licenses)
  if (state) {
    queries.push({
      query: `"${firstName} ${lastName}" "${state}" "license" | "licensed" | "certification"`,
      type: 'dork_license',
      priority: 2,
      category: 'professional',
      description: 'Dork: Professional licenses',
    });
  }

  // 18. Inurl search for username-like patterns
  if (firstName && lastName) {
    queries.push({
      query: `inurl:${firstName.toLowerCase()}${lastName.toLowerCase()} | inurl:${firstName.toLowerCase()}-${lastName.toLowerCase()} | inurl:${firstName.toLowerCase()}_${lastName.toLowerCase()}`,
      type: 'dork_inurl_username',
      priority: 2,
      category: 'social_media',
      description: 'Dork: URL username patterns',
    });
  }

  // 19. Name + Forum/Community keywords
  queries.push({
    query: `"${firstName} ${lastName}" "forum" | "member" | "posted by" | "user profile"`,
    type: 'dork_forums',
    priority: 3,
    category: 'social_media',
    description: 'Dork: Forums/Community profiles',
  });

  // 20. Name + Business ownership keywords
  queries.push({
    query: `"${firstName} ${lastName}" "owner" | "CEO" | "founder" | "president" | "managing member"`,
    type: 'dork_business_owner',
    priority: 2,
    category: 'business',
    description: 'Dork: Business ownership',
  });

  // 21. Dating/Social apps
  queries.push({
    query: `"${firstName} ${lastName}" site:match.com | site:pof.com | site:okcupid.com | site:tinder.com`,
    type: 'dork_dating',
    priority: 4,
    category: 'social_media',
    description: 'Dork: Dating profiles',
  });

  // 22. Review sites (Yelp, Google Reviews)
  queries.push({
    query: `"${firstName} ${lastName}" site:yelp.com | site:tripadvisor.com | site:google.com/maps`,
    type: 'dork_reviews',
    priority: 3,
    category: 'social_media',
    description: 'Dork: Review site profiles',
  });

  // 23. Reddit/Community platforms
  queries.push({
    query: `"${firstName} ${lastName}" site:reddit.com | site:quora.com | site:medium.com`,
    type: 'dork_reddit',
    priority: 3,
    category: 'social_media',
    description: 'Dork: Reddit/Quora/Medium',
  });

  // 24. Name + Bankruptcy/Financial distress
  queries.push({
    query: `"${firstName} ${lastName}" "bankruptcy" | "foreclosure" | "lien" | "judgment"`,
    type: 'dork_financial',
    priority: 3,
    category: 'legal',
    description: 'Dork: Financial/Bankruptcy records',
  });

  // 25. Genealogy/Family tree sites
  queries.push({
    query: `"${firstName} ${lastName}" site:ancestry.com | site:familysearch.org | site:findagrave.com | site:myheritage.com`,
    type: 'dork_genealogy',
    priority: 3,
    category: 'family',
    description: 'Dork: Genealogy sites',
  });

  // ========== LEGACY QUERIES (kept for compatibility) ==========

  // Full name exact phrase
  queries.push({
    query: quotedPrimary,
    type: 'general_exact',
    priority: 2,
    category: 'core',
    description: 'General name search (exact phrase)',
  });

  // Broad gov/edu/org institutional search
  queries.push({
    query: `${quotedPrimary} site:gov OR site:edu OR site:org`,
    type: 'institutional',
    priority: 2,
    category: 'official_records',
    description: 'Government, Education & Org sites',
  });

  // News and media coverage
  queries.push({
    query: `${quotedPrimary} site:news.google.com OR site:reuters.com OR site:ap.org`,
    type: 'news_media',
    priority: 3,
    category: 'news',
    description: 'News and media coverage',
  });

  // Court records and legal filings
  queries.push({
    query: `${quotedPrimary} "court" OR "case" OR "docket" OR "lawsuit" OR "plaintiff" OR "defendant"`,
    type: 'court_records',
    priority: 2,
    category: 'legal',
    description: 'Court records and legal filings',
  });

  // Obituaries and family connections (general)
  queries.push({
    query: `${quotedPrimary} "obituary" OR "survived by" OR "tribute"`,
    type: 'obituary_search',
    priority: 2,
    category: 'family',
    description: 'Obituaries and family records',
  });

  // ========== TARGETED OBITUARY / FUNERAL HOME SITE SEARCHES ==========
  // These sites have structured obituary data ideal for relative extraction

  // Legacy.com - largest obituary aggregator
  queries.push({
    query: `${quotedPrimary} site:legacy.com`,
    type: 'obituary_legacy',
    priority: 1,
    category: 'family',
    description: 'Legacy.com obituary search',
  });

  // Dignity Memorial - major funeral home network
  queries.push({
    query: `${quotedPrimary} site:dignitymemorial.com`,
    type: 'obituary_dignity',
    priority: 1,
    category: 'family',
    description: 'Dignity Memorial obituary search',
  });

  // Echovita - obituary aggregator
  queries.push({
    query: `${quotedPrimary} site:echovita.com`,
    type: 'obituary_echovita',
    priority: 1,
    category: 'family',
    description: 'Echovita obituary search',
  });

  // Tribute Archive - funeral home obituaries
  queries.push({
    query: `${quotedPrimary} site:tributearchive.com`,
    type: 'obituary_tribute',
    priority: 1,
    category: 'family',
    description: 'Tribute Archive obituary search',
  });

  // Find A Grave - cemetery/memorial records
  queries.push({
    query: `${quotedPrimary} site:findagrave.com "family" OR "spouse" OR "parent"`,
    type: 'obituary_findagrave',
    priority: 2,
    category: 'family',
    description: 'Find A Grave memorial records',
  });

  // Broad funeral home search - catches local funeral homes like jamesobradley.com
  if (city && state) {
    queries.push({
      query: `${quotedPrimary} "${city}" "obituary" OR "funeral" OR "memorial" OR "survived by"`,
      type: 'obituary_local_funeral',
      priority: 1,
      category: 'family',
      description: 'Local funeral home obituary search',
    });
  }

  // Obituary + relative connection search (finds family trees)
  queries.push({
    query: `${quotedPrimary} "survived by" "children" OR "grandchildren" OR "wife" OR "husband"`,
    type: 'obituary_survived_by',
    priority: 1,
    category: 'family',
    description: 'Obituary family tree extraction',
  });

  // ========== CUSTOM SITE-SPECIFIC SEARCHES (from keywords) ==========
  // These get HIGHEST priority since user specifically requested these sites
  for (const site of customSites) {
    // Full name on the custom site
    queries.push({
      query: `${quotedPrimary} site:${site}`,
      type: 'custom_site',
      priority: 1,
      description: `Custom site search: ${site}`,
    });

    // Also try first+last name separately for profile URL matching
    if (firstName && lastName) {
      queries.push({
        query: `"${firstName}" "${lastName}" site:${site}`,
        type: 'custom_site_parts',
        priority: 1,
        description: `Custom site (name parts): ${site}`,
      });
    }

    // Try username format common on activity sites: FirstName-LastName
    if (firstName && lastName) {
      queries.push({
        query: `"${firstName}-${lastName}" site:${site}`,
        type: 'custom_site_username',
        priority: 1,
        description: `Custom site (hyphenated): ${site}`,
      });
    }

    // With city if available
    if (city) {
      queries.push({
        query: `${quotedPrimary} "${city}" site:${site}`,
        type: 'custom_site_city',
        priority: 1,
        description: `Custom site + City: ${site}`,
      });
    }
  }

  // ========== KEYWORD + NAME COMBINATIONS (HIGHEST PRIORITY) ==========
  // Keywords are explicitly provided by the user - these MUST be searched with HIGH priority
  for (const keyword of keywordList.slice(0, 5)) { // Increased from 3 to 5 keywords
    // Keyword + full name - PRIORITY 1 (same as core dork queries)
    queries.push({
      query: `${quotedPrimary} "${keyword}"`,
      type: 'keyword_name',
      priority: 1, // Upgraded from 2 to 1 - user-specified keywords are critical
      category: 'keywords',
      description: `Keyword "${keyword}" + Full Name`,
    });

    // Keyword + full name + location (if available)
    if (city && state) {
      queries.push({
        query: `${quotedPrimary} "${keyword}" "${city}" "${state}"`,
        type: 'keyword_name_location',
        priority: 1,
        category: 'keywords',
        description: `Keyword "${keyword}" + Full Name + Location`,
      });
    }

    // Keyword + first name only (catches partial matches)
    if (firstName) {
      queries.push({
        query: `"${firstName}" "${keyword}"`,
        type: 'keyword_firstname',
        priority: 2, // Lower priority but still high
        category: 'keywords',
        description: `Keyword "${keyword}" + First Name`,
      });
    }

    // Keyword + last name only
    if (lastName) {
      queries.push({
        query: `"${lastName}" "${keyword}"`,
        type: 'keyword_lastname',
        priority: 2,
        category: 'keywords',
        description: `Keyword "${keyword}" + Last Name`,
      });
    }
  }
  
  // COMBINED keyword search - search ALL keywords together with name (HIGHEST PRIORITY)
  if (keywordList.length > 0) {
    const allKeywordsQuoted = keywordList.slice(0, 5).map(k => `"${k}"`).join(' ');
    queries.push({
      query: `${quotedPrimary} ${allKeywordsQuoted}`,
      type: 'keywords_combined_all',
      priority: 1,
      category: 'keywords',
      description: `All Keywords Combined: ${keywordList.slice(0, 5).join(', ')}`,
    });
    
    // Also try OR combinations for broader matching
    const allKeywordsOr = keywordList.slice(0, 5).map(k => `"${k}"`).join(' OR ');
    queries.push({
      query: `${quotedPrimary} (${allKeywordsOr})`,
      type: 'keywords_or_combined',
      priority: 1,
      category: 'keywords',
      description: `Keywords OR Combined: ${keywordList.slice(0, 5).join(' | ')}`,
    });
    
    // ========== KEYWORD-ONLY SEARCHES (for company/organization mentions) ==========
    // These catch results where the target's company/org is mentioned but their name
    // might not appear in Google's snippet (e.g., pages about events they attended)
    // PRIORITY 4: Execute LAST after name+keyword queries to prevent keyword-only pollution
    for (const keyword of keywordList.slice(0, 3)) {
      // Keyword alone (company/organization search) - LOW PRIORITY
      queries.push({
        query: `"${keyword}"`,
        type: 'keyword_only',
        priority: 4, // Changed from 1 to 4 - execute last
        category: 'keyword_mentions', // Separate category for UI filtering
        description: `Keyword-only: "${keyword}"`,
      });
      
      // Keyword + first name (catches mentions where full name isn't indexed)
      if (firstName) {
        queries.push({
          query: `"${keyword}" "${firstName}"`,
          type: 'keyword_firstname_direct',
          priority: 3, // Changed from 1 to 3
          category: 'keyword_mentions',
          description: `Keyword "${keyword}" + First Name "${firstName}"`,
        });
      }
      
      // Keyword + last name
      if (lastName) {
        queries.push({
          query: `"${keyword}" "${lastName}"`,
          type: 'keyword_lastname_direct',
          priority: 3, // Changed from 1 to 3
          category: 'keyword_mentions',
          description: `Keyword "${keyword}" + Last Name "${lastName}"`,
        });
      }
    }
    
    // Multi-word keyword exact phrase search (e.g., "Social Detection" as exact phrase)
    const multiWordKeywords = keywordList.filter(k => k.includes(' '));
    for (const multiWord of multiWordKeywords.slice(0, 3)) {
      queries.push({
        query: `"${multiWord}"`,
        type: 'keyword_multiword_exact',
        priority: 1,
        category: 'keywords',
        description: `Exact phrase: "${multiWord}"`,
      });
    }
  }

  // ========== KEYWORD + PHONE COMBINATIONS ==========
  if (hasValidPhone) {
    // Phone direct search
    queries.push({
      query: `"${cleanPhone}"`,
      type: 'phone_direct',
      priority: 1,
      description: `Phone search: ${phone}`,
    });

    // Phone + keywords
    for (const keyword of keywordList.slice(0, 2)) {
      queries.push({
        query: `"${cleanPhone}" "${keyword}"`,
        type: 'keyword_phone',
        priority: 2,
        description: `Keyword "${keyword}" + Phone`,
      });
    }

    // Phone + name
    queries.push({
      query: `"${cleanPhone}" ${quotedPrimary}`,
      type: 'phone_name',
      priority: 2,
      description: 'Phone + Name combination',
    });
  }

  // ========== KEYWORD + EMAIL COMBINATIONS ==========
  if (cleanEmail) {
    // Email direct search
    queries.push({
      query: `"${cleanEmail}"`,
      type: 'email_direct',
      priority: 1,
      description: `Email search: ${email}`,
    });

    // Email + keywords
    for (const keyword of keywordList.slice(0, 2)) {
      queries.push({
        query: `"${cleanEmail}" "${keyword}"`,
        type: 'keyword_email',
        priority: 2,
        description: `Keyword "${keyword}" + Email`,
      });
    }

    // Email + name
    queries.push({
      query: `"${cleanEmail}" ${quotedPrimary}`,
      type: 'email_name',
      priority: 2,
      description: 'Email + Name combination',
    });
  }

  // ========== KEYWORD + USERNAME COMBINATIONS ==========
  if (cleanUsername) {
    // Username direct search
    queries.push({
      query: `"${cleanUsername}"`,
      type: 'username_direct',
      priority: 2,
      description: `Username search: ${cleanUsername}`,
    });

    // Username + keywords
    for (const keyword of keywordList.slice(0, 2)) {
      queries.push({
        query: `"${cleanUsername}" "${keyword}"`,
        type: 'keyword_username',
        priority: 2,
        description: `Keyword "${keyword}" + Username`,
      });
    }

    // Username + name
    queries.push({
      query: `"${cleanUsername}" ${quotedPrimary}`,
      type: 'username_name',
      priority: 2,
      description: 'Username + Name combination',
    });
  }

  // ========== KEYWORD + RELATIVES/ASSOCIATES COMBINATIONS ==========
  if (relatives && relatives.length > 0) {
    for (const relative of relatives.slice(0, 5)) { // Increased from 3 to 5 for better coverage
      const cleanRelative = stripOuterQuotes(relative);
      if (cleanRelative.length > 2) {
        // Parse relative name components
        const relativeParts = cleanRelative.split(/\s+/);
        const relativeFirstName = relativeParts[0] || '';
        const relativeLastName = relativeParts[relativeParts.length - 1] || '';
        
        // Relative + primary name - PRIORITY 1 for family connections
        queries.push({
          query: `"${cleanRelative}" ${quotedPrimary}`,
          type: 'relative_name',
          priority: 1,
          category: 'family',
          description: `Relative/Associate "${cleanRelative}" + Name`,
        });

        // Relative + target name + obituary/family keywords - CRITICAL for obituary discovery
        queries.push({
          query: `"${cleanRelative}" ${quotedPrimary} "obituary" OR "survived by" OR "passed away"`,
          type: 'relative_obituary',
          priority: 1,
          category: 'family',
          description: `Relative "${cleanRelative}" + Name + Obituary search`,
        });
        
        // Search for funeral home results mentioning both names
        queries.push({
          query: `"${cleanRelative}" ${quotedPrimary} "funeral" OR "memorial" OR "tribute"`,
          type: 'relative_funeral',
          priority: 1,
          category: 'family',
          description: `Relative "${cleanRelative}" + Name + Funeral/Memorial`,
        });

        // Relative + last name only (catches shared family name in obituaries)
        if (lastName) {
          queries.push({
            query: `"${cleanRelative}" "${lastName}" "obituary"`,
            type: 'relative_lastname_obituary',
            priority: 1,
            category: 'family',
            description: `Relative "${cleanRelative}" + Last name + Obituary`,
          });
        }
        
        // Former spouse with maiden name pattern: "Heather Petrie Tomes" 
        // Search for former spouses who may have the surname in their married name
        if (relativeLastName !== lastName?.toLowerCase() && relativeParts.length >= 2) {
          // Search for the relative alone (may be former spouse with new name)
          queries.push({
            query: `"${cleanRelative}" "obituary" OR "survived by"`,
            type: 'relative_solo_obituary',
            priority: 1,
            category: 'family',
            description: `Relative "${cleanRelative}" obituary mention`,
          });
          
          // Search for relative with our last name (catches "Heather Petrie Tomes")
          if (lastName) {
            queries.push({
              query: `"${relativeFirstName}" "${lastName}" "${relativeLastName}"`,
              type: 'relative_maiden_name',
              priority: 1,
              category: 'family',
              description: `Former spouse pattern: ${relativeFirstName} ${lastName} ${relativeLastName}`,
            });
          }
        }
        
        // Deceased relative search - look for obituaries of the relative themselves
        // This is especially important for parents who have passed away
        if (relativeParts.length >= 2) {
          queries.push({
            query: `"${cleanRelative}" "obituary" "survived by" "${lastName || firstName}"`,
            type: 'relative_their_obituary',
            priority: 1,
            category: 'family',
            description: `${cleanRelative}'s obituary mentioning ${lastName || firstName}`,
          });
        }

        // Relative + keywords
        for (const keyword of keywordList.slice(0, 2)) {
          queries.push({
            query: `"${cleanRelative}" "${keyword}"`,
            type: 'keyword_relative',
            priority: 2,
            category: 'keywords',
            description: `Keyword "${keyword}" + Relative "${cleanRelative}"`,
          });
        }
      }
    }
    
    // Special query: Last name family obituary search 
    // Catches "the Petrie family" or obituaries listing multiple family members
    if (lastName) {
      queries.push({
        query: `"${lastName} family" "obituary" OR "memorial"`,
        type: 'family_name_obituary',
        priority: 1,
        category: 'family',
        description: `${lastName} family obituary/memorial search`,
      });
      
      // Search for multiple relatives together (strengthens family connections)
      if (relatives.length >= 2) {
        const rel1 = stripOuterQuotes(relatives[0]);
        const rel2 = stripOuterQuotes(relatives[1]);
        queries.push({
          query: `"${rel1}" "${rel2}" "${lastName}"`,
          type: 'multiple_relatives',
          priority: 1,
          category: 'family',
          description: `Multiple relatives: ${rel1} + ${rel2}`,
        });
      }
    }
  }

  // ========== LOCATION COMBINATIONS ==========
  if (state) {
    queries.push({
      query: `${quotedPrimary} ${state}`,
      type: 'location_state',
      priority: 2,
      description: `Name + State: ${state}`,
    });
  }

  if (city && state) {
    queries.push({
      query: `${quotedPrimary} "${city}" "${state}"`,
      type: 'location_full',
      priority: 2,
      description: `Name + Full location: ${city}, ${state}`,
    });
  }

  // ========== STATE BUSINESS REGISTRY SEARCHES ==========
  const stateRegistry = getStateRegistry(state);
  if (stateRegistry) {
    // Search state business registry for officer/director
    queries.push({
      query: `${quotedPrimary} site:${stateRegistry.domain} officer OR director OR member OR agent`,
      type: 'business_registry_officer',
      priority: 2,
      description: `${stateRegistry.name} - Officer/Director Search`,
    });

    // Search for registered agent
    queries.push({
      query: `${quotedPrimary} site:${stateRegistry.domain} "registered agent"`,
      type: 'business_registry_agent',
      priority: 2,
      description: `${stateRegistry.name} - Registered Agent Search`,
    });

    // General business affiliation search on state registry
    queries.push({
      query: `${quotedPrimary} site:${stateRegistry.domain}`,
      type: 'business_registry_general',
      priority: 2,
      description: `${stateRegistry.name} - Business Affiliations`,
    });

    // If we have an address, search by street address
    if (city) {
      queries.push({
        query: `${quotedPrimary} "${city}" site:${stateRegistry.domain}`,
        type: 'business_registry_address',
        priority: 3,
        description: `${stateRegistry.name} - Business at ${city}`,
      });
    }

    // Search for keywords + business registry
    for (const keyword of keywordList.slice(0, 2)) {
      queries.push({
        query: `"${keyword}" site:${stateRegistry.domain} ${quotedPrimary}`,
        type: 'business_registry_keyword',
        priority: 3,
        description: `${stateRegistry.name} - Keyword "${keyword}"`,
      });
    }
  }

  // ========== PROPERTY RECORDS / COUNTY ASSESSOR SEARCHES ==========
  const propertyAssessors = getPropertyAssessors(state);
  if (propertyAssessors) {
    console.log(`Adding property assessor searches for ${propertyAssessors.name}`);
    
    // Build site filter for all county assessor domains
    const siteFilter = propertyAssessors.domains.slice(0, 5).map(d => `site:${d}`).join(' OR ');
    
    // Name search on property assessor sites
    queries.push({
      query: `${quotedPrimary} (${siteFilter})`,
      type: 'property_owner_name',
      priority: 2,
      description: `${propertyAssessors.name} - Property Owner Search`,
    });

    // Address/location + property assessor
    if (city) {
      queries.push({
        query: `${quotedPrimary} "${city}" (${siteFilter})`,
        type: 'property_owner_city',
        priority: 2,
        description: `${propertyAssessors.name} - Property in ${city}`,
      });
    }

    // Property records with address components
    queries.push({
      query: `${quotedPrimary} "property" OR "owner" OR "parcel" (${siteFilter})`,
      type: 'property_parcel',
      priority: 3,
      description: `${propertyAssessors.name} - Parcel/Property Records`,
    });

    // Tax records search
    queries.push({
      query: `${quotedPrimary} "tax" OR "assessment" OR "appraised" (${siteFilter})`,
      type: 'property_tax',
      priority: 3,
      description: `${propertyAssessors.name} - Tax Assessment Records`,
    });
  }

  // ========== 3+ PARAMETER CROSS-REFERENCE QUERIES ==========
  // These combine 3 or more parameters to ensure high accuracy and stronger corroboration.
  // Results from these queries receive a confidence multiplier boost.

  // --- Email + Phone + Name ---
  if (cleanEmail && hasValidPhone) {
    queries.push({
      query: `"${cleanEmail}" "${cleanPhone}"`,
      type: 'xref_email_phone',
      priority: 1,
      category: 'cross_reference',
      description: 'Cross-ref: Email + Phone',
    });
    queries.push({
      query: `"${cleanEmail}" "${cleanPhone}" ${quotedPrimary}`,
      type: 'xref_email_phone_name',
      priority: 1,
      category: 'cross_reference',
      description: 'Cross-ref: Email + Phone + Name (3-param)',
    });
  }

  // --- Email + City + State ---
  if (cleanEmail && city && state) {
    queries.push({
      query: `"${cleanEmail}" "${city}" "${state}"`,
      type: 'xref_email_city_state',
      priority: 1,
      category: 'cross_reference',
      description: 'Cross-ref: Email + City + State (3-param)',
    });
    // 4-param: Email + Name + City + State
    queries.push({
      query: `"${cleanEmail}" ${quotedPrimary} "${city}" "${state}"`,
      type: 'xref_email_name_city_state',
      priority: 1,
      category: 'cross_reference',
      description: 'Cross-ref: Email + Name + City + State (4-param)',
    });
  }

  // --- Phone + City + State ---
  if (hasValidPhone && city && state) {
    queries.push({
      query: `"${cleanPhone}" "${city}" "${state}"`,
      type: 'xref_phone_city_state',
      priority: 1,
      category: 'cross_reference',
      description: 'Cross-ref: Phone + City + State (3-param)',
    });
    // 4-param: Phone + Name + City + State
    queries.push({
      query: `"${cleanPhone}" ${quotedPrimary} "${city}" "${state}"`,
      type: 'xref_phone_name_city_state',
      priority: 1,
      category: 'cross_reference',
      description: 'Cross-ref: Phone + Name + City + State (4-param)',
    });
  }

  // --- Username + Name + City ---
  if (cleanUsername && city) {
    queries.push({
      query: `"${cleanUsername}" ${quotedPrimary} "${city}"`,
      type: 'xref_username_name_city',
      priority: 1,
      category: 'cross_reference',
      description: 'Cross-ref: Username + Name + City (3-param)',
    });
  }

  // --- Username + Email + Name ---
  if (cleanUsername && cleanEmail) {
    queries.push({
      query: `"${cleanUsername}" "${cleanEmail}"`,
      type: 'xref_username_email',
      priority: 1,
      category: 'cross_reference',
      description: 'Cross-ref: Username + Email',
    });
    queries.push({
      query: `"${cleanUsername}" "${cleanEmail}" ${quotedPrimary}`,
      type: 'xref_username_email_name',
      priority: 1,
      category: 'cross_reference',
      description: 'Cross-ref: Username + Email + Name (3-param)',
    });
  }

  // --- Username + Phone ---
  if (cleanUsername && hasValidPhone) {
    queries.push({
      query: `"${cleanUsername}" "${cleanPhone}"`,
      type: 'xref_username_phone',
      priority: 1,
      category: 'cross_reference',
      description: 'Cross-ref: Username + Phone',
    });
    queries.push({
      query: `"${cleanUsername}" "${cleanPhone}" ${quotedPrimary}`,
      type: 'xref_username_phone_name',
      priority: 1,
      category: 'cross_reference',
      description: 'Cross-ref: Username + Phone + Name (3-param)',
    });
  }

  // --- Phone + Email ---
  if (hasValidPhone && cleanEmail) {
    queries.push({
      query: `"${cleanPhone}" "${cleanEmail}"`,
      type: 'xref_phone_email',
      priority: 1,
      category: 'cross_reference',
      description: 'Cross-ref: Phone + Email',
    });
  }

  // --- Email + Keyword + Name ---
  if (cleanEmail && keywordList.length > 0) {
    for (const keyword of keywordList.slice(0, 3)) {
      queries.push({
        query: `"${cleanEmail}" "${keyword}" ${quotedPrimary}`,
        type: 'xref_email_keyword_name',
        priority: 1,
        category: 'cross_reference',
        description: `Cross-ref: Email + Keyword "${keyword}" + Name (3-param)`,
      });
    }
  }

  // --- Phone + Keyword + Name ---
  if (hasValidPhone && keywordList.length > 0) {
    for (const keyword of keywordList.slice(0, 3)) {
      queries.push({
        query: `"${cleanPhone}" "${keyword}" ${quotedPrimary}`,
        type: 'xref_phone_keyword_name',
        priority: 1,
        category: 'cross_reference',
        description: `Cross-ref: Phone + Keyword "${keyword}" + Name (3-param)`,
      });
    }
  }

  // --- Username + Keyword + Name ---
  if (cleanUsername && keywordList.length > 0) {
    for (const keyword of keywordList.slice(0, 3)) {
      queries.push({
        query: `"${cleanUsername}" "${keyword}" ${quotedPrimary}`,
        type: 'xref_username_keyword_name',
        priority: 1,
        category: 'cross_reference',
        description: `Cross-ref: Username + Keyword "${keyword}" + Name (3-param)`,
      });
    }
  }

  // --- Relative + Name + City + State ---
  if (relatives && relatives.length > 0 && city && state) {
    for (const relative of relatives.slice(0, 3)) {
      const cleanRelative = stripOuterQuotes(relative);
      if (cleanRelative.length > 2) {
        queries.push({
          query: `"${cleanRelative}" ${quotedPrimary} "${city}" "${state}"`,
          type: 'xref_relative_name_location',
          priority: 1,
          category: 'cross_reference',
          description: `Cross-ref: Relative "${cleanRelative}" + Name + Location (4-param)`,
        });
      }
    }
  }

  // --- Relative + Email ---
  if (relatives && relatives.length > 0 && cleanEmail) {
    for (const relative of relatives.slice(0, 3)) {
      const cleanRelative = stripOuterQuotes(relative);
      if (cleanRelative.length > 2) {
        queries.push({
          query: `"${cleanRelative}" "${cleanEmail}"`,
          type: 'xref_relative_email',
          priority: 1,
          category: 'cross_reference',
          description: `Cross-ref: Relative "${cleanRelative}" + Email`,
        });
      }
    }
  }

  // --- Relative + Phone ---
  if (relatives && relatives.length > 0 && hasValidPhone) {
    for (const relative of relatives.slice(0, 3)) {
      const cleanRelative = stripOuterQuotes(relative);
      if (cleanRelative.length > 2) {
        queries.push({
          query: `"${cleanRelative}" "${cleanPhone}"`,
          type: 'xref_relative_phone',
          priority: 1,
          category: 'cross_reference',
          description: `Cross-ref: Relative "${cleanRelative}" + Phone`,
        });
      }
    }
  }

  // --- Keyword + City + State + Name (always 4-param when all available) ---
  if (keywordList.length > 0 && city && state) {
    for (const keyword of keywordList.slice(0, 3)) {
      queries.push({
        query: `"${keyword}" "${city}" "${state}" ${quotedPrimary}`,
        type: 'xref_keyword_location_name',
        priority: 1,
        category: 'cross_reference',
        description: `Cross-ref: Keyword "${keyword}" + Location + Name (4-param)`,
      });
    }
  }

  // --- Email + Username + City ---
  if (cleanEmail && cleanUsername && city) {
    queries.push({
      query: `"${cleanEmail}" "${cleanUsername}" "${city}"`,
      type: 'xref_email_username_city',
      priority: 1,
      category: 'cross_reference',
      description: 'Cross-ref: Email + Username + City (3-param)',
    });
  }

  // --- Phone + Username + City ---
  if (hasValidPhone && cleanUsername && city) {
    queries.push({
      query: `"${cleanPhone}" "${cleanUsername}" "${city}"`,
      type: 'xref_phone_username_city',
      priority: 1,
      category: 'cross_reference',
      description: 'Cross-ref: Phone + Username + City (3-param)',
    });
  }

  // General property record searches (national sites)
  queries.push({
    query: `${quotedPrimary} "property owner" OR "real estate" OR "deed" site:gov`,
    type: 'property_records_gov',
    priority: 3,
    description: 'Property records on .gov sites',
  });

  queries.push({
    query: `${quotedPrimary} site:zillow.com OR site:redfin.com OR site:realtor.com`,
    type: 'property_listings',
    priority: 4,
    description: 'Real estate listing sites',
  });

  queries.push({
    query: `${quotedPrimary} site:propertyshark.com OR site:county-taxes.com`,
    type: 'property_aggregators',
    priority: 4,
    description: 'Property data aggregators',
  });

  queries.push({
    query: `${quotedPrimary} "officer" OR "director" OR "president" OR "CEO" site:gov`,
    type: 'business_officer_gov',
    priority: 2,
    description: 'Business Officer/Director on .gov sites',
  });

  queries.push({
    query: `${quotedPrimary} "registered agent" OR "statutory agent" site:gov`,
    type: 'business_agent_gov',
    priority: 3,
    description: 'Registered Agent on .gov sites',
  });

  // OpenCorporates search (aggregates business data)
  queries.push({
    query: `${quotedPrimary} site:opencorporates.com`,
    type: 'opencorporates',
    priority: 3,
    description: 'OpenCorporates business database',
  });

  // Bloomberg/business news for corporate affiliations
  queries.push({
    query: `${quotedPrimary} site:bloomberg.com OR site:crunchbase.com`,
    type: 'business_news',
    priority: 4,
    description: 'Business profiles (Bloomberg, Crunchbase)',
  });

  // ========== SOCIAL MEDIA & PROFILE SEARCHES ==========
  queries.push({
    query: `${quotedPrimary} site:linkedin.com`,
    type: 'linkedin',
    priority: 2,
    description: 'LinkedIn profiles',
  });

  queries.push({
    query: `${quotedPrimary} site:facebook.com`,
    type: 'facebook',
    priority: 2,
    description: 'Facebook profiles',
  });

  queries.push({
    query: `${quotedPrimary} site:twitter.com OR site:x.com`,
    type: 'twitter',
    priority: 3,
    description: 'Twitter/X profiles',
  });

  queries.push({
    query: `${quotedPrimary} site:instagram.com`,
    type: 'instagram',
    priority: 3,
    description: 'Instagram profiles',
  });

  queries.push({
    query: `${quotedPrimary} site:youtube.com OR site:tiktok.com`,
    type: 'video_platforms',
    priority: 3,
    description: 'YouTube/TikTok profiles',
  });

  queries.push({
    query: `${quotedPrimary} site:github.com OR site:gitlab.com`,
    type: 'developer_profiles',
    priority: 4,
    description: 'Developer profiles (GitHub, GitLab)',
  });

  // ========== GOVERNMENT & PUBLIC RECORDS ==========
  queries.push({
    query: `${quotedPrimary} site:gov`,
    type: 'gov_sites',
    priority: 2,
    description: 'All government sites',
  });

  queries.push({
    query: `${quotedPrimary} site:state.fl.us OR site:myflorida.com`,
    type: 'florida_gov',
    priority: 3,
    description: 'Florida state government',
  });

  // County-level government searches (most public records are at county level)
  if (city) {
    queries.push({
      query: `${quotedPrimary} "${city}" site:gov "clerk" OR "recorder" OR "assessor" OR "court"`,
      type: 'county_records',
      priority: 2,
      description: `County records for ${city}`,
    });
  }

  // ========== DOCUMENT SEARCHES ==========
  queries.push({
    query: `${quotedPrimary} filetype:pdf`,
    type: 'documents_pdf',
    priority: 3,
    description: 'PDF documents',
  });

  queries.push({
    query: `${quotedPrimary} filetype:doc OR filetype:docx`,
    type: 'documents_word',
    priority: 4,
    description: 'Word documents',
  });

  // ========== PEOPLE FINDER SITES ==========
  queries.push({
    query: `${quotedPrimary} site:whitepages.com OR site:spokeo.com OR site:truepeoplesearch.com`,
    type: 'people_finders',
    priority: 2,
    description: 'People finder sites',
  });

  queries.push({
    query: `${quotedPrimary} site:beenverified.com OR site:intelius.com OR site:peoplefinder.com`,
    type: 'people_finders_2',
    priority: 3,
    description: 'Additional people finder sites',
  });

  queries.push({
    query: `${quotedPrimary} site:fastpeoplesearch.com OR site:thatsthem.com OR site:usphonebook.com`,
    type: 'people_finders_3',
    priority: 3,
    description: 'Free people search sites',
  });

  // ========== ATHLETIC/HOBBY ACTIVITY SITES ==========
  queries.push({
    query: `${quotedPrimary} site:strava.com OR site:alltrails.com OR site:athlinks.com`,
    type: 'athletic_profiles',
    priority: 3,
    description: 'Athletic/activity profiles',
  });

  queries.push({
    query: `${quotedPrimary} site:runkeeper.com OR site:mapmyrun.com OR site:garmin.com`,
    type: 'fitness_profiles',
    priority: 4,
    description: 'Fitness tracking profiles',
  });

  // ========== PROFESSIONAL DIRECTORIES ==========
  queries.push({
    query: `${quotedPrimary} site:zoominfo.com OR site:dnb.com OR site:manta.com`,
    type: 'business_directories',
    priority: 3,
    description: 'Business directories',
  });

  queries.push({
    query: `${quotedPrimary} "attorney" OR "lawyer" OR "bar association" site:gov OR site:org`,
    type: 'legal_professional',
    priority: 4,
    description: 'Legal professional records',
  });

  queries.push({
    query: `${quotedPrimary} "license" OR "certification" OR "registered" site:gov`,
    type: 'professional_licenses',
    priority: 3,
    description: 'Professional licenses',
  });

  return queries;
}

async function executeSearch(query: string, apiKey: string, searchEngineId: string, pages: number = 2): Promise<any> {
  console.log(`Executing search: "${query}" (fetching ${pages} pages)`);
  
  const allItems: any[] = [];
  let totalResults = 0;
  
  // Fetch multiple pages of results (10 results per page, max 100 total via CSE)
  for (let page = 0; page < pages; page++) {
    const startIndex = page * 10 + 1; // CSE uses 1-based index
    const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}&num=10&start=${startIndex}`;
    
    try {
      const response = await fetch(searchUrl);
      const data = await response.json();
      
      if (data.error) {
        // If we get an error on page 2+, just break and return what we have
        if (page > 0) {
          console.log(`Stopping pagination at page ${page + 1}: ${data.error.message}`);
          break;
        }
        console.error(`Search error for query "${query}":`, data.error.message);
        return null;
      }
      
      if (data.items && data.items.length > 0) {
        allItems.push(...data.items);
        totalResults = parseInt(data.searchInformation?.totalResults || '0');
        console.log(`Page ${page + 1}: Got ${data.items.length} results`);
      } else {
        // No more results available
        console.log(`Page ${page + 1}: No more results`);
        break;
      }
      
      // Don't fetch more pages if we've exhausted results
      if (allItems.length >= totalResults) {
        break;
      }
      
      // Small delay between requests to avoid rate limiting
      if (page < pages - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (err) {
      console.error(`Error fetching page ${page + 1}:`, err);
      if (page === 0) return null;
      break;
    }
  }
  
  console.log(`Query "${query.slice(0, 50)}..." returned ${allItems.length} total results`);
  
  return {
    items: allItems,
    searchInformation: { totalResults: totalResults.toString() }
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { target, searchData } = await req.json();
    console.log('=== Web Search Started ===');
    console.log('Target:', target);
    console.log('Search data:', JSON.stringify(searchData));

    if (!GOOGLE_API_KEY || !GOOGLE_SEARCH_ENGINE_ID) {
      console.error('Missing API credentials');
      throw new Error('Google API credentials not configured');
    }

    const stripOuterQuotes = (value: string) => String(value || '').replace(/^"+|"+$/g, '').trim();

    const seedQuery = typeof target === 'string' ? target.trim() : '';
    const searchName = stripOuterQuotes(searchData?.fullName || seedQuery);
    const location = searchData?.address;
    const email = searchData?.email;
    const phone = searchData?.phone;
    const keywords = searchData?.keywords;
    
    const username = searchData?.username;
    const relatives = searchData?.relatives || searchData?.associates || [];
    
    // Detect state from location for business registry searches
    let detectedState = '';
    if (location && location !== 'provided') {
      const locationParts = location.split(',').map((p: string) => p.trim());
      detectedState = locationParts.length > 1 ? locationParts[locationParts.length - 1] : locationParts[0];
    }
    const stateRegistry = getStateRegistry(detectedState);
    
    console.log('Parsed inputs - Name:', searchName, 'Location:', location, 'Keywords:', keywords, 'Username:', username, 'Relatives:', relatives?.length || 0);
    if (stateRegistry) {
      console.log('Detected state registry:', stateRegistry.name, '- Will search business affiliations');
    }
    
    // Build targeted dork queries with keywords combined with all data points
    const dorkQueries = buildDorkQueries(searchName, location, email, phone, keywords, seedQuery, username, relatives);

    // Execute MORE queries for comprehensive coverage - increased to 30 for better results
    // Google CSE allows 100 queries/day free, then paid - 40 queries accommodates 3+ param cross-references
    // CRITICAL: Keyword queries are now priority 1, so they will be executed first
    const sortedQueries = dorkQueries.sort((a, b) => a.priority - b.priority).slice(0, 40);
    
    console.log('Will execute', sortedQueries.length, 'priority queries out of', dorkQueries.length, 'total generated:');
    sortedQueries.forEach((q, i) => console.log(`  ${i+1}. [P${q.priority}][${q.type}] ${q.query.slice(0, 70)}...`));
    
    // Track results per query for debugging/display
    const queryStats: { query: string; type: string; description: string; resultCount: number; category?: string }[] = [];
    
    const searchPromises = sortedQueries.map((q, index) => 
      executeSearch(q.query, GOOGLE_API_KEY!, GOOGLE_SEARCH_ENGINE_ID!)
        .then(result => {
          const resultCount = result?.items?.length || 0;
          queryStats[index] = {
            query: q.query,
            type: q.type,
            description: q.description,
            resultCount,
            category: q.category
          };
          return { 
            ...result, 
            queryType: q.type, 
            queryUsed: q.query,
            queryDescription: q.description,
            queryCategory: q.category
          };
        })
    );
    
    const searchResults = await Promise.all(searchPromises);
    
    // Log query stats
    console.log('Query execution stats:');
    queryStats.forEach((stat, i) => {
      console.log(`  ${i+1}. [${stat.type}] ${stat.resultCount} results - ${stat.query.slice(0, 60)}...`);
    });
    
    // Check if ALL searches failed due to API being blocked
    const allFailed = searchResults.every(r => r === null);
    const firstError = searchResults.find(r => r?.error);
    
    if (allFailed || firstError?.error) {
      const errorMessage = firstError?.error?.message || 'Google Custom Search API is blocked or not enabled. Please enable it in Google Cloud Console.';
      console.error('All searches failed. API Error:', errorMessage);
      
      // Return error in response so UI can show helpful message
      return new Response(JSON.stringify({ 
        error: errorMessage,
        searchInformation: { totalResults: "0", queriesExecuted: sortedQueries.map(q => q.type) },
        confirmedItems: [],
        possibleItems: [],
        items: [],
        queriesUsed: sortedQueries.map(q => ({ type: q.type, query: q.query, description: q.description, category: q.category })),
        searchContext: {
          fullName: searchName,
          hasAddress: !!location,
          hasEmail: !!email,
          hasPhone: !!phone,
          hasKeywords: !!keywords
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.log('All searches complete. Processing results...');
    
    // normalizeUrl imported from _shared/osint-utils.ts
    
    // Deduplicate results by normalized URL
    const seenUrls = new Set<string>();
    const confirmedResults: any[] = [];
    const possibleResults: any[] = [];
    
    // Parse keywords for matching
    const keywordList = keywords 
      ? keywords.split(',').map((k: string) => k.trim().toLowerCase()).filter((k: string) => k.length > 1)
      : [];
    
    // Track potential relatives found across all results
    const allFoundRelatives: Set<string> = new Set();
    
    // Check which keywords might be potential relative names (share last name with target OR explicitly provided as relatives)
    // This now handles spouses with different surnames (like "Yana Shapiro" for target "Michael Petrie")
    const relativeKeywords: string[] = [];
    const providedRelatives = relatives || [];
    for (const keyword of keywordList) {
      if (isKeywordPotentialRelative(keyword, searchName, providedRelatives)) {
        relativeKeywords.push(keyword);
        console.log(`Keyword "${keyword}" identified as potential relative/spouse for "${searchName}"`);
      }
    }
    
    for (const result of searchResults) {
      if (!result || !result.items) continue;
      
      for (const item of result.items) {
        const normalizedUrl = normalizeUrl(item.link);
        if (seenUrls.has(normalizedUrl)) {
          console.log(`Skipping duplicate URL: ${item.link} (normalized: ${normalizedUrl})`);
          continue;
        }
        seenUrls.add(normalizedUrl);
        
        const textToCheck = `${item.title} ${item.snippet}`;
        const nameMatch = checkNameMatch(textToCheck, searchName, item.link);
        
        // Extract potential relatives from this result (especially obituaries)
        const isObituaryOrPeopleSearch = 
          item.link?.includes('obituar') || 
          item.link?.includes('legacy.com') ||
          item.link?.includes('obradley') ||
          item.link?.includes('findagrave') ||
          item.link?.includes('tributes') ||
          item.link?.includes('whitepages') ||
          item.link?.includes('spokeo') ||
          item.link?.includes('truepeoplesearch') ||
          item.title?.toLowerCase().includes('obituary') ||
          item.snippet?.toLowerCase().includes('survived by');
        
        let foundRelatives: string[] = [];
        let foundRelativesWithContext: { name: string; relationship?: string }[] = [];
        if (isObituaryOrPeopleSearch) {
          // CRITICAL: Only extract relatives from obituaries that actually mention
          // the search target. Without this check, unrelated obituaries that appear
          // in results (e.g., same funeral home, keyword match) would pollute the
          // "From Obituaries/Memorials" section with strangers' family members.
          const targetMentioned = nameMatch.exact || nameMatch.partial;
          if (targetMentioned) {
            foundRelativesWithContext = extractPotentialRelatives(textToCheck, searchName);
            foundRelatives = foundRelativesWithContext.map(r => r.name);
            foundRelatives.forEach(r => allFoundRelatives.add(r));
            if (foundRelatives.length > 0) {
              console.log(`Found potential relatives in "${item.link}":`, foundRelativesWithContext);
            }
          } else {
            console.log(`Skipping relative extraction from "${item.link}" - target name not found in snippet`);
          }
        }
        
        // Check location presence
        // We treat location corroboration as: (city OR state) match.
        // This aligns with the app rule: name + state OR name + city counts as corroboration.
        let locationPresent = false;
        let matchedLocation = '';
        if (location && location !== 'provided') {
          const locationParts = location
            .split(',')
            .map((p: string) => p.trim())
            .filter((p: string) => p.length > 0);

          const cityPart = locationParts[0]?.toLowerCase() || '';
          const statePart = (locationParts[1] || '').trim();
          const stateLower = statePart.toLowerCase();

          const textLower = textToCheck.toLowerCase();

          const cityMatch = cityPart.length >= 3 && textLower.includes(cityPart);

          // Allow 2-letter US state codes (e.g., "PA") with word-boundary matching.
          const stateMatch = /^[a-z]{2}$/.test(stateLower)
            ? new RegExp(`\\b${stateLower}\\b`, 'i').test(textToCheck)
            : (stateLower.length >= 3 && textLower.includes(stateLower));

          locationPresent = cityMatch || stateMatch;
          if (locationPresent) {
            // Build the matched location string
            const matchedParts: string[] = [];
            if (cityMatch && locationParts[0]) matchedParts.push(locationParts[0]);
            if (stateMatch && statePart) matchedParts.push(statePart.toUpperCase());
            matchedLocation = matchedParts.join(', ') || location;
          }
        }

        // Check keyword matches
        const keywordMatches: string[] = [];
        let hasRelativeKeywordMatch = false;
        for (const keyword of keywordList) {
          if (textToCheck.toLowerCase().includes(keyword)) {
            keywordMatches.push(keyword);
            // Check if this matched keyword is a potential relative
            if (relativeKeywords.includes(keyword)) {
              hasRelativeKeywordMatch = true;
            }
          }
        }

        // Check phone presence
        // IMPORTANT: Don't use partial (last-7) matching — it creates false positives.
        let phonePresent = false;
        let matchedPhone = '';
        if (phone) {
          const cleanPhone = phone.replace(/\D/g, '');
          const textDigits = textToCheck.replace(/\D/g, '');
          // Require a full 10+ digit match in the digit-stripped text.
          if (cleanPhone.length >= 10) {
            phonePresent = textDigits.includes(cleanPhone);
            if (phonePresent) {
              // Format the phone number for display
              matchedPhone = phone;
            }
          }
        }
        
        // Check email presence
        let emailPresent = false;
        let matchedEmail = '';
        if (email) {
          emailPresent = textToCheck.toLowerCase().includes(email.toLowerCase());
          if (emailPresent) {
            matchedEmail = email;
          }
        }
        
        // Calculate confidence based on match quality and source type
        // STRICT MATCHING: Confirmed requires name + at least ONE corroborating data point
        // Name-only matches (without phone, email, username, location, relative, or keyword) are POSSIBLE not CONFIRMED
        let confidenceScore = 0.2; // Base score is low - must earn confidence
        
        // Count corroborating evidence beyond just the name
        let corroboratingFactors = 0;
        
        // Name matching is required but NOT SUFFICIENT for confirmed status
        // Name matching determines base score
        // IMPORTANT: Results with NO name match can still be included if ALL keywords match
        // This catches company/organization pages where the person is mentioned in content
        // but their name doesn't appear in Google's snippet
        let isKeywordOnlyMatch = false;
        
        if (nameMatch.exact) {
          // Exact phrase match: "John Smith" found as exact phrase
          // Base score for exact name is 0.45 - below threshold, needs corroboration
          confidenceScore = 0.45;
        } else if (nameMatch.partial) {
          // Both first and last name found but not as exact phrase
          // This is less reliable - could be different people with same names
          confidenceScore = 0.25;
        } else {
          // No name match in snippet - but this could still be a valid result
          // Google often returns relevant results where the name isn't in the snippet
          
          // CASE 1: Result came from a keyword+name query (e.g., "Michael Petrie" "Social Detection")
          // If Google returned this result for that query, trust it - the name may be on the page
          // but just not in the snippet Google chose to display
          const isFromKeywordNameQuery = result.queryType === 'keyword_name' || 
                                          result.queryType === 'keyword_name_location' ||
                                          result.queryType === 'keywords_combined_all' ||
                                          result.queryType === 'keywords_or_combined';
          
          // Check if any user keywords match in the result (validates relevance)
          const hasAnyKeywordMatch = keywordList.length > 0 && 
            keywordList.some((kw: string) => textToCheck.toLowerCase().includes(kw.toLowerCase()));
          
          // Check if any multi-word keywords match exactly (e.g., "Social Detection")
          const hasExactMultiWordMatch = keywordList.some((kw: string) => 
            kw.includes(' ') && textToCheck.toLowerCase().includes(kw.toLowerCase())
          );
          
          // Check if this result came from ANY keyword-related query
          const isFromKeywordQuery = result.queryType?.startsWith('keyword_') || 
                                      result.queryType?.includes('keyword');
          
          if (isFromKeywordNameQuery && hasAnyKeywordMatch) {
            // Keyword+Name query result where keywords appear - TRUST Google's relevance
            // The name was in the query, keywords are present - likely valid result
            isKeywordOnlyMatch = true;
            confidenceScore = 0.50; // Higher than pure keyword-only since query included name
            console.log(`  [KEYWORD+NAME QUERY] Including result from "${result.queryType}" - keywords found, name was in query: ${item.link}`);
          } else if (hasExactMultiWordMatch && isFromKeywordQuery) {
            // Exact multi-word keyword match from any keyword query
            isKeywordOnlyMatch = true;
            confidenceScore = 0.40;
            console.log(`  [EXACT KEYWORD] Including result with exact multi-word keyword match: ${item.link}`);
          } else if (hasAnyKeywordMatch && isFromKeywordQuery) {
            // Some keywords match from a keyword query - lower confidence
            isKeywordOnlyMatch = true;
            confidenceScore = 0.35; // Below confirmed threshold, will be "Possible Match"
            console.log(`  [KEYWORD-ONLY] Including result with keyword match but no name: ${item.link}`);
          } else {
            // Neither name nor sufficient keyword match - skip
            console.log(`Skipping result with no name match: ${item.link}`);
            continue;
          }
        }
        
        // CORROBORATING FACTORS - each one adds to confidence and counts toward "confirmed" status
        
        // Phone match - STRONG corroboration (+20%)
        if (phonePresent) {
          confidenceScore += 0.20;
          corroboratingFactors++;
          console.log(`  [+] Phone match for ${item.link}`);
        }
        
        // Email match - STRONG corroboration (+20%)
        if (emailPresent) {
          confidenceScore += 0.20;
          corroboratingFactors++;
          console.log(`  [+] Email match for ${item.link}`);
        }
        
        // Location match - MODERATE corroboration (+15%)
        if (locationPresent) {
          confidenceScore += 0.15;
          corroboratingFactors++;
          console.log(`  [+] Location match for ${item.link}`);
        }
        
        // Relative/spouse keyword match - STRONG corroboration (+25%)
        // Now handles both same-surname relatives (like "Moira Petrie") AND 
        // different-surname spouses (like "Yana Shapiro") when they're in the relatives list
        if (hasRelativeKeywordMatch) {
          confidenceScore += 0.25; // Increased from 0.20 - relatives are HIGH value
          corroboratingFactors++;
          console.log(`  [+] Relative/spouse keyword match for ${item.link}`);
        }
        
        // Other keyword matches - STRONG corroboration (+20% for keywords, they're user-specified)
        // Keywords are CRITICAL - user explicitly asked for these, so finding them is strong confirmation
        if (keywordMatches.length > 0 && !hasRelativeKeywordMatch) {
          // Give more weight for multiple keyword matches
          const keywordBoost = Math.min(0.25, 0.15 + (keywordMatches.length - 1) * 0.05);
          confidenceScore += keywordBoost;
          corroboratingFactors++;
          console.log(`  [+] Keyword match for ${item.link}: ${keywordMatches.join(', ')} (+${(keywordBoost * 100).toFixed(0)}%)`);
        }
        
        // Username match (check if result URL/text contains the username)
        let usernamePresent = false;
        let matchedUsername = '';
        const cleanUsername = (searchData?.username || '').replace(/^@/, '').toLowerCase().trim();
        if (cleanUsername && cleanUsername.length >= 3) {
          if (textToCheck.toLowerCase().includes(cleanUsername) || 
              item.link.toLowerCase().includes(cleanUsername)) {
            usernamePresent = true;
            matchedUsername = searchData?.username || cleanUsername;
            confidenceScore += 0.20;
            corroboratingFactors++;
            console.log(`  [+] Username match for ${item.link}`);
          }
        }
        
        // Relatives from input match (check if any known relatives appear in the result)
        // This is CRITICAL for spouse detection - spouses often appear together in records
        // even when they have different surnames
        // Enhanced to handle partial matches like "Heather Tomes" matching "Heather Petrie Tomes"
        let relativesPresent = false;
        let matchedRelative = '';
        const inputRelatives = relatives || [];
        const textLower = textToCheck.toLowerCase();
        
        for (const rel of inputRelatives) {
          const relName = typeof rel === 'string' ? rel : rel.name;
          if (!relName) continue;
          
          const relNameLower = relName.toLowerCase().trim();
          const relNameParts = relNameLower.split(/\s+/).filter((p: string) => p.length > 1);
          
          // Direct match: full name appears in text
          if (textLower.includes(relNameLower)) {
            relativesPresent = true;
            matchedRelative = relName;
            confidenceScore += 0.25;
            corroboratingFactors++;
            console.log(`  [+] Known relative/spouse EXACT match for ${item.link}: ${relName}`);
            break;
          }
          
          // Partial match for former spouses: "Heather Petrie Tomes" should match "Heather Tomes"
          // Check if first + last name of relative appear close together in text
          if (relNameParts.length >= 2) {
            const firstName = relNameParts[0];
            const lastName = relNameParts[relNameParts.length - 1];
            
            // Look for first name + last name within 30 chars
            const firstNameIndex = textLower.indexOf(firstName);
            if (firstNameIndex >= 0) {
              const lastNameIndex = textLower.indexOf(lastName, firstNameIndex);
              if (lastNameIndex >= 0 && lastNameIndex - firstNameIndex < 40) {
                relativesPresent = true;
                matchedRelative = relName;
                confidenceScore += 0.20; // Slightly less than exact match
                corroboratingFactors++;
                console.log(`  [+] Known relative/spouse PARTIAL match for ${item.link}: ${relName} (found ${firstName}...${lastName})`);
                break;
              }
            }
            
            // Also check for maiden name pattern: "FirstName OurLastName MarriedName"
            // e.g., "Heather Petrie Tomes" in text when relative is "Heather Tomes"
            const targetLastName = searchName.split(/\s+/).pop()?.toLowerCase() || '';
            if (targetLastName && firstName && lastName !== targetLastName) {
              // Look for: firstName + targetLastName + lastName pattern
              const maidenPattern = new RegExp(
                `\\b${firstName}\\b[\\s\\w]{0,20}\\b${targetLastName}\\b[\\s\\w]{0,20}\\b${lastName}\\b`,
                'i'
              );
              if (maidenPattern.test(textToCheck)) {
                relativesPresent = true;
                matchedRelative = `${firstName} ${targetLastName} ${lastName}`;
                confidenceScore += 0.30; // Strong match - maiden name pattern
                corroboratingFactors++;
                console.log(`  [+] MAIDEN NAME pattern match for ${item.link}: ${matchedRelative}`);
                break;
              }
            }
          }
        }
        
        // Address match - VERY STRONG corroboration (+30%)
        // If the target's address appears in the result, this is highly reliable
        // Spouses/family living at the same address should score high
        let addressPresent = false;
        let matchedAddress = '';
        if (searchData?.address) {
          const normalizedInputAddr = normalizeAddressForSearch(searchData.address);
          const textLower = textToCheck.toLowerCase();
          if (normalizedInputAddr && textLower.includes(normalizedInputAddr)) {
            addressPresent = true;
            matchedAddress = searchData.address;
            confidenceScore += 0.30;
            corroboratingFactors++;
            console.log(`  [+] Address match for ${item.link}: ${searchData.address}`);
          }
        }
        
        // Small boost for high-value source types (but not enough to confirm alone)
        if (result.queryType === 'keywords_combined') {
          confidenceScore += 0.05;
        } else if (result.queryType === 'social_media') {
          confidenceScore += 0.03;
        } else if (result.queryType === 'official_sources') {
          confidenceScore += 0.03;
        } else if (result.queryType === 'people_finders') {
          confidenceScore += 0.02;
        }
        
        // NOTE: Finding *new* relatives mentioned on a page (e.g., obituaries) is useful for leads,
        // but it is NOT corroboration of the target identity against the user's input.
        // So: do not count extracted relatives as a corroborating factor for "Confirmed".
        if (isObituaryOrPeopleSearch && foundRelatives.length > 0) {
          confidenceScore += 0.05;
        }
        
        // CRITICAL: If name-only (no corroborating factors), cap below confirmed threshold
        // This ensures name-only matches NEVER appear in "Confirmed Matches"
        if (corroboratingFactors === 0) {
          confidenceScore = Math.min(confidenceScore, 0.55); // Below 0.6 threshold
          console.log(`  [!] Name-only match, capping at possible: ${item.link}`);
        }
        
        // PENALTY: Bulk legal documents, PDFs, court filings, and bankruptcy records
        // These often list hundreds of names — a name match alone is nearly meaningless
        const isBulkDocument = item.link?.includes('.pdf') ||
          item.link?.includes('pacer') ||
          item.link?.includes('court') ||
          item.link?.includes('docket') ||
          item.link?.includes('bankruptcy') ||
          item.link?.includes('filing') ||
          item.link?.includes('judicial') ||
          item.link?.includes('case-') ||
          item.snippet?.includes('ADDRESS ON FILE') ||
          item.snippet?.includes('CREDITOR') ||
          item.snippet?.includes('DEBTOR');
        
        if (isBulkDocument && corroboratingFactors === 0) {
          // Name-only match in a bulk document is essentially noise
          confidenceScore = Math.min(confidenceScore, 0.15);
          console.log(`  [!!] Bulk document/PDF with name-only match — near-zero confidence: ${item.link}`);
        } else if (isBulkDocument) {
          // Even with some corroboration, penalize bulk docs
          confidenceScore *= 0.7;
          console.log(`  [!] Bulk document/PDF penalty applied: ${item.link}`);
        }
        
        // BOOST: 3+ parameter cross-reference queries earn a confidence multiplier
        // Results from queries that combined 3+ search parameters are inherently more reliable
        const isFromCrossRef = result.queryType?.startsWith('xref_');
        if (isFromCrossRef && corroboratingFactors >= 2) {
          // 4+ param match: 1.5x boost
          const paramCount = (result.queryType?.match(/_/g) || []).length; // rough proxy
          if (paramCount >= 4 || corroboratingFactors >= 3) {
            confidenceScore *= 1.5;
            console.log(`  [⬆] 4+ param cross-ref boost (1.5x): ${item.link}`);
          } else {
            // 3-param match: 1.3x boost
            confidenceScore *= 1.3;
            console.log(`  [⬆] 3-param cross-ref boost (1.3x): ${item.link}`);
          }
        } else if (corroboratingFactors >= 3) {
          // Even non-xref queries get a boost if 3+ corroborating factors confirmed
          confidenceScore *= 1.2;
          console.log(`  [⬆] 3+ corroborating factors boost (1.2x): ${item.link}`);
        }
        
        // Cap at 0.98
        confidenceScore = Math.min(0.98, confidenceScore);
        
        console.log(`  Final score for ${item.link}: ${confidenceScore.toFixed(2)} (${corroboratingFactors} corroborating factors)`);
        
        // Detect if this result came from a family/relative-focused query AND actually contains family data
        // IMPORTANT: Only flag as "family connection" if there's actual evidence of family relationship
        // Not just because the query type was family-focused
        const familyQueryTypes = ['relative_name', 'relative_obituary', 'relative_funeral', 'relative_lastname_obituary', 'keyword_relative'];
        const queryIsFamilyFocused = familyQueryTypes.includes(result.queryType) || 
                                   result.queryCategory === 'family' ||
                                   (result.queryDescription?.toLowerCase().includes('relative') ?? false);
        
        // Only mark as family connection if BOTH: query was family-focused AND we found actual family evidence
        const hasActualFamilyEvidence = relativesPresent || hasRelativeKeywordMatch || foundRelatives.length > 0;
        const isFromFamilyQuery = queryIsFamilyFocused && hasActualFamilyEvidence;
        
        // Determine match type for UI badges
        // Blood relative = shares same surname, Spouse = different surname but shares address/relative list
        const targetLastName = searchName.split(/\s+/).pop()?.toLowerCase() || '';
        let matchType: 'spouse' | 'blood_relative' | 'address_match' | null = null;
        
        if (relativesPresent && matchedRelative) {
          const relativeLastName = matchedRelative.split(/\s+/).pop()?.toLowerCase() || '';
          if (relativeLastName !== targetLastName) {
            // Different surname = likely spouse/partner
            matchType = 'spouse';
          } else {
            // Same surname = blood relative (child, sibling, parent)
            matchType = 'blood_relative';
          }
        } else if (hasRelativeKeywordMatch) {
          // Check if the matched keyword is a spouse (different surname) or blood relative
          const matchedKeyword = keywordMatches.find(k => relativeKeywords.includes(k.toLowerCase()));
          if (matchedKeyword) {
            const keywordLastName = matchedKeyword.split(/\s+/).pop()?.toLowerCase() || '';
            if (keywordLastName !== targetLastName) {
              matchType = 'spouse';
            } else {
              matchType = 'blood_relative';
            }
          }
        }
        
        // If address matched but no relative match, mark as address match
        if (addressPresent && !matchType) {
          matchType = 'address_match';
        }
        
        const processedItem = {
          title: item.title || '',
          link: item.link || '',
          snippet: item.snippet || '',
          displayLink: item.displayLink || '',
          confidenceScore,
          isExactMatch: nameMatch.exact,
          isKeywordOnlyMatch: isKeywordOnlyMatch || false, // Flag for keyword-only matches (no name in snippet)
          hasLocation: locationPresent,
          matchedLocation: matchedLocation || undefined,
          hasKeywords: keywordMatches.length > 0,
          keywordMatches,
          hasRelativeMatch: hasRelativeKeywordMatch,
          foundRelatives: foundRelatives.length > 0 ? foundRelatives : undefined,
          hasPhone: phonePresent,
          matchedPhone: matchedPhone || undefined,
          hasEmail: emailPresent,
          matchedEmail: matchedEmail || undefined,
          hasUsername: usernamePresent,
          matchedUsername: matchedUsername || undefined,
          hasKnownRelative: relativesPresent,
          matchedRelative: matchedRelative || undefined,
          hasAddress: addressPresent,
          matchedAddress: matchedAddress || undefined,
          matchType, // 'spouse', 'blood_relative', 'address_match', or null
          corroboratingFactors,
          sourceType: result.queryType,
          queryDescription: result.queryDescription,
          isFromFamilyQuery, // Flag for results discovered via family/relative queries
          queryCategory: result.queryCategory
        };
        
        if (confidenceScore >= 0.6) {
          confirmedResults.push(processedItem);
        } else {
          possibleResults.push(processedItem);
        }
      }
    }
    
    // Sort by confidence
    confirmedResults.sort((a, b) => b.confidenceScore - a.confidenceScore);
    possibleResults.sort((a, b) => b.confidenceScore - a.confidenceScore);
    
    // Compile all found relatives
    const discoveredRelatives = Array.from(allFoundRelatives);
    if (discoveredRelatives.length > 0) {
      console.log('Total potential relatives discovered:', discoveredRelatives);
    }
    
    const results = {
      searchInformation: {
        totalResults: String(confirmedResults.length + possibleResults.length),
        queriesExecuted: sortedQueries.map(q => q.type),
        keywordsSearched: keywordList,
        relativeKeywordsIdentified: relativeKeywords,
      },
      confirmedItems: confirmedResults,
      possibleItems: possibleResults,
      items: [...confirmedResults, ...possibleResults],
      discoveredRelatives: discoveredRelatives.length > 0 ? discoveredRelatives : undefined,
      queriesUsed: queryStats.map(stat => ({ 
        type: stat.type, 
        query: stat.query,
        description: stat.description,
        resultCount: stat.resultCount,
        category: stat.category
      }))
    };
    
    console.log('Web search complete:', confirmedResults.length, 'confirmed,', possibleResults.length, 'possible');
    console.log('Keywords matched in results:', keywordList.length > 0 ? 'yes' : 'none provided');
    console.log('Relative keywords identified:', relativeKeywords.length > 0 ? relativeKeywords.join(', ') : 'none');

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in osint-web-search:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
