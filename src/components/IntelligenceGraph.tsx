import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Search, User, Mail, Phone, AtSign, Image, FileText,
  Plus, X, ChevronRight, ChevronDown, Download, Check,
  Loader, Link2, Trash2, Lock, Unlock, Settings, Database,
  Undo2, Redo2, MousePointer, Eraser, Clock, Map,
  LayoutGrid, CheckSquare, Square
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';

export interface PivotData {
  type: 'username' | 'email' | 'phone' | 'name' | 'address';
  value: string;
  source?: string;
}

interface IntelligenceGraphProps {
  investigationId?: string | null;
  targetName?: string;
  active?: boolean;
  onPivot?: (pivotData: PivotData) => void;
}

interface GraphNode {
  id: string;
  type: string;
  label: string;
  value: string;
  data: Record<string, any>;
  position: { x: number; y: number };
  locked: boolean;
}

interface Connection {
  id: string;
  from: string;
  to: string;
  label: string;
  field: string;
}

interface HistoryEntry {
  nodes: GraphNode[];
  connections: Connection[];
}

type ActiveTab = 'graph' | 'timeline' | 'map';
type CanvasToolMode = 'interact' | 'link' | 'search' | 'eraser';
type NodeType = 'name' | 'email' | 'phone' | 'username' | 'image' | 'general';

const nodeTypeConfig: Record<NodeType, { icon: typeof User; color: string; label: string }> = {
  name: { icon: User, color: '#06b6d4', label: 'Name' },
  email: { icon: Mail, color: '#8b5cf6', label: 'Email' },
  phone: { icon: Phone, color: '#ec4899', label: 'Phone' },
  username: { icon: AtSign, color: '#f59e0b', label: 'Username' },
  image: { icon: Image, color: '#f43f5e', label: 'Image' },
  general: { icon: FileText, color: '#64748b', label: 'General' },
};

const platformMeta: Record<string, { displayName: string; color: string }> = {
  microsoft: { displayName: 'Microsoft', color: '#00a4ef' },
  hubspot: { displayName: 'HubSpot', color: '#ff7a59' },
  slack: { displayName: 'Slack', color: '#4a154b' },
  notion: { displayName: 'Notion', color: '#444' },
  asana: { displayName: 'Asana', color: '#f06a6a' },
  trello: { displayName: 'Trello', color: '#0079bf' },
  atlassian: { displayName: 'Atlassian', color: '#0052cc' },
  zoom: { displayName: 'Zoom', color: '#2d8cff' },
  dropbox: { displayName: 'Dropbox', color: '#0061ff' },
  mailchimp: { displayName: 'Mailchimp', color: '#ffe01b' },
  shopify: { displayName: 'Shopify', color: '#96bf48' },
  adobe: { displayName: 'Adobe', color: '#ff0000' },
  canva: { displayName: 'Canva', color: '#00c4cc' },
  figma: { displayName: 'Figma', color: '#f24e1e' },
  github: { displayName: 'GitHub', color: '#8b949e' },
  gravatar: { displayName: 'Gravatar', color: '#1e8cbe' },
  wordpress: { displayName: 'WordPress', color: '#21759b' },
  duolingo: { displayName: 'Duolingo', color: '#58cc02' },
  evernote: { displayName: 'Evernote', color: '#00a82d' },
  spotify: { displayName: 'Spotify', color: '#1db954' },
  peloton: { displayName: 'Peloton', color: '#c91c1c' },
  fitbit: { displayName: 'Fitbit', color: '#00b0b9' },
  strava: { displayName: 'Strava', color: '#fc4c02' },
  myfitnesspal: { displayName: 'MyFitnessPal', color: '#0070e0' },
  nike: { displayName: 'Nike', color: '#f5f5f5' },
  garmin: { displayName: 'Garmin', color: '#007cc3' },
  tinder: { displayName: 'Tinder', color: '#fe3c72' },
  bumble: { displayName: 'Bumble', color: '#ffc629' },
  hinge: { displayName: 'Hinge', color: '#8b8b8b' },
  okcupid: { displayName: 'OkCupid', color: '#0500ff' },
  steam: { displayName: 'Steam', color: '#66c0f4' },
  discord: { displayName: 'Discord', color: '#5865f2' },
  epicgames: { displayName: 'Epic Games', color: '#888' },
  xbox: { displayName: 'Xbox', color: '#107c10' },
  playstation: { displayName: 'PlayStation', color: '#003087' },
  nintendo: { displayName: 'Nintendo', color: '#e60012' },
  twitch: { displayName: 'Twitch', color: '#9146ff' },
  ebay: { displayName: 'eBay', color: '#e53238' },
  etsy: { displayName: 'Etsy', color: '#f56400' },
  amazon: { displayName: 'Amazon', color: '#ff9900' },
  paypal: { displayName: 'PayPal', color: '#003087' },
  venmo: { displayName: 'Venmo', color: '#3d95ce' },
  whatsapp: { displayName: 'WhatsApp', color: '#25d366' },
  telegram: { displayName: 'Telegram', color: '#0088cc' },
  viber: { displayName: 'Viber', color: '#7360f2' },
  signal: { displayName: 'Signal', color: '#3a76f0' },
  snapchat: { displayName: 'Snapchat', color: '#fffc00' },
  truecaller: { displayName: 'Truecaller', color: '#0099ff' },
  textnow: { displayName: 'TextNow', color: '#00d084' },
  roblox: { displayName: 'Roblox', color: '#e2231a' },
  poshmark: { displayName: 'Poshmark', color: '#7f0353' },
  depop: { displayName: 'Depop', color: '#ff2300' },
};

