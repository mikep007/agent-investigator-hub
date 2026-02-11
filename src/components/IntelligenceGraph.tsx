import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Search, User, Mail, Phone, MapPin, Users, Globe, Camera,
  MessageSquare, Shield, Plus, X, ChevronRight, Database,
  ExternalLink, Check, Loader
} from 'lucide-react';

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
  data: Record<string, any>;
  position: { x: number; y: number };
}

interface Connection {
  id: string;
  from: string;
  to: string;
  label: string;
  field: string;
}

interface DropdownResult {
  type: string;
  value: string;
  verified?: boolean;
  platforms?: string[];
  carrier?: string;
  registered?: boolean;
  platform?: string;
  followers?: number;
}

const entityTypes: Record<string, { icon: typeof User; color: string; label: string }> = {
  person: { icon: User, color: '#06b6d4', label: 'Person' },
  email: { icon: Mail, color: '#8b5cf6', label: 'Email' },
  phone: { icon: Phone, color: '#ec4899', label: 'Phone' },
  username: { icon: User, color: '#f59e0b', label: 'Username' },
  location: { icon: MapPin, color: '#10b981', label: 'Location' },
  relative: { icon: Users, color: '#3b82f6', label: 'Relative' },
  account: { icon: Globe, color: '#14b8a6', label: 'Social Account' },
  image: { icon: Camera, color: '#f43f5e', label: 'Image/Photo' },
  post: { icon: MessageSquare, color: '#a855f7', label: 'Post/Content' },
};

