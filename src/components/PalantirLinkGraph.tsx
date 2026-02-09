import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Mail, Phone, AtSign, User, MapPin, Globe, AlertTriangle, Shield,
  ZoomIn, ZoomOut, Maximize2, Minimize2, RotateCcw,
  X, Search, Network, Loader2, Plus, Download, PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import { cn } from '@/lib/utils';
import GraphNodeBox from '@/components/graph/GraphNodeBox';
import OSINTToolPalette from '@/components/graph/OSINTToolPalette';
import NodeInspector from '@/components/graph/NodeInspector';
import { toast } from 'sonner';
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
  radius: number;
  searching?: boolean;
  birthTime: number;
  notes?: string;
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

const NODE_COLORS: Record<string, string> = {
  root: '#c084fc', email: '#60a5fa', phone: '#34d399', username: '#a78bfa',
  platform: '#f472b6', person: '#fbbf24', address: '#22d3ee', breach: '#f87171',
};

const NODE_RADIUS: Record<string, number> = {
  root: 10, email: 6, phone: 6, username: 6,
  platform: 4, person: 6, address: 5, breach: 5,
};

// Physics
const REPULSION = 1400;
const LINK_SPRING = 0.025;
const LINK_REST = 220;
const CENTER_PULL = 0.003;
const DAMPING = 0.88;
const VELOCITY_THRESHOLD = 0.01;
const BLOOM_DURATION_MS = 600;

