import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Brain, ArrowLeft, TrendingUp, Shield, Users, Globe, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";

interface Investigation {
  id: string;
  target: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface InvestigationStats {
  id: string;
  target: string;
  status: string;
  created_at: string;
  totalFindings: number;
  findingsByType: Record<string, number>;
  platforms: string[];
  breaches: number;
  avgConfidence: number;
  verificationStatus: {
    verified: number;
    needs_review: number;
    inaccurate: number;
  };
}

const Comparison = () => {
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [comparisonData, setComparisonData] = useState<InvestigationStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
      }
    };
    checkAuth();
    fetchInvestigations();
  }, [navigate]);

  const fetchInvestigations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('investigations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setInvestigations(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch investigations",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(i => i !== id);
      } else if (prev.length < 4) {
        return [...prev, id];
      } else {
        toast({
          title: "Limit Reached",
          description: "You can compare up to 4 investigations at once",
        });
        return prev;
      }
    });
  };

  const compareInvestigations = async () => {
    if (selectedIds.length < 2) {
      toast({
        title: "Selection Required",
        description: "Please select at least 2 investigations to compare",
      });
      return;
    }

    setComparing(true);
    try {
      const statsPromises = selectedIds.map(async (id) => {
        const inv = investigations.find(i => i.id === id)!;
        
        const { data: findings, error } = await supabase
          .from('findings')
          .select('*')
          .eq('investigation_id', id);

        if (error) throw error;

        const stats: InvestigationStats = {
          id: inv.id,
          target: inv.target,
          status: inv.status,
          created_at: inv.created_at,
          totalFindings: findings?.length || 0,
          findingsByType: {},
          platforms: [],
          breaches: 0,
          avgConfidence: 0,
          verificationStatus: {
            verified: 0,
            needs_review: 0,
            inaccurate: 0,
          },
        };

        let totalConfidence = 0;
        let confidenceCount = 0;

        findings?.forEach((finding: any) => {
          const type = finding.agent_type;
          stats.findingsByType[type] = (stats.findingsByType[type] || 0) + 1;

          if (finding.confidence_score) {
            totalConfidence += finding.confidence_score;
            confidenceCount++;
          }

          if (finding.verification_status) {
            stats.verificationStatus[finding.verification_status as keyof typeof stats.verificationStatus]++;
          }

          const data = finding.data;
          if (type === 'Holehe' && data?.results) {
            data.results.forEach((r: any) => {
              if (r.exists && r.platform) stats.platforms.push(r.platform);
            });
          }
          if (type === 'Sherlock' && data?.profileLinks) {
            data.profileLinks.forEach((p: any) => stats.platforms.push(p.platform));
          }
          if (type?.toLowerCase().startsWith('leakcheck')) {
            stats.breaches++;
          }
        });

        stats.avgConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;
        stats.platforms = [...new Set(stats.platforms)];

        return stats;
      });

      const results = await Promise.all(statsPromises);
      setComparisonData(results);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to compare investigations",
        variant: "destructive",
      });
    } finally {
      setComparing(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/50';
      case 'completed': return 'bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/50';
      case 'pending': return 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/50';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <div className="min-h-screen bg-background grid-bg">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Brain className="w-8 h-8 text-primary cyber-glow" />
              <div>
                <h1 className="text-2xl font-bold text-glow">Investigation Comparison</h1>
                <p className="text-sm text-muted-foreground">Compare multiple investigations side-by-side</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        {comparisonData.length === 0 ? (
          <Card className="p-6">
            <h2 className="text-xl font-bold mb-4">Select Investigations to Compare</h2>
            <p className="text-muted-foreground mb-6">
              Choose 2-4 investigations to compare their findings, platforms, and metrics side-by-side.
            </p>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Clock className="h-8 w-8 animate-pulse text-primary" />
              </div>
            ) : investigations.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No investigations found. Create an investigation first.</p>
              </div>
            ) : (
              <>
                <ScrollArea className="h-[500px] pr-4">
                  <div className="space-y-3">
                    {investigations.map((inv) => (
                      <div
                        key={inv.id}
                        className={`flex items-start gap-4 p-4 rounded-lg border-2 transition-all cursor-pointer hover:border-primary/50 ${
                          selectedIds.includes(inv.id) ? 'border-primary bg-primary/5' : 'border-border'
                        }`}
                        onClick={() => toggleSelection(inv.id)}
                      >
                        <Checkbox
                          checked={selectedIds.includes(inv.id)}
                          onCheckedChange={() => toggleSelection(inv.id)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-4 mb-2">
                            <div>
                              <h3 className="font-semibold text-lg">{inv.target}</h3>
                              <p className="text-sm text-muted-foreground">
                                {new Date(inv.created_at).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </p>
                            </div>
                            <Badge variant="outline" className={getStatusColor(inv.status)}>
                              {inv.status}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                <div className="flex items-center justify-between mt-6 pt-6 border-t">
                  <p className="text-sm text-muted-foreground">
                    {selectedIds.length} of 4 investigations selected
                  </p>
                  <Button
                    onClick={compareInvestigations}
                    disabled={selectedIds.length < 2 || comparing}
                    size="lg"
                  >
                    {comparing ? (
                      <>
                        <Clock className="w-4 h-4 mr-2 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <TrendingUp className="w-4 h-4 mr-2" />
                        Compare Selected
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Actions Bar */}
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Comparison Results</h2>
              <Button variant="outline" onClick={() => setComparisonData([])}>
                Change Selection
              </Button>
            </div>

            {/* Comparison Grid */}
            <div className={`grid grid-cols-1 gap-6 ${comparisonData.length === 2 ? 'md:grid-cols-2' : comparisonData.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2 lg:grid-cols-4'}`}>
              {comparisonData.map((stats) => (
                <Card key={stats.id} className="p-6 space-y-6">
                  {/* Header */}
                  <div>
                    <h3 className="font-bold text-xl mb-2 truncate" title={stats.target}>
                      {stats.target}
                    </h3>
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className={getStatusColor(stats.status)}>
                        {stats.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(stats.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </div>

                  <Separator />

                  {/* Total Findings */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      Total Findings
                    </div>
                    <p className="text-3xl font-bold">{stats.totalFindings}</p>
                  </div>

                  {/* Average Confidence */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      Avg. Confidence
                    </div>
                    <p className="text-2xl font-bold">
                      {stats.avgConfidence > 0 ? `${stats.avgConfidence.toFixed(1)}%` : 'N/A'}
                    </p>
                  </div>

                  {/* Findings by Type */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold mb-3">
                      <Globe className="h-4 w-4 text-primary" />
                      Findings by Type
                    </div>
                    <div className="space-y-2">
                      {Object.entries(stats.findingsByType).map(([type, count]) => (
                        <div key={type} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{type}</span>
                          <Badge variant="secondary">{count}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Platforms */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Users className="h-4 w-4 text-primary" />
                      Platforms Found
                    </div>
                    <p className="text-2xl font-bold">{stats.platforms.length}</p>
                    {stats.platforms.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {stats.platforms.slice(0, 5).map((platform) => (
                          <Badge key={platform} variant="outline" className="text-xs">
                            {platform}
                          </Badge>
                        ))}
                        {stats.platforms.length > 5 && (
                          <Badge variant="outline" className="text-xs">
                            +{stats.platforms.length - 5} more
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Breaches */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Shield className="h-4 w-4 text-primary" />
                      Breaches Detected
                    </div>
                    <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                      {stats.breaches}
                    </p>
                  </div>

                  {/* Verification Status */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold mb-3">
                      <AlertTriangle className="h-4 w-4 text-primary" />
                      Verification Status
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-green-600 dark:text-green-400">Verified</span>
                        <Badge className="bg-green-500/20 text-green-700 dark:text-green-400">
                          {stats.verificationStatus.verified}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-yellow-600 dark:text-yellow-400">Needs Review</span>
                        <Badge className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-400">
                          {stats.verificationStatus.needs_review}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-red-600 dark:text-red-400">Inaccurate</span>
                        <Badge className="bg-red-500/20 text-red-700 dark:text-red-400">
                          {stats.verificationStatus.inaccurate}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {/* Comparison Summary */}
            <Card className="p-6">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Comparison Summary
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Highest Findings Count</p>
                  <p className="text-xl font-bold">
                    {Math.max(...comparisonData.map(d => d.totalFindings))} findings
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {comparisonData.find(d => d.totalFindings === Math.max(...comparisonData.map(d => d.totalFindings)))?.target}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Highest Confidence</p>
                  <p className="text-xl font-bold">
                    {Math.max(...comparisonData.map(d => d.avgConfidence)).toFixed(1)}%
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {comparisonData.find(d => d.avgConfidence === Math.max(...comparisonData.map(d => d.avgConfidence)))?.target}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Most Platforms</p>
                  <p className="text-xl font-bold">
                    {Math.max(...comparisonData.map(d => d.platforms.length))} platforms
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {comparisonData.find(d => d.platforms.length === Math.max(...comparisonData.map(d => d.platforms.length)))?.target}
                  </p>
                </div>
              </div>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
};

export default Comparison;
