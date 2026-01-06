import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, AlertTriangle, Users, TrendingUp, Search, Loader2, Link as LinkIcon, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface InvestigationAnalysisProps {
  investigationId: string | null;
  active: boolean;
}

interface AnalysisResult {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
  keyFindings: string[];
  patterns: string[];
  relatedPersons: string[];
  recommendations: string[];
  anomalies: string[];
}

const InvestigationAnalysis = ({ investigationId, active }: InvestigationAnalysisProps) => {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const analyzeInvestigation = async () => {
    if (!investigationId) {
      toast({
        title: "No Investigation",
        description: "Please start an investigation first",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setAnalysis(null);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('analyze-investigation', {
        body: { investigationId }
      });

      if (fnError) throw fnError;

      if (data.error) {
        throw new Error(data.error);
      }

      setAnalysis(data.analysis);
      toast({
        title: "Analysis Complete",
        description: "AI-powered investigation analysis is ready",
      });
    } catch (err: any) {
      const errorMessage = err.message || "Failed to analyze investigation";
      setError(errorMessage);
      toast({
        title: "Analysis Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (active && investigationId && !analysis && !loading) {
      // Auto-analyze when investigation becomes active
      const timer = setTimeout(() => {
        analyzeInvestigation();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [active, investigationId]);

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'critical': return 'text-red-600 border-red-600 bg-red-50';
      case 'high': return 'text-orange-600 border-orange-600 bg-orange-50';
      case 'medium': return 'text-yellow-600 border-yellow-600 bg-yellow-50';
      case 'low': return 'text-green-600 border-green-600 bg-green-50';
      default: return 'text-muted-foreground border-border bg-muted';
    }
  };

  if (!active) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground p-12">
        <div className="text-center space-y-3">
          <Brain className="w-16 h-16 mx-auto opacity-50" />
          <p className="text-lg">Start an investigation to activate AI analysis</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain className="w-6 h-6 text-primary" />
          <h2 className="text-xl font-semibold">AI Investigation Analysis</h2>
        </div>
        <Button
          onClick={analyzeInvestigation}
          disabled={loading || !investigationId}
          size="sm"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Search className="w-4 h-4 mr-2" />
              Run Analysis
            </>
          )}
        </Button>
      </div>

      {loading && !analysis && (
        <Card className="p-12 flex items-center justify-center">
          <div className="text-center space-y-3">
            <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
            <p className="text-muted-foreground">Analyzing investigation data...</p>
            <p className="text-sm text-muted-foreground">This may take a few moments</p>
          </div>
        </Card>
      )}

      {/* Error State with Retry */}
      {error && !loading && !analysis && (
        <Card className="p-8 border-destructive/50 bg-destructive/5">
          <div className="text-center space-y-4">
            <AlertTriangle className="w-12 h-12 mx-auto text-destructive" />
            <div>
              <h3 className="text-lg font-semibold text-destructive">Analysis Failed</h3>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
            </div>
            <Button
              onClick={analyzeInvestigation}
              variant="outline"
              className="border-destructive/50 hover:bg-destructive/10"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry Analysis
            </Button>
          </div>
        </Card>
      )}

      {analysis && (
        <div className="space-y-6">
          {/* Risk Assessment */}
          <Card className="p-6">
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-lg border-2 ${getRiskColor(analysis.riskLevel)}`}>
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-semibold">Risk Assessment</h3>
                  <Badge variant="outline" className={getRiskColor(analysis.riskLevel)}>
                    {analysis.riskLevel.toUpperCase()} RISK
                  </Badge>
                </div>
                <p className="text-muted-foreground leading-relaxed">{analysis.summary}</p>
              </div>
            </div>
          </Card>

          {/* Key Findings */}
          {analysis.keyFindings && analysis.keyFindings.length > 0 && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Key Findings
              </h3>
              <div className="space-y-3">
                {analysis.keyFindings.map((finding, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-semibold text-primary">{index + 1}</span>
                    </div>
                    <p className="text-sm leading-relaxed">{finding}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Patterns Detected */}
          {analysis.patterns && analysis.patterns.length > 0 && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <LinkIcon className="w-5 h-5 text-primary" />
                Patterns Detected
              </h3>
              <div className="space-y-2">
                {analysis.patterns.map((pattern, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card">
                    <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                    <p className="text-sm leading-relaxed">{pattern}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Related Persons */}
          {analysis.relatedPersons && analysis.relatedPersons.length > 0 && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Related Persons
              </h3>
              <div className="flex flex-wrap gap-2">
                {analysis.relatedPersons.map((person, index) => (
                  <Badge key={index} variant="secondary" className="text-sm py-1 px-3">
                    {person}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                These individuals appear frequently in the investigation data and may be connected to the target
              </p>
            </Card>
          )}

          {/* Anomalies */}
          {analysis.anomalies && analysis.anomalies.length > 0 && (
            <Card className="p-6 border-orange-200 bg-orange-50/50">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-orange-800">
                <AlertTriangle className="w-5 h-5" />
                Anomalies & Red Flags
              </h3>
              <div className="space-y-3">
                {analysis.anomalies.map((anomaly, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 rounded-lg bg-white border border-orange-200">
                    <AlertTriangle className="w-4 h-4 text-orange-600 flex-shrink-0 mt-1" />
                    <p className="text-sm leading-relaxed text-orange-900">{anomaly}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Recommendations */}
          {analysis.recommendations && analysis.recommendations.length > 0 && (
            <Card className="p-6 border-primary/30 bg-primary/5">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Search className="w-5 h-5 text-primary" />
                Recommended Next Steps
              </h3>
              <div className="space-y-3">
                {analysis.recommendations.map((rec, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 rounded-lg bg-background border border-border">
                    <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5">
                      {index + 1}
                    </div>
                    <p className="text-sm leading-relaxed">{rec}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default InvestigationAnalysis;
