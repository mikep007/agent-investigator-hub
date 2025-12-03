import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InstaloaderResult {
  username: string;
  fullName?: string;
  biography?: string;
  profilePicUrl?: string;
  isPrivate?: boolean;
  isVerified?: boolean;
  followersCount?: number;
  followingCount?: number;
  postsCount?: number;
  externalUrl?: string;
  businessCategory?: string;
  isBusiness?: boolean;
  recentPosts?: PostData[];
  stories?: StoryData[];
  nameHistory?: NameChange[];
  geotags?: GeotagData[];
  success: boolean;
  error?: string;
}

interface PostData {
  shortcode: string;
  timestamp: string;
  caption?: string;
  likes?: number;
  comments?: number;
  isVideo: boolean;
  url: string;
  location?: string;
}

interface StoryData {
  timestamp: string;
  type: 'image' | 'video';
  url: string;
}

interface NameChange {
  previousName: string;
  newName: string;
  detectedAt: string;
}

interface GeotagData {
  name: string;
  latitude?: number;
  longitude?: number;
  postCount: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { target, includeStories = false, includePosts = true, postsLimit = 12 } = await req.json();
    console.log('Instaloader profile download for:', target);

    // Try local proxy server first (localhost:3001)
    let result: InstaloaderResult | null = null;
    
    try {
      console.log('Attempting local proxy server for Instaloader...');
      const localResponse = await fetch('http://localhost:3001/instaloader', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: target,
          includeStories,
          includePosts,
          postsLimit,
        }),
      });
      
      if (localResponse.ok) {
        result = await localResponse.json();
        console.log('Instaloader local proxy response received');
      }
    } catch (localError) {
      console.log('Local proxy not available, using fallback method');
    }

    // Fallback: Extract what we can via public endpoints
    if (!result) {
      result = await extractInstagramProfileData(target, includePosts, postsLimit);
    }

    // Build intelligence report
    const intelligence = {
      username: target,
      tool: 'Instaloader',
      profileData: result,
      profileUrl: `https://www.instagram.com/${target}`,
      dataCategories: {
        profileInfo: !!(result?.fullName || result?.biography),
        mediaContent: (result?.recentPosts?.length || 0) > 0,
        stories: (result?.stories?.length || 0) > 0,
        geolocation: (result?.geotags?.length || 0) > 0,
        nameChanges: (result?.nameHistory?.length || 0) > 0,
      },
      statistics: {
        postsDownloaded: result?.recentPosts?.length || 0,
        storiesFound: result?.stories?.length || 0,
        geotagsFound: result?.geotags?.length || 0,
      },
      manualVerificationLinks: [
        { name: 'Instagram Profile', url: `https://www.instagram.com/${target}` },
        { name: 'Insta-Stories-Viewer', url: `https://insta-stories-viewer.com/${target}` },
        { name: 'StoriesIG', url: `https://storiesig.info/en/stories/${target}` },
        { name: 'Picuki', url: `https://www.picuki.com/profile/${target}` },
        { name: 'Imginn', url: `https://imginn.com/${target}` },
        { name: 'Toolzu Story Viewer', url: `https://toolzu.com/instagram-story-viewer/?username=${target}` },
      ],
    };

    console.log('Instaloader extraction complete');

    return new Response(JSON.stringify(intelligence), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in osint-instaloader:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      tool: 'Instaloader',
      manualVerificationLinks: [
        { name: 'Instagram Profile', url: 'https://www.instagram.com/' },
        { name: 'Picuki', url: 'https://www.picuki.com/' },
      ],
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function extractInstagramProfileData(
  username: string, 
  includePosts: boolean,
  postsLimit: number
): Promise<InstaloaderResult> {
  try {
    // Try public profile endpoint
    const profileUrl = `https://www.instagram.com/${username}/?__a=1&__d=dis`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(profileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'X-IG-App-ID': '936619743392459',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const user = data?.graphql?.user || data?.user || {};
      
      // Extract recent posts
      const recentPosts: PostData[] = [];
      if (includePosts && user.edge_owner_to_timeline_media?.edges) {
        const edges = user.edge_owner_to_timeline_media.edges.slice(0, postsLimit);
        for (const edge of edges) {
          const node = edge.node;
          recentPosts.push({
            shortcode: node.shortcode,
            timestamp: new Date(node.taken_at_timestamp * 1000).toISOString(),
            caption: node.edge_media_to_caption?.edges?.[0]?.node?.text,
            likes: node.edge_liked_by?.count,
            comments: node.edge_media_to_comment?.count,
            isVideo: node.is_video,
            url: `https://www.instagram.com/p/${node.shortcode}/`,
            location: node.location?.name,
          });
        }
      }

      // Extract geotags from posts
      const geotags: GeotagData[] = [];
      const locationMap = new Map<string, GeotagData>();
      
      for (const post of recentPosts) {
        if (post.location) {
          if (locationMap.has(post.location)) {
            locationMap.get(post.location)!.postCount++;
          } else {
            locationMap.set(post.location, {
              name: post.location,
              postCount: 1,
            });
          }
        }
      }
      geotags.push(...locationMap.values());

      return {
        username,
        fullName: user.full_name,
        biography: user.biography,
        profilePicUrl: user.profile_pic_url_hd || user.profile_pic_url,
        isPrivate: user.is_private,
        isVerified: user.is_verified,
        followersCount: user.edge_followed_by?.count,
        followingCount: user.edge_follow?.count,
        postsCount: user.edge_owner_to_timeline_media?.count,
        externalUrl: user.external_url,
        businessCategory: user.category_name,
        isBusiness: user.is_business_account,
        recentPosts,
        geotags: geotags.length > 0 ? geotags : undefined,
        success: true,
      };
    }

    // Fallback: Just check if profile exists
    const existsResponse = await fetch(`https://www.instagram.com/${username}/`, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    return {
      username,
      success: existsResponse.status === 200,
      error: existsResponse.status !== 200 ? 'Profile not found or restricted' : undefined,
    };
  } catch (error) {
    console.error('Instagram profile extraction error:', error);
    return {
      username,
      success: false,
      error: error instanceof Error ? error.message : 'Failed to extract profile data',
    };
  }
}
