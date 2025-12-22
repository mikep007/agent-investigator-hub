import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { 
  Mail, Phone, User, AtSign, MapPin, Users, Globe, Shield, 
  AlertTriangle, Maximize2, Minimize2, Eye, Play, Pause, RotateCcw
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
}

interface PhysicsNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number | null;
  fy?: number | null;
  radius: number;
  color: string;
  label: string;
  type: "root" | "category" | "entity" | "discovery";
  icon: React.ReactNode;
  metadata?: NodeData["metadata"];
  parentId?: string;
}

interface PhysicsLink {
  source: string;
  target: string;
  strength: number;
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

// Physics constants
const REPULSION_STRENGTH = 800;
const LINK_STRENGTH = 0.05;
const LINK_DISTANCE = 120;
const CENTER_STRENGTH = 0.01;
const DAMPING = 0.9;
const MIN_VELOCITY = 0.01;

const OSINTLinkMap = ({ investigationId, targetName, active }: OSINTLinkMapProps) => {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSimulating, setIsSimulating] = useState(true);
  const [nodes, setNodes] = useState<PhysicsNode[]>([]);
  const [links, setLinks] = useState<PhysicsLink[]>([]);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const animationRef = useRef<number>();
  const nodesRef = useRef<PhysicsNode[]>([]);

  const dimensions = useMemo(() => ({
    width: isFullscreen ? window.innerWidth - 32 : 800,
    height: isFullscreen ? window.innerHeight - 200 : 400,
  }), [isFullscreen]);

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

