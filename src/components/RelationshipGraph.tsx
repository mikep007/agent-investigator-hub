import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Mail, User, Phone, MapPin, Users, Globe, Link as LinkIcon, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface RelationshipGraphProps {
  active: boolean;
  investigationId: string | null;
  targetName?: string;
}

interface GraphNode {
  id: string;
  label: string;
  type: 'target' | 'email' | 'username' | 'phone' | 'address' | 'social' | 'web' | 'relative';
  x: number;
  y: number;
  vx: number;
  vy: number;
  url?: string;
  platform?: string;
  confidence?: number;
  isDragging?: boolean;
}

interface GraphLink {
  source: string;
  target: string;
  strength: number;
  type: string;
}

type LayoutType = 'force' | 'radial' | 'hierarchical';

const RelationshipGraph = ({ active, investigationId, targetName = "Target" }: RelationshipGraphProps) => {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [layout, setLayout] = useState<LayoutType>('force');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [typeFilters, setTypeFilters] = useState<Set<string>>(new Set());
  const svgRef = useRef<SVGSVGElement>(null);
  const animationRef = useRef<number>();
  const dragOffset = useRef({ x: 0, y: 0 });

  const getNodeColor = (type: string) => {
    const colors = {
      target: 'hsl(var(--primary))',
      email: 'hsl(210, 100%, 60%)',
      username: 'hsl(280, 100%, 65%)',
      phone: 'hsl(120, 60%, 50%)',
      address: 'hsl(30, 90%, 60%)',
      social: 'hsl(340, 80%, 60%)',
      web: 'hsl(180, 70%, 50%)',
      relative: 'hsl(50, 90%, 60%)',
    };
    return colors[type as keyof typeof colors] || 'hsl(var(--muted))';
  };

  const getNodeIcon = (type: string) => {
    const icons = {
      target: Users,
      email: Mail,
      username: User,
      phone: Phone,
      address: MapPin,
      social: LinkIcon,
      web: Globe,
      relative: Users,
    };
    return icons[type as keyof typeof icons] || User;
  };

  const getConnectionType = (sourceType: string, targetType: string): string => {
    if (targetType === 'email') return 'registered on';
    if (targetType === 'username') return 'username on';
    if (targetType === 'social') return 'profile on';
    if (targetType === 'phone') return 'phone number';
    if (targetType === 'address') return 'located at';
    if (targetType === 'web') return 'mentioned in';
    return 'linked to';
  };

  const toggleFilter = (type: string) => {
    setTypeFilters(prev => {
      const newFilters = new Set(prev);
      if (newFilters.has(type)) {
        newFilters.delete(type);
      } else {
        newFilters.add(type);
      }
      return newFilters;
    });
  };

  const applyLayout = (nodeList: GraphNode[], layoutType: LayoutType) => {
    const centerX = 400;
    const centerY = 300;

    if (layoutType === 'radial') {
      nodeList.forEach((node, index) => {
        if (node.id === 'target') {
          node.x = centerX;
          node.y = centerY;
        } else {
          const angle = ((index - 1) / (nodeList.length - 1)) * Math.PI * 2;
          const radius = 200;
          node.x = centerX + Math.cos(angle) * radius;
          node.y = centerY + Math.sin(angle) * radius;
        }
      });
    } else if (layoutType === 'hierarchical') {
      const typeGroups: { [key: string]: GraphNode[] } = {};
      nodeList.forEach(node => {
        if (node.id === 'target') return;
        if (!typeGroups[node.type]) typeGroups[node.type] = [];
        typeGroups[node.type].push(node);
      });

      const types = Object.keys(typeGroups);
      const layerHeight = 120;
      
      types.forEach((type, layerIndex) => {
        const nodesInLayer = typeGroups[type];
        const layerY = centerY + (layerIndex - types.length / 2) * layerHeight;
        nodesInLayer.forEach((node, i) => {
          node.x = centerX + (i - nodesInLayer.length / 2) * 100;
          node.y = layerY;
        });
      });

      const targetNode = nodeList.find(n => n.id === 'target');
      if (targetNode) {
        targetNode.x = centerX;
        targetNode.y = centerY;
      }
    }
    // Force-directed layout is handled by the simulation
  };

  useEffect(() => {
    if (!active || !investigationId) {
      setNodes([]);
      setLinks([]);
      return;
    }

    const fetchFindings = async () => {
      const { data } = await supabase
        .from("findings")
        .select("*")
        .eq("investigation_id", investigationId)
        .order("created_at", { ascending: true });

      if (data && data.length > 0) {
        const newNodes: GraphNode[] = [];
        const newLinks: GraphLink[] = [];
        const centerX = 400;
        const centerY = 300;

        // Add target node at center
        newNodes.push({
          id: 'target',
          label: targetName,
          type: 'target',
          x: centerX,
          y: centerY,
          vx: 0,
          vy: 0,
        });

        // Process findings and create nodes
        data.forEach((finding, index) => {
          const findingData = finding.data as any;
          const angle = (index / data.length) * Math.PI * 2;
          const radius = 150;
          const baseX = centerX + Math.cos(angle) * radius;
          const baseY = centerY + Math.sin(angle) * radius;

          if (finding.agent_type === "Holehe" && findingData.results) {
            findingData.results.forEach((result: any, i: number) => {
              if (result.exists && result.platform) {
                const nodeId = `email-${result.platform}-${i}`;
                newNodes.push({
                  id: nodeId,
                  label: result.platform,
                  type: 'email',
                  x: baseX + (Math.random() - 0.5) * 50,
                  y: baseY + (Math.random() - 0.5) * 50,
                  vx: 0,
                  vy: 0,
                  platform: result.platform,
                  confidence: finding.confidence_score || 0,
                });
                newLinks.push({ source: 'target', target: nodeId, strength: 0.8, type: 'registered on' });
              }
            });
          }

          if (finding.agent_type === "Sherlock" && findingData.profileLinks) {
            findingData.profileLinks.forEach((profile: any, i: number) => {
              const nodeId = `username-${profile.platform}-${i}`;
              newNodes.push({
                id: nodeId,
                label: profile.platform,
                type: 'username',
                x: baseX + (Math.random() - 0.5) * 50,
                y: baseY + (Math.random() - 0.5) * 50,
                vx: 0,
                vy: 0,
                url: profile.url,
                platform: profile.platform,
                confidence: finding.confidence_score || 0,
              });
              newLinks.push({ source: 'target', target: nodeId, strength: 0.8, type: 'username on' });
            });
          }

          if (finding.agent_type === "Social" && findingData.profiles) {
            findingData.profiles.forEach((profile: any, i: number) => {
              if (profile.exists) {
                const nodeId = `social-${profile.platform}-${i}`;
                newNodes.push({
                  id: nodeId,
                  label: profile.platform,
                  type: 'social',
                  x: baseX + (Math.random() - 0.5) * 50,
                  y: baseY + (Math.random() - 0.5) * 50,
                  vx: 0,
                  vy: 0,
                  url: profile.url,
                  platform: profile.platform,
                  confidence: finding.confidence_score || 0,
                });
                newLinks.push({ source: 'target', target: nodeId, strength: 0.8, type: 'profile on' });
              }
            });
          }

          if (finding.agent_type === "Web" && findingData.items) {
            findingData.items.slice(0, 5).forEach((item: any, i: number) => {
              const nodeId = `web-${i}-${index}`;
              newNodes.push({
                id: nodeId,
                label: item.title?.substring(0, 30) || 'Web Result',
                type: 'web',
                x: baseX + (Math.random() - 0.5) * 50,
                y: baseY + (Math.random() - 0.5) * 50,
                vx: 0,
                vy: 0,
                url: item.link,
                confidence: finding.confidence_score || 0,
              });
              newLinks.push({ source: 'target', target: nodeId, strength: 0.6, type: 'mentioned in' });
            });
          }

          if (finding.agent_type === "Phone" && findingData.number) {
            const nodeId = `phone-${index}`;
            newNodes.push({
              id: nodeId,
              label: findingData.number,
              type: 'phone',
              x: baseX + (Math.random() - 0.5) * 50,
              y: baseY + (Math.random() - 0.5) * 50,
              vx: 0,
              vy: 0,
              confidence: finding.confidence_score || 0,
            });
            newLinks.push({ source: 'target', target: nodeId, strength: 0.9, type: 'phone number' });
          }

          if (finding.agent_type === "Address" && findingData.location) {
            const nodeId = `address-${index}`;
            newNodes.push({
              id: nodeId,
              label: findingData.location,
              type: 'address',
              x: baseX + (Math.random() - 0.5) * 50,
              y: baseY + (Math.random() - 0.5) * 50,
              vx: 0,
              vy: 0,
              confidence: finding.confidence_score || 0,
            });
            newLinks.push({ source: 'target', target: nodeId, strength: 0.9, type: 'located at' });
          }
        });

        setNodes(newNodes);
        setLinks(newLinks);
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

  // Force-directed graph simulation with collision detection
  useEffect(() => {
    if (nodes.length === 0) return;

    const simulate = () => {
      const newNodes = [...nodes];
      const alpha = 0.1;
      const linkStrength = 0.3;
      const repulsion = 1200; // Increased for better spacing
      const minDistance = 50; // Minimum distance between nodes

      // Apply forces
      newNodes.forEach((node, i) => {
        if (node.id === 'target') return; // Keep target centered

        // Link force
        links.forEach(link => {
          const sourceNode = newNodes.find(n => n.id === link.source);
          const targetNode = newNodes.find(n => n.id === link.target);
          
          if (sourceNode && targetNode && (node.id === link.source || node.id === link.target)) {
            const dx = targetNode.x - sourceNode.x;
            const dy = targetNode.y - sourceNode.y;
            const distance = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = (distance - 120) * linkStrength * link.strength; // Increased ideal distance
            
            if (node.id === link.target) {
              node.vx += (dx / distance) * force * alpha;
              node.vy += (dy / distance) * force * alpha;
            }
          }
        });

        // Collision detection and repulsion force
        newNodes.forEach((otherNode, j) => {
          if (i !== j) {
            const dx = node.x - otherNode.x;
            const dy = node.y - otherNode.y;
            const distance = Math.sqrt(dx * dx + dy * dy) || 1;
            
            // Get node radii for collision detection
            const nodeRadius = node.type === 'target' ? 30 : 20;
            const otherRadius = otherNode.type === 'target' ? 30 : 20;
            const minCollisionDist = nodeRadius + otherRadius + 15; // Add padding
            
            // Strong collision force if overlapping
            if (distance < minCollisionDist) {
              const collisionForce = ((minCollisionDist - distance) / distance) * 50;
              node.vx += (dx / distance) * collisionForce * alpha;
              node.vy += (dy / distance) * collisionForce * alpha;
            }
            
            // Regular repulsion force
            const force = repulsion / (distance * distance);
            node.vx += (dx / distance) * force * alpha;
            node.vy += (dy / distance) * force * alpha;
          }
        });

        // Apply velocity with damping
        node.vx *= 0.85;
        node.vy *= 0.85;
        node.x += node.vx;
        node.y += node.vy;

        // Boundary check with proper padding
        const nodeRadius = node.type === 'target' ? 30 : 20;
        const padding = nodeRadius + 20;
        if (node.x < padding) { node.x = padding; node.vx = 0; }
        if (node.x > 800 - padding) { node.x = 800 - padding; node.vx = 0; }
        if (node.y < padding) { node.y = padding; node.vy = 0; }
        if (node.y > 600 - padding) { node.y = 600 - padding; node.vy = 0; }
      });

      setNodes(newNodes);
      animationRef.current = requestAnimationFrame(simulate);
    };

    animationRef.current = requestAnimationFrame(simulate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [nodes.length, links]);

  const handleNodeClick = (node: GraphNode) => {
    if (node.url) {
      window.open(node.url, '_blank');
    }
  };

  if (!active || nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center space-y-2">
          <Globe className="w-12 h-12 mx-auto opacity-50" />
          <p>Start an investigation to see the relationship graph</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-background/50 rounded-lg border border-border overflow-hidden">
      <svg
        width="800"
        height="600"
        className="w-full h-full"
        style={{ minHeight: '600px' }}
      >
        {/* Draw links */}
        <g>
          {links.map((link, i) => {
            const sourceNode = nodes.find(n => n.id === link.source);
            const targetNode = nodes.find(n => n.id === link.target);
            if (!sourceNode || !targetNode) return null;

            return (
              <line
                key={`link-${i}`}
                x1={sourceNode.x}
                y1={sourceNode.y}
                x2={targetNode.x}
                y2={targetNode.y}
                stroke="hsl(var(--border))"
                strokeWidth={link.strength * 2}
                opacity={0.4}
              />
            );
          })}
        </g>

        {/* Draw nodes */}
        <g>
          {nodes.map((node) => {
            const Icon = getNodeIcon(node.type);
            const isHovered = hoveredNode === node.id;
            const radius = node.type === 'target' ? 30 : 20;

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => handleNodeClick(node)}
                style={{ cursor: node.url ? 'pointer' : 'default' }}
              >
                {/* Node circle */}
                <circle
                  r={radius}
                  fill={getNodeColor(node.type)}
                  stroke={isHovered ? 'hsl(var(--primary))' : 'hsl(var(--background))'}
                  strokeWidth={isHovered ? 3 : 2}
                  opacity={0.9}
                  className="transition-all duration-200"
                />

                {/* Confidence ring for non-target nodes */}
                {node.type !== 'target' && node.confidence !== undefined && (
                  <circle
                    r={radius + 5}
                    fill="none"
                    stroke={getNodeColor(node.type)}
                    strokeWidth={2}
                    opacity={node.confidence / 100}
                    strokeDasharray={`${(node.confidence / 100) * (2 * Math.PI * (radius + 5))} ${2 * Math.PI * (radius + 5)}`}
                  />
                )}

                {/* Node label */}
                {(isHovered || node.type === 'target') && (
                  <text
                    y={radius + 20}
                    textAnchor="middle"
                    fill="hsl(var(--foreground))"
                    fontSize="12"
                    fontWeight={node.type === 'target' ? 'bold' : 'normal'}
                    className="pointer-events-none select-none"
                  >
                    {node.label.length > 20 ? node.label.substring(0, 20) + '...' : node.label}
                  </text>
                )}

                {/* Platform badge */}
                {isHovered && node.platform && (
                  <text
                    y={radius + 35}
                    textAnchor="middle"
                    fill="hsl(var(--muted-foreground))"
                    fontSize="10"
                    className="pointer-events-none select-none"
                  >
                    {node.platform}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-background/90 backdrop-blur-sm border border-border rounded-lg p-3 space-y-1 text-xs">
        <div className="font-semibold mb-2 text-foreground">Legend</div>
        {['target', 'email', 'username', 'social', 'web', 'phone', 'address'].map(type => {
          const Icon = getNodeIcon(type);
          return (
            <div key={type} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: getNodeColor(type) }}
              />
              <span className="capitalize text-muted-foreground">{type}</span>
            </div>
          );
        })}
      </div>

      {/* Stats */}
      <div className="absolute top-4 right-4 bg-background/90 backdrop-blur-sm border border-border rounded-lg p-3 text-xs space-y-1">
        <div className="font-semibold text-foreground">Graph Stats</div>
        <div className="text-muted-foreground">Nodes: {nodes.length}</div>
        <div className="text-muted-foreground">Connections: {links.length}</div>
      </div>
    </div>
  );
};

export default RelationshipGraph;
