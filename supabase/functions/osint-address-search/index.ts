import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GeocodingResult {
  source: 'google' | 'nominatim';
  lat: number;
  lon: number;
  displayName: string;
  address: {
    road?: string;
    houseNumber?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
    county?: string;
  };
  confidence: number;
}

// Generate manual verification links for property records
const generatePropertyLinks = (address: string, city?: string, state?: string, county?: string) => {
  const encodedAddress = encodeURIComponent(address);
  const encodedCity = city ? encodeURIComponent(city) : '';
  const encodedState = state ? encodeURIComponent(state) : '';
  const encodedCounty = county ? encodeURIComponent(county) : '';
  
  const links = [
    { name: 'Zillow', url: `https://www.zillow.com/homes/${encodedAddress}_rb/` },
    { name: 'Realtor.com', url: `https://www.realtor.com/realestateandhomes-search/${encodedAddress.replace(/%20/g, '-')}` },
    { name: 'Redfin', url: `https://www.redfin.com/search?search_input=${encodedAddress}` },
    { name: 'TruePeopleSearch', url: `https://www.truepeoplesearch.com/results?streetaddress=${encodedAddress}&citystatezip=${encodedCity}%20${encodedState}` },
    { name: 'FastPeopleSearch', url: `https://www.fastpeoplesearch.com/address/${encodedAddress.replace(/%20/g, '-')}_${encodedCity.replace(/%20/g, '-')}-${encodedState}` },
    { name: 'WhitePages', url: `https://www.whitepages.com/address/${encodedAddress.replace(/%20/g, '-')}/${encodedCity.replace(/%20/g, '-')}-${encodedState}` },
    { name: 'County Assessor', url: `https://www.google.com/search?q=${encodedCounty || encodedCity}+county+property+assessor+${encodedAddress}` },
    { name: 'Property Records', url: `https://www.google.com/search?q=${encodedAddress}+property+records+ownership+history` },
  ];
  
  return links;
};

// Fetch from Google Geocoding API
async function fetchGoogleGeocoding(address: string, apiKey: string): Promise<GeocodingResult[]> {
  try {
    const googleGeoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    console.log('Fetching Google Geocoding...');
    
    const response = await fetch(googleGeoUrl);
    const data = await response.json();
    
    console.log('Google Geocoding status:', data.status);
    
    if (data.status === 'OK' && data.results?.length > 0) {
      return data.results.map((result: any) => {
        const location = result.geometry.location;
        const addressComponents = result.address_components || [];
        
        const getComponent = (type: string) => 
          addressComponents.find((c: any) => c.types.includes(type))?.long_name || '';
        
        return {
          source: 'google' as const,
          lat: location.lat,
          lon: location.lng,
          displayName: result.formatted_address,
          address: {
            road: getComponent('route'),
            houseNumber: getComponent('street_number'),
            city: getComponent('locality') || getComponent('sublocality') || getComponent('neighborhood'),
            state: getComponent('administrative_area_level_1'),
            country: getComponent('country'),
            postcode: getComponent('postal_code'),
            county: getComponent('administrative_area_level_2')
          },
          confidence: 0.9
        };
      });
    }
    
    console.log('Google Geocoding returned no results or error:', data.error_message || data.status);
    return [];
  } catch (error) {
    console.error('Google Geocoding error:', error);
    return [];
  }
}