  // Build flat node/link structure from findings
  const buildGraph = useCallback(() => {
    const newNodes: PhysicsNode[] = [];
    const newLinks: PhysicsLink[] = [];
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;

    // Root node
    newNodes.push({
      id: "root",
      x: centerX,
      y: centerY,
      vx: 0,
      vy: 0,
      fx: centerX,
      fy: centerY,
      radius: 28,
      color: NODE_COLORS.root,
      label: targetName || "Target",
      type: "root",
      icon: <Shield className="h-5 w-5" />,
    });

    const categories: { [key: string]: { nodes: PhysicsNode[]; color: string; icon: React.ReactNode } } = {
      email: { nodes: [], color: NODE_COLORS.email, icon: <Mail className="h-4 w-4" /> },
      phone: { nodes: [], color: NODE_COLORS.phone, icon: <Phone className="h-4 w-4" /> },
      username: { nodes: [], color: NODE_COLORS.username, icon: <AtSign className="h-4 w-4" /> },
      social: { nodes: [], color: NODE_COLORS.social, icon: <Users className="h-4 w-4" /> },
      address: { nodes: [], color: NODE_COLORS.address, icon: <MapPin className="h-4 w-4" /> },
      relatives: { nodes: [], color: NODE_COLORS.relatives, icon: <Users className="h-4 w-4" /> },
      breach: { nodes: [], color: NODE_COLORS.breach, icon: <AlertTriangle className="h-4 w-4" /> },
      web: { nodes: [], color: NODE_COLORS.web, icon: <Globe className="h-4 w-4" /> },
    };

    findings.forEach((finding) => {
      const data = finding.data as any;

      // Process Holehe
      if (finding.agent_type === "Holehe" && data.found) {
        data.results?.forEach((result: any) => {
          if (result.exists) {
            categories.email.nodes.push({
              id: `email-${result.platform}-${finding.id}`,
              x: centerX + (Math.random() - 0.5) * 300,
              y: centerY + (Math.random() - 0.5) * 300,
              vx: 0,
              vy: 0,
              radius: 10,
              color: NODE_COLORS.email,
              label: result.platform,
              type: "discovery",
              icon: <Globe className="h-3 w-3" />,
              metadata: { source: "Holehe", platform: result.platform, verified: true },
              parentId: "cat-email",
            });
          }
        });
      }

      // Process Sherlock
      if (finding.agent_type === "Sherlock" && data.found) {
        data.platforms?.forEach((platform: any) => {
          if (platform.exists) {
            categories.username.nodes.push({
              id: `username-${platform.platform}-${finding.id}`,
              x: centerX + (Math.random() - 0.5) * 300,
              y: centerY + (Math.random() - 0.5) * 300,
              vx: 0,
              vy: 0,
              radius: 10,
              color: NODE_COLORS.username,
              label: platform.platform,
              type: "discovery",
              icon: <Globe className="h-3 w-3" />,
              metadata: { source: "Sherlock", platform: platform.platform, url: platform.url, verified: true },
              parentId: "cat-username",
            });
          }
        });
      }

      // Process Social
      if (finding.agent_type === "Social" && data.profiles) {
        data.profiles.forEach((profile: any) => {
          if (profile.exists) {
            categories.social.nodes.push({
              id: `social-${profile.platform}-${finding.id}`,
              x: centerX + (Math.random() - 0.5) * 300,
              y: centerY + (Math.random() - 0.5) * 300,
              vx: 0,
              vy: 0,
              radius: 10,
              color: NODE_COLORS.social,
              label: profile.platform,
              type: "discovery",
              icon: <Globe className="h-3 w-3" />,
              metadata: { source: "Social Search", platform: profile.platform, url: profile.url },
              parentId: "cat-social",
            });
          }
        });
      }

      // Process Phone
      if (finding.agent_type === "Phone" && data.valid) {
        categories.phone.nodes.push({
          id: `phone-${finding.id}`,
          x: centerX + (Math.random() - 0.5) * 300,
          y: centerY + (Math.random() - 0.5) * 300,
          vx: 0,
          vy: 0,
          radius: 10,
          color: NODE_COLORS.phone,
          label: data.number || data.carrier || "Phone Found",
          type: "discovery",
          icon: <Phone className="h-3 w-3" />,
          metadata: { source: finding.source, confidence: finding.confidence_score },
          parentId: "cat-phone",
        });
      }

      // Process Address
      if (finding.agent_type === "Address" && data.found) {
        categories.address.nodes.push({
          id: `address-${finding.id}`,
          x: centerX + (Math.random() - 0.5) * 300,
          y: centerY + (Math.random() - 0.5) * 300,
          vx: 0,
          vy: 0,
          radius: 10,
          color: NODE_COLORS.address,
          label: data.location || data.address || "Address Found",
          type: "discovery",
          icon: <MapPin className="h-3 w-3" />,
          metadata: { source: finding.source },
          parentId: "cat-address",
        });
      }

      // Process Relatives
      if (finding.agent_type === "People_search" && data.relatives) {
        data.relatives.forEach((relative: any, idx: number) => {
          categories.relatives.nodes.push({
            id: `relative-${idx}-${finding.id}`,
            x: centerX + (Math.random() - 0.5) * 300,
            y: centerY + (Math.random() - 0.5) * 300,
            vx: 0,
            vy: 0,
            radius: 10,
            color: NODE_COLORS.relatives,
            label: typeof relative === "string" ? relative : relative.name || "Unknown",
            type: "discovery",
            icon: <User className="h-3 w-3" />,
            metadata: { source: "People Search", confidence: finding.confidence_score },
            parentId: "cat-relatives",
          });
        });
      }

      // Process Breach
      if (finding.agent_type === "Breach" || finding.source?.includes("LeakCheck")) {
        const breaches = data.breaches || data.result || [];
        if (Array.isArray(breaches)) {
          breaches.forEach((breach: any, idx: number) => {
            categories.breach.nodes.push({
              id: `breach-${idx}-${finding.id}`,
              x: centerX + (Math.random() - 0.5) * 300,
              y: centerY + (Math.random() - 0.5) * 300,
              vx: 0,
              vy: 0,
              radius: 10,
              color: NODE_COLORS.breach,
              label: breach.name || breach.source || "Data Breach",
              type: "discovery",
              icon: <AlertTriangle className="h-3 w-3" />,
              metadata: { source: "Breach Database" },
              parentId: "cat-breach",
            });
          });
        }
      }

      // Process Web
      if (finding.agent_type === "Web" && data.results) {
        data.results.slice(0, 5).forEach((result: any, idx: number) => {
          categories.web.nodes.push({
            id: `web-${idx}-${finding.id}`,
            x: centerX + (Math.random() - 0.5) * 300,
            y: centerY + (Math.random() - 0.5) * 300,
            vx: 0,
            vy: 0,
            radius: 10,
            color: NODE_COLORS.web,
            label: result.title?.substring(0, 25) || "Web Result",
            type: "discovery",
            icon: <Globe className="h-3 w-3" />,
            metadata: { source: "Web Search", url: result.url, confidence: result.confidenceScore },
            parentId: "cat-web",
          });
        });
      }
    });

    // Create category nodes and links
    const angleStep = (2 * Math.PI) / Object.keys(categories).length;
    let angle = -Math.PI / 2;

    Object.entries(categories).forEach(([key, cat]) => {
      if (cat.nodes.length === 0) return;

      const catId = `cat-${key}`;
      const catX = centerX + Math.cos(angle) * 150;
      const catY = centerY + Math.sin(angle) * 150;

      newNodes.push({
        id: catId,
        x: catX,
        y: catY,
        vx: 0,
        vy: 0,
        radius: 20,
        color: cat.color,
        label: `${key.charAt(0).toUpperCase() + key.slice(1)} (${cat.nodes.length})`,
        type: "category",
        icon: cat.icon,
      });

      newLinks.push({
        source: "root",
        target: catId,
        strength: 0.8,
      });

      cat.nodes.forEach((node) => {
        newNodes.push(node);
        newLinks.push({
          source: catId,
          target: node.id,
          strength: 0.5,
        });
      });

      angle += angleStep;
    });

    return { nodes: newNodes, links: newLinks };
  }, [findings, targetName, dimensions]);