const IntelligenceGraph = ({ investigationId, targetName, active, onPivot }: IntelligenceGraphProps) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('graph');
  const [nodes, setNodes] = useState<GraphNode[]>(() => {
    // Start with subject node in center
    const name = targetName || 'Michael Petrie';
    return [{
      id: 'subject-root',
      type: 'name',
      label: name,
      value: name,
      data: { source: 'subject' },
      position: { x: 450, y: 300 },
      locked: false,
    }];
  });
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [toolMode, setToolMode] = useState<CanvasToolMode>('interact');

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; canvasX: number; canvasY: number } | null>(null);

  // Node action menu
  const [nodeActionMenu, setNodeActionMenu] = useState<string | null>(null);

  // Create node dialog
  const [showCreateNode, setShowCreateNode] = useState(false);
  const [createNodePos, setCreateNodePos] = useState({ x: 400, y: 300 });
  const [newNodeType, setNewNodeType] = useState<NodeType>('email');
  const [newNodeLabel, setNewNodeLabel] = useState('');
  const [newNodeValue, setNewNodeValue] = useState('');

  // Link mode
  const [linkSource, setLinkSource] = useState<string | null>(null);

  // History for undo/redo
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Search results panel
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedResults, setSelectedResults] = useState<Set<number>>(new Set());
  const [searchedNode, setSearchedNode] = useState<GraphNode | null>(null);

  // Import findings
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [availableFindings, setAvailableFindings] = useState<any[]>([]);
  const [selectedFindings, setSelectedFindings] = useState<Set<string>>(new Set());
  const [isLoadingFindings, setIsLoadingFindings] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);

  // Push state to history
  const pushHistory = useCallback(() => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push({ nodes: JSON.parse(JSON.stringify(nodes)), connections: JSON.parse(JSON.stringify(connections)) });
      return newHistory;
    });
    setHistoryIndex(prev => prev + 1);
  }, [nodes, connections, historyIndex]);

  const undo = () => {
    if (historyIndex <= 0) return;
    const entry = history[historyIndex - 1];
    setNodes(entry.nodes);
    setConnections(entry.connections);
    setHistoryIndex(prev => prev - 1);
  };

  const redo = () => {
    if (historyIndex >= history.length - 1) return;
    const entry = history[historyIndex + 1];
    setNodes(entry.nodes);
    setConnections(entry.connections);
    setHistoryIndex(prev => prev + 1);
  };

  // Canvas right-click
  const handleCanvasContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      canvasX: e.clientX - rect.left,
      canvasY: e.clientY - rect.top,
    });
    setNodeActionMenu(null);
  };

  const handleCanvasClick = () => {
    setContextMenu(null);
    setNodeActionMenu(null);
    if (toolMode !== 'link') {
      setSelectedNode(null);
    }
  };

  // Create node
  const openCreateNodeDialog = () => {
    if (contextMenu) {
      setCreateNodePos({ x: contextMenu.canvasX, y: contextMenu.canvasY });
    }
    setContextMenu(null);
    setNewNodeType('email');
    setNewNodeLabel('');
    setNewNodeValue('');
    setShowCreateNode(true);
  };

  const handleCreateNode = () => {
    if (!newNodeValue.trim()) return;
    pushHistory();
    const node: GraphNode = {
      id: `node-${Date.now()}`,
      type: newNodeType,
      label: newNodeLabel.trim() || newNodeType,
      value: newNodeValue.trim(),
      data: { source: 'manual' },
      position: createNodePos,
      locked: false,
    };
    setNodes(prev => [...prev, node]);
    setShowCreateNode(false);
  };

  // Node click
  const handleNodeClick = (e: React.MouseEvent, node: GraphNode) => {
    e.stopPropagation();
    if (toolMode === 'link' && linkSource) {
      // Complete link
      if (linkSource !== node.id) {
        pushHistory();
        setConnections(prev => [...prev, {
          id: `conn-${Date.now()}`,
          from: linkSource,
          to: node.id,
          label: 'linked',
          field: node.type,
        }]);
      }
      setLinkSource(null);
      setToolMode('interact');
      return;
    }
    if (toolMode === 'eraser') {
      // Erase connections to this node
      pushHistory();
      setConnections(prev => prev.filter(c => c.from !== node.id && c.to !== node.id));
      return;
    }
    setSelectedNode(node);
    setNodeActionMenu(node.id);
    setContextMenu(null);
  };

  // Node actions
  const startLink = (nodeId: string) => {
    setLinkSource(nodeId);
    setToolMode('link');
    setNodeActionMenu(null);
  };

  const startSearch = (node: GraphNode) => {
    setNodeActionMenu(null);
    // Run enrichment search directly in the right panel — no pivot/navigation
    runSearch(node);
  };

  const runSearch = async (node: GraphNode) => {
    setIsSearching(true);
    setSearchResults([]);
    setSelectedResults(new Set());
    setSearchedNode(node);
    try {
      const { data, error } = await supabase.functions.invoke('osint-selector-enrichment', {
        body: { selector: node.value, type: 'auto' },
      });
      if (!error && data?.results) {
        setSearchResults(data.results.filter((r: any) => r.exists).slice(0, 30));
      }
    } catch { /* ignore */ } finally {
      setIsSearching(false);
    }
  };

  const updateNodeLock = (nodeId: string) => {
    pushHistory();
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, locked: !n.locked } : n));
    setNodeActionMenu(null);
  };

  const removeNode = (nodeId: string) => {
    pushHistory();
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setConnections(prev => prev.filter(c => c.from !== nodeId && c.to !== nodeId));
    if (selectedNode?.id === nodeId) setSelectedNode(null);
    setNodeActionMenu(null);
  };

  // Drag
  const handleMouseDown = (e: React.MouseEvent, node: GraphNode) => {
    if (e.button !== 0 || node.locked) return;
    if (toolMode !== 'interact' && toolMode !== 'link') return;
    setIsDragging(true);
    setDraggedNode(node.id);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !draggedNode) return;
    setNodes(prev => prev.map(n =>
      n.id === draggedNode ? { ...n, position: { x: n.position.x + e.movementX, y: n.position.y + e.movementY } } : n
    ));
  }, [isDragging, draggedNode]);

  const handleMouseUp = useCallback(() => {
    if (isDragging) pushHistory();
    setIsDragging(false);
    setDraggedNode(null);
  }, [isDragging, pushHistory]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Import findings
  const loadFindings = async () => {
    if (!investigationId) return;
    setIsLoadingFindings(true);
    try {
      const { data } = await supabase.from('findings').select('*').eq('investigation_id', investigationId).order('created_at', { ascending: false });
      if (data) setAvailableFindings(data);
    } finally { setIsLoadingFindings(false); }
  };

  const classifyFindingType = (finding: any): string => {
    const agent = finding.agent_type?.toLowerCase() || '';
    const src = finding.source?.toLowerCase() || '';
    if (agent.includes('people') || agent.includes('person') || src.includes('people')) return 'name';
    if (agent.includes('email') || src.includes('email')) return 'email';
    if (agent.includes('phone') || src.includes('phone')) return 'phone';
    if (agent.includes('username') || src.includes('username') || src.includes('sherlock')) return 'username';
    return 'general';
  };

  const getFindingLabel = (finding: any): string => {
    const d = finding.data as any;
    return d?.name || d?.email || d?.phone || d?.username || d?.platform || finding.source || 'Unknown';
  };

  const importSelectedFindings = () => {
    pushHistory();
    const selected = availableFindings.filter(f => selectedFindings.has(f.id));
    const existingLabels = new Set(nodes.map(n => n.value));
    const cx = 450, cy = 300, radius = 250;
    const step = selected.length > 0 ? (2 * Math.PI) / selected.length : 0;
    const newNodes: GraphNode[] = [];
    const newConns: Connection[] = [];

    selected.forEach((finding, i) => {
      const label = getFindingLabel(finding);
      if (existingLabels.has(label)) return;
      const nodeType = classifyFindingType(finding);
      const angle = i * step - Math.PI / 2;
      const node: GraphNode = {
        id: `imported-${finding.id}`,
        type: nodeType,
        label,
        value: label,
        data: typeof finding.data === 'object' && finding.data !== null ? finding.data as Record<string, any> : {},
        position: { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) },
        locked: false,
      };
      newNodes.push(node);
      if (nodes.length > 0) {
        newConns.push({ id: `conn-import-${finding.id}`, from: nodes[0].id, to: node.id, label: finding.agent_type || 'finding', field: nodeType });
      }
    });

    setNodes(prev => [...prev, ...newNodes]);
    setConnections(prev => [...prev, ...newConns]);
    setShowImportDialog(false);
  };

  // Add search results to graph
  const addResultsToGraph = () => {
    pushHistory();
    const selected = Array.from(selectedResults);
    const subjectNode = nodes[0];
    selected.forEach((idx, i) => {
      const result = searchResults[idx];
      if (!result) return;
      const existingNode = nodes.find(n => n.value === result.platform);
      if (existingNode) return;
      const newNode: GraphNode = {
        id: `result-${Date.now()}-${i}`,
        type: 'general',
        label: result.platform,
        value: result.platform,
        data: { ...result },
        position: { x: subjectNode.position.x + 350 + i * 30, y: subjectNode.position.y - 100 + i * 60 },
        locked: false,
      };
      setNodes(prev => [...prev, newNode]);
      setConnections(prev => [...prev, { id: `conn-result-${Date.now()}-${i}`, from: subjectNode.id, to: newNode.id, label: 'found_on', field: 'general' }]);
    });
    setSelectedResults(new Set());
  };

  const toggleAllResults = () => {
    if (selectedResults.size === searchResults.length) {
      setSelectedResults(new Set());
    } else {
      setSelectedResults(new Set(searchResults.map((_, i) => i)));
    }
  };

  // ──── Render ────
  const tabs: { id: ActiveTab; label: string; icon: typeof LayoutGrid }[] = [
    { id: 'graph', label: 'Graph', icon: LayoutGrid },
    { id: 'timeline', label: 'Timeline', icon: Clock },
    { id: 'map', label: 'Map', icon: Map },
  ];

  return (
    <div className="relative w-full flex" style={{ height: 750 }}>
      {/* Main canvas area */}
      <div className="flex-1 flex flex-col overflow-hidden rounded-l-xl border" style={{ background: '#0a0e17', borderColor: 'rgba(51,65,85,0.3)' }}>
        {/* Tab bar */}
        <div className="relative z-20 flex items-center gap-0 border-b" style={{ borderColor: 'rgba(51,65,85,0.4)' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'text-cyan-400 border-cyan-400 bg-cyan-400/5'
                  : 'text-slate-500 border-transparent hover:text-slate-300 hover:bg-slate-800/30'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
          <div className="flex-1" />
          <div className="flex items-center gap-2 pr-4">
            {investigationId && (
              <button
                onClick={() => { setShowImportDialog(true); setSelectedFindings(new Set()); loadFindings(); }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-600/20 border border-cyan-500/30 text-cyan-400 text-xs font-medium hover:bg-cyan-600/30 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Import Findings
              </button>
            )}
            <span className="px-2 py-1 rounded bg-slate-800/50 border border-slate-700/50 text-[10px] text-slate-400">
              {nodes.length} nodes · {connections.length} links
            </span>
          </div>
        </div>

        {/* Canvas */}
        {activeTab === 'graph' && (
          <div className="flex-1 relative overflow-hidden">
            {/* Dot grid bg */}
            <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, rgba(51,65,85,0.3) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

            {/* Link mode indicator */}
            {toolMode === 'link' && linkSource && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-lg bg-cyan-600/20 border border-cyan-500/40 text-cyan-400 text-xs font-medium">
                Click a node to complete the link · Press Esc to cancel
              </div>
            )}

            <div
              ref={canvasRef}
              className="absolute inset-0"
              onClick={handleCanvasClick}
              onContextMenu={handleCanvasContextMenu}
              style={{ cursor: toolMode === 'link' ? 'crosshair' : toolMode === 'eraser' ? 'not-allowed' : isDragging ? 'grabbing' : 'default' }}
            >
              {/* SVG connections */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 5 }}>
                {connections.map(conn => {
                  const from = nodes.find(n => n.id === conn.from);
                  const to = nodes.find(n => n.id === conn.to);
                  if (!from || !to) return null;
                  const x1 = from.position.x + 80, y1 = from.position.y + 20;
                  const x2 = to.position.x + 80, y2 = to.position.y + 20;
                  const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
                  const color = nodeTypeConfig[conn.field as NodeType]?.color || '#64748b';
                  return (
                    <g key={conn.id}>
                      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1.5} strokeOpacity={0.4} strokeDasharray="6 3" />
                      <circle cx={midX} cy={midY} r={10} fill="rgba(15,23,42,0.9)" stroke={color} strokeWidth={1} />
                      <text x={midX} y={midY + 3} textAnchor="middle" fill={color} fontSize={7} fontWeight={500}>{conn.label}</text>
                    </g>
                  );
                })}
              </svg>

              {/* Nodes */}
              {nodes.map(node => {
                const cfg = nodeTypeConfig[node.type as NodeType] || nodeTypeConfig.general;
                const Icon = cfg.icon;
                const isSubject = node.id === 'subject-root';
                const isSelected = selectedNode?.id === node.id;
                const showActions = nodeActionMenu === node.id;

                return (
                  <div
                    key={node.id}
                    style={{
                      position: 'absolute',
                      left: node.position.x,
                      top: node.position.y,
                      zIndex: showActions ? 50 : 10,
                    }}
                    onMouseDown={(e) => { if (!showActions) handleMouseDown(e, node); }}
                    onClick={(e) => handleNodeClick(e, node)}
                  >
                    <div
                      className={`rounded-lg border transition-all ${isSubject ? 'px-5 py-3' : 'px-4 py-2.5'}`}
                      style={{
                        background: '#0d1117',
                        borderColor: isSelected ? cfg.color : 'rgba(51,65,85,0.5)',
                        boxShadow: isSelected ? `0 0 20px ${cfg.color}25` : '0 2px 8px rgba(0,0,0,0.3)',
                        cursor: node.locked ? 'default' : 'grab',
                        minWidth: isSubject ? 180 : 160,
                      }}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded flex items-center justify-center" style={{ backgroundColor: `${cfg.color}15` }}>
                          <Icon className="w-4 h-4" style={{ color: cfg.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[9px] uppercase tracking-widest font-medium" style={{ color: `${cfg.color}99` }}>{cfg.label}</p>
                          <p className={`font-semibold text-slate-100 truncate ${isSubject ? 'text-sm' : 'text-xs'}`}>{node.value}</p>
                        </div>
                        {node.locked && <Lock className="w-3 h-3 text-slate-600" />}
                      </div>
                    </div>

                    {/* Node action dropdown */}
                    {showActions && (
                      <div
                        className="absolute left-0 top-full mt-1 w-44 rounded-lg border overflow-hidden z-50"
                        style={{ background: '#0d1117', borderColor: 'rgba(51,65,85,0.5)' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button onClick={() => startLink(node.id)} className="w-full px-3 py-2.5 text-xs text-slate-300 hover:bg-slate-800 flex items-center gap-2.5 transition-colors">
                          <Link2 className="w-3.5 h-3.5 text-cyan-400" /> Start Link
                        </button>
                        <button onClick={() => startSearch(node)} className="w-full px-3 py-2.5 text-xs text-slate-300 hover:bg-slate-800 flex items-center gap-2.5 transition-colors">
                          <Search className="w-3.5 h-3.5 text-green-400" /> Start Search
                        </button>
                        <button onClick={() => { /* TODO: update node dialog */ setNodeActionMenu(null); }} className="w-full px-3 py-2.5 text-xs text-slate-300 hover:bg-slate-800 flex items-center gap-2.5 transition-colors">
                          <Settings className="w-3.5 h-3.5 text-amber-400" /> Update Node
                        </button>
                        <button onClick={() => updateNodeLock(node.id)} className="w-full px-3 py-2.5 text-xs text-slate-300 hover:bg-slate-800 flex items-center gap-2.5 transition-colors">
                          {node.locked ? <Unlock className="w-3.5 h-3.5 text-slate-400" /> : <Lock className="w-3.5 h-3.5 text-slate-400" />}
                          {node.locked ? 'Unlock Node' : 'Lock Node'}
                        </button>
                        <div className="border-t" style={{ borderColor: 'rgba(51,65,85,0.3)' }} />
                        <button onClick={() => removeNode(node.id)} className="w-full px-3 py-2.5 text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2.5 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" /> Remove Node
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Canvas context menu */}
            {contextMenu && (
              <div
                className="fixed z-50 w-48 rounded-lg border overflow-hidden shadow-xl"
                style={{ left: contextMenu.x, top: contextMenu.y, background: '#0d1117', borderColor: 'rgba(51,65,85,0.5)' }}
              >
                <button onClick={openCreateNodeDialog} className="w-full px-3 py-2.5 text-xs text-slate-300 hover:bg-slate-800 flex items-center gap-2.5 transition-colors">
                  <Plus className="w-3.5 h-3.5 text-cyan-400" /> Create Node
                </button>
                <button onClick={() => { setContextMenu(null); }} className="w-full px-3 py-2.5 text-xs text-slate-300 hover:bg-slate-800 flex items-center gap-2.5 transition-colors">
                  <LayoutGrid className="w-3.5 h-3.5 text-purple-400" /> Create Group
                </button>
                <div className="border-t" style={{ borderColor: 'rgba(51,65,85,0.3)' }} />
                <button onClick={() => setContextMenu(null)} className="w-full px-3 py-2.5 text-xs text-slate-300 hover:bg-slate-800 flex items-center gap-2.5 transition-colors">
                  <Settings className="w-3.5 h-3.5 text-slate-400" /> Open Settings
                </button>
                <button onClick={() => setContextMenu(null)} className="w-full px-3 py-2.5 text-xs text-slate-300 hover:bg-slate-800 flex items-center gap-2.5 transition-colors">
                  <Database className="w-3.5 h-3.5 text-slate-400" /> Open Storage
                </button>
              </div>
            )}

            {/* Bottom toolbar */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 px-2 py-1.5 rounded-xl border" style={{ background: 'rgba(13,17,23,0.95)', borderColor: 'rgba(51,65,85,0.4)' }}>
              <button onClick={undo} className="p-2 rounded-lg hover:bg-slate-800 transition-colors group" title="Undo">
                <Undo2 className="w-4 h-4 text-slate-500 group-hover:text-slate-300" />
              </button>
              <button onClick={redo} className="p-2 rounded-lg hover:bg-slate-800 transition-colors group" title="Redo">
                <Redo2 className="w-4 h-4 text-slate-500 group-hover:text-slate-300" />
              </button>
              <div className="w-px h-5 bg-slate-700 mx-1" />
              {([
                { mode: 'interact' as CanvasToolMode, icon: MousePointer, label: 'Interact' },
                { mode: 'link' as CanvasToolMode, icon: Link2, label: 'Link' },
                { mode: 'search' as CanvasToolMode, icon: Search, label: 'Search' },
                { mode: 'eraser' as CanvasToolMode, icon: Eraser, label: 'Erase' },
              ]).map(tool => (
                <button
                  key={tool.mode}
                  onClick={() => { setToolMode(tool.mode); setLinkSource(null); }}
                  className={`p-2 rounded-lg transition-colors ${toolMode === tool.mode ? 'bg-cyan-600/20 text-cyan-400' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`}
                  title={tool.label}
                >
                  <tool.icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'timeline' && (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
            <Clock className="w-5 h-5 mr-2" /> Timeline view coming soon
          </div>
        )}

        {activeTab === 'map' && (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
            <Map className="w-5 h-5 mr-2" /> Map view coming soon
          </div>
        )}
      </div>

      {/* Right results panel */}
      <div className="w-80 border-t border-r border-b rounded-r-xl flex flex-col" style={{ background: '#0d1117', borderColor: 'rgba(51,65,85,0.3)' }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(51,65,85,0.4)' }}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">Search Results</h3>
            {searchResults.length > 0 && (
              <span className="text-[10px] text-slate-500">{searchResults.length} found</span>
            )}
          </div>
          {searchedNode && (
            <div className="flex items-center gap-2 mt-2 px-2 py-1.5 rounded-md" style={{ background: 'rgba(51,65,85,0.2)' }}>
              {(() => { const cfg = nodeTypeConfig[searchedNode.type as NodeType] || nodeTypeConfig.general; const Icon = cfg.icon; return <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: cfg.color }} />; })()}
              <span className="text-[11px] text-slate-400 truncate">{searchedNode.value}</span>
            </div>
          )}
        </div>

        {isSearching ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <Loader className="w-6 h-6 text-cyan-400 animate-spin" />
            <p className="text-sm text-slate-500">Enriching selector…</p>
            <p className="text-[10px] text-slate-600">Checking platforms</p>
          </div>
        ) : searchResults.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-center px-6">
            <div>
              <Search className="w-8 h-8 text-slate-700 mx-auto mb-3" />
              <p className="text-xs text-slate-500">Click a node and select "Start Search" to enrich and see platform results here</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-2 flex items-center justify-between border-b" style={{ borderColor: 'rgba(51,65,85,0.3)' }}>
              <button onClick={toggleAllResults} className="text-[10px] text-cyan-400 hover:text-cyan-300 font-medium">
                {selectedResults.size === searchResults.length ? 'Clear selection' : 'Select All'}
              </button>
              <span className="text-[10px] text-slate-500">{selectedResults.size} selected</span>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {searchResults.map((result, idx) => {
                  const meta = platformMeta[result.platform?.toLowerCase()];
                  const displayName = meta?.displayName || result.platform;
                  const color = meta?.color || '#64748b';
                  const initials = displayName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);

                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedResults(prev => {
                          const next = new Set(prev);
                          if (next.has(idx)) next.delete(idx); else next.add(idx);
                          return next;
                        });
                      }}
                      className={`w-full rounded-lg border p-2.5 text-left transition-all ${
                        selectedResults.has(idx) ? 'bg-cyan-600/10 border-cyan-500/30' : 'bg-slate-800/20 border-transparent hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        {selectedResults.has(idx) ? (
                          <CheckSquare className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        ) : (
                          <Square className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                        )}
                        {/* Platform logo circle */}
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                          style={{ backgroundColor: color }}
                        >
                          {initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-200 truncate">{displayName}</p>
                          {result.username && <p className="text-[10px] text-slate-500 truncate">@{result.username}</p>}
                          {result.profileUrl && (
                            <a
                              href={result.profileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-[10px] text-cyan-500 hover:text-cyan-400 truncate block"
                            >
                              View profile ↗
                            </a>
                          )}
                        </div>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{ backgroundColor: `${color}20`, color }}>
                          Found
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
            {selectedResults.size > 0 && (
              <div className="px-3 py-2 border-t" style={{ borderColor: 'rgba(51,65,85,0.3)' }}>
                <Button onClick={addResultsToGraph} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white text-xs h-8">
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add {selectedResults.size} to Graph
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Node Dialog */}
      <Dialog open={showCreateNode} onOpenChange={setShowCreateNode}>
        <DialogContent className="sm:max-w-[380px] bg-slate-900 border-slate-700 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Add a New Node</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium">Node Type</label>
              <Select value={newNodeType} onValueChange={(v) => { setNewNodeType(v as NodeType); setNewNodeLabel(v); }}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {Object.entries(nodeTypeConfig).map(([key, cfg]) => (
                    <SelectItem key={key} value={key} className="text-slate-200 focus:bg-slate-700">
                      <div className="flex items-center gap-2">
                        <cfg.icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                        {cfg.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium">Label</label>
              <Input
                value={newNodeLabel}
                onChange={(e) => setNewNodeLabel(e.target.value)}
                placeholder="e.g. Email"
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium">Value</label>
              <Input
                value={newNodeValue}
                onChange={(e) => setNewNodeValue(e.target.value)}
                placeholder="e.g. mikep007@gmail.com"
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
          </div>
          <Button onClick={handleCreateNode} disabled={!newNodeValue.trim()} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white">
            <Plus className="w-4 h-4 mr-2" /> Add New Node
          </Button>
        </DialogContent>
      </Dialog>

      {/* Import Findings Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-lg bg-slate-900 border-slate-700 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Import Findings</DialogTitle>
            <DialogDescription className="text-slate-400">Select findings to add to the canvas.</DialogDescription>
          </DialogHeader>
          {isLoadingFindings ? (
            <div className="flex items-center justify-center py-12"><Loader className="w-6 h-6 text-cyan-400 animate-spin" /></div>
          ) : availableFindings.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">No findings available.</div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <button onClick={() => {
                  if (selectedFindings.size === availableFindings.length) setSelectedFindings(new Set());
                  else setSelectedFindings(new Set(availableFindings.map(f => f.id)));
                }} className="text-xs text-cyan-400 hover:text-cyan-300">
                  {selectedFindings.size === availableFindings.length ? 'Deselect All' : 'Select All'}
                </button>
                <span className="text-xs text-slate-500">{selectedFindings.size} selected</span>
              </div>
              <ScrollArea className="max-h-[360px]">
                <div className="space-y-1.5">
                  {availableFindings.map(finding => {
                    const fType = classifyFindingType(finding) as NodeType;
                    const cfg = nodeTypeConfig[fType] || nodeTypeConfig.general;
                    const isSelected = selectedFindings.has(finding.id);
                    const alreadyOnCanvas = nodes.some(n => n.value === getFindingLabel(finding));
                    return (
                      <button
                        key={finding.id}
                        onClick={() => { if (!alreadyOnCanvas) { setSelectedFindings(prev => { const n = new Set(prev); if (n.has(finding.id)) n.delete(finding.id); else n.add(finding.id); return n; }); } }}
                        disabled={alreadyOnCanvas}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${alreadyOnCanvas ? 'opacity-40' : isSelected ? 'bg-cyan-600/15 border border-cyan-500/30' : 'bg-slate-800/40 hover:bg-slate-800/70 border border-transparent'}`}
                      >
                        {alreadyOnCanvas ? <Check className="w-4 h-4 text-green-500 shrink-0" /> : isSelected ? <CheckSquare className="w-4 h-4 text-cyan-400 shrink-0" /> : <Square className="w-4 h-4 text-slate-600 shrink-0" />}
                        <div className="w-7 h-7 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: `${cfg.color}20` }}>
                          <cfg.icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-200 truncate">{getFindingLabel(finding)}</p>
                          <p className="text-[10px] text-slate-500 truncate">{finding.source} · {cfg.label}{alreadyOnCanvas && ' · On canvas'}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
              <Button onClick={importSelectedFindings} disabled={selectedFindings.size === 0} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white mt-2">
                <Download className="w-4 h-4 mr-2" /> Import {selectedFindings.size}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default IntelligenceGraph;
