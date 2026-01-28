import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Brain, 
  Sparkles, 
  Loader2, 
  Search, 
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Code,
  FileText,
  Lightbulb,
  Zap,
  ListOrdered
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ParsedCondition {
  field: string;
  value: string;
  operator: 'AND' | 'OR' | 'NOT';
  type: 'must' | 'should' | 'must_not';
}

interface GeneratedQuery {
  query: string;
  priority: number;
  totalValue: number;
  template: string;
}

interface QueryStructure {
  conditions: ParsedCondition[];
  rawQuery: string;
  naturalLanguageSummary: string;
  searchParams: {
    fullName?: string;
    firstName?: string;
    lastName?: string;
    middleName?: string;
    location?: string;
    city?: string;
    state?: string;
    zip?: string;
    email?: string;
    phone?: string;
    username?: string;
    employer?: string;
    age?: number;
    keywords?: string[];
    excludeTerms?: string[];
  };
  suggestedDataSources: string[];
  queryComplexity: 'simple' | 'moderate' | 'complex';
  generatedQueries?: GeneratedQuery[];
}

interface BooleanQuerySearchProps {
  onExecuteSearch: (searchParams: any) => void;
  onQueryParsed?: (queryStructure: QueryStructure) => void;
  loading?: boolean;
}

const EXAMPLE_QUERIES = [
  'Name: John Smith AND Location: Springfield, IL',
  'Email: john@company.com OR Username: johnsmith123',
  'Name: Jane Doe AND Location: Chicago NOT Employer: XYZ Corp',
  'Phone: 555-1234 AND Name: Michael NOT Location: California',
];