  // Initialize graph when findings change
  useEffect(() => {
    const { nodes: newNodes, links: newLinks } = buildGraph();
    setNodes(newNodes);
    setLinks(newLinks);
    nodesRef.current = newNodes;
  }, [buildGraph]);

  // Physics simulation
  const simulate = useCallback(() => {
    if (!isSimulating || nodes.length === 0) return;

    const updatedNodes = nodesRef.current.map((node) => ({ ...node }));
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;

    // Apply forces
    for (let i = 0; i < updatedNodes.length; i++) {
      const node = updatedNodes[i];
      if (node.fx !== undefined && node.fx !== null) continue;

      let fx = 0;
      let fy = 0;

      // Repulsion from other nodes
      for (let j = 0; j < updatedNodes.length; j++) {
        if (i === j) continue;
        const other = updatedNodes[j];
        const dx = node.x - other.x;
        const dy = node.y - other.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = REPULSION_STRENGTH / (dist * dist);
        fx += (dx / dist) * force;
        fy += (dy / dist) * force;
      }

      // Link attraction
      links.forEach((link) => {
        if (link.source === node.id || link.target === node.id) {
          const otherId = link.source === node.id ? link.target : link.source;
          const other = updatedNodes.find((n) => n.id === otherId);
          if (other) {
            const dx = other.x - node.x;
            const dy = other.y - node.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = (dist - LINK_DISTANCE) * LINK_STRENGTH * link.strength;
            fx += (dx / dist) * force;
            fy += (dy / dist) * force;
          }
        }
      });

      // Center gravity
      fx += (centerX - node.x) * CENTER_STRENGTH;
      fy += (centerY - node.y) * CENTER_STRENGTH;

      // Update velocity and position
      node.vx = (node.vx + fx) * DAMPING;
      node.vy = (node.vy + fy) * DAMPING;

      // Clamp velocity
      if (Math.abs(node.vx) < MIN_VELOCITY) node.vx = 0;
      if (Math.abs(node.vy) < MIN_VELOCITY) node.vy = 0;

      node.x += node.vx;
      node.y += node.vy;

      // Keep within bounds
      const padding = 50;
      node.x = Math.max(padding, Math.min(dimensions.width - padding, node.x));
      node.y = Math.max(padding, Math.min(dimensions.height - padding, node.y));
    }

    // Handle fixed nodes (root and dragged)
    updatedNodes.forEach((node) => {
      if (node.fx !== undefined && node.fx !== null) node.x = node.fx;
      if (node.fy !== undefined && node.fy !== null) node.y = node.fy;
    });

    nodesRef.current = updatedNodes;
    setNodes([...updatedNodes]);

    animationRef.current = requestAnimationFrame(simulate);
  }, [isSimulating, nodes.length, links, dimensions]);

