import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import {
  User, Mail, Phone, AtSign, Image, Database,
  Copy, Plus, FolderOpen, Settings, Search,
  Square, Loader2, X, Link2, ChevronRight,
  Globe, ShieldAlert, CheckCircle2
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────
type NodeType = 'name' | 'email' | 'phone' | 'username' | 'image' | 'data';

interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  value: string;
  x: number;
  y: number;
  parentId?: string;
}

interface GraphLink {
  id: string;
  sourceId: string;
  targetId: string;
}

interface SearchResult {
  type: NodeType;
  label: string;
  value: string;
  icon: string;
  source: string;
}

// ─── Config ──────────────────────────────────────────────
const NODE_CONFIG: Record<NodeType, { color: string; icon: typeof User; label: string }> = {
  name:     { color: '#06b6d4', icon: User,     label: 'Name' },
  email:    { color: '#8b5cf6', icon: Mail,     label: 'Email' },
  phone:    { color: '#ec4899', icon: Phone,    label: 'Phone' },
  username: { color: '#f59e0b', icon: AtSign,   label: 'Username' },
  image:    { color: '#f43f5e', icon: Image,    label: 'Image' },
  data:     { color: '#64748b', icon: Database, label: 'Data' },
};

const NODE_WIDTH = 260;
const NODE_HEIGHT = 56;
const VERTICAL_GAP = 80;

