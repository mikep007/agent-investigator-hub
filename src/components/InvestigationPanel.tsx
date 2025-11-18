import { useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface InvestigationPanelProps {
  active: boolean;
  investigationId: string | null;
}

interface LogEntry {
  id: string;
  timestamp: string;
  agent: string;
  message: string;
  status: "success" | "processing" | "pending";
}

const InvestigationPanel = ({ active, investigationId }: InvestigationPanelProps) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    if (!active || !investigationId) {
      setLogs([]);
      return;
    }

    const fetchFindings = async () => {
      const { data: findings, error } = await supabase
        .from('findings')
        .select('*')
        .eq('investigation_id', investigationId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching findings:', error);
        return;
      }

      if (findings) {
        const formattedLogs: LogEntry[] = findings.map((finding) => {
          const data = finding.data as any;
          let message = '';
          let status: "success" | "processing" | "pending" = "success";

          // Format message based on agent type and data
          if (finding.agent_type === 'social') {
            const profiles = data.profiles || [];
            const found = profiles.filter((p: any) => p.exists).length;
            message = found > 0 
              ? `Found ${found} social media profiles: ${profiles.filter((p: any) => p.exists).map((p: any) => p.platform).join(', ')}`
              : 'No social media profiles found';
          } else if (finding.agent_type === 'web') {
            message = data.abstract 
              ? `Web search found: ${data.abstractSource || 'information'}`
              : 'Web search completed - no results';
          } else if (finding.agent_type === 'email') {
            message = data.isValid 
              ? `Email validated: ${data.domain}`
              : 'Invalid email format';
          }

          return {
            id: finding.id,
            timestamp: new Date(finding.created_at).toLocaleTimeString(),
            agent: finding.agent_type.charAt(0).toUpperCase() + finding.agent_type.slice(1),
            message,
            status,
          };
        });

        setLogs(formattedLogs);
      }
    };

    fetchFindings();

    // Set up realtime subscription for new findings
    const channel = supabase
      .channel(`findings:${investigationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'findings',
          filter: `investigation_id=eq.${investigationId}`,
        },
        (payload) => {
          const finding = payload.new;
          const data = finding.data as any;
          let message = '';
          
          if (finding.agent_type === 'social') {
            const profiles = data.profiles || [];
            const found = profiles.filter((p: any) => p.exists).length;
            message = found > 0 
              ? `Found ${found} social media profiles: ${profiles.filter((p: any) => p.exists).map((p: any) => p.platform).join(', ')}`
              : 'No social media profiles found';
          } else if (finding.agent_type === 'web') {
            message = data.abstract 
              ? `Web search found: ${data.abstractSource || 'information'}`
              : 'Web search completed - no results';
          } else if (finding.agent_type === 'email') {
            message = data.isValid 
              ? `Email validated: ${data.domain}`
              : 'Invalid email format';
          }

          const newLog: LogEntry = {
            id: finding.id,
            timestamp: new Date(finding.created_at).toLocaleTimeString(),
            agent: finding.agent_type.charAt(0).toUpperCase() + finding.agent_type.slice(1),
            message,
            status: "success",
          };

          setLogs((prev) => [...prev, newLog]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [active, investigationId]);

  const getStatusIcon = (status: LogEntry["status"]) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="w-4 h-4 text-success" />;
      case "processing":
        return <Clock className="w-4 h-4 text-warning animate-pulse" />;
      case "pending":
        return <AlertCircle className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <ScrollArea className="h-[400px] pr-4">
      {logs.length === 0 && !active && (
        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
          <Clock className="w-12 h-12 mb-3 opacity-50" />
          <p className="text-sm">No active investigation</p>
        </div>
      )}

      {logs.length === 0 && active && (
        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
          <Clock className="w-12 h-12 mb-3 opacity-50 animate-pulse" />
          <p className="text-sm">Initializing agents...</p>
        </div>
      )}

      <div className="space-y-3">
        {logs.map((log, index) => (
          <div
            key={log.id}
            className={cn(
              "p-3 rounded-lg border border-border/50 bg-card/50 animate-in slide-in-from-right",
              "transition-all duration-300"
            )}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className="flex items-start gap-2">
              {getStatusIcon(log.status)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-xs">
                    {log.agent}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{log.timestamp}</span>
                </div>
                <p className="text-sm">{log.message}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
};

export default InvestigationPanel;
