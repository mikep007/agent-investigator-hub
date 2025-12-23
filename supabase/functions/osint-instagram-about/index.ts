import "https://deno.land/x/xhr@0.1.0/mod.ts";

/**
 * Instagram "About This Account" Intelligence Extractor
 * 
 * This edge function attempts to extract "About this account" data from Instagram profiles.
 * 
 * IMPORTANT LIMITATIONS:
 * - Instagram's "About this account" data requires authenticated access
 * - Full username history is NOT directly exposed by Instagram's API
 * - Only the count of former usernames is available without special access
 * - Account join date requires authenticated private API access
 * 
 * DATA EXTRACTED:
 * - Date joined (approximate from first post or API if available)
 * - Former usernames count (from transparency feature)
 * - Account location/country (if available)
 * - Verified status
 * - Business account info
 * - Ads transparency (Meta Ad Library link)
 * 
 * RISKS:
 * - Using unofficial API endpoints may result in rate limiting
 * - Instagram blocks automated requests aggressively
 * - Account credentials should NEVER be hardcoded
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AboutAccountResult {
  username: string;
  userId?: string;
  fullName?: string;
  biography?: string;
  profilePicUrl?: string;
  isPrivate?: boolean;
  isVerified?: boolean;
  
  // About This Account data
  dateJoined?: string;
  dateJoinedRaw?: string;
  accountCountry?: string;
  formerUsernamesCount?: number;
  formerUsernames?: string[];
  
  // Account transparency
  accountType?: 'personal' | 'business' | 'creator';
  businessCategory?: string;
  businessEmail?: string;
  businessPhone?: string;
  businessAddress?: string;
  
  // Stats
  followersCount?: number;
  followingCount?: number;
  postsCount?: number;
  
  // Ads transparency
  hasActiveAds?: boolean;
  adLibraryUrl?: string;
  
  // Meta
  success: boolean;
  error?: string;
  dataSource?: string;
}

// Helper to format date as "Month Year"
function formatMonthYear(date: Date): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

// Attempt to get user ID from username via web endpoint
async function getUserIdFromUsername(username: string): Promise<string | null> {
  try {
    const response = await fetch(`https://www.instagram.com/web/search/topsearch/?query=${username}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    });
    
    if (response.ok) {
      const data = await response.json();
      const users = data?.users || [];
      const match = users.find((u: any) => 
        u.user?.username?.toLowerCase() === username.toLowerCase()
      );
      return match?.user?.pk || null;
    }
  } catch (error) {
    console.log('Could not get user ID from search:', error);
  }
  return null;
}

// Main extraction function
async function extractAboutAccountData(username: string): Promise<AboutAccountResult> {
  console.log(`Extracting "About this account" data for: ${username}`);
  
  try {
    // Step 1: Get basic profile data via public endpoint
    const profileUrl = `https://www.instagram.com/${username}/?__a=1&__d=dis`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(profileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'X-IG-App-ID': '936619743392459',
        'X-Requested-With': 'XMLHttpRequest',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    let user: any = null;
    let userId: string | undefined;
    let dateJoined: string | undefined;
    let dateJoinedRaw: string | undefined;
    let formerUsernamesCount: number | undefined;
    let firstPostTimestamp: number | undefined;

    if (response.ok) {
      const data = await response.json();
      user = data?.graphql?.user || data?.user || {};
      userId = user.id || user.pk;
      
      // Extract the earliest post timestamp to estimate account age
      const posts = user.edge_owner_to_timeline_media?.edges || [];
      if (posts.length > 0) {
        // Get the oldest post from available posts
        const timestamps = posts
          .map((p: any) => p.node?.taken_at_timestamp)
          .filter((t: any) => t)
          .sort((a: number, b: number) => a - b);
        
        if (timestamps.length > 0) {
          firstPostTimestamp = timestamps[0];
        }
      }
    }

    // Step 2: Try to get user ID if we don't have it
    if (!userId) {
      const searchedId = await getUserIdFromUsername(username);
      if (searchedId) {
        userId = searchedId;
      }
    }

    // Step 3: Try Instagram's GraphQL endpoint for transparency data
    // Note: This requires authentication in most cases
    if (userId) {
      try {
        const transparencyUrl = `https://www.instagram.com/api/v1/users/${userId}/info/`;
        const transparencyResponse = await fetch(transparencyUrl, {
          headers: {
            'User-Agent': 'Instagram 275.0.0.27.98 Android',
            'Accept': '*/*',
            'X-IG-App-ID': '936619743392459',
          },
        });
        
        if (transparencyResponse.ok) {
          const transparencyData = await transparencyResponse.json();
          const userInfo = transparencyData?.user || {};
          
          // Some fields that might be available
          if (userInfo.account_created_timestamp) {
            const createdDate = new Date(userInfo.account_created_timestamp * 1000);
            dateJoined = formatMonthYear(createdDate);
            dateJoinedRaw = createdDate.toISOString();
          }
          
          // Former usernames count (if available in transparency data)
          if (userInfo.transparency_product_info?.former_username_count !== undefined) {
            formerUsernamesCount = userInfo.transparency_product_info.former_username_count;
          }
        }
      } catch (err) {
        console.log('Transparency API not accessible:', err);
      }
    }

    // Step 4: If we don't have join date, estimate from first post
    if (!dateJoined && firstPostTimestamp) {
      const firstPostDate = new Date(firstPostTimestamp * 1000);
      dateJoined = `Before ${formatMonthYear(firstPostDate)}`;
      dateJoinedRaw = firstPostDate.toISOString();
    }

    // Step 5: Try to scrape the profile page for embedded data
    if (!dateJoined || !formerUsernamesCount) {
      try {
        const pageResponse = await fetch(`https://www.instagram.com/${username}/`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
          },
        });
        
        if (pageResponse.ok) {
          const html = await pageResponse.text();
          
          // Look for embedded JSON data in the page
          const sharedDataMatch = html.match(/window\._sharedData\s*=\s*(\{.+?\});<\/script>/);
          if (sharedDataMatch) {
            try {
              const sharedData = JSON.parse(sharedDataMatch[1]);
              const profileUser = sharedData?.entry_data?.ProfilePage?.[0]?.graphql?.user;
              if (profileUser && !user) {
                user = profileUser;
              }
            } catch (e) {
              console.log('Could not parse embedded data');
            }
          }
          
          // Look for additional data script
          const additionalDataMatch = html.match(/window\.__additionalDataLoaded\s*\([^,]+,\s*(\{.+?\})\)/);
          if (additionalDataMatch) {
            try {
              const additionalData = JSON.parse(additionalDataMatch[1]);
              if (additionalData?.graphql?.user && !user) {
                user = additionalData.graphql.user;
              }
            } catch (e) {
              console.log('Could not parse additional data');
            }
          }
        }
      } catch (err) {
        console.log('Could not scrape profile page:', err);
      }
    }

    // Build result
    const result: AboutAccountResult = {
      username,
      userId,
      success: true,
      dataSource: 'public_api',
    };

    if (user) {
      result.fullName = user.full_name;
      result.biography = user.biography;
      result.profilePicUrl = user.profile_pic_url_hd || user.profile_pic_url;
      result.isPrivate = user.is_private;
      result.isVerified = user.is_verified;
      result.followersCount = user.edge_followed_by?.count || user.follower_count;
      result.followingCount = user.edge_follow?.count || user.following_count;
      result.postsCount = user.edge_owner_to_timeline_media?.count || user.media_count;
      
      // Business/Creator account info
      if (user.is_business_account || user.is_professional_account) {
        result.accountType = user.is_business_account ? 'business' : 'creator';
        result.businessCategory = user.category_name || user.category;
        result.businessEmail = user.business_email || user.public_email;
        result.businessPhone = user.business_phone_number || user.public_phone_number;
        result.businessAddress = user.business_address_json 
          ? JSON.stringify(user.business_address_json)
          : undefined;
      } else {
        result.accountType = 'personal';
      }
    }

    // Add transparency data
    if (dateJoined) {
      result.dateJoined = dateJoined;
      result.dateJoinedRaw = dateJoinedRaw;
    }
    
    if (formerUsernamesCount !== undefined) {
      result.formerUsernamesCount = formerUsernamesCount;
    }

    // Generate Meta Ad Library URL
    result.adLibraryUrl = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&q=${username}&search_type=keyword_unordered`;

    return result;
  } catch (error) {
    console.error('Error extracting about account data:', error);
    return {
      username,
      success: false,
      error: error instanceof Error ? error.message : 'Failed to extract data',
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { target } = await req.json();
    
    if (!target) {
      return new Response(JSON.stringify({ error: 'Target username is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Instagram About Account extraction for:', target);

    // Try local proxy first for authenticated access
    let result: AboutAccountResult | null = null;
    
    try {
      console.log('Attempting local proxy server for authenticated access...');
      const localResponse = await fetch('http://localhost:3001/instagram-about', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: target }),
      });
      
      if (localResponse.ok) {
        result = await localResponse.json();
        console.log('Local proxy response received');
      }
    } catch (localError) {
      console.log('Local proxy not available, using public API fallback');
    }

    // Fallback to public API extraction
    if (!result) {
      result = await extractAboutAccountData(target);
    }

    // Format the response in a user-friendly way
    const formattedOutput = formatAccountInfo(result);

    const intelligence = {
      username: target,
      tool: 'Instagram About Account',
      aboutData: result,
      formattedOutput,
      profileUrl: `https://www.instagram.com/${target}`,
      
      // Data availability flags
      dataAvailable: {
        dateJoined: !!result.dateJoined,
        formerUsernames: result.formerUsernamesCount !== undefined,
        accountCountry: !!result.accountCountry,
        businessInfo: result.accountType !== 'personal',
        adsTransparency: true, // Always have Ad Library link
      },
      
      // Manual verification links
      manualVerificationLinks: [
        { 
          name: 'Instagram Profile', 
          url: `https://www.instagram.com/${target}`,
          description: 'View the profile directly on Instagram'
        },
        { 
          name: 'Meta Ad Library', 
          url: result.adLibraryUrl || `https://www.facebook.com/ads/library/?q=${target}`,
          description: 'Check for active/past advertisements'
        },
        { 
          name: 'About This Account (Mobile)', 
          url: `instagram://user?username=${target}`,
          description: 'Open in Instagram app to view "About this account"'
        },
        {
          name: 'Picuki Profile',
          url: `https://www.picuki.com/profile/${target}`,
          description: 'Anonymous profile viewer'
        },
        {
          name: 'Imginn Profile',
          url: `https://imginn.com/${target}`,
          description: 'Anonymous story and post viewer'
        },
      ],
      
      // Tips for getting more data
      tips: [
        'For full "About this account" data, view the profile in the Instagram mobile app',
        'Former username history requires Instagram app access (tap ⋮ menu → About this account)',
        'Authenticated API access can reveal account creation date',
        'Check Meta Ad Library for advertising history',
      ],
    };

    console.log('About Account extraction complete');

    return new Response(JSON.stringify(intelligence), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in osint-instagram-about:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      tool: 'Instagram About Account',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function formatAccountInfo(data: AboutAccountResult): string {
  const lines: string[] = [];
  
  lines.push(`@${data.username}`);
  lines.push('');
  lines.push('To help keep our community authentic, we\'re showing information about accounts on Instagram.');
  lines.push('');
  
  if (data.fullName) {
    lines.push(`Name: ${data.fullName}`);
  }
  
  if (data.dateJoined) {
    lines.push(`Date joined: ${data.dateJoined}`);
  } else {
    lines.push('Date joined: Not available (requires authenticated access)');
  }
  
  if (data.formerUsernamesCount !== undefined) {
    if (data.formerUsernames && data.formerUsernames.length > 0) {
      lines.push(`Former usernames: ${data.formerUsernames.join(', ')}`);
    } else {
      lines.push(`Former usernames: ${data.formerUsernamesCount} username change(s)`);
    }
  } else {
    lines.push('Former usernames: Not available (requires app access)');
  }
  
  if (data.accountCountry) {
    lines.push(`Account based in: ${data.accountCountry}`);
  }
  
  if (data.isVerified) {
    lines.push('Verified: Yes ✓');
  }
  
  if (data.accountType && data.accountType !== 'personal') {
    lines.push(`Account type: ${data.accountType.charAt(0).toUpperCase() + data.accountType.slice(1)}`);
    if (data.businessCategory) {
      lines.push(`Category: ${data.businessCategory}`);
    }
  }
  
  lines.push('');
  lines.push('— Profile Stats —');
  if (data.followersCount !== undefined) {
    lines.push(`Followers: ${data.followersCount.toLocaleString()}`);
  }
  if (data.followingCount !== undefined) {
    lines.push(`Following: ${data.followingCount.toLocaleString()}`);
  }
  if (data.postsCount !== undefined) {
    lines.push(`Posts: ${data.postsCount.toLocaleString()}`);
  }
  
  return lines.join('\n');
}
