import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, Brain, Network, Search, UserSearch, Image, Clock, CheckCircle2, Target, LogOut, FileText, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import AgentGraph from "@/components/AgentGraph";
import InvestigationPanel from "@/components/InvestigationPanel";
import ReportDisplay from "@/components/ReportDisplay";

const Index = () => {
  const [activeInvestigation, setActiveInvestigation] = useState(false);
  const [currentInvestigationId, setCurrentInvestigationId] = useState<string | null>(null);
  const [searchTarget, setSearchTarget] = useState("");
  const [searchType, setSearchType] = useState<"name" | "username" | "email" | "phone">("name");
  const [loading, setLoading] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [report, setReport] = useState<{ report: string; target: string; generatedAt: string; findingsCount: number } | null>(null);
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

  const validateInput = (): boolean => {
    if (!searchTarget.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter a search target",
        variant: "destructive",
      });
      return false;
    }

    // Validate based on search type
    if (searchType === "email") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(searchTarget.trim())) {
        toast({
          title: "Invalid Email",
          description: "Please enter a valid email address",
          variant: "destructive",
        });
        return false;
      }
    } else if (searchType === "phone") {
      const phoneRegex = /^[\d\s\-\+\(\)]{10,}$/;
      if (!phoneRegex.test(searchTarget.trim())) {
        toast({
          title: "Invalid Phone",
          description: "Please enter a valid phone number (at least 10 digits)",
          variant: "destructive",
        });
        return false;
      }
    } else if (searchType === "username") {
      if (searchTarget.trim().length < 3) {
        toast({
          title: "Invalid Username",
          description: "Username must be at least 3 characters",
          variant: "destructive",
        });
        return false;
      }
    }

    return true;
  };

  const startInvestigation = async () => {
    if (!validateInput()) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('osint-start-investigation', {
        body: { 
          target: searchTarget,
          searchType: searchType
        }
      });

      if (error) throw error;

      toast({
        title: "Investigation Started",
        description: `Now investigating ${searchType}: ${searchTarget}`,
      });
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

  const agents = [
    {
      id: "holehe",
      name: "Holehe Email Scanner",
      icon: Brain,
      status: "active",
      task: "Checking 120+ platforms for email registration",
      color: "text-orange-500"
    },
    {
      id: "sherlock",
      name: "Sherlock Username Hunter",
      icon: UserSearch,
      status: "active",
      task: "Searching 399+ sites for username profiles",
      color: "text-cyan-500"
    },
    {
      id: "account_enum",
      name: "Account Enumeration Agent",
      icon: Activity,
      status: "active",
      task: "Checking 25+ platforms for registered accounts",
      color: "text-orange-500"
    },
    {
      id: "username",
      name: "Username Enumeration Agent",
      icon: Search,
      status: "active",
      task: "Checking username across platforms",
      color: "text-primary"
    },
    {
      id: "web",
      name: "Web Search Agent",
      icon: Search,
      status: "active",
      task: "Google search and web intel",
      color: "text-accent"
    },
    {
      id: "phone",
      name: "Phone Lookup Agent",
      icon: Activity,
      status: "active",
      task: "Validating phone numbers",
      color: "text-accent"
    },
    {
      id: "address",
      name: "Address Search Agent",
      icon: Target,
      status: "active",
      task: "Geocoding and location intel",
      color: "text-warning"
    },
    {
      id: "correlation",
      name: "Data Correlation Agent",
      icon: Network,
      status: "idle",
      task: "Cross-referencing findings",
      color: "text-cyber-glow"
    }
  ];

  return (
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
              <Badge variant="outline" className="border-primary text-primary">
                <Activity className="w-3 h-3 mr-1" />
                {agents.filter(a => a.status === "active").length} Active
              </Badge>
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        {/* Search Input Panel with Tabs */}
        <Card className="mb-8 p-6 bg-card/80 backdrop-blur border-border/50">
          <Tabs value={searchType} onValueChange={(v) => setSearchType(v as any)} className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-6">
              <TabsTrigger value="name">Name</TabsTrigger>
              <TabsTrigger value="username">Username</TabsTrigger>
              <TabsTrigger value="email">Email</TabsTrigger>
              <TabsTrigger value="phone">Phone</TabsTrigger>
            </TabsList>

            <TabsContent value="name" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name-input" className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary" />
                  Full Name
                </Label>
                <Input
                  id="name-input"
                  type="text"
                  placeholder="Enter first and last name..."
                  value={searchTarget}
                  onChange={(e) => setSearchTarget(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && startInvestigation()}
                  className="bg-background/50"
                  maxLength={100}
                  disabled={loading}
                />
                <p className="text-xs text-muted-foreground">
                  Search for social profiles, web presence, and address information
                </p>
              </div>
            </TabsContent>

            <TabsContent value="username" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username-input" className="flex items-center gap-2">
                  <UserSearch className="w-4 h-4 text-primary" />
                  Username / Handle
                </Label>
                <Input
                  id="username-input"
                  type="text"
                  placeholder="Enter username (without @)..."
                  value={searchTarget}
                  onChange={(e) => setSearchTarget(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && startInvestigation()}
                  className="bg-background/50"
                  maxLength={50}
                  disabled={loading}
                />
                <p className="text-xs text-muted-foreground">
                  Check username across 10+ platforms: GitHub, Reddit, Twitter, LinkedIn, and more
                </p>
              </div>
            </TabsContent>

            <TabsContent value="email" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email-input" className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-primary" />
                  Email Address
                </Label>
                <Input
                  id="email-input"
                  type="email"
                  placeholder="Enter email address..."
                  value={searchTarget}
                  onChange={(e) => setSearchTarget(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && startInvestigation()}
                  className="bg-background/50"
                  maxLength={255}
                  disabled={loading}
                />
                <p className="text-xs text-muted-foreground">
                  Validate email and discover associated social profiles
                </p>
              </div>
            </TabsContent>

            <TabsContent value="phone" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone-input" className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" />
                  Phone Number
                </Label>
                <Input
                  id="phone-input"
                  type="tel"
                  placeholder="Enter phone number..."
                  value={searchTarget}
                  onChange={(e) => setSearchTarget(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && startInvestigation()}
                  className="bg-background/50"
                  maxLength={20}
                  disabled={loading}
                />
                <p className="text-xs text-muted-foreground">
                  Lookup carrier, location, and validate phone number
                </p>
              </div>
            </TabsContent>

            <Button
              onClick={startInvestigation}
              disabled={loading || !searchTarget.trim()}
              className="w-full mt-4 cyber-glow"
              size="lg"
            >
              {loading ? (
                <>
                  <Activity className="w-4 h-4 mr-2 animate-spin" />
                  Investigating...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  Start Investigation
                </>
              )}
            </Button>
          </Tabs>
        </Card>

        {/* Agent Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {agents.map((agent) => (
            <Card key={agent.id} className="p-4 bg-card/80 backdrop-blur border-border/50 hover:border-primary/50 transition-all">
              <div className="flex items-start justify-between mb-3">
                <agent.icon className={`w-5 h-5 ${agent.color}`} />
                <Badge 
                  variant={agent.status === "active" ? "default" : agent.status === "processing" ? "secondary" : "outline"}
                  className="text-xs"
                >
                  {agent.status}
                </Badge>
              </div>
              <h3 className="font-semibold mb-1">{agent.name}</h3>
              <p className="text-xs text-muted-foreground">{agent.task}</p>
            </Card>
          ))}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Agent Workflow Graph */}
          <Card className="lg:col-span-2 p-6 bg-card/80 backdrop-blur border-border/50">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Network className="w-5 h-5 text-primary" />
                Agent Workflow Graph
              </h2>
              <Badge variant="outline" className="border-success text-success">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Connected to MCP
              </Badge>
        </div>

        {/* AI-Generated Report Section */}
        {report && (
          <div className="mt-6">
            <ReportDisplay
              report={report.report}
              target={report.target}
              generatedAt={report.generatedAt}
              findingsCount={report.findingsCount}
            />
          </div>
        )}
            <AgentGraph active={activeInvestigation} investigationId={currentInvestigationId} />
          </Card>

          {/* Investigation Results Panel */}
          <Card className="p-6 bg-card/80 backdrop-blur border-border/50">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Search className="w-5 h-5 text-primary" />
                Investigation Log
              </h2>
              {currentInvestigationId && (
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
              )}
            </div>
            <InvestigationPanel active={activeInvestigation} investigationId={currentInvestigationId} />
          </Card>
        </div>

        {/* Integration Info */}
        <Card className="mt-6 p-6 bg-card/80 backdrop-blur border-border/50">
          <h2 className="text-lg font-bold mb-4">Platform Integration</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border border-border/50 rounded-lg p-4">
              <h3 className="font-semibold mb-2 text-primary">MCP Server</h3>
              <p className="text-sm text-muted-foreground">
                Connected to OSINT tools via Multi-Component Platform server
              </p>
            </div>
            <div className="border border-border/50 rounded-lg p-4">
              <h3 className="font-semibold mb-2 text-accent">N8N Workflows</h3>
              <p className="text-sm text-muted-foreground">
                Visual automation workflows orchestrating agent tasks
              </p>
            </div>
            <div className="border border-border/50 rounded-lg p-4">
              <h3 className="font-semibold mb-2 text-warning">AI Agents SDK</h3>
              <p className="text-sm text-muted-foreground">
                Multiple autonomous agents working in parallel
              </p>
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
};

export default Index;
