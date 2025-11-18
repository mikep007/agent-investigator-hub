import { useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface InvestigationPanelProps {
  active: boolean;
}

interface LogEntry {
  id: string;
  timestamp: string;
  agent: string;
  message: string;
  status: "success" | "processing" | "pending";
}

const InvestigationPanel = ({ active }: InvestigationPanelProps) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    if (!active) {
      setLogs([]);
      return;
    }

    const mockLogs: Omit<LogEntry, "id" | "timestamp">[] = [
      { agent: "Social Media", message: "Found Instagram profile @target_user", status: "success" },
      { agent: "Image Analysis", message: "Analyzing profile photo metadata...", status: "processing" },
      { agent: "Image Analysis", message: "Detected birthday cake with 20 candles", status: "success" },
      { agent: "Timeline", message: "Estimating DOB from photo context", status: "processing" },
      { agent: "Social Media", message: "Found military service photo", status: "success" },
      { agent: "Correlation", message: "Cross-referencing rank insignia", status: "processing" },
      { agent: "Timeline", message: "Estimated service period: 2020-2023", status: "success" },
      { agent: "Correlation", message: "Building comprehensive profile", status: "processing" },
    ];

    let index = 0;
    const interval = setInterval(() => {
      if (index < mockLogs.length) {
        const newLog = {
          ...mockLogs[index],
          id: `log-${Date.now()}-${index}`,
          timestamp: new Date().toLocaleTimeString(),
        };
        setLogs(prev => [...prev, newLog]);
        index++;
      } else {
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [active]);

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