const PalantirLinkGraph = ({ 
  investigationId, 
  targetName = 'Target', 
  active,
  onPivot 
}: PalantirLinkGraphProps) => {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(true);
  
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  
  const [searchValue, setSearchValue] = useState('');
  const [searchType, setSearchType] = useState<string>('email');
  const [searchingNodeId, setSearchingNodeId] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const animationRef = useRef<number>();
  const nodesRef = useRef<GraphNode[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 5;

  const dimensions = useMemo(() => ({
    width: canvasRef.current?.clientWidth || 900,
    height: isFullscreen ? (typeof window !== 'undefined' ? window.innerHeight - 60 : 800) : 650,
  }), [isFullscreen, canvasRef.current?.clientWidth]);

  // ──────── Data ────────
  useEffect(() => {
    if (!active || !investigationId) return;

    const fetchFindings = async () => {
      const { data } = await supabase
        .from('findings')
        .select('*')
        .eq('investigation_id', investigationId)
        .order('created_at', { ascending: true });
      if (data) setFindings(data as Finding[]);
    };

    fetchFindings();

    const channel = supabase
      .channel(`graph-rt:${investigationId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'findings',
        filter: `investigation_id=eq.${investigationId}`,
      }, () => fetchFindings())
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [active, investigationId]);

  // ──────── Daisy-chain graph builder ────────
  const buildGraph = useCallback(() => {
    const newNodes: GraphNode[] = [];
    const newLinks: GraphLink[] = [];
    const cx = dimensions.width / 2;
    const cy = dimensions.height / 2;
    const now = Date.now();
    
    const oldBirthTimes = new Map<string, number>();
    nodesRef.current.forEach(n => oldBirthTimes.set(n.id, n.birthTime));
    
    const added = new Set<string>(['root']);
    const selectorIndex = new Map<string, string>();

    newNodes.push({
      id: 'root', label: targetName, type: 'root',
      x: cx, y: cy, vx: 0, vy: 0, locked: true,
      radius: NODE_RADIUS.root,
      birthTime: oldBirthTimes.get('root') || now,
      metadata: { verified: true },
    });

    selectorIndex.set(targetName.toLowerCase().trim(), 'root');
    
    const addNode = (
      id: string, label: string, type: GraphNode['type'],
      parentId: string, linkLabel?: string, meta?: GraphNode['metadata']
    ) => {
      if (added.has(id)) {
        if (!newLinks.find(l => 
          (l.source === parentId && l.target === id) || 
          (l.source === id && l.target === parentId)
        )) {
          newLinks.push({ source: parentId, target: id, label: linkLabel, strength: 0.5 });
        }
        return;
      }
      const angle = Math.random() * Math.PI * 2;
      const parentNode = newNodes.find(n => n.id === parentId);
      const px = parentNode?.x || cx;
      const py = parentNode?.y || cy;
      const r = 120 + Math.random() * 80;
      
      newNodes.push({
        id, label, type,
        x: px + Math.cos(angle) * r,
        y: py + Math.sin(angle) * r,
        vx: 0, vy: 0, locked: false,
        radius: NODE_RADIUS[type] || 5,
        birthTime: oldBirthTimes.get(id) || now,
        metadata: meta,
      });
      newLinks.push({ source: parentId, target: id, label: linkLabel, strength: 0.7 });
      added.add(id);
      
      const normalized = label.toLowerCase().trim();
      if (!selectorIndex.has(normalized)) {
        selectorIndex.set(normalized, id);
      }
    };

    // ── Pass 1: Person-level data ──
    findings.forEach((f) => {
      const data = f.data as any;
      
      if (f.agent_type === 'People_search') {
        if (data.emails) {
          (Array.isArray(data.emails) ? data.emails : []).forEach((email: string) => {
            const eid = `email-${email.toLowerCase()}`;
            addNode(eid, email, 'email', 'root', 'email');
            selectorIndex.set(email.toLowerCase(), eid);
          });
        }
        if (data.phones) {
          (Array.isArray(data.phones) ? data.phones : []).forEach((phone: string) => {
            const pid = `phone-${phone.replace(/\D/g, '')}`;
            addNode(pid, phone, 'phone', 'root', 'phone');
            selectorIndex.set(phone.replace(/\D/g, ''), pid);
          });
        }
        const extractRelatives = (rels: any[], suffix: string) => {
          if (!rels) return;
          rels.slice(0, 8).forEach((rel: any) => {
            const name = typeof rel === 'string' ? rel : rel.name || 'Unknown';
            const rid = `person-${name.replace(/\s+/g, '-').toLowerCase()}-${suffix}`;
            addNode(rid, name, 'person', 'root', 'relative', { source: 'People Search' });
          });
        };
        extractRelatives(data.relatives, 'ps');
        if (data.results) {
          data.results.forEach((result: any) => {
            extractRelatives(result.relatives, 'psr');
            if (result.emails) {
              result.emails.forEach((email: string) => {
                const eid = `email-${email.toLowerCase()}`;
                addNode(eid, email, 'email', 'root', 'email');
                selectorIndex.set(email.toLowerCase(), eid);
              });
            }
            if (result.phones) {
              result.phones.forEach((phone: string) => {
                const pid = `phone-${phone.replace(/\D/g, '')}`;
                addNode(pid, phone, 'phone', 'root', 'phone');
                selectorIndex.set(phone.replace(/\D/g, ''), pid);
              });
            }
          });
        }
        const addrs = data.addresses || (data.address ? [data.address] : []);
        addrs.slice(0, 3).forEach((addr: any, i: number) => {
          const str = typeof addr === 'string' ? addr : addr.full || addr.street || 'Address';
          const aid = `addr-${str.substring(0, 20).replace(/\s+/g, '-').toLowerCase()}-${i}`;
          addNode(aid, str.length > 30 ? str.substring(0, 28) + '…' : str, 'address', 'root', 'lives at', { source: f.agent_type });
        });
      }

      if (f.agent_type === 'FamilyTreeNow' && data.relatives) {
        data.relatives.forEach((rel: any, i: number) => {
          const name = rel.person?.name 
            ? `${rel.person.name.first || ''} ${rel.person.name.last || ''}`.trim()
            : (typeof rel === 'string' ? rel : rel.name);
          if (name && name.trim().length > 2) {
            addNode(`person-ftn-${name.replace(/\s+/g, '-').toLowerCase()}-${i}`, name, 'person', 'root', rel.link?.relationship_type || 'family', { source: 'FamilyTreeNow' });
          }
        });
      }
    });

    // ── Pass 2: Email-based findings ──
    findings.forEach((f) => {
      const data = f.data as any;

      if (f.source?.includes('@')) {
        const emailId = `email-${f.source.toLowerCase()}`;
        addNode(emailId, f.source, 'email', 'root', 'email', { source: f.agent_type });
        selectorIndex.set(f.source.toLowerCase(), emailId);
      }
      
      if (f.agent_type === 'Holehe' && data.results) {
        const emailId = f.source?.includes('@') ? `email-${f.source.toLowerCase()}` : 'root';
        data.results.forEach((r: any) => {
          if (r.exists && r.platform) {
            const pid = `plat-hol-${r.platform.toLowerCase()}`;
            addNode(pid, r.platform, 'platform', emailId, 'registered', { source: 'Holehe', url: r.url, verified: true });
          }
        });
      }
      
      if ((f.agent_type === 'LeakCheck' || f.source?.includes('LeakCheck')) && data.sources) {
        const emailId = f.source?.includes('@') ? `email-${f.source.toLowerCase()}` : 'root';
        data.sources.forEach((b: any, i: number) => {
          const name = b.name || 'Breach';
          addNode(`breach-${name.toLowerCase()}-${i}`, name, 'breach', emailId, 'breached', { source: 'LeakCheck' });
        });
      }

      if (f.agent_type === 'Gravatar' && data.found) {
        const emailId = f.source?.includes('@') ? `email-${f.source.toLowerCase()}` : 'root';
        addNode('plat-gravatar', 'Gravatar', 'platform', emailId, 'profile', { source: 'Gravatar', verified: true });
      }
    });

    // ── Pass 3: Username/handle-based ──
    findings.forEach((f) => {
      const data = f.data as any;
      
      if (f.agent_type === 'Sherlock' && (data.profileLinks || data.foundPlatforms || data.platforms)) {
        const platforms = data.profileLinks || data.foundPlatforms || data.platforms || [];
        const username = data.username || f.source;
        if (username) {
          const uid = `user-${username.toLowerCase()}`;
          addNode(uid, username, 'username', 'root', 'uses', { source: 'Sherlock' });
          platforms.slice(0, 15).forEach((p: any) => {
            const name = typeof p === 'string' ? p : p.platform || p.name || 'Platform';
            addNode(`plat-sh-${name.toLowerCase()}`, name, 'platform', uid, 'account', { source: 'Sherlock', url: typeof p === 'object' ? p.url : undefined, verified: true });
          });
        }
      }

      if ((f.agent_type === 'Social' || f.agent_type === 'social_email' || f.agent_type === 'social_username') && data.results) {
        let parentId = 'root';
        if (f.source?.includes('@')) {
          const eid = `email-${f.source.toLowerCase()}`;
          if (added.has(eid)) parentId = eid;
        }
        data.results.forEach((r: any) => {
          if (r.platform && (r.exists || r.registered)) {
            addNode(`plat-soc-${r.platform.toLowerCase()}`, r.platform, 'platform', parentId, 'registered', { source: 'Social', url: r.url, verified: true });
          }
        });
      }

      if (f.agent_type === 'Phone' && data.valid) {
        const num = data.number || data.phone || 'Phone';
        addNode(`phone-${num.replace(/\D/g, '')}`, num, 'phone', 'root', 'owns', { source: 'Phone' });
      }

      if (f.agent_type === 'WhatsApp' && data.registered) {
        const phoneNum = data.phone || data.number || '';
        const phoneId = phoneNum ? `phone-${phoneNum.replace(/\D/g, '')}` : null;
        const parent = phoneId && added.has(phoneId) ? phoneId : 'root';
        addNode('plat-whatsapp', 'WhatsApp', 'platform', parent, 'registered', { source: 'WhatsApp', verified: true });
      }

      if (f.agent_type === 'Telegram' && data.found) {
        addNode('plat-telegram', 'Telegram', 'platform', 'root', 'account', { source: 'Telegram', verified: true });
      }

      if (f.agent_type === 'Address' && (data.addresses || data.address)) {
        const addrs = data.addresses || (data.address ? [data.address] : []);
        addrs.slice(0, 3).forEach((addr: any, i: number) => {
          const str = typeof addr === 'string' ? addr : addr.full || addr.street || 'Address';
          addNode(`addr-${str.substring(0, 20).replace(/\s+/g, '-').toLowerCase()}-${i}`, str.length > 30 ? str.substring(0, 28) + '…' : str, 'address', 'root', 'lives at', { source: f.agent_type });
        });
      }
    });

    return { nodes: newNodes, links: newLinks };
  }, [findings, targetName, dimensions]);

  useEffect(() => {
    const { nodes: n, links: l } = buildGraph();
    const oldPositions = new Map<string, { x: number; y: number }>();
    nodesRef.current.forEach(node => oldPositions.set(node.id, { x: node.x, y: node.y }));
    
    const mergedNodes = n.map(node => {
      const old = oldPositions.get(node.id);
      if (old) return { ...node, x: old.x, y: old.y };
      return node;
    });
    
    setNodes(mergedNodes);
    setLinks(l);
    nodesRef.current = mergedNodes;
  }, [buildGraph]);

  // ──────── Physics ────────
  const simulate = useCallback(() => {
    if (nodesRef.current.length === 0) return;
    
    const ns = nodesRef.current.map(n => ({ ...n }));
    const cx = dimensions.width / 2;
    const cy = dimensions.height / 2;
    let totalKE = 0;
    
    for (let i = 0; i < ns.length; i++) {
      const n = ns[i];
      if (n.locked) continue;
      let fx = 0, fy = 0;
      
      for (let j = 0; j < ns.length; j++) {
        if (i === j) continue;
        const dx = n.x - ns[j].x;
        const dy = n.y - ns[j].y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = REPULSION / (d * d);
        fx += (dx / d) * f;
        fy += (dy / d) * f;
      }
      
      links.forEach(l => {
        if (l.source === n.id || l.target === n.id) {
          const oid = l.source === n.id ? l.target : l.source;
          const o = ns.find(x => x.id === oid);
          if (o) {
            const dx = o.x - n.x;
            const dy = o.y - n.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            const f = (d - LINK_REST) * LINK_SPRING * l.strength;
            fx += (dx / d) * f;
            fy += (dy / d) * f;
          }
        }
      });
      
      fx += (cx - n.x) * CENTER_PULL;
      fy += (cy - n.y) * CENTER_PULL;
      
      n.vx = (n.vx + fx) * DAMPING;
      n.vy = (n.vy + fy) * DAMPING;
      n.x += n.vx;
      n.y += n.vy;
      
      totalKE += n.vx * n.vx + n.vy * n.vy;
    }
    
    nodesRef.current = ns;
    setNodes([...ns]);
    
    if (totalKE > VELOCITY_THRESHOLD) {
      animationRef.current = requestAnimationFrame(simulate);
    }
  }, [links, dimensions]);

  useEffect(() => {
    if (nodes.length > 0) {
      animationRef.current = requestAnimationFrame(simulate);
    }
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [simulate, nodes.length]);

  const kickSimulation = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = requestAnimationFrame(simulate);
  }, [simulate]);

  // ──────── Drag ────────
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
  }, [draggedNode, isPanning, panStart, zoom, pan]);

  const handleMouseUp = useCallback(() => {
    if (draggedNode) {
      nodesRef.current = nodesRef.current.map(n =>
        n.id === draggedNode && n.type !== 'root' ? { ...n, locked: false } : n
      );
      setDraggedNode(null);
      kickSimulation();
    }
    setIsPanning(false);
  }, [draggedNode, kickSimulation]);

  const handlePanStart = useCallback((e: React.MouseEvent) => {
    if (e.button === 0 && !draggedNode) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan, draggedNode]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + (e.deltaY > 0 ? -0.1 : 0.1))));
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    const { nodes: n, links: l } = buildGraph();
    setNodes(n);
    setLinks(l);
    nodesRef.current = n;
    kickSimulation();
  }, [buildGraph, kickSimulation]);

  // ──────── Add node from palette ────────
  const handleAddNodeFromPalette = useCallback((toolName: string, nodeType: string) => {
    const nodeId = `manual-${Date.now()}`;
    const cx = dimensions.width / 2;
    const cy = dimensions.height / 2;
    const angle = Math.random() * Math.PI * 2;
    
    const parentId = selectedNode || 'root';
    const parentNode = nodesRef.current.find(n => n.id === parentId);
    const px = parentNode?.x || cx;
    const py = parentNode?.y || cy;
    
    const newNode: GraphNode = {
      id: nodeId, label: toolName,
      type: nodeType as GraphNode['type'],
      x: px + Math.cos(angle) * 150,
      y: py + Math.sin(angle) * 150,
      vx: 0, vy: 0, locked: false,
      radius: NODE_RADIUS[nodeType] || 6,
      birthTime: Date.now(),
      metadata: { source: 'Manual' },
    };
    
    const newLink: GraphLink = {
      source: parentId, target: nodeId, label: 'linked', strength: 0.7,
    };
    
    nodesRef.current = [...nodesRef.current, newNode];
    setNodes(prev => [...prev, newNode]);
    setLinks(prev => [...prev, newLink]);
    kickSimulation();
    toast.success(`Added ${toolName} node`);
  }, [selectedNode, dimensions, kickSimulation]);

  // ──────── Inline search ────────
  const handleInlineSearch = useCallback(async () => {
    const value = searchValue.trim();
    if (!value) return;
    
    const nodeId = `${searchType}-search-${Date.now()}`;
    const cx = dimensions.width / 2;
    const cy = dimensions.height / 2;
    const angle = Math.random() * Math.PI * 2;
    
    const parentId = selectedNode || 'root';
    const parentNode = nodesRef.current.find(n => n.id === parentId);
    const px = parentNode?.x || cx;
    const py = parentNode?.y || cy;
    
    const newNode: GraphNode = {
      id: nodeId, label: value,
      type: searchType as GraphNode['type'],
      x: px + Math.cos(angle) * 120,
      y: py + Math.sin(angle) * 120,
      vx: 0, vy: 0, locked: false,
      radius: NODE_RADIUS[searchType] || 6,
      searching: true,
      birthTime: Date.now(),
      metadata: { source: 'Live Search' },
    };
    
    const newLink: GraphLink = {
      source: parentId, target: nodeId,
      label: searchType === 'email' || searchType === 'phone' ? 'owns' : 'linked',
      strength: 0.7,
    };
    
    nodesRef.current = [...nodesRef.current, newNode];
    setNodes(prev => [...prev, newNode]);
    setLinks(prev => [...prev, newLink]);
    setSearchingNodeId(nodeId);
    setSearchValue('');
    kickSimulation();
    
    if (onPivot) {
      const pivotType = searchType === 'username' ? 'username' 
        : searchType === 'email' ? 'email' 
        : searchType === 'phone' ? 'phone' 
        : searchType === 'person' ? 'name'
        : 'address';
      onPivot({ type: pivotType as PivotData['type'], value });
    }
    
    setTimeout(() => {
      nodesRef.current = nodesRef.current.map(n =>
        n.id === nodeId ? { ...n, searching: false } : n
      );
      setNodes(prev => prev.map(n =>
        n.id === nodeId ? { ...n, searching: false } : n
      ));
      setSearchingNodeId(null);
    }, 5000);
  }, [searchValue, searchType, selectedNode, dimensions, onPivot, kickSimulation]);

  const handleNodeDoubleClick = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || node.type === 'root' || !onPivot) return;
    
    nodesRef.current = nodesRef.current.map(n =>
      n.id === nodeId ? { ...n, searching: true } : n
    );
    setNodes(prev => prev.map(n =>
      n.id === nodeId ? { ...n, searching: true } : n
    ));
    
    const pivotType = node.type === 'username' ? 'username' 
      : node.type === 'email' ? 'email' 
      : node.type === 'phone' ? 'phone' 
      : node.type === 'person' ? 'name'
      : 'address';
    
    onPivot({ type: pivotType as PivotData['type'], value: node.label });
    
    setTimeout(() => {
      nodesRef.current = nodesRef.current.map(n =>
        n.id === nodeId ? { ...n, searching: false } : n
      );
      setNodes(prev => prev.map(n =>
        n.id === nodeId ? { ...n, searching: false } : n
      ));
    }, 5000);
  }, [nodes, onPivot]);

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNode(nodeId === selectedNode ? null : nodeId);
  }, [selectedNode]);

  const handleUpdateNotes = useCallback((nodeId: string, notes: string) => {
    nodesRef.current = nodesRef.current.map(n =>
      n.id === nodeId ? { ...n, notes } : n
    );
    setNodes(prev => prev.map(n =>
      n.id === nodeId ? { ...n, notes } : n
    ));
  }, []);

  // ──────── Bloom animation ────────
  const getBloomProgress = useCallback((birthTime: number): number => {
    const age = Date.now() - birthTime;
    if (age >= BLOOM_DURATION_MS) return 1;
    const t = age / BLOOM_DURATION_MS;
    return 1 - Math.pow(1 - t, 3);
  }, []);

  useEffect(() => {
    const hasAnimating = nodes.some(n => (Date.now() - n.birthTime) < BLOOM_DURATION_MS);
    if (!hasAnimating) return;
    
    let rafId: number;
    const tick = () => {
      setNodes(prev => [...prev]);
      const stillAnimating = nodesRef.current.some(n => (Date.now() - n.birthTime) < BLOOM_DURATION_MS);
      if (stillAnimating) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [nodes.length]);

  // ──────── Canvas drop handler ────────
  const handleCanvasDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    try {
      const toolData = JSON.parse(e.dataTransfer.getData('application/json'));
      handleAddNodeFromPalette(toolData.name, toolData.nodeType);
    } catch {
      // ignore
    }
  }, [handleAddNodeFromPalette]);

  const handleCanvasDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  // Get selected node data for inspector
  const selectedNodeData = useMemo(() => {
    return nodes.find(n => n.id === selectedNode) || null;
  }, [nodes, selectedNode]);

  const selectedConnectionCount = useMemo(() => {
    if (!selectedNode) return 0;
    return links.filter(l => l.source === selectedNode || l.target === selectedNode).length;
  }, [links, selectedNode]);

  // ──────── Render ────────
  if (!active) {
    return (
      <div className="w-full rounded-lg border border-border/20 overflow-hidden flex items-center justify-center" 
        style={{ height: 650, background: '#0d1117' }}>
        <div className="text-center text-muted-foreground">
          <Network className="h-12 w-12 mx-auto mb-3 opacity-20" style={{ color: '#c084fc' }} />
          <p className="text-sm font-medium" style={{ color: '#8b949e' }}>Intelligence Link Graph</p>
          <p className="text-xs mt-1" style={{ color: '#484f58' }}>Start an investigation to visualize connections</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex w-full rounded-lg border border-border/20 overflow-hidden transition-all duration-300",
        isFullscreen && "fixed inset-0 z-50 rounded-none"
      )}
      style={{ 
        background: '#0d1117',
        height: isFullscreen ? '100vh' : 650,
      }}
    >
      {/* ── Left: Tool Palette ── */}
      <div
        className={cn(
          "border-r flex-shrink-0 overflow-hidden transition-all duration-300",
          paletteOpen ? "w-80" : "w-0"
        )}
        style={{ borderColor: paletteOpen ? '#21262d' : 'transparent' }}
      >
        <div className="w-80 h-full">
          <OSINTToolPalette
            onDragTool={() => {}}
            onClickTool={(tool) => handleAddNodeFromPalette(tool.name, tool.nodeType)}
          />
        </div>
      </div>

      {/* ── Center: Mind Map Canvas ── */}
      <div ref={canvasRef} className="flex-1 flex flex-col min-w-0">
        {/* Canvas Toolbar */}
        <div className="h-12 border-b flex items-center px-4 justify-between flex-shrink-0" style={{ borderColor: '#21262d', background: '#161b22' }}>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPaletteOpen(!paletteOpen)}
              className="h-7 w-7 hover:bg-[#21262d]"
              title={paletteOpen ? "Hide tool palette" : "Show tool palette"}
            >
              {paletteOpen ? <PanelLeftClose className="h-4 w-4" style={{ color: '#8b949e' }} /> : <PanelLeftOpen className="h-4 w-4" style={{ color: '#8b949e' }} />}
            </Button>
            <h2 className="font-semibold text-[13px]" style={{ color: '#e6edf3' }}>Investigation Canvas</h2>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] font-mono h-5 px-1.5" style={{ borderColor: '#30363d', color: '#484f58' }}>
              {nodes.length} nodes
            </Badge>
            
            {/* Search toggle */}
            <div className={cn(
              "flex items-center gap-1.5 rounded-full border px-2 py-0.5 transition-all",
              showSearch ? "w-[320px]" : "w-auto"
            )} style={{ borderColor: '#30363d', background: '#0d1117' }}>
              {showSearch ? (
                <>
                  <Select value={searchType} onValueChange={setSearchType}>
                    <SelectTrigger className="w-[80px] h-6 bg-transparent border-none text-[11px] focus:ring-0 px-1" style={{ color: '#8b949e' }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#161b22] border-[#30363d]">
                      <SelectItem value="email"><div className="flex items-center gap-1.5 text-[11px]"><Mail className="h-3 w-3 text-blue-400"/>Email</div></SelectItem>
                      <SelectItem value="username"><div className="flex items-center gap-1.5 text-[11px]"><AtSign className="h-3 w-3 text-purple-400"/>Username</div></SelectItem>
                      <SelectItem value="phone"><div className="flex items-center gap-1.5 text-[11px]"><Phone className="h-3 w-3 text-green-400"/>Phone</div></SelectItem>
                      <SelectItem value="person"><div className="flex items-center gap-1.5 text-[11px]"><User className="h-3 w-3 text-amber-400"/>Person</div></SelectItem>
                      <SelectItem value="address"><div className="flex items-center gap-1.5 text-[11px]"><MapPin className="h-3 w-3 text-cyan-400"/>Address</div></SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    ref={searchInputRef}
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleInlineSearch()}
                    placeholder="Search..."
                    className="flex-1 h-6 bg-transparent border-none text-[11px] placeholder:text-[#484f58] focus-visible:ring-0"
                    style={{ color: '#e6edf3' }}
                  />
                  {searchingNodeId ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: '#c084fc' }} />
                  ) : (
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0" style={{ color: '#c084fc' }}
                      onClick={handleInlineSearch} disabled={!searchValue.trim()}>
                      <Search className="h-3 w-3" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-5 w-5 p-0" style={{ color: '#484f58' }}
                    onClick={() => setShowSearch(false)}>
                    <X className="h-3 w-3" />
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[11px]" style={{ color: '#8b949e' }}
                  onClick={() => { setShowSearch(true); setTimeout(() => searchInputRef.current?.focus(), 100); }}>
                  <Search className="h-3 w-3" /> Add Node
                </Button>
              )}
            </div>

            {/* View controls */}
            <div className="flex items-center gap-0.5 ml-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: '#484f58' }}
                onClick={() => setZoom(z => Math.max(MIN_ZOOM, z - 0.2))}>
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: '#484f58' }}
                onClick={() => setZoom(z => Math.min(MAX_ZOOM, z + 0.2))}>
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: '#484f58' }}
                onClick={resetView}>
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: '#484f58' }}
                onClick={() => setIsFullscreen(!isFullscreen)}>
                {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </div>

        {/* SVG Canvas */}
        <div className="flex-1 relative overflow-hidden"
          onDrop={handleCanvasDrop}
          onDragOver={handleCanvasDragOver}
        >
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
            <defs>
              <pattern id="dot-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="10" cy="10" r="0.6" fill="#1f2937" />
              </pattern>
              <filter id="node-glow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <rect width="100%" height="100%" fill="#0a0a0a" />
            <rect width="100%" height="100%" fill="url(#dot-grid)" />

            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* Links */}
              {links.map((link) => {
                const s = nodes.find(n => n.id === link.source);
                const t = nodes.find(n => n.id === link.target);
                if (!s || !t) return null;

                const isActive = hoveredNode === link.source || hoveredNode === link.target ||
                                 selectedNode === link.source || selectedNode === link.target;
                
                const newerBirth = Math.max(s.birthTime, t.birthTime);
                const linkBloom = getBloomProgress(newerBirth);

                return (
                  <g key={`${link.source}-${link.target}`}>
                    <line
                      x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                      stroke={isActive ? '#c084fc' : '#21262d'}
                      strokeWidth={isActive ? 1.5 : 0.5}
                      strokeOpacity={(isActive ? 0.6 : 0.3) * linkBloom}
                    />
                    {isActive && link.label && linkBloom >= 1 && (
                      <text
                        x={(s.x + t.x) / 2}
                        y={(s.y + t.y) / 2 - 4}
                        textAnchor="middle"
                        style={{ fontSize: '7px', fill: '#484f58', fontWeight: 500 }}
                        className="pointer-events-none select-none"
                      >
                        {link.label}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Nodes */}
              {nodes.map((node) => {
                const bloom = getBloomProgress(node.birthTime);
                const isHovered = hoveredNode === node.id;
                const isSelected = selectedNode === node.id;

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
                  >
                    {bloom < 1 && (
                      <circle
                        r={40 * (1 - bloom)}
                        fill="none"
                        stroke={NODE_COLORS[node.type] || '#c084fc'}
                        strokeWidth={0.5}
                        opacity={0.3 * (1 - bloom)}
                      />
                    )}

                    {node.searching && (
                      <circle r={30} fill="none" stroke={NODE_COLORS[node.type] || '#c084fc'} strokeWidth="0.5" opacity="0.4">
                        <animate attributeName="r" from="20" to="50" dur="1.2s" repeatCount="indefinite" />
                        <animate attributeName="opacity" from="0.5" to="0" dur="1.2s" repeatCount="indefinite" />
                      </circle>
                    )}

                    <GraphNodeBox
                      node={node}
                      isHovered={isHovered}
                      isSelected={isSelected}
                      bloom={bloom}
                      zoom={zoom}
                      onInvestigate={(id) => handleNodeDoubleClick(id)}
                      onCopyValue={(val) => {
                        navigator.clipboard.writeText(val);
                        toast.success('Copied to clipboard');
                      }}
                      onRemove={(id) => {
                        nodesRef.current = nodesRef.current.filter(n => n.id !== id);
                        setNodes(prev => prev.filter(n => n.id !== id));
                        setLinks(prev => prev.filter(l => l.source !== id && l.target !== id));
                        if (selectedNode === id) setSelectedNode(null);
                      }}
                      onOpenUrl={(url) => window.open(url, '_blank')}
                    />
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Canvas hints */}
          <div className="absolute bottom-3 left-3 z-20 text-[10px] select-none" style={{ color: '#484f58' }}>
            Drag nodes • Scroll to zoom • Double-click to investigate • Drag tools from palette
          </div>
        </div>
      </div>

      {/* ── Right: Inspector ── */}
      <div className="w-72 border-l flex-shrink-0 overflow-hidden" style={{ borderColor: '#21262d' }}>
        <NodeInspector
          selectedNode={selectedNodeData}
          connectionCount={selectedConnectionCount}
          onClose={() => setSelectedNode(null)}
          onInvestigate={handleNodeDoubleClick}
          onCopy={(val) => {
            navigator.clipboard.writeText(val);
            toast.success('Copied to clipboard');
          }}
          onRemove={(id) => {
            nodesRef.current = nodesRef.current.filter(n => n.id !== id);
            setNodes(prev => prev.filter(n => n.id !== id));
            setLinks(prev => prev.filter(l => l.source !== id && l.target !== id));
            setSelectedNode(null);
          }}
          onOpenUrl={(url) => window.open(url, '_blank')}
          onUpdateNotes={handleUpdateNotes}
          onPivot={(type, value) => {
            if (onPivot) {
              const pivotType = type === 'username' ? 'username' 
                : type === 'email' ? 'email' 
                : type === 'phone' ? 'phone' 
                : type === 'person' ? 'name'
                : 'address';
              onPivot({ type: pivotType as PivotData['type'], value });
            }
          }}
        />
      </div>
    </div>
  );
};

export default PalantirLinkGraph;