const BooleanQuerySearch = ({ onExecuteSearch, onQueryParsed, loading = false }: BooleanQuerySearchProps) => {
  const [query, setQuery] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsedQuery, setParsedQuery] = useState<QueryStructure | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const parseQuery = async () => {
    if (!query.trim()) {
      toast({
        title: "Query Required",
        description: "Please enter a boolean query to parse",
        variant: "destructive",
      });
      return;
    }

    setParsing(true);
    setError(null);
    setParsedQuery(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('osint-boolean-query-parser', {
        body: { query: query.trim() }
      });

      if (fnError) {
        if (fnError.message?.includes('429')) {
          throw new Error('Rate limit exceeded. Please wait and try again.');
        }
        if (fnError.message?.includes('402')) {
          throw new Error('AI credits exhausted. Please add credits.');
        }
        throw fnError;
      }

      setParsedQuery(data);
      onQueryParsed?.(data);
      
      toast({
        title: "Query Parsed",
        description: `Identified ${data.conditions.length} conditions with ${data.queryComplexity} complexity`,
      });
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to parse query';
      setError(errorMessage);
      toast({
        title: "Parse Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setParsing(false);
    }
  };

  const executeSearch = () => {
    if (!parsedQuery) return;

    // Build full name from parts if not directly provided
    let fullName = parsedQuery.searchParams.fullName || '';
    if (!fullName && (parsedQuery.searchParams.firstName || parsedQuery.searchParams.lastName)) {
      fullName = [
        parsedQuery.searchParams.firstName,
        parsedQuery.searchParams.middleName,
        parsedQuery.searchParams.lastName,
      ].filter(Boolean).join(' ');
    }

    // Build address from city/state if location not provided
    let address = parsedQuery.searchParams.location || '';
    if (!address && (parsedQuery.searchParams.city || parsedQuery.searchParams.state)) {
      address = [
        parsedQuery.searchParams.city,
        parsedQuery.searchParams.state,
        parsedQuery.searchParams.zip,
      ].filter(Boolean).join(', ');
    }

    // Convert parsed query to search params format
    const searchParams = {
      fullName,
      address,
      email: parsedQuery.searchParams.email || '',
      phone: parsedQuery.searchParams.phone || '',
      username: parsedQuery.searchParams.username || '',
      city: parsedQuery.searchParams.city || '',
      state: parsedQuery.searchParams.state || '',
      keywords: [
        ...(parsedQuery.searchParams.keywords || []),
        parsedQuery.searchParams.employer ? `employer:${parsedQuery.searchParams.employer}` : '',
      ].filter(Boolean).join(' '),
      // Store exclude terms for filtering
      _excludeTerms: parsedQuery.searchParams.excludeTerms || [],
      // Store full parsed query for insights generation
      _parsedQuery: parsedQuery,
      // Pass generated queries for hybrid search execution
      _generatedQueries: parsedQuery.generatedQueries || [],
    };

    onExecuteSearch(searchParams);
  };

  const getOperatorColor = (operator: string) => {
    switch (operator) {
      case 'AND': return 'bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/50';
      case 'OR': return 'bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/50';
      case 'NOT': return 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/50';
      default: return 'bg-muted';
    }
  };

  const getComplexityColor = (complexity: string) => {
    switch (complexity) {
      case 'simple': return 'bg-green-500/20 text-green-700 dark:text-green-400';
      case 'moderate': return 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400';
      case 'complex': return 'bg-orange-500/20 text-orange-700 dark:text-orange-400';
      default: return 'bg-muted';
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <CardTitle>AI Boolean Query Search</CardTitle>
        </div>
        <CardDescription>
          Enter boolean queries with AND, OR, NOT operators for AI-powered entity resolution
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Query Input */}
        <div className="space-y-2">
          <Textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g., Name: John Smith AND Location: Springfield OR NOT Employer: XYZ Corp"
            className="min-h-[100px] font-mono text-sm"
            disabled={parsing || loading}
          />
          
          {/* Example Queries */}
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground">Examples:</span>
            {EXAMPLE_QUERIES.map((example, idx) => (
              <button
                key={idx}
                onClick={() => setQuery(example)}
                className="text-xs text-primary hover:underline"
                disabled={parsing || loading}
              >
                {idx + 1}
              </button>
            ))}
          </div>
        </div>

        {/* Parse Button */}
        <Button
          onClick={parseQuery}
          disabled={parsing || loading || !query.trim()}
          className="w-full gap-2"
        >
          {parsing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Parsing Query...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Parse with AI
            </>
          )}
        </Button>

        {/* Error Display */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Parsed Query Display */}
        {parsedQuery && (
          <div className="space-y-4 pt-4">
            <Separator />
            
            {/* Summary */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="font-medium">Query Parsed Successfully</span>
                </div>
                <Badge className={getComplexityColor(parsedQuery.queryComplexity)}>
                  {parsedQuery.queryComplexity}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {parsedQuery.naturalLanguageSummary}
              </p>
            </div>

            {/* Conditions */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Code className="h-4 w-4" />
                Parsed Conditions
              </div>
              <div className="space-y-2">
                {parsedQuery.conditions.map((condition, idx) => (
                  <div 
                    key={idx}
                    className="flex items-center gap-2 p-2 rounded-lg bg-muted/50"
                  >
                    <Badge variant="outline" className={getOperatorColor(condition.operator)}>
                      {condition.operator}
                    </Badge>
                    <span className="text-sm font-medium capitalize">{condition.field}:</span>
                    <span className="text-sm text-muted-foreground">{condition.value}</span>
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {condition.type}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Search Parameters */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4" />
                Extracted Parameters
              </div>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(parsedQuery.searchParams)
                  .filter(([_, value]) => value && (Array.isArray(value) ? value.length > 0 : true))
                  .map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                      <span className="text-xs font-medium capitalize">{key}:</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {Array.isArray(value) ? value.join(', ') : value}
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Suggested Data Sources */}
            {parsedQuery.suggestedDataSources.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Lightbulb className="h-4 w-4" />
                  Suggested Data Sources
                </div>
                <div className="flex flex-wrap gap-1">
                  {parsedQuery.suggestedDataSources.map((source, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {source}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Generated Prioritized Queries */}
            {parsedQuery.generatedQueries && parsedQuery.generatedQueries.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <ListOrdered className="h-4 w-4" />
                    Generated Queries ({parsedQuery.generatedQueries.length})
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    <Zap className="h-3 w-3 mr-1" />
                    Priority Ranked
                  </Badge>
                </div>
                <ScrollArea className="h-[200px] rounded-lg border">
                  <div className="p-2 space-y-1">
                    {parsedQuery.generatedQueries.slice(0, 20).map((gq, idx) => (
                      <div 
                        key={idx}
                        className="flex items-center justify-between p-2 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-xs font-medium text-muted-foreground w-5">
                            {idx + 1}.
                          </span>
                          <code className="text-xs truncate flex-1">
                            {gq.query}
                          </code>
                        </div>
                        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                          <Badge variant="outline" className="text-xs">
                            P{gq.priority}
                          </Badge>
                          <Badge 
                            variant="secondary" 
                            className={`text-xs ${
                              gq.totalValue > 5000 
                                ? 'bg-green-500/20 text-green-700 dark:text-green-400' 
                                : gq.totalValue > 2000 
                                  ? 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400'
                                  : 'bg-muted'
                            }`}
                          >
                            {gq.totalValue.toLocaleString()}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <p className="text-xs text-muted-foreground">
                  Higher value = more specific match. Priority determines execution order.
                </p>
              </div>
            )}

            {/* Execute Search Button */}
            <Button
              onClick={executeSearch}
              disabled={loading}
              className="w-full gap-2"
              variant="default"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Executing Search...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  Execute Investigation
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default BooleanQuerySearch;
