import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { crypto as stdCrypto } from "https://deno.land/std@0.208.0/crypto/mod.ts";
import { encodeHex } from "https://deno.land/std@0.208.0/encoding/hex.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function md5(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await stdCrypto.subtle.digest('MD5', data);
  return encodeHex(new Uint8Array(hashBuffer));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { target } = await req.json();
    console.log('Gravatar lookup for:', target);

    if (!target || !target.includes('@')) {
      return new Response(JSON.stringify({ error: 'Email address is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const emailHash = await md5(target.trim().toLowerCase());
    let found = false;
    let profileData: any = {};

    // Check Gravatar profile JSON endpoint
    try {
      const profileResponse = await fetch(`https://en.gravatar.com/${emailHash}.json`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });

      if (profileResponse.ok) {
        const profileJson = await profileResponse.json();
        const entry = profileJson?.entry?.[0];
        found = true;

        profileData = {
          has_profile: true,
          avatar_url: `https://www.gravatar.com/avatar/${emailHash}?s=400&d=404`,
          profile_url: entry?.profileUrl || `https://www.gravatar.com/${emailHash}`,
          display_name: entry?.displayName || null,
          preferred_username: entry?.preferredUsername || null,
          about_me: entry?.aboutMe || null,
          current_location: entry?.currentLocation || null,
          photos: entry?.photos?.map((p: any) => p.value) || [],
          urls: entry?.urls?.map((u: any) => ({ title: u.title, value: u.value })) || [],
          accounts: entry?.accounts?.map((a: any) => ({
            domain: a.domain,
            display: a.display,
            url: a.url,
            username: a.username,
            shortname: a.shortname,
          })) || [],
        };

        console.log(`Gravatar profile found: ${entry?.displayName || 'unnamed'}, ${profileData.accounts.length} linked accounts`);
      } else {
        // No profile — check if avatar exists (non-404)
        const avatarResponse = await fetch(`https://www.gravatar.com/avatar/${emailHash}?d=404`, {
          method: 'HEAD',
        });

        if (avatarResponse.ok) {
          found = true;
          profileData = {
            has_profile: false,
            has_avatar: true,
            avatar_url: `https://www.gravatar.com/avatar/${emailHash}?s=400`,
            profile_url: `https://www.gravatar.com/${emailHash}`,
          };
          console.log('Gravatar: avatar exists but no profile');
        } else {
          profileData = {
            has_profile: false,
            has_avatar: false,
          };
          console.log('Gravatar: no avatar or profile found');
        }
      }
    } catch (fetchError) {
      console.warn('Gravatar check failed:', fetchError);
      profileData = { error: 'Could not check Gravatar', check_method: 'failed' };
    }

    return new Response(JSON.stringify({
      platform: 'Gravatar',
      found,
      confidence: found ? (profileData.has_profile ? 'confirmed' : 'medium') : 'low',
      data: profileData,
      email: target,
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in osint-gravatar-lookup:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
