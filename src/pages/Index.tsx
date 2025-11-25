import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, Network, LogOut, FileText, Activity, CheckCircle2, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import InvestigationAnalysis from "@/components/InvestigationAnalysis";
import InvestigationPanel from "@/components/InvestigationPanel";
import ReportDisplay from "@/components/ReportDisplay";
import ComprehensiveSearchForm from "@/components/ComprehensiveSearchForm";
import RelationshipGraph from "@/components/RelationshipGraph";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Index = () => {
  const [activeInvestigation, setActiveInvestigation] = useState(false);
  const [currentInvestigationId, setCurrentInvestigationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [report, setReport] = useState<{ report: string; target: string; generatedAt: string; findingsCount: number } | null>(null);
  const [targetName, setTargetName] = useState<string>("");
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
  }, [navigate]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const startComprehensiveInvestigation = async (searchData: {
    fullName: string;
    address: string;
    email: string;
    phone: string;
    username: string;
  }) => {
    setLoading(true);
    setTargetName(searchData.fullName || searchData.username || searchData.email || "Target");
    try {
      const { data, error } = await supabase.functions.invoke('osint-comprehensive-investigation', {
        body: searchData
      });

      if (error) throw error;

      setActiveInvestigation(true);
      setCurrentInvestigationId(data.investigationId);
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={() => navigate('/breach-monitoring')}>
                      <Activity className="w-4 h-4 mr-2" />
                      Breach Monitor
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Monitor subjects for data breaches</TooltipContent>
                </Tooltip>
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
          />


          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Graph Visualization */}
            <Card className="lg:col-span-2 p-6 bg-card/80 backdrop-blur border-border/50">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Network className="w-5 h-5 text-primary" />
                  Investigation Visualization
                </h2>
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

              <Tabs defaultValue="timeline" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="timeline">Digital Footprint Timeline</TabsTrigger>
                  <TabsTrigger value="analysis">AI Investigation Analysis</TabsTrigger>
                </TabsList>
                <TabsContent value="timeline" className="min-h-[600px]">
                  <RelationshipGraph 
                    active={activeInvestigation} 
                    investigationId={currentInvestigationId}
                    targetName={targetName}
                  />
                </TabsContent>
                <TabsContent value="analysis" className="min-h-[600px]">
                  <InvestigationAnalysis 
                    active={activeInvestigation} 
                    investigationId={currentInvestigationId}
                  />
                </TabsContent>
              </Tabs>
            </Card>

            {/* Investigation Results Panel */}
            <Card className="p-6 bg-card/80 backdrop-blur border-border/50">
              <div className="flex items-center justify-between mb-6">
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
              <InvestigationPanel active={activeInvestigation} investigationId={currentInvestigationId} />
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
      </div>
    </TooltipProvider>
  );
}

export default Index;
