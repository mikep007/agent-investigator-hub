import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface AgentGraphProps {
  active: boolean;
  investigationId: string | null;
}

interface NodeData {
  emails: string[];
  usernames: string[];
  phones: string[];
  social: string[];
  addresses: string[];
  relatives: string[];
}

const AgentGraph = ({ active, investigationId }: AgentGraphProps) => {
  const [pulseNodes, setPulseNodes] = useState<number[]>([]);
  const [nodeData, setNodeData] = useState<NodeData>({
    emails: [],
    usernames: [],
    phones: [],
    social: [],
    addresses: [],
    relatives: [],
  });

  useEffect(() => {
    if (!active || !investigationId) {
      setPulseNodes([]);
      setNodeData({
        emails: [],
        usernames: [],
        phones: [],
        social: [],
        addresses: [],
        relatives: [],
      });
      return;
    }

    const fetchFindings = async () => {
      const { data } = await supabase
        .from("findings")
        .select("*")
        .eq("investigation_id", investigationId)
        .order("created_at", { ascending: true });

      if (data) {
        const newData: NodeData = {
          emails: [],
          usernames: [],
          phones: [],
          social: [],
          addresses: [],
          relatives: [],
        };

        data.forEach((finding) => {
          const findingData = finding.data as any;
          
          if (finding.agent_type === "Holehe" && findingData.found) {
            findingData.results?.forEach((result: any) => {
              if (result.exists && result.platform && !newData.emails.includes(result.platform)) {
                newData.emails.push(result.platform);
              }
            });
          }
          
          if (finding.agent_type === "Sherlock" && findingData.found) {
            findingData.platforms?.forEach((platform: any) => {
              if (platform.exists && !newData.usernames.includes(platform.platform)) {
                newData.usernames.push(platform.platform);
              }
            });
          }
          
          if ((finding.agent_type === "Social" || finding.agent_type === "Social_email" || finding.agent_type === "Social_username") && findingData.profiles) {
            findingData.profiles.forEach((profile: any) => {
              if (profile.exists && !newData.social.includes(profile.platform)) {
                newData.social.push(profile.platform);
              }
            });
          }
          
          if (finding.agent_type === "Phone" && findingData.valid) {
            if (!newData.phones.includes(findingData.number || "Found")) {
              newData.phones.push(findingData.number || "Found");
            }
          }
          
          if (finding.agent_type === "Address" && findingData.found) {
            if (!newData.addresses.includes(findingData.location || "Found")) {
              newData.addresses.push(findingData.location || "Found");
            }
          }
        });

        setNodeData(newData);
      }
    };

    fetchFindings();

    const channel = supabase
      .channel(`findings:${investigationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "findings",
          filter: `investigation_id=eq.${investigationId}`,
        },
        () => {
          fetchFindings();
        }
      )
      .subscribe();

    const interval = setInterval(() => {
      setPulseNodes(prev => {
        const next = [...prev];
        if (next.length < 6) {
          next.push(next.length);
        } else {
          next.shift();
          next.push((next[next.length - 1] + 1) % 6);
        }
        return next;
      });
    }, 1200);

    return () => {
      clearInterval(interval);
      channel.unsubscribe();
    };
  }, [active, investigationId]);

  const nodes = [
    { id: 0, x: 80, y: 150, label: "Email", color: "primary", data: nodeData.emails },
    { id: 1, x: 250, y: 80, label: "Username", color: "primary", data: nodeData.usernames },
    { id: 2, x: 250, y: 220, label: "Phone", color: "accent", data: nodeData.phones },
    { id: 3, x: 420, y: 80, label: "Social", color: "cyber-glow", data: nodeData.social },
    { id: 4, x: 420, y: 150, label: "Address", color: "primary", data: nodeData.addresses },
    { id: 5, x: 420, y: 220, label: "Relatives", color: "accent", data: nodeData.relatives },
  ];

  const edges = [
    { from: 0, to: 1 },
    { from: 0, to: 2 },
    { from: 1, to: 3 },
    { from: 2, to: 5 },
    { from: 1, to: 4 },
    { from: 3, to: 4 },
    { from: 4, to: 5 },
  ];

  return (
    <div className="relative h-[300px] rounded-lg border border-border/30 bg-background/50 overflow-hidden">
      <svg className="w-full h-full">
        {/* Draw edges */}
        {edges.map((edge, i) => {
          const from = nodes.find(n => n.id === edge.from)!;
          const to = nodes.find(n => n.id === edge.to)!;
          const isActive = pulseNodes.includes(edge.from) && pulseNodes.includes(edge.to);
          
          return (
            <line
              key={i}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={isActive ? "hsl(var(--primary))" : "hsl(var(--border))"}
              strokeWidth={isActive ? "3" : "2"}
              className={cn("transition-all duration-500", isActive && "opacity-100", !isActive && "opacity-30")}
              strokeDasharray={isActive ? "0" : "5,5"}
            />
          );
        })}

        {/* Draw nodes */}
        {nodes.map((node) => {
          const isActive = pulseNodes.includes(node.id);
          const hasData = node.data && node.data.length > 0;
          const dataCount = node.data?.length || 0;
          
          return (
            <g key={node.id}>
              <circle
                cx={node.x}
                cy={node.y}
                r={isActive ? "28" : "24"}
                fill={`hsl(var(--${node.color}))`}
                className={cn(
                  "transition-all duration-500",
                  isActive && "opacity-100 drop-shadow-[0_0_15px_hsl(var(--primary))]",
                  !isActive && "opacity-60"
                )}
              />
              {hasData && (
                <circle
                  cx={node.x + 18}
                  cy={node.y - 18}
                  r="12"
                  fill="hsl(var(--accent))"
                  className="drop-shadow-[0_0_8px_hsl(var(--accent))]"
                />
              )}
              {hasData && (
                <text
                  x={node.x + 18}
                  y={node.y - 14}
                  textAnchor="middle"
                  className="text-xs font-bold fill-accent-foreground"
                >
                  {dataCount}
                </text>
              )}
              <text
                x={node.x}
                y={node.y + 45}
                textAnchor="middle"
                className="text-xs font-medium fill-foreground"
              >
                {node.label}
              </text>
              {hasData && node.data && node.data.length > 0 && (
                <text
                  x={node.x}
                  y={node.y + 60}
                  textAnchor="middle"
                  className="text-[10px] fill-muted-foreground"
                >
                  {node.data[0].length > 15 ? node.data[0].substring(0, 12) + "..." : node.data[0]}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Overlay when not active */}
      {!active && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <p className="text-muted-foreground text-sm">Click "Start Investigation" to activate agents</p>
        </div>
      )}
    </div>
  );
};

export default AgentGraph;
