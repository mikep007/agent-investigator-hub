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
    console.log('Address search for:', target);

    // Use Nominatim (OpenStreetMap) for free geocoding
    const searchUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(target)}&format=json&addressdetails=1&limit=5`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'OSINT-Platform/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Geocoding API error: ${response.status}`);
    }

    const data = await response.json();

    const results = {
      query: target,
      found: data.length > 0,
      locations: data.map((location: any) => ({
        displayName: location.display_name,
        latitude: parseFloat(location.lat),
        longitude: parseFloat(location.lon),
        type: location.type,
        category: location.class,
        address: {
          road: location.address?.road,
          city: location.address?.city || location.address?.town || location.address?.village,
          state: location.address?.state,
          country: location.address?.country,
          postcode: location.address?.postcode,
          county: location.address?.county
        },
        importance: location.importance,
        boundingBox: location.boundingbox
      })),
      count: data.length
    };

    console.log('Address search results:', results.count, 'locations found');

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in osint-address-search:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
