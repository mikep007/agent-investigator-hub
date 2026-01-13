import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FaceSearchRequest {
  investigationId?: string;
  imageBase64?: string;
  imageUrl?: string;
}

interface FaceSearchResult {
  source: string;
  url: string;
  thumbnail?: string;
  similarity?: number;
  sourceType: 'social_media' | 'mugshot' | 'news' | 'video' | 'other';
  title?: string;
  description?: string;
}

interface FaceSearchSource {
  name: string;
  enabled: boolean;
  apiEndpoint?: string;
  manualUrl: string;
  description: string;
  capabilities: string[];
}

const FACE_SEARCH_SOURCES: FaceSearchSource[] = [
  {
    name: 'PimEyes',
    enabled: false, // API requires enterprise subscription
    manualUrl: 'https://pimeyes.com/en',
    description: 'Deep face search across billions of images on the web',
    capabilities: ['social_media', 'news', 'public_photos'],
  },
  {
    name: 'FaceCheck.ID',
    enabled: false, // API requires subscription
    manualUrl: 'https://facecheck.id/',
    description: 'Search mugshots, sex offender registries, social media',
    capabilities: ['mugshots', 'registries', 'social_media', 'news'],
  },
  {
    name: 'Yandex Images',
    enabled: true, // Can construct search URL
    manualUrl: 'https://yandex.com/images/',
    description: 'Reverse image search with face matching capabilities',
    capabilities: ['web_images', 'social_media', 'russian_platforms'],
  },
  {
    name: 'Search4faces',
    enabled: false, // API requires subscription
    manualUrl: 'https://search4faces.com/',
    description: 'VK and Russian social network face search',
    capabilities: ['vk', 'russian_social', 'ok.ru'],
  },
  {
    name: 'TelegramFaceSearch',
    enabled: false, // Telegram bots
    manualUrl: 'https://t.me/FaceSearchBot',
    description: 'Telegram bot for phone and face searches',
    capabilities: ['phone_lookup', 'face_search', 'telegram_users'],
  },
  {
    name: 'GetContact',
    enabled: false,
    manualUrl: 'https://t.me/GetContact_real2bot',
    description: 'Telegram bot for phone number lookups',
    capabilities: ['phone_lookup', 'contact_names'],
  },
  {
    name: 'EyeOfGod',
    enabled: false,
    manualUrl: 'https://t.me/eyeofgodbot',
    description: 'Russian OSINT Telegram bot (face, phone, name search)',
    capabilities: ['face_search', 'phone_lookup', 'name_search', 'vehicle_search'],
  },
  {
    name: 'Himera',
    enabled: false,
    manualUrl: 'https://t.me/hlobot',
    description: 'Ukrainian/Russian OSINT Telegram bot',
    capabilities: ['face_search', 'phone_lookup', 'social_search'],
  },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization')!;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const body: FaceSearchRequest = await req.json();
    const { investigationId, imageBase64, imageUrl } = body;

    console.log('[FaceSearch] Starting face search...');

    const results: FaceSearchResult[] = [];
    const manualVerificationLinks: { source: string; url: string; description: string; capabilities: string[] }[] = [];
    const automatedSearches: { source: string; status: string; resultsCount: number }[] = [];

    // Process each source
    for (const source of FACE_SEARCH_SOURCES) {
      if (source.enabled && imageBase64) {
        // Attempt automated search for enabled APIs
        try {
          if (source.name === 'Yandex Images' && imageUrl) {
            // Construct Yandex reverse image search URL
            const yandexSearchUrl = `https://yandex.com/images/search?rpt=imageview&url=${encodeURIComponent(imageUrl)}`;
            
            results.push({
              source: 'Yandex Images',
              url: yandexSearchUrl,
              sourceType: 'other',
              title: 'Yandex Reverse Image Search',
              description: 'Click to view face matches on Yandex',
            });
            
            automatedSearches.push({
              source: source.name,
              status: 'redirect_generated',
              resultsCount: 1,
            });
          }
        } catch (error) {
          console.error(`[FaceSearch] ${source.name} API error:`, error);
          automatedSearches.push({
            source: source.name,
            status: 'error',
            resultsCount: 0,
          });
        }
      }

      // Always add manual verification link
      manualVerificationLinks.push({
        source: source.name,
        url: source.manualUrl,
        description: source.description,
        capabilities: source.capabilities,
      });
    }

    // Prepare response
    const response = {
      success: true,
      method: results.length > 0 ? 'hybrid' : 'manual_verification_required',
      results,
      manualVerificationLinks,
      automatedSearches,
      totalSourcesAvailable: FACE_SEARCH_SOURCES.length,
      totalApiEnabled: FACE_SEARCH_SOURCES.filter(s => s.enabled).length,
      supportedCapabilities: [
        'mugshots',
        'social_media',
        'news_articles',
        'video_thumbnails',
        'public_photos',
        'russian_platforms',
        'telegram_lookup',
      ],
    };

    // Save finding if investigationId provided
    if (investigationId) {
      await supabaseClient.from('findings').insert({
        investigation_id: investigationId,
        agent_type: 'Face_search',
        source: 'Multi-source Face Recognition',
        data: response,
        confidence_score: results.length > 0 ? 0.7 : 0.3,
      });
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[FaceSearch] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false,
        manualVerificationLinks: FACE_SEARCH_SOURCES.map(s => ({
          source: s.name,
          url: s.manualUrl,
          description: s.description,
          capabilities: s.capabilities,
        })),
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
