import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sparkles,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Target,
  Link2,
  Shield,
  TrendingUp,
  Search,
  ChevronDown,
  ChevronUp,
  Network,
  Clock,
  MapPin,
  BarChart3,
  Eye,
  RefreshCw
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  dataPoints?: any[];
}

interface MatchStats {
  totalResults: number;
  exactMatches: number;
  partialMatches: number;
  semanticMatches: number;
  inferredMatches: number;
  noMatchResults: number;
  overallConfidence: number;
}

interface AIInsightsData {
  executiveSummary: string;
  connections: InsightConnection[];
  insights: ActionableInsight[];
  visualizations: InsightVisualization[];
  matchStats: MatchStats;
  privacyFlags?: string[];
  rawQuery: string;
  generatedAt: string;
}

interface AIInsightsPanelProps {
  results: any[];
  parsedQuery: any;
  autoGenerate?: boolean;
}

const AIInsightsPanel = ({ results, parsedQuery, autoGenerate = false }: AIInsightsPanelProps) => {
  const [insights, setInsights] = useState<AIInsightsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<string[]>(['summary', 'insights']);
  const { toast } = useToast();

  useEffect(() => {
    if (autoGenerate && results.length > 0 && parsedQuery && !insights && !loading) {
      generateInsights();
    }
  }, [autoGenerate, results, parsedQuery]);

  const generateInsights = async () => {
    if (!results.length || !parsedQuery) {
      toast({
        title: "Missing Data",
        description: "Results and parsed query are required to generate insights",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('osint-ai-insights', {
        body: {
          results,
          queryConditions: parsedQuery.conditions,
          searchParams: parsedQuery.searchParams,
          rawQuery: parsedQuery.rawQuery,
        }
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

      setInsights(data);
      toast({
        title: "Insights Generated",
        description: `Found ${data.insights.length} actionable insights`,
      });
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to generate insights';
      setError(errorMessage);
      toast({
        title: "Insight Generation Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev =>
      prev.includes(section)
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/50';
      case 'medium': return 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/50';
      case 'low': return 'bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/50';
      default: return 'bg-muted';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'identity': return <Target className="h-4 w-4" />;
      case 'connection': return <Link2 className="h-4 w-4" />;
      case 'risk': return <AlertTriangle className="h-4 w-4" />;
      case 'opportunity': return <TrendingUp className="h-4 w-4" />;
      case 'verification': return <CheckCircle2 className="h-4 w-4" />;
      default: return <Search className="h-4 w-4" />;
    }
  };

  const getMatchTypeColor = (type: string) => {
    switch (type) {
      case 'exact': return 'bg-green-500/20 text-green-700 dark:text-green-400';
      case 'partial': return 'bg-blue-500/20 text-blue-700 dark:text-blue-400';
      case 'semantic': return 'bg-purple-500/20 text-purple-700 dark:text-purple-400';
      case 'inferred': return 'bg-orange-500/20 text-orange-700 dark:text-orange-400';
      default: return 'bg-muted';
    }
  };

  const getVisualizationIcon = (type: string) => {
    switch (type) {
      case 'network': return <Network className="h-4 w-4" />;
      case 'timeline': return <Clock className="h-4 w-4" />;
      case 'heatmap': return <MapPin className="h-4 w-4" />;
      case 'comparison': return <BarChart3 className="h-4 w-4" />;
      default: return <Eye className="h-4 w-4" />;
    }
  };

  if (!results.length) {
    return null;
  }

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle>AI-Powered Insights</CardTitle>
          </div>
          <Button
            onClick={generateInsights}
            disabled={loading}
            size="sm"
            variant={insights ? "outline" : "default"}
            className="gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : insights ? (
              <>
                <RefreshCw className="h-4 w-4" />
                Regenerate
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate Insights
              </>
            )}
          </Button>
        </div>
        <CardDescription>
          AI analysis of search results with actionable intelligence
        </CardDescription>
      </CardHeader>

      {error && (
        <CardContent>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </div>
        </CardContent>
      )}

      {insights && (
        <CardContent className="space-y-4">
          {/* Executive Summary */}
          <Collapsible
            open={expandedSections.includes('summary')}
            onOpenChange={() => toggleSection('summary')}
          >
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <span className="font-medium">Executive Summary</span>
              </div>
              {expandedSections.includes('summary') ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <p className="text-sm text-muted-foreground p-3 bg-background rounded-lg border">
                {insights.executiveSummary}
              </p>
            </CollapsibleContent>
          </Collapsible>

          {/* Match Statistics */}
          {insights.matchStats && (
            <div className="space-y-3 p-4 rounded-lg bg-muted/30">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Overall Confidence</span>
                <span className="text-sm font-bold text-primary">
                  {Math.round(insights.matchStats.overallConfidence)}%
                </span>
              </div>
              <Progress value={insights.matchStats.overallConfidence} className="h-2" />
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2">
                <div className="text-center p-2 rounded bg-green-500/10">
                  <div className="text-lg font-bold text-green-600 dark:text-green-400">
                    {insights.matchStats.exactMatches}
                  </div>
                  <div className="text-xs text-muted-foreground">Exact</div>
                </div>
                <div className="text-center p-2 rounded bg-blue-500/10">
                  <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                    {insights.matchStats.partialMatches}
                  </div>
                  <div className="text-xs text-muted-foreground">Partial</div>
                </div>
                <div className="text-center p-2 rounded bg-purple-500/10">
                  <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
                    {insights.matchStats.semanticMatches}
                  </div>
                  <div className="text-xs text-muted-foreground">Semantic</div>
                </div>
                <div className="text-center p-2 rounded bg-orange-500/10">
                  <div className="text-lg font-bold text-orange-600 dark:text-orange-400">
                    {insights.matchStats.inferredMatches}
                  </div>
                  <div className="text-xs text-muted-foreground">Inferred</div>
                </div>
              </div>
            </div>
          )}

          {/* Actionable Insights */}
          <Collapsible
            open={expandedSections.includes('insights')}
            onOpenChange={() => toggleSection('insights')}
          >
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="font-medium">Actionable Insights</span>
                <Badge variant="secondary">{insights.insights.length}</Badge>
              </div>
              {expandedSections.includes('insights') ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 space-y-2">
              {insights.insights.map((insight, idx) => (
                <div key={idx} className="p-3 rounded-lg border bg-background space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {getCategoryIcon(insight.category)}
                      <span className="font-medium text-sm">{insight.title}</span>
                    </div>
                    <Badge variant="outline" className={getPriorityColor(insight.priority)}>
                      {insight.priority}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{insight.description}</p>
                  {insight.suggestedAction && (
                    <div className="flex items-center gap-2 p-2 rounded bg-primary/5 border border-primary/20">
                      <Target className="h-3 w-3 text-primary" />
                      <span className="text-xs text-primary">{insight.suggestedAction}</span>
                    </div>
                  )}
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>

          {/* Connections */}
          {insights.connections.length > 0 && (
            <Collapsible
              open={expandedSections.includes('connections')}
              onOpenChange={() => toggleSection('connections')}
            >
              <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                <div className="flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-primary" />
                  <span className="font-medium">Result Connections</span>
                  <Badge variant="secondary">{insights.connections.length}</Badge>
                </div>
                {expandedSections.includes('connections') ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3 space-y-2">
                {insights.connections.slice(0, 10).map((conn, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-background border">
                    <Badge className={getMatchTypeColor(conn.matchType)} variant="outline">
                      {conn.matchType}
                    </Badge>
                    <span className="text-xs font-medium">{conn.conditionField}:</span>
                    <span className="text-xs text-muted-foreground truncate flex-1">
                      {conn.explanation}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {conn.confidence}%
                    </Badge>
                  </div>
                ))}
                {insights.connections.length > 10 && (
                  <p className="text-xs text-muted-foreground text-center">
                    +{insights.connections.length - 10} more connections
                  </p>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Suggested Visualizations */}
          {insights.visualizations.length > 0 && (
            <Collapsible
              open={expandedSections.includes('visualizations')}
              onOpenChange={() => toggleSection('visualizations')}
            >
              <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  <span className="font-medium">Suggested Visualizations</span>
                  <Badge variant="secondary">{insights.visualizations.length}</Badge>
                </div>
                {expandedSections.includes('visualizations') ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3 space-y-2">
                {insights.visualizations.map((viz, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 rounded-lg bg-background border">
                    <div className="p-2 rounded-full bg-primary/10">
                      {getVisualizationIcon(viz.type)}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-sm">{viz.title}</div>
                      <div className="text-xs text-muted-foreground">{viz.description}</div>
                    </div>
                    <Badge variant="outline" className="capitalize">{viz.type}</Badge>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Privacy Flags */}
          {insights.privacyFlags && insights.privacyFlags.length > 0 && (
            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 space-y-2">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                <span className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
                  Privacy Considerations
                </span>
              </div>
              <ul className="text-xs text-yellow-700 dark:text-yellow-300 space-y-1">
                {insights.privacyFlags.map((flag, idx) => (
                  <li key={idx}>• {flag}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Generation Info */}
          <div className="text-xs text-muted-foreground text-center pt-2">
            Generated at {new Date(insights.generatedAt).toLocaleString()}
          </div>
        </CardContent>
      )}
    </Card>
  );
};

export default AIInsightsPanel;
