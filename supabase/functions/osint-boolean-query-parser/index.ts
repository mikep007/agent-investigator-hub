import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ParsedCondition {
  field: string;
  value: string;
  operator: 'AND' | 'OR' | 'NOT';
  type: 'must' | 'should' | 'must_not';
}

interface QueryStructure {
  conditions: ParsedCondition[];
  rawQuery: string;
  naturalLanguageSummary: string;
  searchParams: {
    fullName?: string;
    location?: string;
    email?: string;
    phone?: string;
    username?: string;
    employer?: string;
    keywords?: string[];
    excludeTerms?: string[];
  };
  suggestedDataSources: string[];
  queryComplexity: 'simple' | 'moderate' | 'complex';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    if (!query || typeof query !== 'string') {
      throw new Error('Query string is required');
    }

    console.log('Parsing boolean query:', query);

    const systemPrompt = `You are an expert OSINT query parser. Your role is to:

1. Parse boolean queries containing AND, OR, NOT operators
2. Extract structured search parameters from natural language
3. Identify entity types (name, location, email, phone, username, employer)
4. Suggest optimal data sources for the query

Parse the input query and extract:
- Individual conditions with their boolean operators
- Structured search parameters for OSINT investigation
- Suggested data sources to query
- Query complexity assessment

Field types to recognize:
- Name/Person: first name, last name, full name
- Location: city, state, country, address
- Email: email addresses or domains
- Phone: phone numbers
- Username: social media handles, usernames
- Employer/Company: business names, employers
- Keywords: general search terms

Boolean operators:
- AND: Both conditions must match (type: "must")
- OR: Either condition can match (type: "should")  
- NOT: Exclude this condition (type: "must_not")

Return structured JSON with the parsed query.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Parse this boolean query and extract structured search parameters:\n\n"${query}"` }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'parse_boolean_query',
              description: 'Parse a boolean query into structured search parameters',
              parameters: {
                type: 'object',
                properties: {
                  conditions: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        field: { type: 'string', description: 'Field name (name, location, email, phone, username, employer, keyword)' },
                        value: { type: 'string', description: 'The search value' },
                        operator: { type: 'string', enum: ['AND', 'OR', 'NOT'] },
                        type: { type: 'string', enum: ['must', 'should', 'must_not'] }
                      },
                      required: ['field', 'value', 'operator', 'type'],
                      additionalProperties: false
                    }
                  },
                  naturalLanguageSummary: { type: 'string', description: 'Human-readable summary of what the query is searching for' },
                  searchParams: {
                    type: 'object',
                    properties: {
                      fullName: { type: 'string' },
                      location: { type: 'string' },
                      email: { type: 'string' },
                      phone: { type: 'string' },
                      username: { type: 'string' },
                      employer: { type: 'string' },
                      keywords: { type: 'array', items: { type: 'string' } },
                      excludeTerms: { type: 'array', items: { type: 'string' } }
                    },
                    additionalProperties: false
                  },
                  suggestedDataSources: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'List of suggested OSINT data sources to query'
                  },
                  queryComplexity: { type: 'string', enum: ['simple', 'moderate', 'complex'] }
                },
                required: ['conditions', 'naturalLanguageSummary', 'searchParams', 'suggestedDataSources', 'queryComplexity'],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'parse_boolean_query' } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`AI request failed: ${response.status}`);
    }

    const aiResponse = await response.json();
    console.log('AI response:', JSON.stringify(aiResponse, null, 2));

    const toolCall = aiResponse.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error('No tool call in AI response');
    }

    const parsedQuery = JSON.parse(toolCall.function.arguments);

    const queryStructure: QueryStructure = {
      ...parsedQuery,
      rawQuery: query,
    };

    return new Response(
      JSON.stringify(queryStructure),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in osint-boolean-query-parser:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to parse query' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
