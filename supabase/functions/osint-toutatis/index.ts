import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ToutatisResult {
  username: string;
  fullName?: string;
  biography?: string;
  profilePicUrl?: string;
  email?: string;
  phoneNumber?: string;
  isPrivate?: boolean;
  isVerified?: boolean;
  followersCount?: number;
  followingCount?: number;
  postsCount?: number;
  externalUrl?: string;
  accountCategory?: string;
  contactPhoneNumber?: string;
  publicPhoneCountryCode?: string;
  publicEmail?: string;
  success: boolean;
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { target } = await req.json();
    console.log('Toutatis Instagram extraction for:', target);

    // Try local proxy server first (localhost:3001)
    let result: ToutatisResult | null = null;
    
    try {
      console.log('Attempting local proxy server for Toutatis...');
      const localResponse = await fetch('http://localhost:3001/toutatis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: target }),
      });
      
      if (localResponse.ok) {
        result = await localResponse.json();
        console.log('Toutatis local proxy response:', result);
      }
    } catch (localError) {
      console.log('Local proxy not available, using fallback method');
    }

    // Fallback: Extract what we can via public Instagram endpoints
    if (!result) {
      result = await extractInstagramData(target);
    }

    // Build response with extracted intelligence
    const intelligence = {
      username: target,
      tool: 'Toutatis',
      extractedData: result,
      profileUrl: `https://www.instagram.com/${target}`,
      dataPoints: [] as string[],
      manualVerificationLinks: [
        { name: 'Instagram Profile', url: `https://www.instagram.com/${target}` },
        { name: 'Imginn (Anonymous)', url: `https://imginn.com/${target}` },
        { name: 'Dumpor (Anonymous)', url: `https://dumpor.io/v/${target}` },
        { name: 'Piokok (Anonymous)', url: `https://www.piokok.com/profile/${target}` },
      ],
    };

    // Track what data points were found
    if (result?.email || result?.publicEmail) {
      intelligence.dataPoints.push('Email Address');
    }
    if (result?.phoneNumber || result?.contactPhoneNumber) {
      intelligence.dataPoints.push('Phone Number');
    }
    if (result?.profilePicUrl) {
      intelligence.dataPoints.push('Profile Picture');
    }
    if (result?.fullName) {
      intelligence.dataPoints.push('Full Name');
    }
    if (result?.externalUrl) {
      intelligence.dataPoints.push('External URL');
    }

    console.log('Toutatis extraction complete:', intelligence.dataPoints.length, 'data points found');

    return new Response(JSON.stringify(intelligence), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in osint-toutatis:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      tool: 'Toutatis',
      manualVerificationLinks: [
        { name: 'Instagram Profile', url: 'https://www.instagram.com/' },
        { name: 'Imginn (Anonymous)', url: 'https://imginn.com/' },
      ],
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function extractInstagramData(username: string): Promise<ToutatisResult> {
  try {
    // Try to get basic profile info via public endpoint
    const profileUrl = `https://www.instagram.com/${username}/?__a=1&__d=dis`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(profileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const user = data?.graphql?.user || data?.user || {};
      
      return {
        username,
        fullName: user.full_name,
        biography: user.biography,
        profilePicUrl: user.profile_pic_url_hd || user.profile_pic_url,
        email: user.business_email || user.public_email,
        phoneNumber: user.business_phone_number || user.public_phone_number,
        isPrivate: user.is_private,
        isVerified: user.is_verified,
        followersCount: user.edge_followed_by?.count,
        followingCount: user.edge_follow?.count,
        postsCount: user.edge_owner_to_timeline_media?.count,
        externalUrl: user.external_url,
        accountCategory: user.category_name,
        success: true,
      };
    }

    // Fallback: Check if profile exists via HEAD request
    const existsResponse = await fetch(`https://www.instagram.com/${username}/`, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    return {
      username,
      success: existsResponse.status === 200,
      error: existsResponse.status !== 200 ? 'Profile not found or private' : undefined,
    };
  } catch (error) {
    console.error('Instagram extraction error:', error);
    return {
      username,
      success: false,
      error: error instanceof Error ? error.message : 'Failed to extract data',
    };
  }
}