// Fetch from Nominatim (OpenStreetMap)
async function fetchNominatimGeocoding(address: string): Promise<GeocodingResult[]> {
  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&addressdetails=1&limit=5`;
    console.log('Fetching Nominatim Geocoding...');
    
    const response = await fetch(nominatimUrl, {
      headers: {
        'User-Agent': 'OSINT-Platform/1.0'
      }
    });
    
    if (!response.ok) {
      console.error('Nominatim response not OK:', response.status);
      return [];
    }
    
    const data = await response.json();
    console.log('Nominatim returned', data.length, 'results');
    
    if (data.length > 0) {
      return data.map((location: any) => ({
        source: 'nominatim' as const,
        lat: parseFloat(location.lat),
        lon: parseFloat(location.lon),
        displayName: location.display_name,
        address: {
          road: location.address?.road,
          houseNumber: location.address?.house_number,
          city: location.address?.city || location.address?.town || location.address?.village,
          state: location.address?.state,
          country: location.address?.country,
          postcode: location.address?.postcode,
          county: location.address?.county
        },
        confidence: parseFloat(location.importance) || 0.5
      }));
    }
    
    return [];
  } catch (error) {
    console.error('Nominatim error:', error);
    return [];
  }
}

// Calculate distance between two coordinates in meters
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Determine verification status based on dual-source comparison
function determineVerificationStatus(googleResults: GeocodingResult[], nominatimResults: GeocodingResult[]) {
  const hasGoogle = googleResults.length > 0;
  const hasNominatim = nominatimResults.length > 0;
  
  if (!hasGoogle && !hasNominatim) {
    return {
      status: 'unverified',
      confidence: 0,
      sources: [] as string[],
      message: 'No geocoding results found from any source'
    };
  }
  
  if (hasGoogle && hasNominatim) {
    const googleLoc = googleResults[0];
    const nominatimLoc = nominatimResults[0];
    const distance = calculateDistance(googleLoc.lat, googleLoc.lon, nominatimLoc.lat, nominatimLoc.lon);
    
    console.log(`Distance between Google and Nominatim results: ${distance.toFixed(2)}m`);
    
    if (distance < 100) {
      return {
        status: 'verified',
        confidence: 0.95,
        sources: ['google', 'nominatim'],
        message: `Multi-source verified (${distance.toFixed(0)}m variance)`,
        distance
      };
    } else if (distance < 500) {
      return {
        status: 'partial',
        confidence: 0.75,
        sources: ['google', 'nominatim'],
        message: `Sources differ by ${distance.toFixed(0)}m - verify manually`,
        distance
      };
    } else {
      return {
        status: 'discrepancy',
        confidence: 0.5,
        sources: ['google', 'nominatim'],
        message: `Large discrepancy (${distance.toFixed(0)}m) - manual verification required`,
        distance
      };
    }
  }
  
  const source = hasGoogle ? 'google' : 'nominatim';
  return {
    status: 'single_source',
    confidence: hasGoogle ? 0.7 : 0.6,
    sources: [source],
    message: `Single source (${source}) - dual verification unavailable`
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { target } = await req.json();
    console.log('Address search for:', target);

    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY');
    console.log('GOOGLE_API_KEY configured:', !!GOOGLE_API_KEY);
    
    // Run both geocoding APIs in parallel for dual-source validation
    const [googleResults, nominatimResults] = await Promise.all([
      GOOGLE_API_KEY ? fetchGoogleGeocoding(target, GOOGLE_API_KEY) : Promise.resolve([]),
      fetchNominatimGeocoding(target)
    ]);
    
    console.log(`Google results: ${googleResults.length}, Nominatim results: ${nominatimResults.length}`);
    
    // Determine verification status based on dual-source comparison
    const verification = determineVerificationStatus(googleResults, nominatimResults);
    console.log('Verification status:', verification.status, verification.message);
    
    // Use Google results as primary when available, otherwise Nominatim
    const primaryResults = googleResults.length > 0 ? googleResults : nominatimResults;
    
    // Generate Street View URL if we have location data and Google API key
    let streetViewUrl = null;
    if (primaryResults.length > 0 && GOOGLE_API_KEY) {
      const location = primaryResults[0];
      streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=800x600&location=${location.lat},${location.lon}&fov=90&heading=0&pitch=0&key=${GOOGLE_API_KEY}`;
      console.log('Generated Street View URL for coordinates:', location.lat, location.lon);
    }

    // Extract address components for property links
    const firstLocation = primaryResults[0];
    const addressCity = firstLocation?.address?.city || '';
    const addressState = firstLocation?.address?.state || '';
    const addressCounty = firstLocation?.address?.county || '';
    
    // Generate property lookup links
    const propertyLinks = generatePropertyLinks(target, addressCity, addressState, addressCounty);

    const results = {
      query: target,
      found: primaryResults.length > 0,
      streetViewUrl: streetViewUrl,
      verification: verification,
      geocodingSources: {
        google: {
          available: googleResults.length > 0,
          count: googleResults.length,
          results: googleResults.slice(0, 3)
        },
        nominatim: {
          available: nominatimResults.length > 0,
          count: nominatimResults.length,
          results: nominatimResults.slice(0, 3)
        }
      },
      locations: primaryResults.map((location) => ({
        displayName: location.displayName,
        latitude: location.lat,
        longitude: location.lon,
        type: 'address',
        category: 'place',
        address: location.address,
        importance: location.confidence,
        source: location.source,
        boundingBox: null
      })),
      propertyLinks: propertyLinks,
      count: primaryResults.length
    };

    console.log(`Address search complete: ${results.count} locations found, verification: ${verification.status}`);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in osint-address-search:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: errorMessage, 
      found: false, 
      locations: [],
      verification: { status: 'error', confidence: 0, sources: [], message: errorMessage }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
