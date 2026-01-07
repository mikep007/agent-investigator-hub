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
  dob?: { year: number };
  locations?: Array<{ city: string; state: string; country: string }>;
  emails?: string[];
  usernames?: string[];
}

interface EnrichOptions {
  platforms?: string[];
  max_profiles_per_subject?: number;
  min_profile_match_score?: number;
}

interface SocialProfile {
  platform: string;
  handle?: string;
  profile_url: string;
  display_name?: string;
  bio?: string;
  inferred_location?: {
    city: string;
    state: string;
    country: string;
    confidence: number;
  };
  signals: {
    recent_activity_year?: number;
    location_mentions: string[];
    family_mentions: string[];
  };
  profile_match_score: number;
}

interface FamilyConfirmation {
  relative_name: string;
  relationship_type_hint: string;
  evidence: string[];
  confirmation_score: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { subjects, options = {} }: { subjects: SubjectInput[]; options: EnrichOptions } = await req.json();
    console.log('[enrich-social] Subjects:', subjects.length);

    const {
      platforms = ['facebook', 'instagram', 'linkedin', 'x', 'tiktok'],
      max_profiles_per_subject = 5,
      min_profile_match_score = 0.6
    } = options;

    const results: any[] = [];

    for (const subject of subjects) {
      console.log(`[enrich-social] Processing subject: ${subject.name.first} ${subject.name.last}`);
      
      const profiles: SocialProfile[] = [];
      const familyConfirmations: FamilyConfirmation[] = [];
      let derivedLocation: any = null;

      const fullName = `${subject.name.first} ${subject.name.last}`;
      const primaryLocation = subject.locations?.[0];

      // 1. Search IDCrawl for aggregated social profiles
      try {
        console.log('[enrich-social] Querying IDCrawl...');
        const idcrawlResponse = await supabase.functions.invoke('osint-idcrawl', {
          body: {
            fullName,
            location: primaryLocation ? `${primaryLocation.city}, ${primaryLocation.state}` : ''
          }
        });

        if (idcrawlResponse.data?.profiles) {
          for (const profile of idcrawlResponse.data.profiles) {
            if (!platforms.includes(profile.platform?.toLowerCase())) continue;

            const socialProfile = processSocialProfile(profile, subject, primaryLocation);
            if (socialProfile.profile_match_score >= min_profile_match_score) {
              profiles.push(socialProfile);
            }
          }
        }
      } catch (err) {
        console.error('[enrich-social] IDCrawl error:', err);
      }

      // 2. Search Sherlock for username-based discovery
      const potentialUsernames = generatePotentialUsernames(subject);
      
      for (const username of potentialUsernames.slice(0, 3)) {
        try {
          console.log(`[enrich-social] Sherlock search for: ${username}`);
          const sherlockResponse = await supabase.functions.invoke('osint-sherlock', {
            body: { username }
          });

          if (sherlockResponse.data?.profiles) {
            for (const profile of sherlockResponse.data.profiles) {
              if (!platforms.includes(profile.platform?.toLowerCase())) continue;

              const existingProfile = profiles.find(p => 
                p.platform === profile.platform && p.profile_url === profile.url
              );

              if (!existingProfile) {
              profiles.push({
                  platform: profile.platform,
                  handle: username,
                  profile_url: profile.url,
                  display_name: profile.display_name,
                  bio: undefined,
                  inferred_location: undefined,
                  signals: {
                    location_mentions: [],
                    family_mentions: []
                  },
                  profile_match_score: 0.7
                });
              }
            }
          }
        } catch (err) {
          console.error(`[enrich-social] Sherlock error for ${username}:`, err);
        }
      }

      // 3. Check email-based account discovery via Holehe
      if (subject.emails && subject.emails.length > 0) {
        for (const email of subject.emails.slice(0, 2)) {
          try {
            console.log(`[enrich-social] Holehe check for: ${email}`);
            const holeheResponse = await supabase.functions.invoke('osint-holehe', {
              body: { email }
            });

            if (holeheResponse.data?.accounts) {
              for (const account of holeheResponse.data.accounts) {
                if (!account.exists) continue;
                if (!platforms.includes(account.platform?.toLowerCase())) continue;

                const existingProfile = profiles.find(p => p.platform === account.platform);
                if (!existingProfile) {
                  profiles.push({
                    platform: account.platform,
                    handle: email.split('@')[0],
                    profile_url: account.url || `https://${account.platform}.com`,
                    display_name: undefined,
                    bio: undefined,
                    inferred_location: undefined,
                    signals: {
                      location_mentions: [],
                      family_mentions: []
                    },
                    profile_match_score: 0.8 // Higher confidence from email match
                  });
                } else {
                  // Boost confidence for email-confirmed profile
                  existingProfile.profile_match_score = Math.min(
                    existingProfile.profile_match_score + 0.1,
                    0.98
                  );
                }
              }
            }
          } catch (err) {
            console.error(`[enrich-social] Holehe error for ${email}:`, err);
          }
        }
      }

      // 4. Deep dive on Instagram if found
      const instagramProfile = profiles.find(p => p.platform === 'instagram');
      if (instagramProfile?.handle) {
        try {
          console.log(`[enrich-social] Instagram deep dive for: ${instagramProfile.handle}`);
          const instaResponse = await supabase.functions.invoke('osint-toutatis', {
            body: { username: instagramProfile.handle }
          });

          if (instaResponse.data) {
            instagramProfile.bio = instaResponse.data.bio;
            instagramProfile.display_name = instaResponse.data.full_name;
            
            // Extract location from bio
            const locationFromBio = extractLocationFromBio(instaResponse.data.bio, subject.locations);
            if (locationFromBio) {
              instagramProfile.inferred_location = locationFromBio;
            }

            // Extract family mentions from bio
            const familyMentions = extractFamilyMentions(instaResponse.data.bio);
            instagramProfile.signals.family_mentions = familyMentions;
          }
        } catch (err) {
          console.error('[enrich-social] Instagram deep dive error:', err);
        }
      }

      // 5. Derive best current location from profiles
      derivedLocation = deriveCurrentLocation(profiles, subject.locations);

      // 6. Extract family confirmations from profile data
      for (const profile of profiles) {
        if (profile.signals.family_mentions.length > 0) {
          for (const mention of profile.signals.family_mentions) {
            familyConfirmations.push({
              relative_name: mention,
              relationship_type_hint: inferRelationshipFromMention(mention),
              evidence: [`${profile.platform}_bio`],
              confirmation_score: 0.6
            });
          }
        }
      }

      // Sort and limit profiles
      profiles.sort((a, b) => b.profile_match_score - a.profile_match_score);
      const topProfiles = profiles.slice(0, max_profiles_per_subject);

      results.push({
        subject_id: subject.id,
        profiles: topProfiles,
        derived: {
          current_location: derivedLocation,
          family_confirmations: familyConfirmations
        }
      });
    }

