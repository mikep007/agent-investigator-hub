import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, Network, LogOut, FileText, Activity, CheckCircle2, Search, GitCompare, FolderOpen, Share2, Clock, Save, ArrowRight, X, Fingerprint, Navigation, Menu } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import InvestigationAnalysis from "@/components/InvestigationAnalysis";
import InvestigationPanel from "@/components/InvestigationPanel";
import ReportDisplay from "@/components/ReportDisplay";
import ComprehensiveSearchForm from "@/components/ComprehensiveSearchForm";
import RelationshipGraph from "@/components/RelationshipGraph";
import OSINTLinkMap, { PivotData } from "@/components/OSINTLinkMap";
import PalantirLinkGraph from "@/components/PalantirLinkGraph";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SaveToCaseDialog from "@/components/cases/SaveToCaseDialog";
import InvestigationBreadcrumb from "@/components/InvestigationBreadcrumb";
import EnrichInvestigation from "@/components/EnrichInvestigation";
import { usePowerAutomatePolling } from "@/hooks/usePowerAutomatePolling";
import AIInsightsPanel from "@/components/AIInsightsPanel";

interface InvestigationHistoryItem {
  id: string;
  name: string;
  investigationId: string | null;
}

interface SearchFormRef {
  setSearchData: (data: Partial<SearchData>) => void;
}

interface SearchData {
  fullName?: string;
  address?: string;
  email?: string;
  phone?: string;
  username?: string;
}

interface PendingPivot {
  type: string;
  value: string;
}

const STORAGE_KEY = 'osint-investigation-state';

