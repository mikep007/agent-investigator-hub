import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Mail, Phone, AtSign, User, MapPin, Globe, AlertTriangle, Shield,
  ZoomIn, ZoomOut, Maximize2, Minimize2, Plus, Play, Pause, RotateCcw,
  Move, X, Search, Network, Eye
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface PivotData {
  type: 'username' | 'email' | 'phone' | 'name' | 'address';
  value: string;
  source?: string;
}

interface PalantirLinkGraphProps {
  investigationId: string | null;
  targetName?: string;
  active: boolean;
  onPivot?: (pivotData: PivotData) => void;
}

interface GraphNode {
  id: string;
  label: string;
  type: 'root' | 'email' | 'phone' | 'username' | 'platform' | 'person' | 'address' | 'breach';
  x: number;
  y: number;
  vx: number;
  vy: number;
  locked: boolean;
  metadata?: {
    source?: string;
    url?: string;
    verified?: boolean;
    confidence?: number;
  };
}

interface GraphLink {
  source: string;
  target: string;
  label?: string;
  strength: number;
}

interface Finding {
  id: string;
  agent_type: string;
  source: string;
  data: any;
  confidence_score?: number;
  created_at: string;
}

// Palantir-inspired colors
const NODE_COLORS: Record<string, string> = {
  root: '#FF6B00',      // Orange - primary
  email: '#3B82F6',     // Blue
  phone: '#10B981',     // Green
  username: '#8B5CF6',  // Purple
  platform: '#EC4899',  // Pink
  person: '#F59E0B',    // Amber
  address: '#06B6D4',   // Cyan
  breach: '#EF4444',    // Red
};

const NODE_ICONS: Record<string, React.ReactNode> = {
  root: <Shield className="h-4 w-4" />,
  email: <Mail className="h-3 w-3" />,
  phone: <Phone className="h-3 w-3" />,
  username: <AtSign className="h-3 w-3" />,
  platform: <Globe className="h-3 w-3" />,
  person: <User className="h-3 w-3" />,
  address: <MapPin className="h-3 w-3" />,
  breach: <AlertTriangle className="h-3 w-3" />,
};

// Physics constants
const REPULSION_STRENGTH = 1500;
const LINK_STRENGTH = 0.04;
const LINK_DISTANCE = 200;
const CENTER_STRENGTH = 0.005;
const DAMPING = 0.9;