    const response = {
      results,
      enrichment_metadata: {
        platforms_searched: platforms,
        total_profiles_found: results.reduce((sum, r) => sum + r.profiles.length, 0)
      }
    };

    console.log(`[enrich-social] Completed. Found ${response.enrichment_metadata.total_profiles_found} profiles`);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[enrich-social] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function processSocialProfile(
  profile: any,
  subject: SubjectInput,
  primaryLocation: any
): SocialProfile {
  const signals: any = {
    location_mentions: [],
    family_mentions: []
  };

  // Extract location mentions from profile data
  if (profile.location) {
    signals.location_mentions.push(profile.location);
  }
  if (profile.bio) {
    const locationMatches = extractLocationMentions(profile.bio);
    signals.location_mentions.push(...locationMatches);
  }

  // Calculate match score
  let matchScore = 0.5;

  // Name match in display name
  if (profile.display_name || profile.name) {
    const displayName = (profile.display_name || profile.name || '').toLowerCase();
    if (
      displayName.includes(subject.name.first.toLowerCase()) &&
      displayName.includes(subject.name.last.toLowerCase())
    ) {
      matchScore += 0.3;
    } else if (displayName.includes(subject.name.first.toLowerCase())) {
      matchScore += 0.15;
    }
  }

  // Location match
  if (primaryLocation && signals.location_mentions.length > 0) {
    const locationMatch = signals.location_mentions.some((loc: string) =>
      loc.toLowerCase().includes(primaryLocation.city.toLowerCase()) ||
      loc.toLowerCase().includes(primaryLocation.state.toLowerCase())
    );
    if (locationMatch) {
      matchScore += 0.2;
    }
  }

  // Profile image confidence (if present)
  if (profile.image_url) {
    matchScore += 0.05;
  }

  return {
    platform: profile.platform?.toLowerCase() || 'unknown',
    handle: profile.username || profile.handle,
    profile_url: profile.url || profile.profile_url,
    display_name: profile.display_name || profile.name,
    bio: profile.bio,
    inferred_location: primaryLocation ? {
      ...primaryLocation,
      confidence: signals.location_mentions.length > 0 ? 0.8 : 0.5
    } : null,
    signals,
    profile_match_score: Math.min(matchScore, 0.98)
  };
}

function generatePotentialUsernames(subject: SubjectInput): string[] {
  const usernames: string[] = [];
  const first = subject.name.first?.toLowerCase() || '';
  const last = subject.name.last?.toLowerCase() || '';

  if (first && last) {
    usernames.push(`${first}${last}`);
    usernames.push(`${first}.${last}`);
    usernames.push(`${first}_${last}`);
    usernames.push(`${first[0]}${last}`);
    usernames.push(`${first}${last[0]}`);
    
    if (subject.dob?.year) {
      const yearShort = String(subject.dob.year).slice(-2);
      usernames.push(`${first}${last}${yearShort}`);
      usernames.push(`${first}.${last}${yearShort}`);
    }
  }

  // Add any existing usernames
  if (subject.usernames) {
    usernames.push(...subject.usernames);
  }

  return [...new Set(usernames)];
}

function extractLocationMentions(text: string): string[] {
  if (!text) return [];
  
  const locations: string[] = [];
  
  // Common location patterns
  const patterns = [
    /📍\s*([A-Za-z\s,]+)/g,
    /(?:based in|living in|from)\s+([A-Za-z\s,]+)/gi,
    /([A-Z][a-z]+,\s*[A-Z]{2})/g, // City, ST format
  ];

  for (const pattern of patterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) {
        locations.push(match[1].trim());
      }
    }
  }

  return locations;
}

