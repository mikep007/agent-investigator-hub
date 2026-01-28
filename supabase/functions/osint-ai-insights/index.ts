import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface QueryCondition {
  field: string;
  value: string;
  operator: string;
  type: string;
}

interface InsightConnection {
  resultId: string;
  conditionField: string;
  conditionValue: string;
  matchType: 'exact' | 'partial' | 'semantic' | 'inferred';
  confidence: number;
  explanation: string;
}

interface ActionableInsight {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  category: 'identity' | 'connection' | 'risk' | 'opportunity' | 'verification';
  suggestedAction?: string;
  relatedResults: string[];
}

interface InsightVisualization {
  type: 'network' | 'timeline' | 'heatmap' | 'comparison';
  title: string;
  description: string;
  dataPoints: any[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { results, queryConditions, searchParams, rawQuery } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log('Generating insights for query:', rawQuery);
    console.log('Results count:', results?.length || 0);

    const systemPrompt = `You are an expert OSINT analyst generating actionable intelligence insights. Your role is to:

1. Analyze search results against the original boolean query conditions
2. Identify connections between results and query parameters
3. Generate actionable insights with clear priorities
4. Suggest visualizations for understanding the data
5. Highlight anomalies, patterns, and verification opportunities

For each result, determine:
- How it matches each query condition (exact, partial, semantic, or inferred)
- Confidence level of the match (0-100)
- Why this connection exists

Generate insights that are:
- Actionable: Clear next steps for investigation
- Prioritized: High/Medium/Low based on importance
- Categorized: Identity, Connection, Risk, Opportunity, or Verification
- Evidence-based: Reference specific results

Suggest visualizations that would help understand:
- Entity relationships (network graphs)
- Temporal patterns (timelines)
- Geographic concentrations (heatmaps)
- Comparative analysis (comparison charts)`;

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
          { 
            role: 'user', 
            content: `Analyze these OSINT search results against the query conditions and generate insights:

ORIGINAL QUERY: "${rawQuery}"

QUERY CONDITIONS:
${JSON.stringify(queryConditions, null, 2)}

SEARCH PARAMETERS:
${JSON.stringify(searchParams, null, 2)}

SEARCH RESULTS (${results?.length || 0} items):
${JSON.stringify(results?.slice(0, 20) || [], null, 2)}

Generate:
1. Connections between results and query conditions
2. Actionable insights with priorities
3. Suggested visualizations` 
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'generate_insights',
              description: 'Generate structured insights from OSINT search results',
              parameters: {
                type: 'object',
                properties: {
                  executiveSummary: { 
                    type: 'string', 
                    description: 'Brief executive summary of findings (2-3 sentences)' 
                  },
                  connections: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        resultId: { type: 'string', description: 'Identifier for the result (index or title)' },
                        conditionField: { type: 'string' },
                        conditionValue: { type: 'string' },
                        matchType: { type: 'string', enum: ['exact', 'partial', 'semantic', 'inferred'] },
                        confidence: { type: 'number', minimum: 0, maximum: 100 },
                        explanation: { type: 'string' }
                      },
                      required: ['resultId', 'conditionField', 'conditionValue', 'matchType', 'confidence', 'explanation'],
                      additionalProperties: false
                    }
                  },
                  insights: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        title: { type: 'string' },
                        description: { type: 'string' },
                        priority: { type: 'string', enum: ['high', 'medium', 'low'] },
                        category: { type: 'string', enum: ['identity', 'connection', 'risk', 'opportunity', 'verification'] },
                        suggestedAction: { type: 'string' },
                        relatedResults: { type: 'array', items: { type: 'string' } }
                      },
                      required: ['title', 'description', 'priority', 'category', 'relatedResults'],
                      additionalProperties: false
                    }
                  },
                  visualizations: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        type: { type: 'string', enum: ['network', 'timeline', 'heatmap', 'comparison'] },
                        title: { type: 'string' },
                        description: { type: 'string' },
                        dataPoints: { type: 'array', items: { type: 'object' } }
                      },
                      required: ['type', 'title', 'description'],
                      additionalProperties: false
                    }
                  },
                  matchStats: {
                    type: 'object',
                    properties: {
                      totalResults: { type: 'number' },
                      exactMatches: { type: 'number' },
                      partialMatches: { type: 'number' },
                      semanticMatches: { type: 'number' },
                      inferredMatches: { type: 'number' },
                      noMatchResults: { type: 'number' },
                      overallConfidence: { type: 'number' }
                    },
                    additionalProperties: false
                  },
                  privacyFlags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Any privacy or compliance considerations'
                  }
                },
                required: ['executiveSummary', 'connections', 'insights', 'visualizations', 'matchStats'],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'generate_insights' } }
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
    console.log('AI insights response received');

    const toolCall = aiResponse.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error('No tool call in AI response');
    }

    const insights = JSON.parse(toolCall.function.arguments);

    return new Response(
      JSON.stringify({
        ...insights,
        rawQuery,
        generatedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in osint-ai-insights:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to generate insights' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
