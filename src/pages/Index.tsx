import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, Brain, Network, Search, UserSearch, Image, Clock, CheckCircle2, Target, LogOut } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import AgentGraph from "@/components/AgentGraph";
import InvestigationPanel from "@/components/InvestigationPanel";

const Index = () => {
  const [activeInvestigation, setActiveInvestigation] = useState(false);
  const [searchTarget, setSearchTarget] = useState("");
  const [loading, setLoading] = useState(false);
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

  const startInvestigation = async () => {
    if (!searchTarget.trim()) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('osint-start-investigation', {
        body: { target: searchTarget }
      });

      if (error) throw error;

      toast({
        title: "Investigation Started",
        description: `Now investigating: ${searchTarget}`,
      });
      setActiveInvestigation(true);
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

  const agents = [
    {
      id: "social",
      name: "Social Media Agent",
      icon: UserSearch,
      status: "active",
      task: "Finding social profiles",
      color: "text-primary"
    },
    {
      id: "image",
      name: "Image Analysis Agent",
      icon: Image,
      status: "processing",
      task: "Analyzing photos for metadata",
      color: "text-accent"
    },
    {
      id: "timeline",
      name: "Timeline Agent",
      icon: Clock,
      status: "idle",
      task: "Building activity timeline",
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
        {/* Search Input Panel */}
        <Card className="mb-8 p-6 bg-card/80 backdrop-blur border-border/50">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
            <div className="flex-1 w-full">
              <label className="text-sm font-medium mb-2 flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                Investigation Target
              </label>
              <Input
                placeholder="Enter name, username, email, or identifier..."
                value={searchTarget}
                onChange={(e) => setSearchTarget(e.target.value)}
                className="bg-background/50"
                disabled={activeInvestigation}
              />
            </div>
            <Button 
              onClick={() => {
                if (activeInvestigation) {
                  setActiveInvestigation(false);
                } else {
                  startInvestigation();
                }
              }}
              disabled={(!searchTarget.trim() && !activeInvestigation) || loading}
              className="cyber-glow"
            >
              <Search className="w-4 h-4 mr-2" />
              {loading ? "Starting..." : activeInvestigation ? "Stop Investigation" : "Start Investigation"}
            </Button>
          </div>
          {activeInvestigation && searchTarget && (
            <div className="mt-4 p-3 bg-primary/10 border border-primary/30 rounded-lg">
              <p className="text-sm">
                <span className="text-muted-foreground">Investigating:</span>{" "}
                <span className="text-primary font-semibold">{searchTarget}</span>
              </p>
            </div>
          )}
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
            <AgentGraph active={activeInvestigation} />
          </Card>

          {/* Investigation Results Panel */}
          <Card className="p-6 bg-card/80 backdrop-blur border-border/50">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Search className="w-5 h-5 text-primary" />
              Investigation Log
            </h2>
            <InvestigationPanel active={activeInvestigation} />
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
