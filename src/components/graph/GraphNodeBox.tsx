import { useState, useRef, useEffect } from 'react';
import {
  Mail, Phone, AtSign, User, MapPin, Globe, AlertTriangle, Shield,
  Search, Copy, ExternalLink, Trash2, ChevronDown, Loader2, Lock, Pin
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface GraphNodeData {
  id: string;
  label: string;
  type: 'root' | 'email' | 'phone' | 'username' | 'platform' | 'person' | 'address' | 'breach';
  searching?: boolean;
  metadata?: {
    source?: string;
    url?: string;
    verified?: boolean;
    confidence?: number;
  };
}

interface GraphNodeBoxProps {
  node: GraphNodeData;
  isHovered: boolean;
  isSelected: boolean;
  bloom: number;
  zoom: number;
  onInvestigate: (nodeId: string) => void;
  onCopyValue: (value: string) => void;
  onRemove: (nodeId: string) => void;
  onOpenUrl?: (url: string) => void;
}

const ICON_MAP: Record<string, typeof Mail> = {
  root: User,
  email: Mail,
  phone: Phone,
  username: AtSign,
  platform: Globe,
  person: User,
  address: MapPin,
  breach: AlertTriangle,
};

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

const TYPE_LABELS: Record<string, string> = {
  root: 'TARGET',
  email: 'EMAIL',
  phone: 'PHONE',
  username: 'USERNAME',
  platform: 'PLATFORM',
  person: 'PERSON',
  address: 'ADDRESS',
  breach: 'BREACH',
};

const GraphNodeBox = ({
  node,
  isHovered,
  isSelected,
  bloom,
  zoom,
  onInvestigate,
  onCopyValue,
  onRemove,
  onOpenUrl,
}: GraphNodeBoxProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const Icon = ICON_MAP[node.type] || Globe;
  const color = NODE_COLORS[node.type] || '#c084fc';

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const boxWidth = node.type === 'root' ? 180 : 160;
  const boxHeight = 36;

  return (
    <foreignObject
      x={-boxWidth / 2}
      y={-boxHeight / 2}
      width={boxWidth + 2}
      height={menuOpen ? boxHeight + 140 : boxHeight + 4}
      style={{
        opacity: bloom,
        overflow: 'visible',
        pointerEvents: 'all',
      }}
    >
      <div
        style={{ transform: `scale(${bloom})`, transformOrigin: 'center top' }}
        className="relative"
      >
        {/* Main box */}
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-md border px-2 py-1 transition-all duration-150 select-none",
            "text-[11px] font-medium whitespace-nowrap",
            isSelected
              ? "ring-1 ring-offset-0"
              : ""
          )}
          style={{
            background: isSelected || isHovered
              ? `${color}18`
              : '#0d1117',
            borderColor: isSelected
              ? color
              : isHovered
                ? `${color}80`
                : '#30363d',
            color: '#e6edf3',
            boxShadow: isSelected || isHovered
              ? `0 0 12px ${color}30, 0 0 4px ${color}15`
              : '0 1px 3px rgba(0,0,0,0.4)',
            ...(isSelected ? { ringColor: color } : {}),
            minWidth: boxWidth,
          }}
        >
          {/* Type icon */}
          <div
            className="flex items-center justify-center rounded-sm flex-shrink-0"
            style={{
              width: 22,
              height: 22,
              background: `${color}20`,
            }}
          >
            {node.searching ? (
              <Loader2 className="animate-spin" style={{ width: 12, height: 12, color }} />
            ) : (
              <Icon style={{ width: 12, height: 12, color }} />
            )}
          </div>

          {/* Label */}
          <div className="flex flex-col flex-1 min-w-0 leading-none gap-0">
            <span className="truncate text-[11px]" style={{ color: '#e6edf3' }}>
              {node.label.length > 20 ? node.label.substring(0, 18) + '…' : node.label}
            </span>
            <span className="text-[8px] uppercase tracking-wider" style={{ color: `${color}99` }}>
              {TYPE_LABELS[node.type]}
              {node.metadata?.source ? ` · ${node.metadata.source}` : ''}
            </span>
          </div>

          {/* Verified badge */}
          {node.metadata?.verified && (
            <div className="flex-shrink-0" style={{ color: '#34d399' }}>
              <Shield style={{ width: 10, height: 10 }} />
            </div>
          )}

          {/* Dropdown trigger */}
          {node.type !== 'root' && (
            <button
              className={cn(
                "flex-shrink-0 rounded-sm p-0.5 transition-colors",
                menuOpen ? "bg-white/10" : "hover:bg-white/5"
              )}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              style={{ color: '#8b949e' }}
            >
              <ChevronDown style={{ width: 12, height: 12, transform: menuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>
          )}
        </div>

        {/* Dropdown menu */}
        {menuOpen && node.type !== 'root' && (
          <div
            ref={menuRef}
            className="absolute left-0 right-0 mt-1 rounded-md border shadow-xl z-50"
            style={{
              background: '#161b22',
              borderColor: '#30363d',
            }}
          >
            <button
              className="flex items-center gap-2 w-full px-2.5 py-1.5 text-[11px] text-left hover:bg-white/5 transition-colors"
              style={{ color: '#e6edf3' }}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onInvestigate(node.id);
              }}
            >
              <Search style={{ width: 11, height: 11, color: '#c084fc' }} />
              Investigate
            </button>
            <button
              className="flex items-center gap-2 w-full px-2.5 py-1.5 text-[11px] text-left hover:bg-white/5 transition-colors"
              style={{ color: '#e6edf3' }}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onCopyValue(node.label);
              }}
            >
              <Copy style={{ width: 11, height: 11, color: '#8b949e' }} />
              Copy value
            </button>
            {node.metadata?.url && (
              <button
                className="flex items-center gap-2 w-full px-2.5 py-1.5 text-[11px] text-left hover:bg-white/5 transition-colors"
                style={{ color: '#e6edf3' }}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onOpenUrl?.(node.metadata!.url!);
                }}
              >
                <ExternalLink style={{ width: 11, height: 11, color: '#60a5fa' }} />
                Open link
              </button>
            )}
            <div style={{ height: 1, background: '#21262d', margin: '2px 0' }} />
            <button
              className="flex items-center gap-2 w-full px-2.5 py-1.5 text-[11px] text-left hover:bg-white/5 transition-colors"
              style={{ color: '#f87171' }}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onRemove(node.id);
              }}
            >
              <Trash2 style={{ width: 11, height: 11 }} />
              Remove
            </button>
          </div>
        )}
      </div>
    </foreignObject>
  );
};

export default GraphNodeBox;