// ─── Component ───────────────────────────────────────────
const OSINTGraph = () => {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLDivElement>(null);

  // Graph state
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Menu state
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [menuAnchorNodeId, setMenuAnchorNodeId] = useState<string | null>(null);

  // Dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newNodeType, setNewNodeType] = useState<NodeType>('email');
  const [newNodeLabel, setNewNodeLabel] = useState('Email');
  const [newNodeValue, setNewNodeValue] = useState('');

  // Link mode
  const [linkMode, setLinkMode] = useState(false);
  const [linkSource, setLinkSource] = useState<string | null>(null);

  // Search state
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const searchAbortRef = useRef<AbortController | null>(null);

  // ─── Node position calculator ─────────────────────────
  const getNewNodePosition = useCallback((parentId?: string) => {
    if (!parentId) {
      return { x: 400, y: 200 };
    }
    const parent = nodes.find(n => n.id === parentId);
    if (!parent) return { x: 400, y: 200 };

    // Count existing children to offset horizontally
    const siblings = nodes.filter(n => n.parentId === parentId);
    const offsetX = (siblings.length - Math.floor(siblings.length / 2)) * (NODE_WIDTH + 40);
    return {
      x: parent.x + offsetX,
      y: parent.y + NODE_HEIGHT + VERTICAL_GAP,
    };
  }, [nodes]);

  // ─── Create node ──────────────────────────────────────
  const handleCreateNode = useCallback(() => {
    if (!newNodeValue.trim()) return;

    const pos = menuAnchorNodeId
      ? getNewNodePosition(menuAnchorNodeId)
      : { x: menuPosition.x - NODE_WIDTH / 2, y: menuPosition.y - NODE_HEIGHT / 2 };

    const newNode: GraphNode = {
      id: `node-${Date.now()}`,
      type: newNodeType,
      label: newNodeLabel || NODE_CONFIG[newNodeType].label,
      value: newNodeValue.trim(),
      x: pos.x,
      y: pos.y,
      parentId: menuAnchorNodeId || undefined,
    };

    setNodes(prev => [...prev, newNode]);

    // Auto-link to parent
    if (menuAnchorNodeId) {
      setLinks(prev => [...prev, {
        id: `link-${Date.now()}`,
        sourceId: menuAnchorNodeId,
        targetId: newNode.id,
      }]);
    }

    setSelectedNodeId(newNode.id);
    setCreateDialogOpen(false);
    setNewNodeValue('');
    setMenuAnchorNodeId(null);
  }, [newNodeType, newNodeLabel, newNodeValue, menuAnchorNodeId, menuPosition, getNewNodePosition]);

  // ─── Auto-populate label from type ─────────────────────
  useEffect(() => {
    setNewNodeLabel(NODE_CONFIG[newNodeType]?.label || '');
  }, [newNodeType]);

  // ─── Copy value ────────────────────────────────────────
  const handleCopy = useCallback((value: string) => {
    navigator.clipboard.writeText(value);
    toast({ title: 'Copied to clipboard', description: value });
  }, [toast]);

  // ─── Context menu ──────────────────────────────────────
  const openMenu = useCallback((x: number, y: number, nodeId: string | null) => {
    setMenuPosition({ x, y });
    setMenuAnchorNodeId(nodeId);
    setMenuOpen(true);
  }, []);

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (linkMode) return;
    setMenuOpen(false);
    setSelectedNodeId(null);

    // Open create-node menu on click in blank canvas space
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      setMenuAnchorNodeId(null);
      setCreateDialogOpen(true);
    }
  }, [linkMode]);

  const handleNodeClick = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (linkMode) {
      if (!linkSource) {
        setLinkSource(nodeId);
        toast({ title: 'Link mode', description: 'Now click the target node' });
      } else if (linkSource !== nodeId) {
        // Check if link already exists
        const exists = links.some(l =>
          (l.sourceId === linkSource && l.targetId === nodeId) ||
          (l.sourceId === nodeId && l.targetId === linkSource)
        );
        if (!exists) {
          setLinks(prev => [...prev, {
            id: `link-${Date.now()}`,
            sourceId: linkSource,
            targetId: nodeId,
          }]);
        }
        setLinkSource(null);
        setLinkMode(false);
      }
      return;
    }

    setSelectedNodeId(nodeId);
    setMenuOpen(false);
  }, [linkMode, linkSource, links, toast]);

  const handleNodeContextMenu = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      openMenu(e.clientX - rect.left, e.clientY - rect.top, nodeId);
    }
  }, [openMenu]);

  // ─── Search ────────────────────────────────────────────
  const startSearch = useCallback(async () => {
    const node = nodes.find(n => n.id === selectedNodeId);
    if (!node) return;

    setIsSearching(true);
    setSearchResults([]);
    const controller = new AbortController();
    searchAbortRef.current = controller;

    try {
      // Determine which edge function to call based on node type
      let functionName = '';
      const body: Record<string, string> = { target: node.value };

      switch (node.type) {
        case 'email':
          functionName = 'osint-holehe';
          break;
        case 'username':
          functionName = 'osint-sherlock';
          break;
        case 'phone':
          functionName = 'osint-phone-lookup';
          break;
        case 'name':
          functionName = 'osint-people-search';
          break;
        default:
          functionName = 'osint-web-search';
      }

      const { data, error } = await supabase.functions.invoke(functionName, {
        body,
      });

      if (controller.signal.aborted) return;

      if (error) {
        toast({ title: 'Search error', description: error.message, variant: 'destructive' });
        setIsSearching(false);
        return;
      }

      // Parse results based on function type
      const results: SearchResult[] = [];

      if (functionName === 'osint-holehe' && data?.allResults) {
        data.allResults
          .filter((r: any) => r.exists)
          .slice(0, 20)
          .forEach((r: any) => {
            results.push({
              type: 'data',
              label: r.name,
              value: r.domain,
              icon: 'globe',
              source: 'Holehe',
            });
          });
      } else if (functionName === 'osint-sherlock' && data?.profileLinks) {
        data.profileLinks.slice(0, 20).forEach((p: any) => {
          results.push({
            type: 'username',
            label: p.platform || p.name,
            value: p.url || p.platform,
            icon: 'globe',
            source: 'Sherlock',
          });
        });
      } else if (data?.results || data?.data) {
        const items = data.results || data.data || [];
        (Array.isArray(items) ? items : [items]).slice(0, 15).forEach((item: any) => {
          results.push({
            type: 'data',
            label: item.name || item.title || item.platform || 'Result',
            value: item.value || item.url || item.link || JSON.stringify(item).slice(0, 80),
            icon: 'database',
            source: functionName.replace('osint-', ''),
          });
        });
      }

      setSearchResults(results);
    } catch (err: any) {
      if (!controller.signal.aborted) {
        toast({ title: 'Search failed', description: err.message, variant: 'destructive' });
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsSearching(false);
      }
    }
  }, [selectedNodeId, nodes, toast]);

  const stopSearch = useCallback(() => {
    searchAbortRef.current?.abort();
    setIsSearching(false);
    setSearchResults([]);
  }, []);

  // ─── Add search result as node ─────────────────────────
  const addResultAsNode = useCallback((result: SearchResult) => {
    if (!selectedNodeId) return;
    const parent = nodes.find(n => n.id === selectedNodeId);
    if (!parent) return;

    const siblings = nodes.filter(n => n.parentId === selectedNodeId);
    const pos = {
      x: parent.x + (siblings.length * 40) - 60,
      y: parent.y + NODE_HEIGHT + VERTICAL_GAP,
    };

    const newNode: GraphNode = {
      id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: result.type,
      label: result.label,
      value: result.value,
      x: pos.x,
      y: pos.y,
      parentId: selectedNodeId,
    };

    setNodes(prev => [...prev, newNode]);
    setLinks(prev => [...prev, {
      id: `link-${Date.now()}`,
      sourceId: selectedNodeId,
      targetId: newNode.id,
    }]);

    toast({ title: `Added: ${result.label}` });
  }, [selectedNodeId, nodes, toast]);

  // ─── SVG connection line (curved dotted) ───────────────
  const renderLink = useCallback((link: GraphLink) => {
    const source = nodes.find(n => n.id === link.sourceId);
    const target = nodes.find(n => n.id === link.targetId);
    if (!source || !target) return null;

    const sx = source.x + NODE_WIDTH / 2;
    const sy = source.y + NODE_HEIGHT;
    const tx = target.x + NODE_WIDTH / 2;
    const ty = target.y;

    const midY = (sy + ty) / 2;
    const d = `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`;

    return (
      <path
        key={link.id}
        d={d}
        fill="none"
        stroke="#06b6d4"
        strokeWidth={2}
        strokeDasharray="6 4"
        opacity={0.6}
      />
    );
  }, [nodes]);

  // ─── Drag support ──────────────────────────────────────
  const [dragState, setDragState] = useState<{ nodeId: string; offsetX: number; offsetY: number } | null>(null);

  const handleDragStart = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDragState({
      nodeId,
      offsetX: e.clientX - rect.left - node.x,
      offsetY: e.clientY - rect.top - node.y,
    });
  }, [nodes]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragState) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left - dragState.offsetX;
    const y = e.clientY - rect.top - dragState.offsetY;
    setNodes(prev => prev.map(n => n.id === dragState.nodeId ? { ...n, x, y } : n));
  }, [dragState]);

  const handleMouseUp = useCallback(() => {
    setDragState(null);
  }, []);

  // ─── Selected node info ─────────────────────────────────
  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  return (
    <div className="flex h-full w-full bg-background">
      {/* ─── Canvas ────────────────────────────────── */}
      <div
        ref={canvasRef}
        className="flex-1 relative overflow-auto"
        style={{ background: 'radial-gradient(circle, hsl(var(--muted)) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
        onClick={handleCanvasClick}
        onContextMenu={(e) => {
          e.preventDefault();
          if (linkMode) return;
          const rect = canvasRef.current?.getBoundingClientRect();
          if (rect) {
            setMenuPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
            setMenuAnchorNodeId(null);
            setCreateDialogOpen(true);
          }
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* SVG links layer */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ minHeight: '100%', minWidth: '100%' }}>
          {links.map(renderLink)}
        </svg>

        {/* Empty state: starting cell */}
        {nodes.length === 0 && (
          <button
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-16 border-2 border-dashed border-muted-foreground/40 rounded-xl flex items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              const rect = canvasRef.current?.getBoundingClientRect();
              if (rect) openMenu(e.clientX - rect.left, e.clientY - rect.top, null);
            }}
          >
            <Plus className="h-5 w-5" />
            <span className="text-sm font-medium">Click to start investigation</span>
          </button>
        )}

        {/* Nodes */}
        {nodes.map(node => {
          const config = NODE_CONFIG[node.type];
          const Icon = config.icon;
          const isSelected = node.id === selectedNodeId;

          return (
            <div
              key={node.id}
              className={`absolute select-none cursor-pointer rounded-xl border-2 transition-shadow ${
                isSelected ? 'ring-2 ring-primary shadow-lg' : 'hover:shadow-md'
              }`}
              style={{
                left: node.x,
                top: node.y,
                width: NODE_WIDTH,
                height: NODE_HEIGHT,
                borderColor: config.color,
                backgroundColor: `${config.color}10`,
              }}
              onClick={(e) => handleNodeClick(node.id, e)}
              onContextMenu={(e) => handleNodeContextMenu(node.id, e)}
              onMouseDown={(e) => handleDragStart(node.id, e)}
            >
              <div className="flex items-center h-full px-3 gap-3">
                {/* Type icon */}
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${config.color}20` }}
                >
                  <Icon className="h-4 w-4" style={{ color: config.color }} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: config.color }}>
                    {node.label}
                  </div>
                  <div className="text-sm font-medium text-foreground truncate">
                    {node.value}
                  </div>
                </div>

                {/* Copy button */}
                <button
                  className="flex-shrink-0 p-1.5 rounded-md hover:bg-muted transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopy(node.value);
                  }}
                >
                  <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
            </div>
          );
        })}

        {/* Context Menu */}
        {menuOpen && (
          <div
            className="absolute z-50 w-52 rounded-xl border border-border bg-popover shadow-xl py-1 animate-in fade-in-0 zoom-in-95"
            style={{ left: menuPosition.x, top: menuPosition.y }}
          >
            <button
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
              onClick={() => {
                setMenuOpen(false);
                setCreateDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 text-primary" />
              Create node
            </button>
            <button
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
              onClick={() => {
                setMenuOpen(false);
                toast({ title: 'Groups', description: 'Group functionality coming soon' });
              }}
            >
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              Create group
            </button>
            <button
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
              onClick={() => {
                setMenuOpen(false);
                toast({ title: 'Settings', description: 'Settings panel coming soon' });
              }}
            >
              <Settings className="h-4 w-4 text-muted-foreground" />
              Open settings
            </button>
            <button
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
              onClick={() => {
                setMenuOpen(false);
                toast({ title: 'Storage', description: 'Storage panel coming soon' });
              }}
            >
              <Database className="h-4 w-4 text-muted-foreground" />
              Open storage
            </button>
          </div>
        )}
      </div>

      {/* ─── Right Panel ──────────────────────────── */}
      <div className="w-80 border-l border-border bg-card flex flex-col">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Investigation Panel</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {selectedNode
              ? `Selected: ${selectedNode.label} — ${selectedNode.value}`
              : 'Select a node to search or link'}
          </p>
        </div>

        {/* Controls */}
        <div className="p-4 space-y-2 border-b border-border">
          {!isSearching ? (
            <Button
              className="w-full gap-2"
              disabled={!selectedNode}
              onClick={startSearch}
            >
              <Search className="h-4 w-4" />
              Start Search
            </Button>
          ) : (
            <Button
              variant="destructive"
              className="w-full gap-2"
              onClick={stopSearch}
            >
              <Square className="h-4 w-4" />
              Stop Search
            </Button>
          )}

          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => {
              setLinkMode(true);
              setLinkSource(null);
              toast({ title: 'Link mode', description: 'Click the source node, then click the target' });
            }}
            disabled={nodes.length < 2}
          >
            <Link2 className="h-4 w-4" />
            Create Link
          </Button>

          {linkMode && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => { setLinkMode(false); setLinkSource(null); }}
            >
              <X className="h-3 w-3 mr-1" /> Cancel link mode
            </Button>
          )}
        </div>

        {/* Search status */}
        {isSearching && (
          <div className="p-4 flex items-center gap-3 text-sm text-muted-foreground border-b border-border">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Searching {selectedNode?.value}...
          </div>
        )}

        {/* Search results */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-2">
            {searchResults.length > 0 && (
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {searchResults.length} Results Found
              </div>
            )}
            {searchResults.map((result, i) => (
              <button
                key={i}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors text-left group"
                onClick={() => addResultAsNode(result)}
              >
                <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                  {result.icon === 'globe' ? <Globe className="h-3.5 w-3.5 text-primary" /> :
                   result.icon === 'shield' ? <ShieldAlert className="h-3.5 w-3.5 text-destructive" /> :
                   <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{result.label}</div>
                  <div className="text-xs text-muted-foreground truncate">{result.value}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}

            {searchResults.length === 0 && !isSearching && nodes.length > 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">
                Select a node and click "Start Search" to begin investigation
              </p>
            )}
          </div>
        </ScrollArea>

        {/* Stats */}
        <div className="p-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <span>{nodes.length} nodes</span>
          <span>{links.length} links</span>
        </div>
      </div>

      {/* ─── Create Node Dialog ───────────────────── */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Node</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Node Type</Label>
              <Select value={newNodeType} onValueChange={(v) => {
                const t = v as NodeType;
                setNewNodeType(t);
                setNewNodeLabel(NODE_CONFIG[t].label);
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(NODE_CONFIG).map(([key, cfg]) => {
                    const Icon = cfg.icon;
                    return (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" style={{ color: cfg.color }} />
                          {cfg.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Value</Label>
              <Input
                value={newNodeValue}
                onChange={(e) => setNewNodeValue(e.target.value)}
                placeholder={
                  newNodeType === 'email' ? 'john@example.com' :
                  newNodeType === 'phone' ? '+1-555-123-4567' :
                  newNodeType === 'name' ? 'John Smith' :
                  newNodeType === 'username' ? '@johndoe' :
                  'Enter value...'
                }
                autoFocus
              />
              {/* Suggestions from existing nodes & search results */}
              {(() => {
                const suggestions = [
                  ...nodes.filter(n => n.type === newNodeType).map(n => n.value),
                  ...searchResults.filter(r => r.type === newNodeType).map(r => r.value),
                ].filter((v, i, a) => a.indexOf(v) === i); // dedupe
                if (suggestions.length === 0) return null;
                return (
                  <div className="space-y-1 pt-1">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Suggestions</span>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.slice(0, 8).map((val) => (
                        <button
                          key={val}
                          type="button"
                          className="text-xs px-2.5 py-1 rounded-full border border-border bg-muted/50 hover:bg-primary/10 hover:border-primary/40 text-foreground transition-colors truncate max-w-[200px]"
                          onClick={() => setNewNodeValue(val)}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateNode} disabled={!newNodeValue.trim()}>
              Add Node
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OSINTGraph;
