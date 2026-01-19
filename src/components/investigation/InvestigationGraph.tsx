import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Network, Map, Clock, Settings, 
  Move, Info, Layers 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import EntityNode from './EntityNode';
import ConnectionLine from './ConnectionLine';
import CanvasToolbar, { CanvasTool } from './CanvasToolbar';
import EntityContextMenu from './EntityContextMenu';
import CreateEntityDialog from './CreateEntityDialog';
import { 
  EntityNode as EntityNodeType, 
  EntityConnection, 
  EntityType,
  ENTITY_COLORS 
} from './types';

interface InvestigationGraphProps {
  investigationId: string | null;
  targetName?: string;
  active: boolean;
  onPivot?: (type: string, value: string) => void;
}

// Physics constants
const REPULSION_STRENGTH = 1200;
const LINK_STRENGTH = 0.06;
const LINK_DISTANCE = 180;
const CENTER_STRENGTH = 0.008;
const DAMPING = 0.88;

interface Finding {
  id: string;
  agent_type: string;
  source: string;
  data: any;
  confidence_score?: number;
  created_at: string;
}

const InvestigationGraph = ({ 
  investigationId, 
  targetName = 'Target', 
  active,
  onPivot 
}: InvestigationGraphProps) => {
  const [activeTab, setActiveTab] = useState<'graph' | 'map' | 'timeline'>('graph');
  const [activeTool, setActiveTool] = useState<CanvasTool>('select');
  const [nodes, setNodes] = useState<EntityNodeType[]>([]);
  const [connections, setConnections] = useState<EntityConnection[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  
  // Canvas state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  
  // Interaction state
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(true);
  const [contextPosition, setContextPosition] = useState({ x: 0, y: 0 });
  
  // Dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createDialogType, setCreateDialogType] = useState<EntityType>('person');
  
  // Refs
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>();
  const nodesRef = useRef<EntityNodeType[]>([]);
  const historyRef = useRef<{ nodes: EntityNodeType[]; connections: EntityConnection[] }[]>([]);
  const historyIndexRef = useRef(-1);
  
  const dimensions = useMemo(() => ({
    width: containerRef.current?.clientWidth || 800,
    height: 500,
  }), [containerRef.current?.clientWidth]);
  
  // Fetch findings and build graph
  useEffect(() => {
    if (!active || !investigationId) {
      setNodes([]);
      setConnections([]);
      setFindings([]);
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
      .channel(`investigation-graph:${investigationId}`)
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
  useEffect(() => {
    if (findings.length === 0) {
      // Create root person node
      const rootNode: EntityNodeType = {
        id: 'root',
        type: 'person',
        label: targetName,
        x: dimensions.width / 2,
        y: dimensions.height / 2,
        vx: 0,
        vy: 0,
        locked: true,
        selected: false,
        metadata: { verified: true },
        connections: [],
      };
      setNodes([rootNode]);
      nodesRef.current = [rootNode];
      return;
    }
    
    buildGraphFromFindings();
  }, [findings, targetName, dimensions]);
  
  const buildGraphFromFindings = useCallback(() => {
    const newNodes: EntityNodeType[] = [];
    const newConnections: EntityConnection[] = [];
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    
    // Root person node
    const rootNode: EntityNodeType = {
      id: 'root',
      type: 'person',
      label: targetName,
      x: centerX,
      y: centerY,
      vx: 0,
      vy: 0,
      locked: true,
      selected: false,
      metadata: { verified: true },
      connections: [],
    };
    newNodes.push(rootNode);
    
    const addedEmails = new Set<string>();
    const addedPhones = new Set<string>();
    const addedUsernames = new Set<string>();
    const addedPlatforms = new Set<string>();
    
    findings.forEach((finding) => {
      const data = finding.data as any;
      const angle = Math.random() * Math.PI * 2;
      const radius = 200 + Math.random() * 100;
      
      // Extract emails from source
      if (finding.source?.includes('@') && !addedEmails.has(finding.source)) {
        const emailId = `email-${finding.source}`;
        newNodes.push({
          id: emailId,
          type: 'email',
          label: finding.source,
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius,
          vx: 0,
          vy: 0,
          locked: false,
          selected: false,
          metadata: { value: finding.source, source: finding.agent_type },
          connections: ['root'],
        });
        newConnections.push({
          id: `conn-${emailId}-root`,
          sourceId: 'root',
          targetId: emailId,
          type: 'owns',
          confidence: 0.9,
          label: 'owns',
        });
        addedEmails.add(finding.source);
        rootNode.connections.push(emailId);
      }
      
      // Process Holehe (email-based accounts)
      if (finding.agent_type === 'Holehe' && data.results) {
        data.results.forEach((result: any, idx: number) => {
          if (result.exists && result.platform && !addedPlatforms.has(`${result.platform}-holehe`)) {
            const platformId = `platform-holehe-${result.platform}-${finding.id}`;
            const platformAngle = angle + (idx * 0.3);
            
            newNodes.push({
              id: platformId,
              type: 'platform',
              label: result.platform,
              x: centerX + Math.cos(platformAngle) * (radius + 80),
              y: centerY + Math.sin(platformAngle) * (radius + 80),
              vx: 0,
              vy: 0,
              locked: false,
              selected: false,
              metadata: { 
                platform: result.platform, 
                source: 'Holehe',
                verified: true 
              },
              connections: [],
            });
            
            // Link to email if exists
            const emailId = `email-${finding.source}`;
            if (newNodes.find(n => n.id === emailId)) {
              newConnections.push({
                id: `conn-${emailId}-${platformId}`,
                sourceId: emailId,
                targetId: platformId,
                type: 'registered_on',
                confidence: 0.95,
                label: 'registered',
              });
            }
            
            addedPlatforms.add(`${result.platform}-holehe`);
          }
        });
      }
      
      // Process Sherlock (username-based)
      if (finding.agent_type === 'Sherlock' && (data.profileLinks || data.foundPlatforms)) {
        const platforms = data.profileLinks || data.foundPlatforms || [];
        const username = data.username || finding.source;
        
        if (username && !addedUsernames.has(username)) {
          const usernameId = `username-${username}`;
          newNodes.push({
            id: usernameId,
            type: 'username',
            label: username,
            x: centerX + Math.cos(angle + 1) * radius,
            y: centerY + Math.sin(angle + 1) * radius,
            vx: 0,
            vy: 0,
            locked: false,
            selected: false,
            metadata: { value: username, source: 'Sherlock' },
            connections: ['root'],
          });
          newConnections.push({
            id: `conn-root-${usernameId}`,
            sourceId: 'root',
            targetId: usernameId,
            type: 'owns',
            confidence: 0.85,
            label: 'uses',
          });
          addedUsernames.add(username);
          rootNode.connections.push(usernameId);
          
          // Add platforms
          platforms.slice(0, 10).forEach((platform: any, idx: number) => {
            const pName = platform.platform || platform.name || platform;
            const pUrl = platform.url;
            if (!addedPlatforms.has(`${pName}-sherlock`)) {
              const platformId = `platform-sherlock-${pName}-${finding.id}`;
              const pAngle = angle + 1 + (idx * 0.25);
              
              newNodes.push({
                id: platformId,
                type: 'platform',
                label: pName,
                x: centerX + Math.cos(pAngle) * (radius + 100),
                y: centerY + Math.sin(pAngle) * (radius + 100),
                vx: 0,
                vy: 0,
                locked: false,
                selected: false,
                metadata: { 
                  platform: pName, 
                  url: pUrl,
                  source: 'Sherlock',
                  verified: true 
                },
                connections: [usernameId],
              });
              
              newConnections.push({
                id: `conn-${usernameId}-${platformId}`,
                sourceId: usernameId,
                targetId: platformId,
                type: 'registered_on',
                confidence: 0.9,
                label: 'account',
              });
              
              addedPlatforms.add(`${pName}-sherlock`);
            }
          });
        }
      }
      
      // Process LeakCheck breaches
      if ((finding.agent_type === 'LeakCheck' || finding.source?.includes('LeakCheck')) && data.sources) {
        data.sources.forEach((breach: any, idx: number) => {
          const breachName = breach.name || 'Unknown Breach';
          const breachId = `breach-${breachName}-${finding.id}-${idx}`;
          const bAngle = angle + 2 + (idx * 0.2);
          
          newNodes.push({
            id: breachId,
            type: 'breach',
            label: breachName,
            x: centerX + Math.cos(bAngle) * (radius + 60),
            y: centerY + Math.sin(bAngle) * (radius + 60),
            vx: 0,
            vy: 0,
            locked: false,
            selected: false,
            metadata: { 
              source: 'LeakCheck',
              timestamp: breach.date,
            },
            connections: [],
          });
          
          // Link to email if exists
          const emailId = `email-${finding.source}`;
          if (newNodes.find(n => n.id === emailId)) {
            newConnections.push({
              id: `conn-${emailId}-${breachId}`,
              sourceId: emailId,
              targetId: breachId,
              type: 'breached_at',
              confidence: 1,
              label: 'breached',
            });
          }
        });
      }
      
      // Process People_search relatives
      if (finding.agent_type === 'People_search' && data.relatives) {
        data.relatives.slice(0, 5).forEach((relative: any, idx: number) => {
          const relativeName = typeof relative === 'string' ? relative : relative.name || 'Unknown';
          const relativeId = `person-relative-${idx}-${finding.id}`;
          const rAngle = angle + 3 + (idx * 0.4);
          
          newNodes.push({
            id: relativeId,
            type: 'person',
            label: relativeName,
            x: centerX + Math.cos(rAngle) * (radius + 50),
            y: centerY + Math.sin(rAngle) * (radius + 50),
            vx: 0,
            vy: 0,
            locked: false,
            selected: false,
            metadata: { 
              source: 'People Search',
              firstName: relativeName.split(' ')[0],
              lastName: relativeName.split(' ').slice(1).join(' '),
            },
            connections: ['root'],
          });
          
          newConnections.push({
            id: `conn-root-${relativeId}`,
            sourceId: 'root',
            targetId: relativeId,
            type: 'related_to',
            confidence: relative.confidence || 0.7,
            label: 'relative',
          });
          
          rootNode.connections.push(relativeId);
        });
      }
    });
    
    setNodes(newNodes);
    setConnections(newConnections);
    nodesRef.current = newNodes;
  }, [findings, targetName, dimensions]);
  
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
      
      // Repulsion
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
      connections.forEach(conn => {
        if (conn.sourceId === node.id || conn.targetId === node.id) {
          const otherId = conn.sourceId === node.id ? conn.targetId : conn.sourceId;
          const other = updatedNodes.find(n => n.id === otherId);
          if (other) {
            const dx = other.x - node.x;
            const dy = other.y - node.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = (dist - LINK_DISTANCE) * LINK_STRENGTH;
            fx += (dx / dist) * force;
            fy += (dy / dist) * force;
          }
        }
      });
      
      // Center gravity
      fx += (centerX - node.x) * CENTER_STRENGTH;
      fy += (centerY - node.y) * CENTER_STRENGTH;
      
      node.vx = (node.vx + fx) * DAMPING;
      node.vy = (node.vy + fy) * DAMPING;
      node.x += node.vx;
      node.y += node.vy;
      
      // Bounds
      const padding = 60;
      node.x = Math.max(padding, Math.min(dimensions.width - padding, node.x));
      node.y = Math.max(padding, Math.min(dimensions.height - padding, node.y));
    }
    
    nodesRef.current = updatedNodes;
    setNodes([...updatedNodes]);
    
    animationRef.current = requestAnimationFrame(simulate);
  }, [isSimulating, connections, dimensions]);
  
  useEffect(() => {
    if (isSimulating && nodes.length > 0) {
      animationRef.current = requestAnimationFrame(simulate);
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isSimulating, simulate, nodes.length]);
  
  // Event handlers
  const handleNodeDragStart = useCallback((nodeId: string, e: React.MouseEvent) => {
    if (activeTool !== 'select') return;
    e.preventDefault();
    e.stopPropagation();
    setDraggedNode(nodeId);
    nodesRef.current = nodesRef.current.map(n =>
      n.id === nodeId ? { ...n, locked: true } : n
    );
  }, [activeTool]);
  
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
      const node = nodesRef.current.find(n => n.id === draggedNode);
      if (node && node.id !== 'root') {
        nodesRef.current = nodesRef.current.map(n =>
          n.id === draggedNode ? { ...n, locked: false } : n
        );
      }
      setDraggedNode(null);
    }
    setIsPanning(false);
  }, [draggedNode]);
  
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setSelectedNodes(new Set());
    }
  }, []);
  
  const handleNodeClick = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeTool === 'eraser') {
      setNodes(prev => prev.filter(n => n.id !== nodeId));
      setConnections(prev => prev.filter(c => c.sourceId !== nodeId && c.targetId !== nodeId));
      return;
    }
    
    if (e.shiftKey) {
      setSelectedNodes(prev => {
        const newSet = new Set(prev);
        if (newSet.has(nodeId)) newSet.delete(nodeId);
        else newSet.add(nodeId);
        return newSet;
      });
    } else {
      setSelectedNodes(new Set([nodeId]));
    }
  }, [activeTool]);
  
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect) {
      setContextPosition({
        x: (e.clientX - rect.left - pan.x) / zoom,
        y: (e.clientY - rect.top - pan.y) / zoom,
      });
    }
  }, [pan, zoom]);
  
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(z => Math.max(0.25, Math.min(3, z + delta)));
  }, []);
  
  // Node creation
  const handleCreateNode = useCallback((type: EntityType, position: { x: number; y: number }) => {
    setCreateDialogType(type);
    setCreateDialogOpen(true);
  }, []);
  
  const handleNodeCreated = useCallback((nodeData: Partial<EntityNodeType>) => {
    const newNode: EntityNodeType = {
      id: `${nodeData.type}-${Date.now()}`,
      type: nodeData.type!,
      label: nodeData.label!,
      x: contextPosition.x,
      y: contextPosition.y,
      vx: 0,
      vy: 0,
      locked: false,
      selected: false,
      metadata: nodeData.metadata || {},
      connections: [],
    };
    
    setNodes(prev => [...prev, newNode]);
    nodesRef.current = [...nodesRef.current, newNode];
  }, [contextPosition]);
  
  // Toolbar actions
  const handleZoomIn = () => setZoom(z => Math.min(3, z + 0.2));
  const handleZoomOut = () => setZoom(z => Math.max(0.25, z - 0.2));
  const handleFitToScreen = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  
  if (!active) {
    return (
      <div className="flex items-center justify-center h-[500px] bg-muted/20 rounded-lg border border-border">
        <div className="text-center text-muted-foreground">
          <Network className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Start an investigation to build the entity graph</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="relative rounded-lg border border-border bg-background overflow-hidden" ref={containerRef}>
      {/* Header with tabs */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-3">
          <Network className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm">Investigation Graph</span>
          <Badge variant="outline" className="text-xs">
            {nodes.length} entities
          </Badge>
          <Badge variant="outline" className="text-xs">
            {connections.length} connections
          </Badge>
        </div>
        
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="h-8">
            <TabsTrigger value="graph" className="text-xs h-7 px-3">
              <Network className="h-3 w-3 mr-1" />
              Graph
            </TabsTrigger>
            <TabsTrigger value="map" className="text-xs h-7 px-3" disabled>
              <Map className="h-3 w-3 mr-1" />
              Map
              <Badge variant="secondary" className="ml-1 text-[8px] px-1">Soon</Badge>
            </TabsTrigger>
            <TabsTrigger value="timeline" className="text-xs h-7 px-3" disabled>
              <Clock className="h-3 w-3 mr-1" />
              Timeline
              <Badge variant="secondary" className="ml-1 text-[8px] px-1">Soon</Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      
      {/* Legend */}
      <div className="flex flex-wrap gap-3 px-4 py-2 border-b border-border/50 bg-muted/20">
        {Object.entries(ENTITY_COLORS).slice(0, 6).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            <span className="capitalize">{type}</span>
          </div>
        ))}
      </div>
      
      {/* Canvas */}
      <EntityContextMenu
        onCreateNode={handleCreateNode}
        onLinkNodes={() => {}}
        onUnlinkNode={() => {}}
        onDeleteNode={() => {
          selectedNodes.forEach(id => {
            setNodes(prev => prev.filter(n => n.id !== id));
            setConnections(prev => prev.filter(c => c.sourceId !== id && c.targetId !== id));
          });
          setSelectedNodes(new Set());
        }}
        onDuplicateNode={() => {}}
        onPivotSearch={() => {
          const node = nodes.find(n => selectedNodes.has(n.id));
          if (node && onPivot) {
            onPivot(node.type, node.metadata.value || node.label);
          }
        }}
        onLockNode={() => {}}
        onGroupNodes={() => {}}
        hasSelection={selectedNodes.size > 0}
        hasMultipleSelection={selectedNodes.size > 1}
        contextPosition={contextPosition}
      >
        <svg
          ref={svgRef}
          width="100%"
          height="500"
          className="bg-gradient-to-br from-background via-background to-muted/10"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={handleCanvasClick}
          onWheel={handleWheel}
          onContextMenu={handleContextMenu}
          style={{ cursor: isPanning ? 'grabbing' : activeTool === 'select' ? 'default' : 'crosshair' }}
        >
          {/* Grid pattern */}
          <defs>
            <pattern id="entity-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="hsl(var(--border))" strokeWidth="0.5" opacity="0.3" />
            </pattern>
            <filter id="entity-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,6 L9,3 z" fill="hsl(var(--muted-foreground))" opacity="0.5" />
            </marker>
          </defs>
          <rect width="100%" height="100%" fill="url(#entity-grid)" />
          
          {/* Pannable/zoomable group */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Connections */}
            {connections.map(conn => (
              <ConnectionLine
                key={conn.id}
                connection={conn}
                sourceNode={nodes.find(n => n.id === conn.sourceId)}
                targetNode={nodes.find(n => n.id === conn.targetId)}
                isHighlighted={
                  hoveredNode === conn.sourceId || 
                  hoveredNode === conn.targetId ||
                  selectedNodes.has(conn.sourceId) ||
                  selectedNodes.has(conn.targetId)
                }
                isSelected={false}
                onClick={() => {}}
              />
            ))}
            
            {/* Nodes */}
            {nodes.map(node => (
              <g
                key={node.id}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                <EntityNode
                  node={{ ...node, selected: selectedNodes.has(node.id) }}
                  isHovered={hoveredNode === node.id}
                  isDragging={draggedNode === node.id}
                  zoom={zoom}
                  onStartDrag={(e) => handleNodeDragStart(node.id, e)}
                  onClick={(e) => handleNodeClick(node.id, e)}
                  onContextMenu={(e) => {
                    setSelectedNodes(new Set([node.id]));
                    handleContextMenu(e);
                  }}
                  onDoubleClick={() => {
                    if (onPivot && node.metadata.value) {
                      onPivot(node.type, node.metadata.value);
                    }
                  }}
                />
              </g>
            ))}
          </g>
        </svg>
      </EntityContextMenu>
      
      {/* Toolbar */}
      <CanvasToolbar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        onUndo={() => {}}
        onRedo={() => {}}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitToScreen={handleFitToScreen}
        canUndo={false}
        canRedo={false}
        zoom={zoom}
      />
      
      {/* Instructions hint */}
      <div className="absolute top-16 left-4 flex items-center gap-1.5 px-2 py-1 rounded bg-background/80 border border-border/30 text-xs text-muted-foreground backdrop-blur-sm">
        <Move className="h-3 w-3" />
        <span>Drag nodes • Right-click for menu • Scroll to zoom</span>
      </div>
      
      {/* Create entity dialog */}
      <CreateEntityDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreate={handleNodeCreated}
        defaultType={createDialogType}
        position={contextPosition}
      />
    </div>
  );
};

export default InvestigationGraph;