  useEffect(() => {
    if (isSimulating && nodes.length > 0) {
      animationRef.current = requestAnimationFrame(simulate);
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isSimulating, simulate, nodes.length]);

  const handleMouseDown = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.preventDefault();
    setDraggedNode(nodeId);
    nodesRef.current = nodesRef.current.map((n) =>
      n.id === nodeId ? { ...n, fx: n.x, fy: n.y } : n
    );
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggedNode || !svgRef.current) return;

    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    nodesRef.current = nodesRef.current.map((n) =>
      n.id === draggedNode ? { ...n, x, y, fx: x, fy: y } : n
    );
    setNodes([...nodesRef.current]);
  }, [draggedNode]);

  const handleMouseUp = useCallback(() => {
    if (draggedNode) {
      // Release the node but keep root fixed
      nodesRef.current = nodesRef.current.map((n) =>
        n.id === draggedNode && n.type !== "root"
          ? { ...n, fx: null, fy: null }
          : n
      );
      setDraggedNode(null);
    }
  }, [draggedNode]);

  const resetSimulation = useCallback(() => {
    const { nodes: newNodes, links: newLinks } = buildGraph();
    setNodes(newNodes);
    setLinks(newLinks);
    nodesRef.current = newNodes;
    setIsSimulating(true);
  }, [buildGraph]);

  const totalDiscoveries = useMemo(() => {
    return nodes.filter((n) => n.type === "discovery").length;
  }, [nodes]);

  const categoryCount = useMemo(() => {
    return nodes.filter((n) => n.type === "category").length;
  }, [nodes]);

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
      ref={containerRef}
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
            {categoryCount} categories
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsSimulating(!isSimulating)}
            title={isSimulating ? "Pause simulation" : "Resume simulation"}
          >
            {isSimulating ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={resetSimulation}
            title="Reset simulation"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
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
      <div className={cn("w-full overflow-hidden", isFullscreen ? "h-[calc(100vh-200px)]" : "h-[350px]")}>
        <svg
          ref={svgRef}
          width={dimensions.width}
          height={dimensions.height}
          className="w-full h-full"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Background grid */}
          <defs>
            <pattern id="physics-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="hsl(var(--border))"
                strokeWidth="0.5"
                opacity="0.3"
              />
            </pattern>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <rect width={dimensions.width} height={dimensions.height} fill="url(#physics-grid)" />

          {/* Links */}
          {links.map((link) => {
            const sourceNode = nodes.find((n) => n.id === link.source);
            const targetNode = nodes.find((n) => n.id === link.target);
            if (!sourceNode || !targetNode) return null;

            const isHighlighted =
              hoveredNode === link.source ||
              hoveredNode === link.target ||
              selectedNode === link.source ||
              selectedNode === link.target;

            return (
              <line
                key={`${link.source}-${link.target}`}
                x1={sourceNode.x}
                y1={sourceNode.y}
                x2={targetNode.x}
                y2={targetNode.y}
                stroke={isHighlighted ? targetNode.color : "hsl(var(--border))"}
                strokeWidth={isHighlighted ? 2 : 1}
                strokeOpacity={isHighlighted ? 0.8 : 0.4}
                className="transition-all duration-200"
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const isHovered = hoveredNode === node.id;
            const isSelected = selectedNode === node.id;
            const isDragging = draggedNode === node.id;

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onMouseDown={(e) => handleMouseDown(node.id, e)}
                onClick={() => setSelectedNode(node.id === selectedNode ? null : node.id)}
                className="cursor-pointer"
                style={{ cursor: isDragging ? "grabbing" : "grab" }}
              >
                {/* Pulse animation for active nodes */}
                {(isHovered || isSelected) && (
                  <circle
                    r={node.radius + 8}
                    fill={node.color}
                    opacity={0.2}
                    className="animate-pulse"
                  />
                )}

                {/* Glow effect */}
                <circle
                  r={node.radius + 4}
                  fill={node.color}
                  opacity={isHovered || isSelected ? 0.3 : 0}
                  filter="url(#glow)"
                  className="transition-opacity duration-200"
                />

                {/* Main node */}
                <circle
                  r={node.radius}
                  fill={node.color}
                  stroke={isHovered || isSelected || isDragging ? "white" : "transparent"}
                  strokeWidth={2}
                  className="transition-all duration-200"
                  style={{
                    filter: isHovered || isSelected ? `drop-shadow(0 0 10px ${node.color})` : "none",
                  }}
                />

                {/* Icon */}
                <foreignObject
                  x={-node.radius / 2}
                  y={-node.radius / 2}
                  width={node.radius}
                  height={node.radius}
                  className="pointer-events-none"
                >
                  <div className="flex items-center justify-center text-white w-full h-full">
                    {node.icon}
                  </div>
                </foreignObject>

                {/* Label */}
                <text
                  y={node.radius + 14}
                  textAnchor="middle"
                  className={cn(
                    "text-[10px] fill-foreground font-medium select-none pointer-events-none",
                    isHovered && "fill-primary"
                  )}
                >
                  {node.label.length > 18 ? node.label.substring(0, 16) + "..." : node.label}
                </text>

                {/* Verified badge */}
                {node.metadata?.verified && (
                  <g transform={`translate(${node.radius - 4}, ${-node.radius + 4})`}>
                    <circle r={6} fill="#10B981" />
                    <foreignObject x={-4} y={-4} width={8} height={8}>
                      <div className="flex items-center justify-center text-white">
                        <Eye className="h-2 w-2" />
                      </div>
                    </foreignObject>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Selected Node Details */}
      {selectedNode && (
        <div className="absolute bottom-4 right-4 w-64 p-3 rounded-lg bg-background/95 border border-border shadow-lg backdrop-blur-sm animate-fade-in">
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
                const node = nodes.find((n) => n.id === selectedNode);
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

      {/* Simulation status indicator */}
      <div className="absolute bottom-4 left-4 flex items-center gap-2 text-xs text-muted-foreground">
        <div className={cn("w-2 h-2 rounded-full", isSimulating ? "bg-green-500 animate-pulse" : "bg-muted")} />
        <span>{isSimulating ? "Simulating" : "Paused"}</span>
      </div>
    </div>
  );
};

export default OSINTLinkMap;
