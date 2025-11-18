import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface AgentGraphProps {
  active: boolean;
}

const AgentGraph = ({ active }: AgentGraphProps) => {
  const [pulseNodes, setPulseNodes] = useState<number[]>([]);

  useEffect(() => {
    if (!active) {
      setPulseNodes([]);
      return;
    }

    const interval = setInterval(() => {
      setPulseNodes(prev => {
        const next = [...prev];
        if (next.length < 4) {
          next.push(next.length);
        } else {
          next.shift();
          next.push((next[next.length - 1] + 1) % 4);
        }
        return next;
      });
    }, 1500);

    return () => clearInterval(interval);
  }, [active]);

  const nodes = [
    { id: 0, x: 50, y: 50, label: "Input", color: "primary" },
    { id: 1, x: 250, y: 30, label: "Social", color: "primary" },
    { id: 2, x: 250, y: 120, label: "Image", color: "accent" },
    { id: 3, x: 450, y: 75, label: "Correlate", color: "cyber-glow" },
  ];

  const edges = [
    { from: 0, to: 1 },
    { from: 0, to: 2 },
    { from: 1, to: 3 },
    { from: 2, to: 3 },
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
              <text
                x={node.x}
                y={node.y + 45}
                textAnchor="middle"
                className="text-xs font-medium fill-foreground"
              >
                {node.label}
              </text>
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
