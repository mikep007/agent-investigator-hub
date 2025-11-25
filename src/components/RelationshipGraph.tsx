import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Globe } from "lucide-react";

interface RelationshipGraphProps {
  active: boolean;
  investigationId: string | null;
  targetName?: string;
}

interface InvestigationNode {
  id: string;
  label: string;
  description: string;
  type: 'target' | 'investigation';
  agentType?: string;
  layer: number;
  count?: number;
}

const RelationshipGraph = ({ active, investigationId, targetName = "Target" }: RelationshipGraphProps) => {
  const [nodes, setNodes] = useState<InvestigationNode[]>([]);

  // Generate curved path between two points
  const generateCurvedPath = (x1: number, y1: number, x2: number, y2: number) => {
    const midY = y1 + (y2 - y1) * 0.3;
    return `M ${x1} ${y1} Q ${x1} ${midY}, ${(x1 + x2) / 2} ${(y1 + y2) / 2} T ${x2} ${y2}`;
  };

  useEffect(() => {
    if (!active || !investigationId) {
      setNodes([]);
      return;
    }

    const fetchFindings = async () => {
      const { data } = await supabase
        .from("findings")
        .select("*")
        .eq("investigation_id", investigationId)
        .order("created_at", { ascending: true });

      if (data && data.length > 0) {
        const newNodes: InvestigationNode[] = [];
        
        // Add target node at the top
        newNodes.push({
          id: 'target',
          label: targetName,
          description: 'OSINT Investigation',
          type: 'target',
          layer: 0,
        });

        // Count findings by agent type
        const agentCounts: { [key: string]: number } = {};
        data.forEach((finding) => {
          const agentType = finding.agent_type;
          agentCounts[agentType] = (agentCounts[agentType] || 0) + 1;
        });

        // Create investigation step nodes for each agent type found
        const agentDescriptions: { [key: string]: { label: string; description: string; layer: number } } = {
          'Holehe': { 
            label: 'Email Account Discovery', 
            description: 'Identify all linked accounts and services associated with the email address',
            layer: 1 
          },
          'OSINT Industries': { 
            label: 'Email Intelligence Report', 
            description: 'Comprehensive email intelligence including breach data and metadata',
            layer: 1 
          },
          'Web': { 
            label: 'Web Search Analysis', 
            description: 'Search the web for exact matches and public mentions',
            layer: 1 
          },
          'Sherlock': { 
            label: 'Username Enumeration', 
            description: 'Discover usernames across multiple platforms and social networks',
            layer: 1 
          },
          'Phone': { 
            label: 'Phone Number Lookup', 
            description: 'Verify and gather intelligence on phone numbers',
            layer: 2 
          },
          'Address': { 
            label: 'Location Investigation', 
            description: 'Research physical addresses and location data',
            layer: 2 
          },
          'LeakCheck': { 
            label: 'Breach Database Search', 
            description: 'Check for leaked credentials and compromised accounts',
            layer: 2 
          },
        };

        Object.keys(agentCounts).forEach((agentType) => {
          const agentInfo = agentDescriptions[agentType];
          if (agentInfo) {
            newNodes.push({
              id: `agent-${agentType}`,
              label: agentInfo.label,
              description: agentInfo.description,
              type: 'investigation',
              agentType: agentType,
              layer: agentInfo.layer,
              count: agentCounts[agentType],
            });
          }
        });

        setNodes(newNodes);
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [active, investigationId, targetName]);

  if (!active || nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center space-y-2">
          <Globe className="w-12 h-12 mx-auto opacity-50" />
          <p>Start an investigation to see the workflow graph</p>
        </div>
      </div>
    );
  }

  // Calculate layout positions
  const targetNode = nodes.find(n => n.type === 'target');
  const layer1Nodes = nodes.filter(n => n.layer === 1);
  const layer2Nodes = nodes.filter(n => n.layer === 2);

  const svgWidth = 1200;
  const svgHeight = 700;
  const nodeWidth = 280;
  const nodeHeight = 100;
  const targetY = 80;
  const layer1Y = 240;
  const layer2Y = 450;

  // Position nodes
  const positions: { [key: string]: { x: number; y: number } } = {};
  
  if (targetNode) {
    positions[targetNode.id] = { x: svgWidth / 2, y: targetY };
  }

  layer1Nodes.forEach((node, i) => {
    const spacing = Math.min(nodeWidth + 60, (svgWidth - 100) / layer1Nodes.length);
    const startX = (svgWidth - (layer1Nodes.length - 1) * spacing) / 2;
    positions[node.id] = { x: startX + i * spacing, y: layer1Y };
  });

  layer2Nodes.forEach((node, i) => {
    const spacing = Math.min(nodeWidth + 60, (svgWidth - 100) / layer2Nodes.length);
    const startX = (svgWidth - (layer2Nodes.length - 1) * spacing) / 2;
    positions[node.id] = { x: startX + i * spacing, y: layer2Y };
  });

  return (
    <div className="relative w-full h-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 rounded-lg border border-border overflow-auto">
      <svg
        width={svgWidth}
        height={svgHeight}
        className="w-full"
        style={{ minHeight: '700px' }}
      >
        {/* Draw curved connections from target to layer 1 */}
        {targetNode && layer1Nodes.map((node) => {
          const startPos = positions[targetNode.id];
          const endPos = positions[node.id];
          if (!startPos || !endPos) return null;

          return (
            <path
              key={`link-${targetNode.id}-${node.id}`}
              d={generateCurvedPath(startPos.x, startPos.y + 40, endPos.x, endPos.y - 10)}
              stroke="hsl(210, 80%, 60%)"
              strokeWidth="2"
              fill="none"
              opacity={0.6}
            />
          );
        })}

        {/* Draw curved connections from layer 1 to layer 2 */}
        {layer1Nodes.map((layer1Node) => {
          return layer2Nodes.map((layer2Node) => {
            const startPos = positions[layer1Node.id];
            const endPos = positions[layer2Node.id];
            if (!startPos || !endPos) return null;

            return (
              <path
                key={`link-${layer1Node.id}-${layer2Node.id}`}
                d={generateCurvedPath(startPos.x, startPos.y + nodeHeight/2 + 10, endPos.x, endPos.y - 10)}
                stroke="hsl(210, 60%, 50%)"
                strokeWidth="1.5"
                fill="none"
                opacity={0.4}
              />
            );
          });
        })}

        {/* Draw nodes */}
        {nodes.map((node) => {
          const pos = positions[node.id];
          if (!pos) return null;

          const isTarget = node.type === 'target';
          const boxWidth = isTarget ? 260 : nodeWidth;
          const boxHeight = isTarget ? 70 : nodeHeight;
          const x = pos.x - boxWidth / 2;
          const y = pos.y - boxHeight / 2;

          return (
            <g key={node.id}>
              {/* Node box */}
              <rect
                x={x}
                y={y}
                width={boxWidth}
                height={boxHeight}
                rx={8}
                fill={isTarget ? "hsl(220, 50%, 25%)" : "hsl(210, 70%, 45%)"}
                stroke={isTarget ? "hsl(210, 80%, 60%)" : "hsl(210, 80%, 55%)"}
                strokeWidth={isTarget ? 3 : 2}
                className="drop-shadow-lg"
              />

              {/* Node label */}
              <text
                x={pos.x}
                y={pos.y - (isTarget ? 12 : 20)}
                textAnchor="middle"
                fill="white"
                fontSize={isTarget ? "16" : "14"}
                fontWeight="600"
                className="pointer-events-none select-none"
              >
                {node.label}
              </text>

              {/* Node description */}
              {!isTarget && (
                <foreignObject
                  x={x + 10}
                  y={y + 30}
                  width={boxWidth - 20}
                  height={boxHeight - 35}
                >
                  <div className="text-white/80 text-xs leading-tight px-1">
                    {node.description}
                  </div>
                </foreignObject>
              )}

              {/* Target subtitle */}
              {isTarget && (
                <text
                  x={pos.x}
                  y={pos.y + 12}
                  textAnchor="middle"
                  fill="hsl(210, 80%, 70%)"
                  fontSize="13"
                  className="pointer-events-none select-none"
                >
                  {node.description}
                </text>
              )}

              {/* Count badge */}
              {node.count && node.count > 0 && (
                <g>
                  <circle
                    cx={x + boxWidth - 15}
                    cy={y + 15}
                    r="12"
                    fill="hsl(140, 70%, 45%)"
                    className="drop-shadow-md"
                  />
                  <text
                    x={x + boxWidth - 15}
                    y={y + 19}
                    textAnchor="middle"
                    fill="white"
                    fontSize="11"
                    fontWeight="700"
                    className="pointer-events-none select-none"
                  >
                    {node.count}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default RelationshipGraph;
