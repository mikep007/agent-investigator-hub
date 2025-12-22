import { useState, useEffect, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { 
  Mail, Phone, User, AtSign, MapPin, Users, Globe, Shield, 
  AlertTriangle, ChevronRight, Maximize2, Minimize2, Eye
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface OSINTLinkMapProps {
  investigationId: string | null;
  targetName?: string;
  active: boolean;
}

interface NodeData {
  id: string;
  label: string;
  type: "root" | "category" | "entity" | "discovery";
  icon: React.ReactNode;
  color: string;
  children: NodeData[];
  metadata?: {
    source?: string;
    confidence?: number;
    verified?: boolean;
    url?: string;
    platform?: string;
  };
  expanded?: boolean;
}

interface Finding {
  id: string;
  agent_type: string;
  source: string;
  data: any;
  confidence_score?: number;
  verification_status?: string;
  created_at: string;
}

const NODE_COLORS = {
  root: "hsl(var(--primary))",
  email: "#3B82F6",
  phone: "#10B981",
  username: "#8B5CF6",
  social: "#EC4899",
  address: "#F59E0B",
  relatives: "#EF4444",
  breach: "#DC2626",
  web: "#6366F1",
};

const OSINTLinkMap = ({ investigationId, targetName, active }: OSINTLinkMapProps) => {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(["root"]));
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!active || !investigationId) {
      setFindings([]);
      return;
    }

    const fetchFindings = async () => {
      const { data } = await supabase
        .from("findings")
        .select("*")
        .eq("investigation_id", investigationId)
        .order("created_at", { ascending: true });

      if (data) {
        setFindings(data as Finding[]);
      }
    };

    fetchFindings();

    const channel = supabase
      .channel(`osint-linkmap:${investigationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "findings",
          filter: `investigation_id=eq.${investigationId}`,
        },
        () => fetchFindings()
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [active, investigationId]);

  const buildNodeTree = useMemo((): NodeData => {
    const emailNodes: NodeData[] = [];
    const phoneNodes: NodeData[] = [];
    const usernameNodes: NodeData[] = [];
    const socialNodes: NodeData[] = [];
    const addressNodes: NodeData[] = [];
    const relativesNodes: NodeData[] = [];
    const breachNodes: NodeData[] = [];
    const webNodes: NodeData[] = [];

    findings.forEach((finding) => {
      const data = finding.data as any;

      // Process Holehe (email platform discovery)
      if (finding.agent_type === "Holehe" && data.found) {
        data.results?.forEach((result: any) => {
          if (result.exists) {
            emailNodes.push({
              id: `email-${result.platform}-${finding.id}`,
              label: result.platform,
              type: "discovery",
              icon: <Globe className="h-3 w-3" />,
              color: NODE_COLORS.email,
              children: [],
              metadata: {
                source: "Holehe",
                platform: result.platform,
                verified: true,
              },
            });
          }
        });
      }

      // Process Sherlock (username discovery)
      if (finding.agent_type === "Sherlock" && data.found) {
        data.platforms?.forEach((platform: any) => {
          if (platform.exists) {
            usernameNodes.push({
              id: `username-${platform.platform}-${finding.id}`,
              label: platform.platform,
              type: "discovery",
              icon: <Globe className="h-3 w-3" />,
              color: NODE_COLORS.username,
              children: [],
              metadata: {
                source: "Sherlock",
                platform: platform.platform,
                url: platform.url,
                verified: true,
              },
            });
          }
        });
      }

      // Process Social profiles
      if (finding.agent_type === "Social" && data.profiles) {
        data.profiles.forEach((profile: any) => {
          if (profile.exists) {
            socialNodes.push({
              id: `social-${profile.platform}-${finding.id}`,
              label: profile.platform,
              type: "discovery",
              icon: <Globe className="h-3 w-3" />,
              color: NODE_COLORS.social,
              children: [],
              metadata: {
                source: "Social Search",
                platform: profile.platform,
                url: profile.url,
              },
            });
          }
        });
      }

      // Process Phone findings
      if (finding.agent_type === "Phone" && data.valid) {
        phoneNodes.push({
          id: `phone-${finding.id}`,
          label: data.number || data.carrier || "Phone Found",
          type: "discovery",
          icon: <Phone className="h-3 w-3" />,
          color: NODE_COLORS.phone,
          children: [],
          metadata: {
            source: finding.source,
            confidence: finding.confidence_score,
          },
        });
      }

      // Process Address findings
      if (finding.agent_type === "Address" && data.found) {
        addressNodes.push({
          id: `address-${finding.id}`,
          label: data.location || data.address || "Address Found",
          type: "discovery",
          icon: <MapPin className="h-3 w-3" />,
          color: NODE_COLORS.address,
          children: [],
          metadata: {
            source: finding.source,
          },
        });
      }

      // Process People Search (relatives/associates)
      if (finding.agent_type === "People_search" && data.relatives) {
        data.relatives.forEach((relative: any, idx: number) => {
          relativesNodes.push({
            id: `relative-${idx}-${finding.id}`,
            label: typeof relative === "string" ? relative : relative.name || "Unknown",
            type: "discovery",
            icon: <User className="h-3 w-3" />,
            color: NODE_COLORS.relatives,
            children: [],
            metadata: {
              source: "People Search",
              confidence: finding.confidence_score,
            },
          });
        });
      }

      // Process Breach data
      if (finding.agent_type === "Breach" || finding.source?.includes("LeakCheck")) {
        const breaches = data.breaches || data.result || [];
        if (Array.isArray(breaches)) {
          breaches.forEach((breach: any, idx: number) => {
            breachNodes.push({
              id: `breach-${idx}-${finding.id}`,
              label: breach.name || breach.source || "Data Breach",
              type: "discovery",
              icon: <AlertTriangle className="h-3 w-3" />,
              color: NODE_COLORS.breach,
              children: [],
              metadata: {
                source: "Breach Database",
              },
            });
          });
        }
      }

      // Process Web search results
      if (finding.agent_type === "Web" && data.results) {
        data.results.slice(0, 5).forEach((result: any, idx: number) => {
          webNodes.push({
            id: `web-${idx}-${finding.id}`,
            label: result.title?.substring(0, 30) || "Web Result",
            type: "discovery",
            icon: <Globe className="h-3 w-3" />,
            color: NODE_COLORS.web,
            children: [],
            metadata: {
              source: "Web Search",
              url: result.url,
              confidence: result.confidenceScore,
            },
          });
        });
      }
    });

    // Build category nodes
    const categories: NodeData[] = [];

    if (emailNodes.length > 0) {
      categories.push({
        id: "cat-email",
        label: `Email (${emailNodes.length})`,
        type: "category",
        icon: <Mail className="h-4 w-4" />,
        color: NODE_COLORS.email,
        children: emailNodes,
      });
    }

    if (phoneNodes.length > 0) {
      categories.push({
        id: "cat-phone",
        label: `Phone (${phoneNodes.length})`,
        type: "category",
        icon: <Phone className="h-4 w-4" />,
        color: NODE_COLORS.phone,
        children: phoneNodes,
      });
    }

    if (usernameNodes.length > 0) {
      categories.push({
        id: "cat-username",
        label: `Username (${usernameNodes.length})`,
        type: "category",
        icon: <AtSign className="h-4 w-4" />,
        color: NODE_COLORS.username,
        children: usernameNodes,
      });
    }

    if (socialNodes.length > 0) {
      categories.push({
        id: "cat-social",
        label: `Social (${socialNodes.length})`,
        type: "category",
        icon: <Users className="h-4 w-4" />,
        color: NODE_COLORS.social,
        children: socialNodes,
      });
    }

    if (addressNodes.length > 0) {
      categories.push({
        id: "cat-address",
        label: `Address (${addressNodes.length})`,
        type: "category",
        icon: <MapPin className="h-4 w-4" />,
        color: NODE_COLORS.address,
        children: addressNodes,
      });
    }

    if (relativesNodes.length > 0) {
      categories.push({
        id: "cat-relatives",
        label: `Relatives (${relativesNodes.length})`,
        type: "category",
        icon: <Users className="h-4 w-4" />,
        color: NODE_COLORS.relatives,
        children: relativesNodes,
      });
    }

    if (breachNodes.length > 0) {
      categories.push({
        id: "cat-breach",
        label: `Breaches (${breachNodes.length})`,
        type: "category",
        icon: <AlertTriangle className="h-4 w-4" />,
        color: NODE_COLORS.breach,
        children: breachNodes,
      });
    }

    if (webNodes.length > 0) {
      categories.push({
        id: "cat-web",
        label: `Web (${webNodes.length})`,
        type: "category",
        icon: <Globe className="h-4 w-4" />,
        color: NODE_COLORS.web,
        children: webNodes,
      });
    }

    return {
      id: "root",
      label: targetName || "Target",
      type: "root",
      icon: <Shield className="h-5 w-5" />,
      color: NODE_COLORS.root,
      children: categories,
    };
  }, [findings, targetName]);

  const toggleNode = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const totalDiscoveries = useMemo(() => {
    return buildNodeTree.children.reduce((acc, cat) => acc + cat.children.length, 0);
  }, [buildNodeTree]);

  // Render the hierarchical tree
  const renderNode = (node: NodeData, depth: number = 0, parentY: number = 0, index: number = 0, siblingCount: number = 1) => {
    const isExpanded = expandedNodes.has(node.id);
    const isHovered = hoveredNode === node.id;
    const isSelected = selectedNode === node.id;
    const hasChildren = node.children.length > 0;

    const xOffset = depth * 180;
    const ySpacing = depth === 0 ? 0 : 60;
    const startY = parentY - ((siblingCount - 1) * ySpacing) / 2;
    const yOffset = startY + index * ySpacing;

    return (
      <g key={node.id}>
        {/* Connection line from parent */}
        {depth > 0 && (
          <path
            d={`M ${xOffset - 60} ${parentY} C ${xOffset - 30} ${parentY}, ${xOffset - 30} ${yOffset}, ${xOffset - 20} ${yOffset}`}
            fill="none"
            stroke={isHovered || isSelected ? node.color : "hsl(var(--border))"}
            strokeWidth={isHovered || isSelected ? 2 : 1}
            strokeOpacity={isHovered || isSelected ? 1 : 0.5}
            className="transition-all duration-300"
          />
        )}

        {/* Node circle */}
        <g
          transform={`translate(${xOffset}, ${yOffset})`}
          onMouseEnter={() => setHoveredNode(node.id)}
          onMouseLeave={() => setHoveredNode(null)}
          onClick={() => {
            if (hasChildren) toggleNode(node.id);
            setSelectedNode(node.id === selectedNode ? null : node.id);
          }}
          className="cursor-pointer"
        >
          {/* Glow effect for hovered/selected */}
          {(isHovered || isSelected) && (
            <circle
              r={node.type === "root" ? 28 : node.type === "category" ? 22 : 16}
              fill={node.color}
              opacity={0.3}
              className="animate-pulse"
            />
          )}

          {/* Main node circle */}
          <circle
            r={node.type === "root" ? 24 : node.type === "category" ? 18 : 12}
            fill={node.color}
            stroke={isHovered || isSelected ? "white" : "transparent"}
            strokeWidth={2}
            className="transition-all duration-200"
            style={{
              filter: isHovered || isSelected ? `drop-shadow(0 0 8px ${node.color})` : "none",
            }}
          />

          {/* Icon inside node */}
          <foreignObject
            x={node.type === "root" ? -10 : node.type === "category" ? -8 : -6}
            y={node.type === "root" ? -10 : node.type === "category" ? -8 : -6}
            width={node.type === "root" ? 20 : node.type === "category" ? 16 : 12}
            height={node.type === "root" ? 20 : node.type === "category" ? 16 : 12}
            className="pointer-events-none"
          >
            <div className="flex items-center justify-center text-white w-full h-full">
              {node.icon}
            </div>
          </foreignObject>

          {/* Expand/collapse indicator */}
          {hasChildren && (
            <g transform={`translate(${node.type === "root" ? 18 : 14}, -8)`}>
              <circle r={8} fill="hsl(var(--background))" stroke={node.color} strokeWidth={1} />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={10}
                fill={node.color}
                className="font-bold select-none"
              >
                {isExpanded ? "−" : "+"}
              </text>
            </g>
          )}

          {/* Label */}
          <text
            y={node.type === "root" ? 40 : node.type === "category" ? 32 : 24}
            textAnchor="middle"
            className={cn(
              "text-xs fill-foreground font-medium select-none",
              isHovered && "fill-primary"
            )}
          >
            {node.label.length > 20 ? node.label.substring(0, 18) + "..." : node.label}
          </text>

          {/* Metadata badge */}
          {node.metadata?.verified && (
            <g transform={`translate(${node.type === "root" ? -18 : -14}, -8)`}>
              <circle r={6} fill="#10B981" />
              <foreignObject x={-4} y={-4} width={8} height={8}>
                <div className="flex items-center justify-center text-white">
                  <Eye className="h-2 w-2" />
                </div>
              </foreignObject>
            </g>
          )}
        </g>

        {/* Render children if expanded */}
        {isExpanded &&
          node.children.map((child, idx) =>
            renderNode(child, depth + 1, yOffset, idx, node.children.length)
          )}
      </g>
    );
  };

  // Calculate SVG dimensions
  const svgHeight = Math.max(
    400,
    buildNodeTree.children.reduce((acc, cat) => {
      if (expandedNodes.has(cat.id)) {
        return acc + cat.children.length * 60 + 100;
      }
      return acc + 80;
    }, 200)
  );

  const svgWidth = Math.max(800, expandedNodes.size * 200 + 400);

  if (!active) {
    return (
      <div className="relative h-[400px] rounded-lg border border-border/30 bg-background/50 overflow-hidden flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <Shield className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Start an investigation to view the OSINT link map</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative rounded-lg border border-border/30 bg-gradient-to-br from-background via-background to-muted/20 overflow-hidden transition-all duration-300",
        isFullscreen && "fixed inset-4 z-50"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">OSINT Link Map</h3>
            <p className="text-xs text-muted-foreground">
              {totalDiscoveries} digital breadcrumbs discovered
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {buildNodeTree.children.length} categories
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsFullscreen(!isFullscreen)}
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 px-4 py-2 border-b border-border/20 bg-muted/30">
        {[
          { label: "Email", color: NODE_COLORS.email },
          { label: "Phone", color: NODE_COLORS.phone },
          { label: "Username", color: NODE_COLORS.username },
          { label: "Social", color: NODE_COLORS.social },
          { label: "Address", color: NODE_COLORS.address },
          { label: "Relatives", color: NODE_COLORS.relatives },
          { label: "Breaches", color: NODE_COLORS.breach },
          { label: "Web", color: NODE_COLORS.web },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      {/* Graph Area */}
      <ScrollArea className={cn("w-full", isFullscreen ? "h-[calc(100vh-200px)]" : "h-[350px]")}>
        <div className="min-w-[800px] p-4">
          <svg
            width={svgWidth}
            height={svgHeight}
            viewBox={`-50 ${-svgHeight / 2 + 50} ${svgWidth} ${svgHeight}`}
            className="overflow-visible"
          >
            {/* Background grid pattern */}
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path
                  d="M 40 0 L 0 0 0 40"
                  fill="none"
                  stroke="hsl(var(--border))"
                  strokeWidth="0.5"
                  opacity="0.3"
                />
              </pattern>
            </defs>
            <rect
              x={-50}
              y={-svgHeight / 2 + 50}
              width={svgWidth}
              height={svgHeight}
              fill="url(#grid)"
            />

            {/* Render the tree */}
            {renderNode(buildNodeTree)}
          </svg>
        </div>
      </ScrollArea>

      {/* Selected Node Details Panel */}
      {selectedNode && (
        <div className="absolute bottom-4 right-4 w-64 p-3 rounded-lg bg-background/95 border border-border shadow-lg backdrop-blur-sm">
          <TooltipProvider>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Selected Node</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={() => setSelectedNode(null)}
                >
                  ×
                </Button>
              </div>
              {(() => {
                const findNode = (node: NodeData): NodeData | null => {
                  if (node.id === selectedNode) return node;
                  for (const child of node.children) {
                    const found = findNode(child);
                    if (found) return found;
                  }
                  return null;
                };
                const node = findNode(buildNodeTree);
                if (!node) return null;

                return (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div
                        className="p-1.5 rounded"
                        style={{ backgroundColor: node.color + "20" }}
                      >
                        {node.icon}
                      </div>
                      <span className="font-medium text-sm truncate">{node.label}</span>
                    </div>
                    {node.metadata?.source && (
                      <p className="text-xs text-muted-foreground">
                        Source: {node.metadata.source}
                      </p>
                    )}
                    {node.metadata?.url && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a
                            href={node.metadata.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline flex items-center gap-1"
                          >
                            <Globe className="h-3 w-3" />
                            View Profile
                          </a>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">{node.metadata.url}</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {node.metadata?.verified && (
                      <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-600">
                        Verified
                      </Badge>
                    )}
                  </div>
                );
              })()}
            </div>
          </TooltipProvider>
        </div>
      )}
    </div>
  );
};

export default OSINTLinkMap;
