import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LeakCheckProResult {
  success: boolean;
  found: number;
  quota: number;
  result: BreachRecord[];
}

interface BreachRecord {
  source: {
    name: string;
    breach_date: string;
    unverified?: number;
    passwordless?: number;
    compilation?: number;
  };
  fields: string[];
  [key: string]: any;
}

interface BreachSource {
  name: string;
  date: string;
  line?: string;
  record?: BreachRecord;
}

// Retry with exponential backoff for rate limiting
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // If rate limited, wait and retry
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt + 1) * 1000;
        console.log(`Rate limited, waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Fetch attempt ${attempt + 1} failed:`, lastError.message);
      
      if (attempt < maxRetries - 1) {
        const waitTime = Math.pow(2, attempt + 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { target, type } = await req.json();
    let searchType = type || 'email';
    if (searchType === 'username') {
      searchType = 'login';
    }
    
    let cleanTarget = target?.trim();
    if (searchType === 'phone') {
      cleanTarget = cleanTarget.replace(/[\s\-\(\)\+\.]/g, '');
      console.log(`Phone cleaned: ${target} -> ${cleanTarget}`);
    }
    
    if (!cleanTarget) {
      throw new Error('No target provided');
    }
    
    console.log(`LeakCheck search for ${searchType}:`, cleanTarget);

    const leakCheckApiKey = Deno.env.get('LEAKCHECK_API_KEY');
    if (!leakCheckApiKey) {
      throw new Error('LEAKCHECK_API_KEY not configured');
    }

    const apiUrl = `https://leakcheck.io/api/v2/query/${encodeURIComponent(cleanTarget)}?type=${searchType}`;
    console.log('Calling LeakCheck Pro API v2:', apiUrl);
    
    const response = await fetchWithRetry(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-API-Key': leakCheckApiKey,
      },
    });

    if (!response.ok) {
      console.error('LeakCheck API error:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('Error response:', errorText);
      
      return new Response(JSON.stringify({ 
        error: `LeakCheck API error: ${response.statusText}`,
        found: 0,
        sources: [],
        rateLimited: response.status === 429
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data: LeakCheckProResult = await response.json();
    console.log('LeakCheck Pro API v2 results:', {
      found: data.found,
      records: data.result?.length || 0,
      quota: data.quota,
    });

    const allFields = new Set<string>();
    data.result?.forEach(record => {
      record.fields?.forEach(field => allFields.add(field));
    });

    const sources: BreachSource[] = data.result?.map(record => {
      const dataLine = record.fields
        ?.map(field => {
          const value = record[field];
          return value ? `${field}: ${value}` : null;
        })
        .filter(Boolean)
        .join(' | ') || 'No data details available';

      return {
        name: record.source.name,
        date: record.source.breach_date,
        line: dataLine,
        record: record,
      };
    }) || [];

    console.log('Processed breach sources:', sources.length);

    return new Response(JSON.stringify({
      target: cleanTarget,
      type: searchType,
      found: data.found || 0,
      fields: Array.from(allFields),
      sources: sources,
      success: data.success,
      quota: data.quota,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in osint-leakcheck:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: errorMessage,
      found: 0,
      sources: []
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
