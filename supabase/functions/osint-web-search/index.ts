import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { target } = await req.json();
    console.log('Web search for:', target);

    // Using DuckDuckGo's instant answer API (free, no key needed)
    const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(target)}&format=json&no_html=1&skip_disambig=1`;
    
    const response = await fetch(searchUrl);
    const data = await response.json();

    const results = {
      abstract: data.Abstract || '',
      abstractSource: data.AbstractSource || '',
      abstractUrl: data.AbstractURL || '',
      relatedTopics: data.RelatedTopics?.slice(0, 5).map((topic: any) => ({
        text: topic.Text || '',
        url: topic.FirstURL || ''
      })) || [],
      infobox: data.Infobox || null
    };

    console.log('Web search results found:', results.abstract ? 'Yes' : 'No');

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