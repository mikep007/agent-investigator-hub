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
    console.log('Address search for:', target);

    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY');
    console.log('GOOGLE_API_KEY configured:', !!GOOGLE_API_KEY);
    
    let data: any[] = [];
    let geocodingSource = 'none';

    // Try Google Geocoding API FIRST since it's more reliable for US addresses
    if (GOOGLE_API_KEY) {
      console.log('Trying Google Geocoding API first...');
      try {
        const googleGeoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(target)}&key=${GOOGLE_API_KEY}`;
        console.log('Google Geocoding URL:', googleGeoUrl.replace(GOOGLE_API_KEY, 'REDACTED'));
        
        const googleResponse = await fetch(googleGeoUrl);
        const googleData = await googleResponse.json();
        
        console.log('Google Geocoding API response status:', googleData.status);
        console.log('Google Geocoding API error_message:', googleData.error_message || 'none');
        
        if (googleData.status === 'OK' && googleData.results && googleData.results.length > 0) {
          // Convert Google Geocoding format to our standard format
          data = googleData.results.map((result: any) => {
            const location = result.geometry.location;
            const addressComponents = result.address_components || [];
            
            // Extract address components
            const getComponent = (type: string) => 
              addressComponents.find((c: any) => c.types.includes(type))?.long_name || '';
            
            return {
              lat: location.lat.toString(),
              lon: location.lng.toString(),
              display_name: result.formatted_address,
              type: result.types?.[0] || 'address',
              class: 'place',
              address: {
                road: getComponent('route'),
                house_number: getComponent('street_number'),
                city: getComponent('locality') || getComponent('sublocality') || getComponent('neighborhood'),
                state: getComponent('administrative_area_level_1'),
                country: getComponent('country'),
                postcode: getComponent('postal_code'),
                county: getComponent('administrative_area_level_2')
              },
              importance: 0.9,
              boundingbox: result.geometry.viewport ? [
                result.geometry.viewport.southwest.lat.toString(),
                result.geometry.viewport.northeast.lat.toString(),
                result.geometry.viewport.southwest.lng.toString(),
                result.geometry.viewport.northeast.lng.toString()
              ] : null
            };
          });
          geocodingSource = 'google';
          console.log(`Google Geocoding found ${data.length} results`);
        } else {
          console.log('Google Geocoding returned no valid results, status:', googleData.status);
        }
      } catch (error) {
        console.error('Google Geocoding error:', error);
      }
    }

    // Fallback to Nominatim if Google didn't work
    if (data.length === 0) {
      console.log('Trying Nominatim as fallback...');
      try {
        const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(target)}&format=json&addressdetails=1&limit=5`;
        
        const nominatimResponse = await fetch(nominatimUrl, {
          headers: {
            'User-Agent': 'OSINT-Platform/1.0'
          }
        });

        if (nominatimResponse.ok) {
          const nominatimData = await nominatimResponse.json();
          if (nominatimData.length > 0) {
            data = nominatimData;
            geocodingSource = 'nominatim';
            console.log(`Nominatim found ${data.length} results`);
          } else {
            console.log('Nominatim returned 0 results');
          }
        }
      } catch (error) {
        console.error('Nominatim error:', error);
      }
    }

    // Generate Street View URL if we have location data
    let streetViewUrl = null;
    if (data.length > 0 && GOOGLE_API_KEY) {
      const location = data[0];
      const lat = parseFloat(location.lat);
      const lon = parseFloat(location.lon);
      
      // Google Street View Static API URL
      streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=800x600&location=${lat},${lon}&fov=90&heading=0&pitch=0&key=${GOOGLE_API_KEY}`;
      console.log('Generated Street View URL for coordinates:', lat, lon);
    }

    const results = {
      query: target,
      found: data.length > 0,
      streetViewUrl: streetViewUrl,
      geocodingSource: geocodingSource,
      locations: data.map((location: any) => ({
        displayName: location.display_name,
        latitude: parseFloat(location.lat),
        longitude: parseFloat(location.lon),
        type: location.type,
        category: location.class,
        address: {
          road: location.address?.road,
          houseNumber: location.address?.house_number,
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

    console.log(`Address search complete: ${results.count} locations found via ${geocodingSource}`);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in osint-address-search:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage, found: false, locations: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