function extractLocationFromBio(bio: string, knownLocations?: any[]): any | null {
  if (!bio) return null;

  const mentions = extractLocationMentions(bio);
  if (mentions.length === 0) return null;

  // Try to match with known locations
  if (knownLocations && knownLocations.length > 0) {
    for (const mention of mentions) {
      const mentionLower = mention.toLowerCase();
      for (const known of knownLocations) {
        if (
          mentionLower.includes(known.city?.toLowerCase()) ||
          mentionLower.includes(known.state?.toLowerCase())
        ) {
          return {
            city: known.city,
            state: known.state,
            country: known.country || 'US',
            confidence: 0.9
          };
        }
      }
    }
  }

  // Parse the first mention
  const firstMention = mentions[0];
  const parts = firstMention.split(',').map(s => s.trim());
  
  return {
    city: parts[0] || '',
    state: parts[1] || '',
    country: 'US',
    confidence: 0.6
  };
}

function extractFamilyMentions(bio: string): string[] {
  if (!bio) return [];

  const mentions: string[] = [];
  
  // Patterns for family mentions
  const patterns = [
    /(?:married to|husband|wife|spouse)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
    /(?:mom|dad|mother|father)\s+(?:of|to)\s+([A-Z][a-z]+)/gi,
    /(?:son|daughter)\s+(?:of)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
    /👨‍👩‍👧‍👦|👨‍👩‍👦|👨‍👩‍👧/g // Family emojis indicate family content
  ];

  for (const pattern of patterns) {
    const matches = bio.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) {
        mentions.push(match[1].trim());
      }
    }
  }

  return [...new Set(mentions)];
}

function deriveCurrentLocation(profiles: SocialProfile[], knownLocations?: any[]): any | null {
  const locationVotes: Map<string, { count: number; confidence: number }> = new Map();

  for (const profile of profiles) {
    if (profile.inferred_location) {
      const key = `${profile.inferred_location.city}_${profile.inferred_location.state}`.toLowerCase();
      if (!locationVotes.has(key)) {
        locationVotes.set(key, { count: 0, confidence: 0 });
      }
      const vote = locationVotes.get(key)!;
      vote.count++;
      vote.confidence = Math.max(vote.confidence, profile.inferred_location.confidence);
    }
  }

  // Find location with most votes
  let bestLocation: any = null;
  let maxVotes = 0;

  for (const [key, vote] of locationVotes) {
    if (vote.count > maxVotes) {
      maxVotes = vote.count;
      const [city, state] = key.split('_');
      bestLocation = {
        city: city.charAt(0).toUpperCase() + city.slice(1),
        state: state.toUpperCase(),
        country: 'US',
        confidence: Math.min(vote.confidence + (vote.count * 0.05), 0.98)
      };
    }
  }

  // Fallback to known location if no social location found
  if (!bestLocation && knownLocations && knownLocations.length > 0) {
    bestLocation = {
      ...knownLocations[0],
      confidence: 0.5
    };
  }

  return bestLocation;
}

function inferRelationshipFromMention(mention: string): string {
  const lowerMention = mention.toLowerCase();
  
  if (lowerMention.includes('mom') || lowerMention.includes('mother')) return 'parent';
  if (lowerMention.includes('dad') || lowerMention.includes('father')) return 'parent';
  if (lowerMention.includes('son') || lowerMention.includes('daughter')) return 'child';
  if (lowerMention.includes('husband') || lowerMention.includes('wife')) return 'spouse';
  if (lowerMention.includes('brother') || lowerMention.includes('sister')) return 'sibling';
  
  return 'unknown';
}