const PalantirLinkGraph = ({ 
  investigationId, 
  targetName = 'Target', 
  active,
  onPivot 
}: PalantirLinkGraphProps) => {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  
  // Canvas state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Interaction state
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(true);
  
  // Input state for adding entities
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [newEntityType, setNewEntityType] = useState<string>('email');
  const [newEntityValue, setNewEntityValue] = useState('');
  
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const animationRef = useRef<number>();
  const nodesRef = useRef<GraphNode[]>([]);
  
  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 4;
  
  // Calculate dimensions based on container
  const dimensions = useMemo(() => ({
    width: containerRef.current?.clientWidth || (typeof window !== 'undefined' ? window.innerWidth - 48 : 1200),
    height: isFullscreen ? (typeof window !== 'undefined' ? window.innerHeight - 120 : 800) : 600,
  }), [isFullscreen, containerRef.current?.clientWidth]);

  // Fetch findings
  useEffect(() => {
    if (!active || !investigationId) {
      return;
    }

    const fetchFindings = async () => {
      const { data } = await supabase
        .from('findings')
        .select('*')
        .eq('investigation_id', investigationId)
        .order('created_at', { ascending: true });

      if (data) {
        setFindings(data as Finding[]);
      }
    };

    fetchFindings();

    const channel = supabase
      .channel(`palantir-graph:${investigationId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'findings',
        filter: `investigation_id=eq.${investigationId}`,
      }, () => fetchFindings())
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [active, investigationId]);

  // Build graph from findings
  const buildGraph = useCallback(() => {
    const newNodes: GraphNode[] = [];
    const newLinks: GraphLink[] = [];
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    
    // Root node
    newNodes.push({
      id: 'root',
      label: targetName,
      type: 'root',
      x: centerX,
      y: centerY,
      vx: 0,
      vy: 0,
      locked: true,
      metadata: { verified: true },
    });
    
    const addedIds = new Set<string>(['root']);
    
    findings.forEach((finding) => {
      const data = finding.data as any;
      const angle = Math.random() * Math.PI * 2;
      const radius = 250 + Math.random() * 150;
      
      // Extract emails
      if (finding.source?.includes('@') && !addedIds.has(`email-${finding.source}`)) {
        const nodeId = `email-${finding.source}`;
        newNodes.push({
          id: nodeId,
          label: finding.source,
          type: 'email',
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius,
          vx: 0,
          vy: 0,
          locked: false,
          metadata: { source: finding.agent_type },
        });
        newLinks.push({ source: 'root', target: nodeId, label: 'owns', strength: 0.8 });
        addedIds.add(nodeId);
      }
      
      // Process Holehe
      if (finding.agent_type === 'Holehe' && data.results) {
        data.results.forEach((result: any, idx: number) => {
          if (result.exists && result.platform) {
            const nodeId = `platform-holehe-${result.platform}-${finding.id}`;
            if (!addedIds.has(nodeId)) {
              const pAngle = angle + (idx * 0.2);
              newNodes.push({
                id: nodeId,
                label: result.platform,
                type: 'platform',
                x: centerX + Math.cos(pAngle) * (radius + 100),
                y: centerY + Math.sin(pAngle) * (radius + 100),
                vx: 0,
                vy: 0,
                locked: false,
                metadata: { source: 'Holehe', verified: true },
              });
              
              // Link to email if exists
              const emailId = `email-${finding.source}`;
              if (addedIds.has(emailId)) {
                newLinks.push({ source: emailId, target: nodeId, label: 'registered', strength: 0.6 });
              } else {
                newLinks.push({ source: 'root', target: nodeId, strength: 0.5 });
              }
              addedIds.add(nodeId);
            }
          }
        });
      }
      
      // Process Sherlock
      if (finding.agent_type === 'Sherlock' && (data.profileLinks || data.foundPlatforms || data.platforms)) {
        const platforms = data.profileLinks || data.foundPlatforms || data.platforms || [];
        const username = data.username || finding.source;
        
        if (username && !addedIds.has(`username-${username}`)) {
          const usernameId = `username-${username}`;
          newNodes.push({
            id: usernameId,
            label: username,
            type: 'username',
            x: centerX + Math.cos(angle + 1) * radius,
            y: centerY + Math.sin(angle + 1) * radius,
            vx: 0,
            vy: 0,
            locked: false,
            metadata: { source: 'Sherlock' },
          });
          newLinks.push({ source: 'root', target: usernameId, label: 'uses', strength: 0.8 });
          addedIds.add(usernameId);
          
          platforms.slice(0, 15).forEach((platform: any, idx: number) => {
            const pName = platform.platform || platform.name || platform;
            const nodeId = `platform-sherlock-${pName}-${finding.id}`;
            if (!addedIds.has(nodeId)) {
              const pAngle = angle + 1 + (idx * 0.15);
              newNodes.push({
                id: nodeId,
                label: pName,
                type: 'platform',
                x: centerX + Math.cos(pAngle) * (radius + 120),
                y: centerY + Math.sin(pAngle) * (radius + 120),
                vx: 0,
                vy: 0,
                locked: false,
                metadata: { source: 'Sherlock', url: platform.url, verified: true },
              });
              newLinks.push({ source: usernameId, target: nodeId, label: 'account', strength: 0.5 });
              addedIds.add(nodeId);
            }
          });
        }
      }
      
      // Process LeakCheck breaches
      if ((finding.agent_type === 'LeakCheck' || finding.source?.includes('LeakCheck')) && data.sources) {
        data.sources.forEach((breach: any, idx: number) => {
          const breachName = breach.name || 'Breach';
          const nodeId = `breach-${breachName}-${finding.id}-${idx}`;
          if (!addedIds.has(nodeId)) {
            const bAngle = angle + 2 + (idx * 0.2);
            newNodes.push({
              id: nodeId,
              label: breachName,
              type: 'breach',
              x: centerX + Math.cos(bAngle) * (radius + 80),
              y: centerY + Math.sin(bAngle) * (radius + 80),
              vx: 0,
              vy: 0,
              locked: false,
              metadata: { source: 'LeakCheck' },
            });
            
            const emailId = `email-${finding.source}`;
            if (addedIds.has(emailId)) {
              newLinks.push({ source: emailId, target: nodeId, label: 'breached', strength: 0.7 });
            }
            addedIds.add(nodeId);
          }
        });
      }
      
      // Process People_search relatives
      if (finding.agent_type === 'People_search' && data.relatives) {
        data.relatives.slice(0, 8).forEach((relative: any, idx: number) => {
          const relativeName = typeof relative === 'string' ? relative : relative.name || 'Unknown';
          const nodeId = `person-${relativeName.replace(/\s+/g, '-')}-${idx}`;
          if (!addedIds.has(nodeId)) {
            const rAngle = angle + 3 + (idx * 0.3);
            newNodes.push({
              id: nodeId,
              label: relativeName,
              type: 'person',
              x: centerX + Math.cos(rAngle) * (radius + 60),
              y: centerY + Math.sin(rAngle) * (radius + 60),
              vx: 0,
              vy: 0,
              locked: false,
              metadata: { source: 'People Search' },
            });
            newLinks.push({ source: 'root', target: nodeId, label: 'relative', strength: 0.6 });
            addedIds.add(nodeId);
          }
        });
      }
      
      // Process Addresses
      if ((finding.agent_type === 'People_search' || finding.agent_type === 'Address') && (data.addresses || data.address)) {
        const addresses = data.addresses || (data.address ? [data.address] : []);
        addresses.slice(0, 3).forEach((addr: any, idx: number) => {
          const addrStr = typeof addr === 'string' ? addr : addr.full || addr.street || 'Address';
          const nodeId = `address-${addrStr.replace(/\s+/g, '-').substring(0, 20)}-${idx}`;
          if (!addedIds.has(nodeId)) {
            const aAngle = angle + 4 + (idx * 0.4);
            newNodes.push({
              id: nodeId,
              label: addrStr.length > 30 ? addrStr.substring(0, 28) + '...' : addrStr,
              type: 'address',
              x: centerX + Math.cos(aAngle) * (radius + 50),
              y: centerY + Math.sin(aAngle) * (radius + 50),
              vx: 0,
              vy: 0,
              locked: false,
              metadata: { source: finding.agent_type },
            });
            newLinks.push({ source: 'root', target: nodeId, label: 'lives at', strength: 0.7 });
            addedIds.add(nodeId);
          }
        });
      }
      
      // Process Phones
      if (finding.agent_type === 'Phone' && data.valid) {
        const phoneNumber = data.number || data.phone || 'Phone';
        const nodeId = `phone-${phoneNumber}`;
        if (!addedIds.has(nodeId)) {
          newNodes.push({
            id: nodeId,
            label: phoneNumber,
            type: 'phone',
            x: centerX + Math.cos(angle + 5) * radius,
            y: centerY + Math.sin(angle + 5) * radius,
            vx: 0,
            vy: 0,
            locked: false,
            metadata: { source: finding.agent_type },
          });
          newLinks.push({ source: 'root', target: nodeId, label: 'owns', strength: 0.8 });
          addedIds.add(nodeId);
        }
      }
    });
    
    return { nodes: newNodes, links: newLinks };
  }, [findings, targetName, dimensions]);

  // Initialize graph
  useEffect(() => {
    const { nodes: newNodes, links: newLinks } = buildGraph();
    setNodes(newNodes);
    setLinks(newLinks);
    nodesRef.current = newNodes;
  }, [buildGraph]);

  // Physics simulation
  const simulate = useCallback(() => {
    if (!isSimulating || nodesRef.current.length === 0) return;
    
    const updatedNodes = nodesRef.current.map(n => ({ ...n }));
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    
    for (let i = 0; i < updatedNodes.length; i++) {
      const node = updatedNodes[i];
      if (node.locked) continue;
      
      let fx = 0, fy = 0;
      
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
      links.forEach(link => {
        if (link.source === node.id || link.target === node.id) {
          const otherId = link.source === node.id ? link.target : link.source;
          const other = updatedNodes.find(n => n.id === otherId);
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
      node.x += node.vx;
      node.y += node.vy;
      
      // Bounds
      const padding = 80;
      node.x = Math.max(padding, Math.min(dimensions.width - padding, node.x));
      node.y = Math.max(padding, Math.min(dimensions.height - padding, node.y));
    }
    
    nodesRef.current = updatedNodes;
    setNodes([...updatedNodes]);
    
    animationRef.current = requestAnimationFrame(simulate);
  }, [isSimulating, links, dimensions]);

  useEffect(() => {
    if (isSimulating && nodes.length > 0) {
      animationRef.current = requestAnimationFrame(simulate);
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isSimulating, simulate, nodes.length]);

  // Drag handlers
  const handleNodeDragStart = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggedNode(nodeId);
    nodesRef.current = nodesRef.current.map(n =>
      n.id === nodeId ? { ...n, locked: true } : n
    );
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (draggedNode && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - pan.x) / zoom;
      const y = (e.clientY - rect.top - pan.y) / zoom;
      
      nodesRef.current = nodesRef.current.map(n =>
        n.id === draggedNode ? { ...n, x, y } : n
      );
      setNodes([...nodesRef.current]);
    } else if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  }, [draggedNode, isPanning, panStart, pan, zoom]);

  const handleMouseUp = useCallback(() => {
    if (draggedNode) {
      nodesRef.current = nodesRef.current.map(n =>
        n.id === draggedNode && n.type !== 'root' ? { ...n, locked: false } : n
      );
      setDraggedNode(null);
    }
    setIsPanning(false);
  }, [draggedNode]);

  // Pan handlers
  const handlePanStart = useCallback((e: React.MouseEvent) => {
    if (e.button === 0 && !draggedNode) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan, draggedNode]);

  // Zoom handlers
  const handleZoom = useCallback((delta: number) => {
    setZoom(z => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + delta)));
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    handleZoom(delta);
  }, [handleZoom]);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const resetSimulation = useCallback(() => {
    const { nodes: newNodes, links: newLinks } = buildGraph();
    setNodes(newNodes);
    setLinks(newLinks);
    nodesRef.current = newNodes;
    setIsSimulating(true);
  }, [buildGraph]);

  // Add new entity
  const handleAddEntity = useCallback(() => {
    if (!newEntityValue.trim()) return;
    
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    const angle = Math.random() * Math.PI * 2;
    const radius = 300;
    
    const nodeId = `${newEntityType}-manual-${Date.now()}`;
    const newNode: GraphNode = {
      id: nodeId,
      label: newEntityValue,
      type: newEntityType as GraphNode['type'],
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
      locked: false,
      metadata: { source: 'Manual Entry' },
    };
    
    const newLink: GraphLink = {
      source: 'root',
      target: nodeId,
      label: newEntityType === 'email' || newEntityType === 'phone' ? 'owns' : 'linked',
      strength: 0.7,
    };
    
    nodesRef.current = [...nodesRef.current, newNode];
    setNodes(prev => [...prev, newNode]);
    setLinks(prev => [...prev, newLink]);
    setNewEntityValue('');
    
    // Trigger pivot if callback exists
    if (onPivot) {
      const pivotType = newEntityType === 'username' ? 'username' 
        : newEntityType === 'email' ? 'email' 
        : newEntityType === 'phone' ? 'phone' 
        : newEntityType === 'person' ? 'name'
        : 'address';
      onPivot({ type: pivotType as PivotData['type'], value: newEntityValue });
    }
  }, [newEntityType, newEntityValue, dimensions, onPivot]);

  // Handle node click for pivot
  const handleNodeClick = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || node.type === 'root') return;
    
    setSelectedNode(nodeId === selectedNode ? null : nodeId);
  }, [nodes, selectedNode]);

  // Handle double-click for pivot
  const handleNodeDoubleClick = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || node.type === 'root' || !onPivot) return;
    
    const pivotType = node.type === 'username' ? 'username' 
      : node.type === 'email' ? 'email' 
      : node.type === 'phone' ? 'phone' 
      : node.type === 'person' ? 'name'
      : 'address';
    
    onPivot({ type: pivotType as PivotData['type'], value: node.label });
  }, [nodes, onPivot]);

  // Inactive state
  if (!active) {
    return (
      <div className="w-full rounded-lg border border-border/30 bg-[#1a1a1a] overflow-hidden flex items-center justify-center" style={{ height: 600 }}>
        <div className="text-center text-muted-foreground">
          <Network className="h-16 w-16 mx-auto mb-4 opacity-30 text-orange-500" />
          <p className="text-lg font-medium">Intelligence Link Analysis</p>
          <p className="text-sm mt-2">Start an investigation to visualize entity connections</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div
        ref={containerRef}
        className={cn(
          "relative w-full rounded-lg border border-border/30 overflow-hidden transition-all duration-300",
          isFullscreen && "fixed inset-0 z-50 rounded-none"
        )}
        style={{ 
          backgroundColor: '#1a1a1a',
          height: isFullscreen ? '100vh' : 600 
        }}
      >
        {/* Header Bar */}
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-[#1a1a1a] via-[#1a1a1a]/90 to-transparent">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-500/20 border border-orange-500/30">
              <Network className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">Intelligence Link Analysis</h3>
              <p className="text-xs text-gray-400">
                {nodes.length} entities • {links.length} connections
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Add Entity Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAddPanel(!showAddPanel)}
              className={cn(
                "h-8 text-gray-300 hover:text-white hover:bg-white/10",
                showAddPanel && "bg-orange-500/20 text-orange-400"
              )}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Entity
            </Button>
            
            <div className="h-4 w-px bg-gray-600" />
            
            {/* Zoom controls */}
            <Badge variant="outline" className="text-xs font-mono border-gray-600 text-gray-300 bg-black/30">
              {Math.round(zoom * 100)}%
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 hover:text-white hover:bg-white/10"
              onClick={() => handleZoom(-0.2)}
              disabled={zoom <= MIN_ZOOM}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 hover:text-white hover:bg-white/10"
              onClick={() => handleZoom(0.2)}
              disabled={zoom >= MAX_ZOOM}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 hover:text-white hover:bg-white/10"
              onClick={resetView}
              title="Reset View"
            >
              <Move className="h-4 w-4" />
            </Button>
            
            <div className="h-4 w-px bg-gray-600" />
            
            {/* Simulation controls */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 hover:text-white hover:bg-white/10"
              onClick={() => setIsSimulating(!isSimulating)}
              title={isSimulating ? 'Pause' : 'Play'}
            >
              {isSimulating ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 hover:text-white hover:bg-white/10"
              onClick={resetSimulation}
              title="Reset"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            
            <div className="h-4 w-px bg-gray-600" />
            
            {/* Fullscreen */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 hover:text-white hover:bg-white/10"
              onClick={() => setIsFullscreen(!isFullscreen)}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Add Entity Panel */}
        {showAddPanel && (
          <div className="absolute top-14 right-4 z-30 w-72 p-4 rounded-lg bg-[#242424] border border-gray-700 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-white">Add New Entity</h4>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-gray-400 hover:text-white"
                onClick={() => setShowAddPanel(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="space-y-3">
              <Select value={newEntityType} onValueChange={setNewEntityType}>
                <SelectTrigger className="bg-[#1a1a1a] border-gray-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#242424] border-gray-600">
                  <SelectItem value="email" className="text-white hover:bg-white/10">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-blue-400" />
                      Email Address
                    </div>
                  </SelectItem>
                  <SelectItem value="username" className="text-white hover:bg-white/10">
                    <div className="flex items-center gap-2">
                      <AtSign className="h-4 w-4 text-purple-400" />
                      Username
                    </div>
                  </SelectItem>
                  <SelectItem value="phone" className="text-white hover:bg-white/10">
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-green-400" />
                      Phone Number
                    </div>
                  </SelectItem>
                  <SelectItem value="person" className="text-white hover:bg-white/10">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-amber-400" />
                      Person Name
                    </div>
                  </SelectItem>
                  <SelectItem value="address" className="text-white hover:bg-white/10">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-cyan-400" />
                      Address
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              
              <Input
                value={newEntityValue}
                onChange={(e) => setNewEntityValue(e.target.value)}
                placeholder={
                  newEntityType === 'email' ? 'user@example.com' :
                  newEntityType === 'username' ? '@username' :
                  newEntityType === 'phone' ? '+1 555 123 4567' :
                  newEntityType === 'person' ? 'John Smith' :
                  '123 Main St, City'
                }
                className="bg-[#1a1a1a] border-gray-600 text-white placeholder:text-gray-500"
                onKeyDown={(e) => e.key === 'Enter' && handleAddEntity()}
              />
              
              <Button
                onClick={handleAddEntity}
                disabled={!newEntityValue.trim()}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add to Graph
              </Button>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-4 left-4 z-20 flex flex-wrap gap-3 p-3 rounded-lg bg-black/60 backdrop-blur-sm border border-gray-700">
          {Object.entries(NODE_COLORS).filter(([k]) => k !== 'root').map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5 text-xs text-gray-300">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
              <span className="capitalize">{type}</span>
            </div>
          ))}
        </div>

        {/* Selected Node Info */}
        {selectedNode && (
          <div className="absolute bottom-4 right-4 z-20 w-64 p-4 rounded-lg bg-[#242424] border border-gray-700 shadow-xl">
            {(() => {
              const node = nodes.find(n => n.id === selectedNode);
              if (!node) return null;
              
              return (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="p-2 rounded-lg"
                        style={{ backgroundColor: NODE_COLORS[node.type] + '30' }}
                      >
                        {NODE_ICONS[node.type]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white truncate max-w-40">{node.label}</p>
                        <p className="text-xs text-gray-400 capitalize">{node.type}</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-gray-400 hover:text-white"
                      onClick={() => setSelectedNode(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  {node.metadata?.source && (
                    <p className="text-xs text-gray-400">
                      Source: {node.metadata.source}
                    </p>
                  )}
                  
                  {node.metadata?.verified && (
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                      <Eye className="h-3 w-3 mr-1" />
                      Verified
                    </Badge>
                  )}
                  
                  {node.type !== 'root' && onPivot && (
                    <Button
                      size="sm"
                      className="w-full bg-orange-500 hover:bg-orange-600"
                      onClick={() => handleNodeDoubleClick(node.id)}
                    >
                      <Search className="h-4 w-4 mr-2" />
                      Pivot to This Entity
                    </Button>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Instructions */}
        <div className="absolute top-14 left-4 z-20 px-3 py-2 rounded-lg bg-black/50 border border-gray-700 text-xs text-gray-400 backdrop-blur-sm">
          <span className="text-orange-400">Drag</span> nodes • <span className="text-orange-400">Scroll</span> to zoom • <span className="text-orange-400">Double-click</span> to pivot
        </div>

        {/* SVG Canvas */}
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          className="cursor-grab active:cursor-grabbing"
          onMouseDown={handlePanStart}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          {/* Background grid */}
          <defs>
            <pattern id="palantir-grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path
                d="M 60 0 L 0 0 0 60"
                fill="none"
                stroke="#2a2a2a"
                strokeWidth="1"
              />
            </pattern>
            <filter id="palantir-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <rect width="100%" height="100%" fill="#1a1a1a" />
          <rect width="100%" height="100%" fill="url(#palantir-grid)" />

          {/* Transform group for zoom/pan */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Links */}
            {links.map((link) => {
              const sourceNode = nodes.find(n => n.id === link.source);
              const targetNode = nodes.find(n => n.id === link.target);
              if (!sourceNode || !targetNode) return null;

              const isHighlighted = 
                hoveredNode === link.source || 
                hoveredNode === link.target ||
                selectedNode === link.source ||
                selectedNode === link.target;

              return (
                <g key={`${link.source}-${link.target}`}>
                  <line
                    x1={sourceNode.x}
                    y1={sourceNode.y}
                    x2={targetNode.x}
                    y2={targetNode.y}
                    stroke={isHighlighted ? '#FF6B00' : '#444444'}
                    strokeWidth={isHighlighted ? 2 : 1}
                    strokeOpacity={isHighlighted ? 0.8 : 0.4}
                    className="transition-all duration-200"
                  />
                  {/* Link label */}
                  {isHighlighted && link.label && (
                    <text
                      x={(sourceNode.x + targetNode.x) / 2}
                      y={(sourceNode.y + targetNode.y) / 2 - 8}
                      textAnchor="middle"
                      className="text-[10px] fill-gray-400 pointer-events-none"
                    >
                      {link.label}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {nodes.map((node) => {
              const isHovered = hoveredNode === node.id;
              const isSelected = selectedNode === node.id;
              const isDragging = draggedNode === node.id;
              const nodeColor = NODE_COLORS[node.type] || '#FF6B00';
              const nodeRadius = node.type === 'root' ? 32 : 20;

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onMouseDown={(e) => handleNodeDragStart(node.id, e)}
                  onClick={() => handleNodeClick(node.id)}
                  onDoubleClick={() => handleNodeDoubleClick(node.id)}
                  className="cursor-pointer"
                  style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                >
                  {/* Glow effect */}
                  {(isHovered || isSelected) && (
                    <circle
                      r={nodeRadius + 12}
                      fill={nodeColor}
                      opacity={0.15}
                      filter="url(#palantir-glow)"
                    />
                  )}
                  
                  {/* Selection ring */}
                  {isSelected && (
                    <circle
                      r={nodeRadius + 6}
                      fill="none"
                      stroke="#FF6B00"
                      strokeWidth="2"
                      strokeDasharray="4 2"
                      className="animate-spin"
                      style={{ animationDuration: '8s' }}
                    />
                  )}

                  {/* Main node circle */}
                  <circle
                    r={nodeRadius}
                    fill={nodeColor}
                    stroke={isHovered || isSelected ? '#ffffff' : 'rgba(255,255,255,0.2)'}
                    strokeWidth={isHovered || isSelected ? 2 : 1}
                    className="transition-all duration-200"
                    style={{
                      filter: isHovered || isSelected ? `drop-shadow(0 0 15px ${nodeColor})` : 'none',
                    }}
                  />

                  {/* Icon */}
                  <foreignObject
                    x={-nodeRadius / 2}
                    y={-nodeRadius / 2}
                    width={nodeRadius}
                    height={nodeRadius}
                    className="pointer-events-none"
                  >
                    <div className="flex items-center justify-center w-full h-full text-white">
                      {NODE_ICONS[node.type]}
                    </div>
                  </foreignObject>

                  {/* Label */}
                  <text
                    y={nodeRadius + 16}
                    textAnchor="middle"
                    className="text-[11px] fill-white font-medium pointer-events-none select-none"
                    style={{ 
                      textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                      opacity: isHovered || isSelected ? 1 : 0.8
                    }}
                  >
                    {node.label.length > 20 ? node.label.substring(0, 18) + '...' : node.label}
                  </text>

                  {/* Verified badge */}
                  {node.metadata?.verified && (
                    <g transform={`translate(${nodeRadius - 4}, ${-nodeRadius + 4})`}>
                      <circle r={7} fill="#10B981" />
                      <foreignObject x={-4} y={-4} width={8} height={8}>
                        <div className="flex items-center justify-center text-white text-[8px]">
                          ✓
                        </div>
                      </foreignObject>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </TooltipProvider>
  );
};

export default PalantirLinkGraph;