const Index = () => {
  // Load initial state from sessionStorage
  const loadPersistedState = () => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to load persisted state:', e);
    }
    return null;
  };

  const persistedState = loadPersistedState();

  const [activeInvestigation, setActiveInvestigation] = useState(persistedState?.activeInvestigation ?? false);
  const [currentInvestigationId, setCurrentInvestigationId] = useState<string | null>(persistedState?.currentInvestigationId ?? null);
  const [loading, setLoading] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [report, setReport] = useState<{ report: string; target: string; generatedAt: string; findingsCount: number } | null>(persistedState?.report ?? null);
  const [targetName, setTargetName] = useState<string>(persistedState?.targetName ?? "");
  const [pivotSearchData, setPivotSearchData] = useState<Partial<SearchData> | null>(null);
  const [pivotConfirmDialog, setPivotConfirmDialog] = useState(false);
  const [pendingPivot, setPendingPivot] = useState<PendingPivot | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [investigationHistory, setInvestigationHistory] = useState<InvestigationHistoryItem[]>(persistedState?.investigationHistory ?? []);
  const [originalSearchData, setOriginalSearchData] = useState<SearchData | null>(persistedState?.originalSearchData ?? null);
  const [findings, setFindings] = useState<any[]>(persistedState?.findings ?? []);
  const [parsedBooleanQuery, setParsedBooleanQuery] = useState<any>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Persist state to sessionStorage whenever key values change
  useEffect(() => {
    const stateToStore = {
      activeInvestigation,
      currentInvestigationId,
      report,
      targetName,
      investigationHistory,
      originalSearchData,
      findings,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stateToStore));
  }, [activeInvestigation, currentInvestigationId, report, targetName, investigationHistory, originalSearchData, findings]);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
      }
    };
    checkAuth();
  }, [navigate]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  // Fetch findings when investigation changes
  // Extract fetchFindings so it can be called from other places
  const fetchFindings = useCallback(async () => {
    if (!currentInvestigationId) return;
    
    const { data } = await supabase
      .from('findings')
      .select('*')
      .eq('investigation_id', currentInvestigationId);
    
    if (data) {
      setFindings(data);
    }
  }, [currentInvestigationId]);

  useEffect(() => {
    if (!currentInvestigationId) {
      setFindings([]);
      return;
    }

    fetchFindings();

    // Subscribe to new findings
    const channel = supabase
      .channel(`findings-${currentInvestigationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'findings',
          filter: `investigation_id=eq.${currentInvestigationId}`,
        },
        () => fetchFindings()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentInvestigationId, fetchFindings]);

  // Power Automate polling - keeps investigation active while polling for results
  const { isPolling: isPowerAutomatePolling } = usePowerAutomatePolling({
    investigationId: currentInvestigationId,
    findings,
    onResultsReceived: () => {
      toast({
        title: "Global Findings Ready",
        description: "Power Automate results have been received and integrated.",
      });
    },
    refetchFindings: fetchFindings
  });

  // Check if we should show as still investigating
  // Data is complete when status is 'complete' OR has persons data
  const hasPendingPowerAutomate = findings.some(f => {
    if (f.agent_type !== 'Power_automate') return false;
    const data = f.data as any;
    const hasPersonsData = data?.persons && Array.isArray(data.persons);
    const isExplicitlyComplete = data?.status === 'complete' || data?.pending === false;
    const isPending = !isExplicitlyComplete && !hasPersonsData && (data?.pending === true || data?.status === 'pending');
    return isPending;
  });

  const startComprehensiveInvestigation = async (searchData: {
    fullName: string;
    address: string;
    email: string;
    phone: string;
    username: string;
    _parsedQuery?: any;
    _excludeTerms?: string[];
  }) => {
    setLoading(true);
    const name = searchData.fullName || searchData.username || searchData.email || "Target";
    setTargetName(name);
    setOriginalSearchData(searchData);
    setFindings([]); // Reset findings for new investigation
    
    // Store parsed boolean query if present (for AI insights)
    if (searchData._parsedQuery) {
      setParsedBooleanQuery(searchData._parsedQuery);
    } else {
      setParsedBooleanQuery(null);
    }
    
    try {
      const { data, error } = await supabase.functions.invoke('osint-comprehensive-investigation', {
        body: searchData
      });

      if (error) throw error;

      setActiveInvestigation(true);
      setCurrentInvestigationId(data.investigationId);
      
      // Add to investigation history
      setInvestigationHistory(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          name,
          investigationId: data.investigationId,
        }
      ]);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to start investigation",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async () => {
    if (!currentInvestigationId) {
      toast({
        title: "No Investigation",
        description: "Please start an investigation first",
        variant: "destructive",
      });
      return;
    }

    setGeneratingReport(true);
    setReport(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-osint-report', {
        body: { investigationId: currentInvestigationId }
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      setReport(data);
      toast({
        title: "Report Generated",
        description: "AI-powered investigation report is ready",
      });
    } catch (error: any) {
      toast({
        title: "Report Generation Failed",
        description: error.message || "Failed to generate report",
        variant: "destructive",
      });
    } finally {
      setGeneratingReport(false);
    }
  };

  // Handle pivot from link map or relatives card
  const handlePivot = (pivotDataOrType: PivotData | string, valueArg?: string) => {
    // Normalize the pivot data format - can be called with PivotData object or (type, value) args
    const type = typeof pivotDataOrType === 'string' ? pivotDataOrType : pivotDataOrType.type;
    const value = typeof pivotDataOrType === 'string' ? valueArg! : pivotDataOrType.value;
    
    // If there's an active investigation, show confirmation dialog
    if (activeInvestigation && currentInvestigationId) {
      setPendingPivot({ type, value });
      setPivotConfirmDialog(true);
      return;
    }
    
    // No active investigation, proceed directly
    executePivot(type, value);
  };

  // Execute the pivot after confirmation
  const executePivot = (type: string, value: string) => {
    const newSearchData: Partial<SearchData> = {};
    
    switch (type) {
      case 'username':
        newSearchData.username = value;
        break;
      case 'email':
        newSearchData.email = value;
        break;
      case 'phone':
        newSearchData.phone = value;
        break;
      case 'name':
        newSearchData.fullName = value;
        break;
      case 'address':
        newSearchData.address = value;
        break;
    }
    
    setPivotSearchData(newSearchData);
    setPivotConfirmDialog(false);
    setPendingPivot(null);
    
    // Scroll to search form
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    toast({
      title: "Pivot Ready",
      description: `Search pre-filled with ${type}: "${value}". Click Start Investigation to begin.`,
    });
  };

  // Handle save and pivot
  const handleSaveAndPivot = () => {
    setPivotConfirmDialog(false);
    setShowSaveDialog(true);
  };

  // After saving, execute the pivot
  const handleAfterSave = () => {
    setShowSaveDialog(false);
    if (pendingPivot) {
      executePivot(pendingPivot.type, pendingPivot.value);
    }
  };

  // Handle enriched re-run
  const handleEnrichedRerun = (enrichedData: any) => {
    // Reset investigation and pre-fill with enriched data
    setActiveInvestigation(false);
    setCurrentInvestigationId(null);
    setPivotSearchData(enrichedData);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    toast({
      title: "Re-run Ready",
      description: "Search form updated with selected data. Click Start Investigation to begin.",
    });
  };

  // Navigate to a previous investigation in the history
  const handleHistoryNavigate = (index: number) => {
    const item = investigationHistory[index];
    if (item && item.investigationId) {
      setCurrentInvestigationId(item.investigationId);
      setTargetName(item.name);
      setActiveInvestigation(true);
      // Trim history to this point
      setInvestigationHistory(prev => prev.slice(0, index + 1));
      toast({
        title: "Navigated Back",
        description: `Viewing investigation for "${item.name}"`,
      });
    }
  };
  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background grid-bg">
        {/* Header */}
        <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm">
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Brain className="w-8 h-8 text-primary cyber-glow" />
                <div>
                  <h1 className="text-2xl font-bold text-glow">OSINT Agent Orchestra</h1>
                  <p className="text-sm text-muted-foreground">Multi-Agent Investigation Platform</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Menu className="w-4 h-4 mr-2" />
                      Tools
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={() => navigate('/cases')}>
                      <FolderOpen className="w-4 h-4 mr-2" />
                      Case Files
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/comparison')}>
                      <GitCompare className="w-4 h-4 mr-2" />
                      Compare Investigations
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/selector-enrichment')}>
                      <Fingerprint className="w-4 h-4 mr-2" />
                      Selector Enrichment
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate('/breach-monitoring')}>
                      <Activity className="w-4 h-4 mr-2" />
                      Breach Monitor
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/waze')}>
                      <Navigation className="w-4 h-4 mr-2" />
                      Waze Tracker
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={handleSignOut}>
                      <LogOut className="w-4 h-4 mr-2" />
                      Sign Out
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Sign out from your account</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-6 py-8">
          {/* Comprehensive Search Form */}
          <ComprehensiveSearchForm 
            onStartInvestigation={startComprehensiveInvestigation}
            loading={loading}
            pivotData={pivotSearchData}
            onPivotConsumed={() => setPivotSearchData(null)}
          />

          {/* Investigation History Breadcrumb */}
          {investigationHistory.length > 0 && (
            <div className="mb-6">
              <InvestigationBreadcrumb 
                history={investigationHistory}
                onNavigate={handleHistoryNavigate}
              />
            </div>
          )}

          {/* Investigation Log - Full Width Landscape */}
          <Card className="bg-card/80 backdrop-blur border-border/50 overflow-hidden mb-6">
            <div className="px-6 pt-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Search className="w-5 h-5 text-primary" />
                  Investigation Log
                </h2>
                {currentInvestigationId && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={generateReport}
                        disabled={generatingReport || !activeInvestigation}
                        size="sm"
                        className="gap-2"
                      >
                        {generatingReport ? (
                          <>
                            <Activity className="w-4 h-4 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <FileText className="w-4 h-4" />
                            Generate Report
                          </>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Generate AI-powered investigation report</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
            <InvestigationPanel active={activeInvestigation} investigationId={currentInvestigationId} onPivot={handlePivot} />
          </Card>

          {/* Enrich & Re-run Investigation */}
          {activeInvestigation && originalSearchData && findings.length > 0 && (
            <div className="mb-6">
              <EnrichInvestigation
                findings={findings}
                originalSearchData={originalSearchData}
                onRerun={handleEnrichedRerun}
              />
            </div>
          )}

          {/* AI Insights Panel - Shows for boolean query searches */}
          {activeInvestigation && parsedBooleanQuery && findings.length > 0 && (
            <div className="mb-6">
              <AIInsightsPanel
                results={findings.flatMap(f => f.data?.items || [])}
                parsedQuery={parsedBooleanQuery}
                autoGenerate={false}
              />
            </div>
          )}

          {/* Full-Width Palantir Link Graph */}
          <Card className="mb-6 p-0 bg-transparent border-border/50 overflow-hidden">
            <PalantirLinkGraph 
              active={activeInvestigation} 
              investigationId={currentInvestigationId}
              targetName={targetName}
              onPivot={handlePivot}
            />
          </Card>

          {/* Visualization and Analysis Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Graph Visualization with Tabs */}
            <Card className="p-6 bg-card/80 backdrop-blur border-border/50">
              <Tabs defaultValue="linkmap" className="w-full">
                <div className="flex items-center justify-between mb-4">
                  <TabsList className="grid grid-cols-2 w-auto">
                    <TabsTrigger value="linkmap" className="gap-2">
                      <Share2 className="w-4 h-4" />
                      Link Map
                    </TabsTrigger>
                    <TabsTrigger value="timeline" className="gap-2">
                      <Clock className="w-4 h-4" />
                      Timeline
                    </TabsTrigger>
                  </TabsList>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="border-success text-success cursor-help">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Connected to MCP
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>MCP Server integration active</TooltipContent>
                  </Tooltip>
                </div>
                
                <TabsContent value="linkmap" className="mt-0">
                  <div className="min-h-[500px]">
                    <OSINTLinkMap 
                      active={activeInvestigation} 
                      investigationId={currentInvestigationId}
                      targetName={targetName}
                      onPivot={handlePivot}
                    />
                  </div>
                </TabsContent>
                
                <TabsContent value="timeline" className="mt-0">
                  <div className="min-h-[500px]">
                    <RelationshipGraph 
                      active={activeInvestigation} 
                      investigationId={currentInvestigationId}
                      targetName={targetName}
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </Card>

            {/* AI Analysis */}
            <Card className="p-6 bg-card/80 backdrop-blur border-border/50">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Brain className="w-5 h-5 text-primary" />
                  AI Investigation Analysis
                </h2>
              </div>
              
              {/* AI-Generated Report Section */}
              {report && (
                <div className="mb-6">
                  <ReportDisplay
                    report={report.report}
                    target={report.target}
                    generatedAt={report.generatedAt}
                    findingsCount={report.findingsCount}
                  />
                </div>
              )}
              
              <div className="min-h-[500px]">
                <InvestigationAnalysis 
                  active={activeInvestigation} 
                  investigationId={currentInvestigationId}
                />
              </div>
            </Card>
          </div>

          {/* Integration Info */}
          <Card className="mt-6 p-6 bg-card/80 backdrop-blur border-border/50">
            <h2 className="text-lg font-bold mb-4">Platform Integration</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="border border-border/50 rounded-lg p-4 hover:border-primary/50 transition-colors cursor-help">
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <Brain className="w-4 h-4 text-primary" />
                      MCP Server
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Orchestrates OSINT tools (Sherlock, Holehe, Maigret) for comprehensive reconnaissance
                    </p>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Model Context Protocol server manages OSINT tool execution</TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="border border-border/50 rounded-lg p-4 hover:border-primary/50 transition-colors cursor-help">
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <Network className="w-4 h-4 text-primary" />
                      N8N Workflows
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Automated investigation pipelines connecting multiple data sources and APIs
                    </p>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Workflow automation for investigation orchestration</TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="border border-border/50 rounded-lg p-4 hover:border-primary/50 transition-colors cursor-help">
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-primary" />
                      AI Agents SDK
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Intelligent correlation and analysis of cross-referenced investigation data
                    </p>
                  </div>
                </TooltipTrigger>
                <TooltipContent>AI-powered data correlation and insights</TooltipContent>
              </Tooltip>
            </div>
          </Card>
        </main>

        {/* Pivot Confirmation Dialog */}
        <AlertDialog open={pivotConfirmDialog} onOpenChange={setPivotConfirmDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Search className="h-5 w-5 text-primary" />
                Start New Investigation?
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <p>
                  You're about to pivot to investigate: <strong className="text-foreground">{pendingPivot?.value}</strong>
                </p>
                <p className="text-muted-foreground">
                  You have an active investigation for "{targetName}". Would you like to save it to a case before starting the new investigation?
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
              <AlertDialogCancel className="flex items-center gap-2">
                <X className="h-4 w-4" />
                Cancel
              </AlertDialogCancel>
              <Button
                variant="outline"
                onClick={() => {
                  if (pendingPivot) {
                    executePivot(pendingPivot.type, pendingPivot.value);
                  }
                }}
                className="flex items-center gap-2"
              >
                <ArrowRight className="h-4 w-4" />
                Pivot Without Saving
              </Button>
              <Button
                onClick={handleSaveAndPivot}
                className="flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                Save & Pivot
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Save to Case Dialog */}
        <SaveToCaseDialog
          open={showSaveDialog}
          onOpenChange={(open) => {
            setShowSaveDialog(open);
            if (!open && pendingPivot) {
              executePivot(pendingPivot.type, pendingPivot.value);
            }
          }}
          item={currentInvestigationId ? {
            item_type: 'finding',
            title: `Investigation: ${targetName}`,
            content: { investigationId: currentInvestigationId, targetName },
            source_investigation_id: currentInvestigationId,
            tags: ['pivoted-from'],
          } : null}
        />
      </div>
    </TooltipProvider>
  );
}

export default Index;
