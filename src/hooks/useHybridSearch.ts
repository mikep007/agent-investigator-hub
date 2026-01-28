import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from './use-toast';

interface GeneratedQuery {
  query: string;
  priority: number;
  totalValue: number;
  template: string;
}

interface ParsedBooleanQuery {
  conditions: Array<{
    field: string;
    value: string;
    operator: 'AND' | 'OR' | 'NOT';
    type: 'must' | 'should' | 'must_not';
  }>;
  rawQuery: string;
  naturalLanguageSummary: string;
  searchParams: Record<string, any>;
  suggestedDataSources: string[];
  queryComplexity: 'simple' | 'moderate' | 'complex';
  generatedQueries?: GeneratedQuery[];
}

interface HybridSearchResult {
  parsedQuery: ParsedBooleanQuery | null;
  generatedQueries: GeneratedQuery[];
  isBoolean: boolean;
  searchParams: Record<string, any>;
}

// Detect if a query contains boolean operators
export const detectBooleanMode = (query: string): boolean => {
  const upperQuery = query.toUpperCase();
  return (
    upperQuery.includes(' AND ') ||
    upperQuery.includes(' OR ') ||
    upperQuery.includes(' NOT ') ||
    /\b(AND|OR|NOT)\b/.test(upperQuery)
  );
};

// Convert parsed boolean query to standard search params
export const booleanToSearchParams = (parsed: ParsedBooleanQuery): Record<string, any> => {
  const params: Record<string, any> = {};
  const excludeTerms: string[] = [];

  // Extract from searchParams
  if (parsed.searchParams) {
    if (parsed.searchParams.fullName) params.fullName = parsed.searchParams.fullName;
    if (parsed.searchParams.firstName) {
      params.fullName = params.fullName || '';
      if (!params.fullName.toLowerCase().includes(parsed.searchParams.firstName.toLowerCase())) {
        params.fullName = `${parsed.searchParams.firstName} ${params.fullName}`.trim();
      }
    }
    if (parsed.searchParams.lastName) {
      params.fullName = params.fullName || '';
      if (!params.fullName.toLowerCase().includes(parsed.searchParams.lastName.toLowerCase())) {
        params.fullName = `${params.fullName} ${parsed.searchParams.lastName}`.trim();
      }
    }
    if (parsed.searchParams.email) params.email = parsed.searchParams.email;
    if (parsed.searchParams.phone) params.phone = parsed.searchParams.phone;
    if (parsed.searchParams.username) params.username = parsed.searchParams.username;
    if (parsed.searchParams.location) params.address = parsed.searchParams.location;
    if (parsed.searchParams.city || parsed.searchParams.state) {
      params.address = [parsed.searchParams.city, parsed.searchParams.state].filter(Boolean).join(', ');
    }
    if (parsed.searchParams.employer) {
      params.keywords = params.keywords || '';
      params.keywords += ` ${parsed.searchParams.employer}`;
    }
    if (parsed.searchParams.keywords?.length) {
      params.keywords = params.keywords || '';
      params.keywords += ` ${parsed.searchParams.keywords.join(' ')}`;
    }
    if (parsed.searchParams.excludeTerms?.length) {
      excludeTerms.push(...parsed.searchParams.excludeTerms);
    }
  }

  // Process conditions for NOT operators
  for (const condition of parsed.conditions) {
    if (condition.type === 'must_not') {
      excludeTerms.push(condition.value);
    }
  }

  // Trim all string values
  for (const key of Object.keys(params)) {
    if (typeof params[key] === 'string') {
      params[key] = params[key].trim();
    }
  }

  params._excludeTerms = excludeTerms;
  params._parsedQuery = parsed;
  params._generatedQueries = parsed.generatedQueries || [];

  return params;
};

export const useHybridSearch = () => {
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Parse a boolean query using the AI parser
  const parseBoolean = useCallback(async (query: string): Promise<ParsedBooleanQuery | null> => {
    setParsing(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('osint-boolean-query-parser', {
        body: { query: query.trim() }
      });

      if (fnError) {
        throw fnError;
      }

      return data as ParsedBooleanQuery;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to parse boolean query';
      setError(errorMessage);
      toast({
        title: 'Parse Error',
        description: errorMessage,
        variant: 'destructive',
      });
      return null;
    } finally {
      setParsing(false);
    }
  }, [toast]);

  // Process input - automatically detect mode and parse if needed
  const processInput = useCallback(async (input: string | Record<string, any>): Promise<HybridSearchResult> => {
    // If input is already structured params, return as-is
    if (typeof input === 'object') {
      return {
        parsedQuery: null,
        generatedQueries: [],
        isBoolean: false,
        searchParams: input,
      };
    }

    // Check if input contains boolean operators
    const isBoolean = detectBooleanMode(input);

    if (isBoolean) {
      const parsed = await parseBoolean(input);
      if (parsed) {
        return {
          parsedQuery: parsed,
          generatedQueries: parsed.generatedQueries || [],
          isBoolean: true,
          searchParams: booleanToSearchParams(parsed),
        };
      }
    }

    // Fall back to simple search params
    return {
      parsedQuery: null,
      generatedQueries: [],
      isBoolean: false,
      searchParams: { fullName: input },
    };
  }, [parseBoolean]);

  // Select relevant templates based on parsed params
  const selectRelevantTemplates = useCallback((
    generatedQueries: GeneratedQuery[],
    maxQueries = 20
  ): GeneratedQuery[] => {
    // Already sorted by priority and value in the backend
    // Filter to top N for efficiency
    return generatedQueries.slice(0, maxQueries);
  }, []);

  return {
    parsing,
    error,
    parseBoolean,
    processInput,
    selectRelevantTemplates,
    detectBooleanMode,
    booleanToSearchParams,
  };
};

export default useHybridSearch;
