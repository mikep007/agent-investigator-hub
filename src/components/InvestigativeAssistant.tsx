import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Lightbulb, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Suggestion {
  action: string;
  reasoning: string;
  platform: string;
  searchType: string;
  searchQuery: string;
  expectedValue: string;
}

interface InvestigativeAssistantProps {
  findings: any[];
  onSuggestionClick?: (suggestion: Suggestion) => void;
}

const InvestigativeAssistant = ({ findings, onSuggestionClick }: InvestigativeAssistantProps) => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const { toast } = useToast();

  const analyzeFindingsAndSuggest = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-investigative-assistant', {
        body: { findings }
      });

      if (error) {
        if (error.message?.includes('429')) {
          toast({
            title: "Rate Limit Reached",
            description: "Too many AI requests. Please wait a moment and try again.",
            variant: "destructive",
          });
        } else if (error.message?.includes('402')) {
          toast({
            title: "Credits Exhausted",
            description: "AI credits depleted. Please add credits to your workspace.",
            variant: "destructive",
          });
        } else {
          throw error;
        }
        return;
      }

      if (data?.suggestions) {
        setSuggestions(data.suggestions);
        setAnalyzed(true);
        toast({
          title: "Analysis Complete",
          description: `Found ${data.suggestions.length} investigative suggestions`,
        });
      }
    } catch (error: any) {
      console.error('AI assistant error:', error);
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to analyze findings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getSearchTypeColor = (type: string) => {
    switch (type) {
      case 'web': return 'bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/50';
      case 'social': return 'bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-500/50';
      case 'username': return 'bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/50';
      case 'email': return 'bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/50';
      default: return 'bg-gray-500/20 text-gray-700 dark:text-gray-400 border-gray-500/50';
    }
  };

  if (findings.length === 0) {
    return null;
  }

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle>AI Investigative Assistant</CardTitle>
          </div>
          {!analyzed && (
            <Button
              onClick={analyzeFindingsAndSuggest}
              disabled={loading}
              size="sm"
              className="gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Lightbulb className="h-4 w-4" />
                  Analyze Findings
                </>
              )}
            </Button>
          )}
        </div>
        <CardDescription>
          AI-powered analysis of your findings with smart search suggestions
        </CardDescription>
      </CardHeader>
      
      {suggestions.length > 0 && (
        <CardContent className="space-y-4">
          {suggestions.map((suggestion, index) => (
            <Card key={index} className="bg-muted/30">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-primary" />
                      <CardTitle className="text-base">{suggestion.action}</CardTitle>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className={getSearchTypeColor(suggestion.searchType)}>
                        {suggestion.searchType}
                      </Badge>
                      <Badge variant="outline" className="gap-1">
                        <ExternalLink className="h-3 w-3" />
                        {suggestion.platform}
                      </Badge>
                    </div>
                  </div>
                  {onSuggestionClick && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSuggestionClick(suggestion)}
                      className="shrink-0"
                    >
                      Run Search
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <span className="font-medium text-muted-foreground">Why: </span>
                  <span className="text-foreground">{suggestion.reasoning}</span>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">Search: </span>
                  <code className="text-xs bg-background px-2 py-1 rounded">
                    {suggestion.searchQuery}
                  </code>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">Expected: </span>
                  <span className="text-foreground">{suggestion.expectedValue}</span>
                </div>
              </CardContent>
            </Card>
          ))}
          
          {analyzed && (
            <Button
              onClick={analyzeFindingsAndSuggest}
              disabled={loading}
              variant="outline"
              size="sm"
              className="w-full gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Re-analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Re-analyze with New Findings
                </>
              )}
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
};

export default InvestigativeAssistant;
