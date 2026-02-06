import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Mail, Phone, AtSign, User, MapPin, Globe, AlertTriangle, Shield,
  ZoomIn, ZoomOut, Maximize2, Minimize2, RotateCcw,
  X, Search, Network, Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
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
  birthTime: number; // ms timestamp for bloom animation
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

// Obsidian-inspired muted palette
const NODE_COLORS: Record<string, string> = {
  root: '#c084fc',
  email: '#60a5fa',
  phone: '#34d399',
  username: '#a78bfa',
  platform: '#f472b6',
  person: '#fbbf24',
  address: '#22d3ee',
  breach: '#f87171',
};

const NODE_RADIUS: Record<string, number> = {
  root: 10,
  email: 6,
  phone: 6,
  username: 6,
  platform: 4,
  person: 6,
  address: 5,
  breach: 5,
};

// Physics
const REPULSION = 800;
const LINK_SPRING = 0.03;
const LINK_REST = 160;
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
  
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  
  const [searchValue, setSearchValue] = useState('');
  const [searchType, setSearchType] = useState<string>('email');
  const [searchingNodeId, setSearchingNodeId] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const animationRef = useRef<number>();
  const nodesRef = useRef<GraphNode[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 5;

  const dimensions = useMemo(() => ({
    width: containerRef.current?.clientWidth || 1200,
    height: isFullscreen ? (typeof window !== 'undefined' ? window.innerHeight - 60 : 800) : 650,
  }), [isFullscreen, containerRef.current?.clientWidth]);

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
  // Key idea: nodes connect through shared identifiers, not all to root.
  // Email found on a person → person→email. Platform found via email → email→platform.
  const buildGraph = useCallback(() => {
    const newNodes: GraphNode[] = [];
    const newLinks: GraphLink[] = [];
    const cx = dimensions.width / 2;
    const cy = dimensions.height / 2;
    const now = Date.now();
    
    // Track old node birth times to preserve animations
    const oldBirthTimes = new Map<string, number>();
    nodesRef.current.forEach(n => oldBirthTimes.set(n.id, n.birthTime));
    
    const added = new Set<string>(['root']);
    // Map selector values to their node IDs for cross-linking
    const selectorIndex = new Map<string, string>(); // normalized value → nodeId

    newNodes.push({
      id: 'root', label: targetName, type: 'root',
      x: cx, y: cy, vx: 0, vy: 0, locked: true,
      radius: NODE_RADIUS.root,
      birthTime: oldBirthTimes.get('root') || now,
      metadata: { verified: true },
    });

    // Register root name for cross-linking
    selectorIndex.set(targetName.toLowerCase().trim(), 'root');
    
    const addNode = (
      id: string, label: string, type: GraphNode['type'],
      parentId: string, linkLabel?: string, meta?: GraphNode['metadata']
    ) => {
      if (added.has(id)) {
        // Node exists — but add a link if not already linked to this parent
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
      
      // Index for cross-linking
      const normalized = label.toLowerCase().trim();
      if (!selectorIndex.has(normalized)) {
        selectorIndex.set(normalized, id);
      }
    };

    // Helper: find best parent for a selector value
    const findParent = (value: string, fallback: string): string => {
      const normalized = value.toLowerCase().trim();
      return selectorIndex.get(normalized) || fallback;
    };

    // ── Pass 1: Extract person-level data (people search, FamilyTreeNow) ──
    // These create the person nodes that other data can chain from
    findings.forEach((f) => {
      const data = f.data as any;
      
      // People search relatives
      if (f.agent_type === 'People_search') {
        // Extract emails found on the target → link to root
        if (data.emails) {
          (Array.isArray(data.emails) ? data.emails : []).forEach((email: string) => {
            const eid = `email-${email.toLowerCase()}`;
            addNode(eid, email, 'email', 'root', 'email');
            selectorIndex.set(email.toLowerCase(), eid);
          });
        }
        // Extract phones
        if (data.phones) {
          (Array.isArray(data.phones) ? data.phones : []).forEach((phone: string) => {
            const pid = `phone-${phone.replace(/\D/g, '')}`;
            addNode(pid, phone, 'phone', 'root', 'phone');
            selectorIndex.set(phone.replace(/\D/g, ''), pid);
          });
        }
        // Relatives
        const extractRelatives = (rels: any[], suffix: string) => {
          if (!rels) return;
          rels.slice(0, 8).forEach((rel: any, i: number) => {
            const name = typeof rel === 'string' ? rel : rel.name || 'Unknown';
            const rid = `person-${name.replace(/\s+/g, '-').toLowerCase()}-${suffix}`;
            addNode(rid, name, 'person', 'root', 'relative', { source: 'People Search' });
          });
        };
        extractRelatives(data.relatives, 'ps');
        if (data.results) {
          data.results.forEach((result: any) => {
            extractRelatives(result.relatives, 'psr');
            // Chain emails found on result to root
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
        // Addresses
        const addrs = data.addresses || (data.address ? [data.address] : []);
        addrs.slice(0, 3).forEach((addr: any, i: number) => {
          const str = typeof addr === 'string' ? addr : addr.full || addr.street || 'Address';
          const aid = `addr-${str.substring(0, 20).replace(/\s+/g, '-').toLowerCase()}-${i}`;
          addNode(aid, str.length > 30 ? str.substring(0, 28) + '…' : str, 'address', 'root', 'lives at', { source: f.agent_type });
        });
      }

      // FamilyTreeNow
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

    // ── Pass 2: Email-based findings → chain off email nodes ──
    findings.forEach((f) => {
      const data = f.data as any;

      // If the finding's source looks like an email, ensure that email node exists
      if (f.source?.includes('@')) {
        const emailId = `email-${f.source.toLowerCase()}`;
        addNode(emailId, f.source, 'email', 'root', 'email', { source: f.agent_type });
        selectorIndex.set(f.source.toLowerCase(), emailId);
      }
      
      // Holehe: platforms chain off the email they were found on
      if (f.agent_type === 'Holehe' && data.results) {
        const emailId = f.source?.includes('@') ? `email-${f.source.toLowerCase()}` : 'root';
        data.results.forEach((r: any) => {
          if (r.exists && r.platform) {
            const pid = `plat-hol-${r.platform.toLowerCase()}`;
            addNode(pid, r.platform, 'platform', emailId, 'registered', { source: 'Holehe', url: r.url, verified: true });
          }
        });
      }
      
      // LeakCheck breaches chain off the email
      if ((f.agent_type === 'LeakCheck' || f.source?.includes('LeakCheck')) && data.sources) {
        const emailId = f.source?.includes('@') ? `email-${f.source.toLowerCase()}` : 'root';
        data.sources.forEach((b: any, i: number) => {
          const name = b.name || 'Breach';
          addNode(`breach-${name.toLowerCase()}-${i}`, name, 'breach', emailId, 'breached', { source: 'LeakCheck' });
        });
      }

      // Gravatar → chain off email
      if (f.agent_type === 'Gravatar' && data.found) {
        const emailId = f.source?.includes('@') ? `email-${f.source.toLowerCase()}` : 'root';
        addNode('plat-gravatar', 'Gravatar', 'platform', emailId, 'profile', { source: 'Gravatar', verified: true });
      }
    });

    // ── Pass 3: Username/handle-based findings ──
    findings.forEach((f) => {
      const data = f.data as any;
      
      // Sherlock: username → platforms chain off username
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

      // Social platforms
      if ((f.agent_type === 'Social' || f.agent_type === 'social_email' || f.agent_type === 'social_username') && data.results) {
        // Try to chain off the relevant email or username
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

      // Phone
      if (f.agent_type === 'Phone' && data.valid) {
        const num = data.number || data.phone || 'Phone';
        addNode(`phone-${num.replace(/\D/g, '')}`, num, 'phone', 'root', 'owns', { source: 'Phone' });
      }

      // WhatsApp → chain off phone if possible
      if (f.agent_type === 'WhatsApp' && data.registered) {
        const phoneNum = data.phone || data.number || '';
        const phoneId = phoneNum ? `phone-${phoneNum.replace(/\D/g, '')}` : null;
        const parent = phoneId && added.has(phoneId) ? phoneId : 'root';
        addNode('plat-whatsapp', 'WhatsApp', 'platform', parent, 'registered', { source: 'WhatsApp', verified: true });
      }

      // Telegram
      if (f.agent_type === 'Telegram' && data.found) {
        addNode('plat-telegram', 'Telegram', 'platform', 'root', 'account', { source: 'Telegram', verified: true });
      }

      // Address findings
      if (f.agent_type === 'Address' && (data.addresses || data.address)) {
        const addrs = data.addresses || (data.address ? [data.address] : []);
        addrs.slice(0, 3).forEach((addr: any, i: number) => {
          const str = typeof addr === 'string' ? addr : addr.full || addr.street || 'Address';
          addNode(`addr-${str.substring(0, 20).replace(/\s+/g, '-').toLowerCase()}-${i}`, str.length > 30 ? str.substring(0, 28) + '…' : str, 'address', 'root', 'lives at', { source: f.agent_type });
        });
      }
    });

    // ── Pass 4: Cross-link shared selectors ──
    // If two person nodes share an email or phone, link them
    // (This happens when daisy-chaining from relative investigations)
    // For now, platforms with same name from different sources get merged via addNode's dedup

    return { nodes: newNodes, links: newLinks };
  }, [findings, targetName, dimensions]);

  useEffect(() => {
    const { nodes: n, links: l } = buildGraph();
    // Preserve positions of existing nodes
    const oldPositions = new Map<string, { x: number; y: number }>();
    nodesRef.current.forEach(node => oldPositions.set(node.id, { x: node.x, y: node.y }));
    
    const mergedNodes = n.map(node => {
      const old = oldPositions.get(node.id);
      if (old) {
        return { ...node, x: old.x, y: old.y };
      }
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
      source: parentId,
      target: nodeId,
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

  // Double-click to pivot
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

  // ──────── Bloom animation helper ────────
  const getBloomProgress = useCallback((birthTime: number): number => {
    const age = Date.now() - birthTime;
    if (age >= BLOOM_DURATION_MS) return 1;
    // Ease-out cubic
    const t = age / BLOOM_DURATION_MS;
    return 1 - Math.pow(1 - t, 3);
  }, []);

  // Force re-render during bloom animations
  useEffect(() => {
    const hasAnimating = nodes.some(n => (Date.now() - n.birthTime) < BLOOM_DURATION_MS);
    if (!hasAnimating) return;
    
    let rafId: number;
    const tick = () => {
      setNodes(prev => [...prev]); // trigger re-render
      const stillAnimating = nodesRef.current.some(n => (Date.now() - n.birthTime) < BLOOM_DURATION_MS);
      if (stillAnimating) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [nodes.length]);

  // ──────── Render ────────
  if (!active) {
    return (
      <div className="w-full rounded-lg border border-border/20 overflow-hidden flex items-center justify-center" 
        style={{ height: 650, background: '#0d1117' }}>
        <div className="text-center text-muted-foreground">
          <Network className="h-12 w-12 mx-auto mb-3 opacity-20" style={{ color: '#c084fc' }} />
          <p className="text-sm font-medium text-gray-400">Intelligence Link Graph</p>
          <p className="text-xs mt-1 text-gray-600">Start an investigation to visualize connections</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full rounded-lg border border-border/20 overflow-hidden transition-all duration-300",
        isFullscreen && "fixed inset-0 z-50 rounded-none"
      )}
      style={{ 
        background: '#0d1117',
        height: isFullscreen ? '100vh' : 650,
      }}
    >
      {/* ── Floating Search Bar ── */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30">
        <div className={cn(
          "flex items-center gap-2 rounded-full border border-gray-700/60 bg-[#161b22]/90 backdrop-blur-xl px-3 py-1.5 shadow-2xl transition-all",
          showSearch ? "w-[420px]" : "w-auto"
        )}>
          {showSearch ? (
            <>
              <Select value={searchType} onValueChange={setSearchType}>
                <SelectTrigger className="w-[100px] h-7 bg-transparent border-none text-gray-300 text-xs focus:ring-0 px-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#161b22] border-gray-700">
                  <SelectItem value="email"><div className="flex items-center gap-1.5 text-xs"><Mail className="h-3 w-3 text-blue-400"/>Email</div></SelectItem>
                  <SelectItem value="username"><div className="flex items-center gap-1.5 text-xs"><AtSign className="h-3 w-3 text-purple-400"/>Username</div></SelectItem>
                  <SelectItem value="phone"><div className="flex items-center gap-1.5 text-xs"><Phone className="h-3 w-3 text-green-400"/>Phone</div></SelectItem>
                  <SelectItem value="person"><div className="flex items-center gap-1.5 text-xs"><User className="h-3 w-3 text-amber-400"/>Person</div></SelectItem>
                  <SelectItem value="address"><div className="flex items-center gap-1.5 text-xs"><MapPin className="h-3 w-3 text-cyan-400"/>Address</div></SelectItem>
                </SelectContent>
              </Select>
              <Input
                ref={searchInputRef}
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInlineSearch()}
                placeholder={
                  searchType === 'email' ? 'user@example.com' :
                  searchType === 'username' ? '@handle' :
                  searchType === 'phone' ? '+1 555 123 4567' :
                  searchType === 'person' ? 'John Smith' :
                  '123 Main St'
                }
                className="flex-1 h-7 bg-transparent border-none text-white text-xs placeholder:text-gray-600 focus-visible:ring-0"
              />
              {searchingNodeId ? (
                <Loader2 className="h-4 w-4 text-purple-400 animate-spin" />
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-purple-400 hover:text-purple-300 hover:bg-purple-400/10"
                  onClick={handleInlineSearch}
                  disabled={!searchValue.trim()}
                >
                  <Search className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 text-gray-500 hover:text-gray-300"
                onClick={() => setShowSearch(false)}
              >
                <X className="h-3 w-3" />
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 text-gray-400 hover:text-white hover:bg-white/5 text-xs px-3"
              onClick={() => {
                setShowSearch(true);
                setTimeout(() => searchInputRef.current?.focus(), 100);
              }}
            >
              <Search className="h-3.5 w-3.5" />
              Search entity…
            </Button>
          )}
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-1">
        <Badge variant="outline" className="text-[10px] font-mono border-gray-700/50 text-gray-500 bg-transparent h-6">
          {nodes.length} nodes
        </Badge>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-600 hover:text-gray-300 hover:bg-white/5"
          onClick={() => setZoom(z => Math.max(MIN_ZOOM, z - 0.2))}>
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-600 hover:text-gray-300 hover:bg-white/5"
          onClick={() => setZoom(z => Math.min(MAX_ZOOM, z + 0.2))}>
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-600 hover:text-gray-300 hover:bg-white/5"
          onClick={resetView}>
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-600 hover:text-gray-300 hover:bg-white/5"
          onClick={() => setIsFullscreen(!isFullscreen)}>
          {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {/* ── Hint ── */}
      <div className="absolute bottom-3 left-3 z-20 text-[10px] text-gray-600 select-none">
        Drag nodes • Scroll to zoom • Double-click to investigate
      </div>

      {/* ── Selected node panel ── */}
      {selectedNode && (() => {
        const node = nodes.find(n => n.id === selectedNode);
        if (!node) return null;
        const connectedCount = links.filter(l => l.source === node.id || l.target === node.id).length;
        return (
          <div className="absolute bottom-3 right-3 z-20 w-56 p-3 rounded-lg bg-[#161b22]/95 backdrop-blur border border-gray-800 shadow-xl">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: NODE_COLORS[node.type] }} />
              <p className="text-xs font-medium text-white truncate flex-1">{node.label}</p>
              <Button variant="ghost" size="icon" className="h-5 w-5 p-0 text-gray-500 hover:text-white"
                onClick={() => setSelectedNode(null)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            <p className="text-[10px] text-gray-500 capitalize mb-1">{node.type}{node.metadata?.source ? ` • ${node.metadata.source}` : ''}</p>
            <p className="text-[10px] text-gray-600 mb-2">{connectedCount} connection{connectedCount !== 1 ? 's' : ''}</p>
            {node.type !== 'root' && onPivot && (
              <Button size="sm" className="w-full h-7 text-xs bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-600/30"
                onClick={() => handleNodeDoubleClick(node.id)}>
                {node.searching ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Search className="h-3 w-3 mr-1" />}
                Investigate
              </Button>
            )}
          </div>
        );
      })()}

      {/* ── SVG Canvas ── */}
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
          <pattern id="dot-grid" width="30" height="30" patternUnits="userSpaceOnUse">
            <circle cx="15" cy="15" r="0.5" fill="#21262d" />
          </pattern>
          <filter id="node-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width="100%" height="100%" fill="#0d1117" />
        <rect width="100%" height="100%" fill="url(#dot-grid)" />

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Links */}
          {links.map((link) => {
            const s = nodes.find(n => n.id === link.source);
            const t = nodes.find(n => n.id === link.target);
            if (!s || !t) return null;

            const isActive = hoveredNode === link.source || hoveredNode === link.target ||
                             selectedNode === link.source || selectedNode === link.target;
            
            // Bloom: fade link in with the newer node
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
                {/* Edge label on hover */}
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
            const isHovered = hoveredNode === node.id;
            const isSelected = selectedNode === node.id;
            const color = NODE_COLORS[node.type] || '#c084fc';
            const bloom = getBloomProgress(node.birthTime);
            const r = node.radius * bloom; // scale in
            const opacity = bloom; // fade in
            const showLabel = (isHovered || isSelected || node.type === 'root' || zoom > 1.2) && bloom > 0.5;

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
                style={{ opacity }}
              >
                {/* Bloom burst ring */}
                {bloom < 1 && (
                  <circle
                    r={node.radius * 4 * (1 - bloom)}
                    fill="none"
                    stroke={color}
                    strokeWidth={0.5}
                    opacity={0.3 * (1 - bloom)}
                  />
                )}

                {/* Glow */}
                {(isHovered || isSelected) && bloom >= 1 && (
                  <circle r={r * 3} fill={color} opacity={0.08} />
                )}
                
                {/* Pulse ring for searching */}
                {node.searching && (
                  <circle r={r * 2.5} fill="none" stroke={color} strokeWidth="0.5" opacity="0.4">
                    <animate attributeName="r" from={`${r * 1.5}`} to={`${r * 4}`} dur="1.2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.5" to="0" dur="1.2s" repeatCount="indefinite" />
                  </circle>
                )}

                {/* Selection ring */}
                {isSelected && (
                  <circle r={r + 3} fill="none" stroke={color} strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />
                )}

                {/* Dot */}
                <circle
                  r={r}
                  fill={color}
                  opacity={isHovered || isSelected ? 1 : 0.7}
                  style={{
                    filter: isHovered || isSelected ? `drop-shadow(0 0 ${r * 2}px ${color})` : 'none',
                    transition: 'opacity 0.2s',
                  }}
                />

                {/* Label */}
                {showLabel && (
                  <text
                    y={r + 12}
                    textAnchor="middle"
                    className="pointer-events-none select-none"
                    style={{ 
                      fontSize: node.type === 'root' ? '11px' : '9px',
                      fill: isHovered || isSelected ? '#e6edf3' : '#8b949e',
                      fontWeight: node.type === 'root' ? 600 : 400,
                      textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                    }}
                  >
                    {node.label.length > 24 ? node.label.substring(0, 22) + '…' : node.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};

export default PalantirLinkGraph;