const IntelligenceGraph = ({ investigationId, targetName, active, onPivot }: IntelligenceGraphProps) => {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  const [showSearchDropdown, setShowSearchDropdown] = useState<string | null>(null);
  const [dropdownSearchQuery, setDropdownSearchQuery] = useState('');
  const [dropdownResults, setDropdownResults] = useState<DropdownResult[]>([]);
  const [isDropdownSearching, setIsDropdownSearching] = useState(false);
  const [hoveredConnection, setHoveredConnection] = useState<string | null>(null);

  // Search within dropdown for connections
  const searchDropdownData = async (query: string) => {
    setIsDropdownSearching(true);
    await new Promise(resolve => setTimeout(resolve, 800));

    const results: DropdownResult[] = [
      { type: 'email', value: `${query}@gmail.com`, verified: true, platforms: ['GitHub', 'Twitter'] },
      { type: 'email', value: `${query}@protonmail.com`, verified: false, platforms: ['Reddit'] },
      {
        type: 'phone',
        value: `+1 (555) ${Math.floor(Math.random() * 900) + 100}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
        carrier: 'Verizon',
        registered: true,
      },
      { type: 'username', value: `${query}_dev`, platforms: ['GitHub', 'Twitter', 'Reddit'] },
      {
        type: 'account',
        value: `Twitter: @${query}`,
        platform: 'Twitter',
        followers: Math.floor(Math.random() * 5000),
      },
    ].filter(r => r.value.toLowerCase().includes(query.toLowerCase()));

    setDropdownResults(results);
    setIsDropdownSearching(false);
  };

  const addFieldFromDropdown = (result: DropdownResult, sourceNodeId: string) => {
    const sourceNode = nodes.find(n => n.id === sourceNodeId);
    if (!sourceNode) return;

    const existingNode = nodes.find(n => n.label === result.value);

    if (existingNode) {
      setConnections(prev => [
        ...prev,
        { id: `conn-${sourceNodeId}-${existingNode.id}-${Date.now()}`, from: sourceNodeId, to: existingNode.id, label: 'discovered', field: result.type },
      ]);
    } else {
      const newNode: GraphNode = {
        id: `node-${Date.now()}`,
        type: result.type,
        label: result.value,
        data: { ...result },
        position: {
          x: sourceNode.position.x + 300 + Math.random() * 100,
          y: sourceNode.position.y + (Math.random() - 0.5) * 200,
        },
      };
      setNodes(prev => [...prev, newNode]);
      setConnections(prev => [
        ...prev,
        { id: `conn-${sourceNodeId}-${newNode.id}`, from: sourceNodeId, to: newNode.id, label: 'owns', field: result.type },
      ]);
    }

    setShowSearchDropdown(null);
    setDropdownSearchQuery('');
    setDropdownResults([]);
  };

  const investigateEntity = async (query: string) => {
    setIsSearching(true);
    await new Promise(resolve => setTimeout(resolve, 1500));

    const isEmail = query.includes('@');
    const baseIdentifier = isEmail ? query.split('@')[0] : query.toLowerCase().replace(/\s/g, '.');

    const primary: GraphNode = {
      id: `node-${Date.now()}`,
      type: isEmail ? 'email' : 'person',
      label: query,
      data: { fullName: isEmail ? baseIdentifier : query, verified: isEmail ? true : undefined, timestamp: new Date().toISOString() },
      position: { x: 400, y: 300 },
    };

    const related = [
      ...(!isEmail
        ? [
            { id: `node-${Date.now()}-1`, type: 'email', label: `${baseIdentifier}@gmail.com`, data: { verified: true, breached: false, platforms: ['GitHub', 'Twitter'] }, relationship: 'owns' },
            { id: `node-${Date.now()}-2`, type: 'email', label: `${baseIdentifier.split('.')[0]}@protonmail.com`, data: { verified: true, breached: false, platforms: ['Reddit'] }, relationship: 'owns' },
          ]
        : []),
      {
        id: `node-${Date.now()}-3`,
        type: 'phone',
        label: `+1 (${Math.floor(Math.random() * 900) + 100}) 555-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
        data: { carrier: 'Verizon', type: 'Mobile', registered: true },
        relationship: 'owns',
      },
      {
        id: `node-${Date.now()}-4`,
        type: 'username',
        label: `${baseIdentifier.replace(/\./g, '_')}_${Math.floor(Math.random() * 99)}`,
        data: { platforms: ['GitHub', 'Twitter', 'Reddit'], verified: true },
        relationship: 'uses',
      },
      {
        id: `node-${Date.now()}-5`,
        type: 'account',
        label: `Twitter: @${baseIdentifier.split('.')[0]}`,
        data: { platform: 'Twitter', followers: Math.floor(Math.random() * 5000), joined: '2019-03' },
        relationship: 'active_on',
      },
      {
        id: `node-${Date.now()}-6`,
        type: 'account',
        label: `GitHub: ${baseIdentifier.replace(/\./g, '-')}`,
        data: { platform: 'GitHub', repos: Math.floor(Math.random() * 20), followers: Math.floor(Math.random() * 100) },
        relationship: 'active_on',
      },
    ];

    setIsSearching(false);
    return { primary, related };
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    const results = await investigateEntity(searchQuery);
    const primaryNode = results.primary;
    setNodes(prev => [...prev, primaryNode]);

    const angleStep = (2 * Math.PI) / results.related.length;
    const radius = 250;

    results.related.forEach((relatedData, index) => {
      const angle = index * angleStep;
      const relatedNode: GraphNode = {
        id: relatedData.id,
        type: relatedData.type,
        label: relatedData.label,
        data: relatedData.data,
        position: {
          x: primaryNode.position.x + radius * Math.cos(angle),
          y: primaryNode.position.y + radius * Math.sin(angle),
        },
      };

      setNodes(prev => [...prev, relatedNode]);
      setConnections(prev => [
        ...prev,
        { id: `conn-${primaryNode.id}-${relatedNode.id}`, from: primaryNode.id, to: relatedNode.id, label: relatedData.relationship, field: relatedData.type },
      ]);
    });

    setSearchQuery('');
  };

  const handleMouseDown = (e: React.MouseEvent, node: GraphNode) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDraggedNode(node.id);
    setSelectedNode(node);
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !draggedNode) return;
      setNodes(prev =>
        prev.map(node =>
          node.id === draggedNode
            ? { ...node, position: { x: node.position.x + e.movementX, y: node.position.y + e.movementY } }
            : node
        )
      );
    },
    [isDragging, draggedNode]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDraggedNode(null);
  }, []);

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

  const deleteNode = (nodeId: string) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setConnections(prev => prev.filter(c => c.from !== nodeId && c.to !== nodeId));
    if (selectedNode?.id === nodeId) setSelectedNode(null);
  };

  // ──── Node Component ────
  const NodeComponent = ({ node }: { node: GraphNode }) => {
    const EntityIcon = entityTypes[node.type]?.icon || User;
    const color = entityTypes[node.type]?.color || '#64748b';
    const isSelected = selectedNode?.id === node.id;
    const showingDropdown = showSearchDropdown === node.id;

    return (
      <div
        style={{ position: 'absolute', left: node.position.x, top: node.position.y, zIndex: showingDropdown || isSelected ? 50 : 10 }}
        onMouseDown={(e) => {
          if (!showingDropdown) handleMouseDown(e, node);
        }}
        className={`transition-all duration-200 ${!showingDropdown ? 'cursor-move' : ''}`}
      >
        <div
          className="rounded-xl border backdrop-blur-sm shadow-2xl"
          style={{
            background: 'rgba(15, 23, 42, 0.95)',
            borderColor: isSelected ? color : 'rgba(51, 65, 85, 0.5)',
            boxShadow: isSelected ? `0 0 30px ${color}30, 0 4px 20px rgba(0,0,0,0.4)` : '0 4px 20px rgba(0,0,0,0.4)',
            minWidth: 280,
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 p-4 border-b" style={{ borderColor: 'rgba(51, 65, 85, 0.3)' }}>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}20` }}>
              <EntityIcon className="w-5 h-5" style={{ color }} />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: `${color}cc` }}>
                {entityTypes[node.type]?.label || node.type}
              </span>
              <p className="text-sm font-semibold text-slate-100 truncate">{node.label}</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteNode(node.id);
              }}
              className="p-1 hover:bg-red-500/20 rounded transition-colors"
            >
              <X className="w-4 h-4 text-slate-500 hover:text-red-400" />
            </button>
          </div>

          {/* Data fields */}
          <div className="px-4 py-3 space-y-1.5">
            {Object.entries(node.data || {})
              .slice(0, 3)
              .map(([key, value]) => (
                <div key={key} className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 capitalize">{key.replace(/_/g, ' ')}:</span>
                  <span className="text-slate-300 font-medium truncate ml-2 max-w-[160px]">
                    {Array.isArray(value) ? value.join(', ') : String(value)}
                  </span>
                </div>
              ))}
          </div>

          {/* Actions */}
          <div className="px-4 pb-4 flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowSearchDropdown(showingDropdown ? null : node.id);
                setDropdownSearchQuery('');
                setDropdownResults([]);
              }}
              className="flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 hover:scale-105"
              style={{ backgroundColor: `${color}20`, color }}
            >
              <Plus className="w-3.5 h-3.5" />
              {showingDropdown ? 'Close Search' : 'Add Connection'}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedNode(node);
              }}
              className="flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 bg-slate-800/80 text-slate-300 hover:bg-slate-700/80"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View Details
            </button>
          </div>

          {/* Searchable Dropdown */}
          {showingDropdown && (
            <div
              className="border-t"
              style={{ borderColor: 'rgba(51, 65, 85, 0.3)' }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="p-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    value={dropdownSearchQuery}
                    onChange={(e) => {
                      setDropdownSearchQuery(e.target.value);
                      if (e.target.value.length > 2) {
                        searchDropdownData(e.target.value);
                      }
                    }}
                    placeholder="Search email, phone, username..."
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg pl-10 pr-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    autoFocus
                  />
                  {isDropdownSearching && <Loader className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400 animate-spin" />}
                </div>
              </div>

              <div className="max-h-52 overflow-y-auto">
                {dropdownResults.length === 0 && dropdownSearchQuery.length > 2 && !isDropdownSearching && (
                  <div className="px-4 py-6 text-center text-sm text-slate-500">No results found. Try a different search.</div>
                )}

                {dropdownResults.map((result, idx) => {
                  const ResultIcon = entityTypes[result.type]?.icon || User;
                  const resultColor = entityTypes[result.type]?.color;
                  return (
                    <div
                      key={idx}
                      onClick={() => addFieldFromDropdown(result, node.id)}
                      className="px-4 py-3 hover:bg-slate-700/50 cursor-pointer border-b transition-colors"
                      style={{ borderColor: 'rgba(51, 65, 85, 0.3)' }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${resultColor}20` }}>
                          <ResultIcon className="w-4 h-4" style={{ color: resultColor }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-slate-200 font-medium truncate">{result.value}</div>
                          <div className="text-xs text-slate-500 flex items-center gap-1">
                            {entityTypes[result.type]?.label}
                            {result.verified && <Check className="w-3 h-3 text-green-400" />}
                          </div>
                        </div>
                        <Plus className="w-4 h-4 text-slate-500" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ──── Connection Line ────
  const ConnectionLine = ({ connection }: { connection: Connection }) => {
    const fromNode = nodes.find(n => n.id === connection.from);
    const toNode = nodes.find(n => n.id === connection.to);
    if (!fromNode || !toNode) return null;

    const isHovered = hoveredConnection === connection.id;
    const midX = (fromNode.position.x + toNode.position.x) / 2;
    const midY = (fromNode.position.y + toNode.position.y) / 2;
    const color = entityTypes[connection.field]?.color || '#64748b';

    return (
      <g
        onMouseEnter={() => setHoveredConnection(connection.id)}
        onMouseLeave={() => setHoveredConnection(null)}
        className="cursor-pointer"
      >
        <line
          x1={fromNode.position.x + 140}
          y1={fromNode.position.y + 40}
          x2={toNode.position.x + 140}
          y2={toNode.position.y + 40}
          stroke={isHovered ? color : 'rgba(100, 116, 139, 0.3)'}
          strokeWidth={isHovered ? 2 : 1}
          strokeDasharray={isHovered ? 'none' : '6 4'}
        />
        <circle cx={midX + 140} cy={midY + 40} r={isHovered ? 16 : 12} fill="rgba(15, 23, 42, 0.9)" stroke={color} strokeWidth={1} />
        <text x={midX + 140} y={midY + 44} textAnchor="middle" fill={isHovered ? color : '#94a3b8'} fontSize={isHovered ? 9 : 7} fontWeight={500}>
          {connection.label}
        </text>
      </g>
    );
  };

  return (
    <div className="relative w-full overflow-hidden rounded-xl border" style={{ height: 700, background: '#0a0e17', borderColor: 'rgba(51,65,85,0.3)' }}>
      {/* Background effects */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-900/20 via-slate-950 to-slate-950" />
      </div>
      <div
        className="absolute inset-0"
        style={{ backgroundImage: 'radial-gradient(circle, rgba(51, 65, 85, 0.3) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
      />

      {/* Header */}
      <div className="relative z-20 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/25">
                <Database className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-100">Intelligence Graph</h1>
                <p className="text-sm text-slate-500">OSINT Lateral Movement Analysis</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="px-3 py-1 rounded-full bg-slate-800/50 border border-slate-700/50 text-xs text-slate-400">
                Entities: <span className="text-cyan-400 font-medium">{nodes.length}</span>
              </span>
              <span className="px-3 py-1 rounded-full bg-slate-800/50 border border-slate-700/50 text-xs text-slate-400">
                Connections: <span className="text-cyan-400 font-medium">{connections.length}</span>
              </span>
            </div>
          </div>

          {/* Search Bar */}
          <div className="max-w-3xl mx-auto">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Investigate: name, email, phone, username..."
                className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl pl-12 pr-32 py-4 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 transition-all"
              />
              <button
                onClick={handleSearch}
                disabled={isSearching || !searchQuery.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-all"
              >
                {isSearching ? <Loader className="w-4 h-4 animate-spin" /> : 'Investigate'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Canvas */}
      <div ref={canvasRef} className="absolute inset-0 pt-44 overflow-auto" style={{ cursor: isDragging ? 'grabbing' : 'default' }}>
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 5 }}>
          <defs>
            <linearGradient id="conn-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.6" />
            </linearGradient>
          </defs>
          {connections.map(connection => (
            <ConnectionLine key={connection.id} connection={connection} />
          ))}
        </svg>

        {nodes.map(node => (
          <NodeComponent key={node.id} node={node} />
        ))}

        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pt-20">
            <div className="text-center max-w-md">
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-slate-800/50 border border-slate-700/30 flex items-center justify-center">
                <Search className="w-8 h-8 text-slate-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-300 mb-2">Begin Your Investigation</h3>
              <p className="text-slate-500 text-sm">
                Search for a name, email, phone number, or username to start mapping digital footprints
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Side Panel */}
      {selectedNode && (
        <div className="absolute right-0 top-0 bottom-0 w-96 z-30 border-l backdrop-blur-xl overflow-y-auto" style={{ background: 'rgba(15, 23, 42, 0.95)', borderColor: 'rgba(51, 65, 85, 0.5)' }}>
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-slate-100">Entity Details</h2>
              <button onClick={() => setSelectedNode(null)} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Type */}
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">Type</p>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50">
                  {React.createElement(entityTypes[selectedNode.type]?.icon || User, {
                    className: 'w-5 h-5',
                    style: { color: entityTypes[selectedNode.type]?.color },
                  })}
                  <span className="text-sm text-slate-200 font-medium">{entityTypes[selectedNode.type]?.label || selectedNode.type}</span>
                </div>
              </div>

              {/* Identifier */}
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">Identifier</p>
                <div className="p-3 rounded-lg bg-slate-800/50 text-sm text-cyan-400 font-mono break-all">{selectedNode.label}</div>
              </div>

              {/* Intelligence Data */}
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">Intelligence Data</p>
                <div className="space-y-3">
                  {Object.entries(selectedNode.data || {}).map(([key, value]) => (
                    <div key={key} className="p-3 rounded-lg bg-slate-800/30">
                      <p className="text-xs text-slate-500 mb-1 capitalize">{key.replace(/_/g, ' ')}</p>
                      <div className="text-sm text-slate-200">
                        {Array.isArray(value) ? (
                          <div className="flex flex-wrap gap-1.5">
                            {value.map((item: string, i: number) => (
                              <span key={i} className="px-2 py-0.5 rounded-full bg-slate-700/50 text-xs text-slate-300">
                                {item}
                              </span>
                            ))}
                          </div>
                        ) : typeof value === 'boolean' ? (
                          <span className={value ? 'text-green-400' : 'text-red-400'}>{value ? '✓ Yes' : '✗ No'}</span>
                        ) : (
                          String(value)
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Connections */}
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">
                  Connections ({connections.filter(c => c.from === selectedNode.id || c.to === selectedNode.id).length})
                </p>
                <div className="space-y-2">
                  {connections
                    .filter(c => c.from === selectedNode.id || c.to === selectedNode.id)
                    .map(conn => {
                      const otherNodeId = conn.from === selectedNode.id ? conn.to : conn.from;
                      const otherNode = nodes.find(n => n.id === otherNodeId);
                      if (!otherNode) return null;
                      return (
                        <div
                          key={conn.id}
                          onClick={() => setSelectedNode(otherNode)}
                          className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30 hover:bg-slate-700/40 cursor-pointer transition-colors"
                        >
                          {React.createElement(entityTypes[otherNode.type]?.icon || User, {
                            className: 'w-4 h-4',
                            style: { color: entityTypes[otherNode.type]?.color },
                          })}
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] uppercase text-slate-500">{conn.label}</p>
                            <p className="text-sm text-slate-200 truncate">{otherNode.label}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-600" />
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-6 left-6 z-20 bg-slate-900/80 backdrop-blur-sm border border-slate-700/30 rounded-xl p-4">
        <p className="text-xs text-slate-500 mb-2">Entity Types</p>
        <div className="flex flex-wrap gap-3">
          {Object.entries(entityTypes)
            .slice(0, 6)
            .map(([type, config]) => (
              <div key={type} className="flex items-center gap-1.5 text-xs text-slate-400">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: config.color }} />
                {config.label}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default IntelligenceGraph;
