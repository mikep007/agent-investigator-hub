import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  User, Mail, Phone, AtSign, MapPin, Globe, AlertTriangle,
  FileText, Shield, ExternalLink, Search, Copy, Trash2, X
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ICON_MAP: Record<string, typeof User> = {
  root: User, email: Mail, phone: Phone, username: AtSign,
  platform: Globe, person: User, address: MapPin, breach: AlertTriangle, document: FileText,
};

const NODE_COLORS: Record<string, string> = {
  root: '#c084fc', email: '#60a5fa', phone: '#34d399', username: '#a78bfa',
  platform: '#f472b6', person: '#fbbf24', address: '#22d3ee', breach: '#f87171',
};

interface CanvasNode {
  id: string;
  label: string;
  type: string;
  notes?: string;
  metadata?: {
    source?: string;
    url?: string;
    verified?: boolean;
    confidence?: number;
  };
}

interface NodeInspectorProps {
  selectedNode: CanvasNode | null;
  connectionCount: number;
  onClose: () => void;
  onInvestigate: (nodeId: string) => void;
  onCopy: (value: string) => void;
  onRemove: (nodeId: string) => void;
  onOpenUrl?: (url: string) => void;
  onUpdateNotes: (nodeId: string, notes: string) => void;
  onPivot?: (type: string, value: string) => void;
}

const PIVOT_SUGGESTIONS: Record<string, string[]> = {
  email: ['Holehe', 'LeakCheck', 'Gravatar', 'Social Search'],
  phone: ['PhoneInfoga', 'WhatsApp', 'Telegram'],
  username: ['Sherlock', 'Maigret', 'Social Search'],
  person: ['People Search', 'FamilyTreeNow', 'Voter Lookup'],
  address: ['Property Records', 'Street View'],
  platform: ['Deep Dive Investigation'],
  breach: ['LeakCheck'],
  root: ['Full Investigation'],
};

const NodeInspector = ({
  selectedNode,
  connectionCount,
  onClose,
  onInvestigate,
  onCopy,
  onRemove,
  onOpenUrl,
  onUpdateNotes,
  onPivot,
}: NodeInspectorProps) => {
  const [notes, setNotes] = useState(selectedNode?.notes || '');

  if (!selectedNode) {
    return (
      <div className="flex flex-col h-full" style={{ background: '#0d1117' }}>
        <div className="p-4 border-b font-medium text-[13px]" style={{ borderColor: '#21262d', color: '#e6edf3' }}>
          Node Details
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-[13px]" style={{ color: '#484f58' }}>Click a node to inspect</p>
        </div>
      </div>
    );
  }

  const Icon = ICON_MAP[selectedNode.type] || Globe;
  const color = NODE_COLORS[selectedNode.type] || '#c084fc';
  const pivots = PIVOT_SUGGESTIONS[selectedNode.type] || [];

  return (
    <div className="flex flex-col h-full" style={{ background: '#0d1117' }}>
      <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: '#21262d' }}>
        <span className="font-medium text-[13px]" style={{ color: '#e6edf3' }}>Node Details</span>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-[#484f58] hover:text-[#e6edf3]" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Node header */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center rounded-lg w-10 h-10" style={{ background: `${color}20` }}>
            <Icon className="h-5 w-5" style={{ color }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-[13px] truncate" style={{ color: '#e6edf3' }}>{selectedNode.label}</p>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: `${color}99` }}>
              {selectedNode.type}
              {selectedNode.metadata?.source ? ` · ${selectedNode.metadata.source}` : ''}
            </p>
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5">
          {selectedNode.metadata?.verified && (
            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px] gap-1">
              <Shield className="h-3 w-3" /> Verified
            </Badge>
          )}
          <Badge className="bg-[#161b22] text-[#8b949e] border-[#30363d] text-[10px]">
            {connectionCount} connections
          </Badge>
          {selectedNode.metadata?.confidence != null && (
            <Badge className="bg-[#161b22] text-[#8b949e] border-[#30363d] text-[10px]">
              {Math.round(selectedNode.metadata.confidence * 100)}% confidence
            </Badge>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-[12px] h-8 text-[#e6edf3] hover:bg-[#161b22]"
            onClick={() => onInvestigate(selectedNode.id)}
          >
            <Search className="h-3.5 w-3.5 mr-2" style={{ color: '#c084fc' }} />
            Investigate
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-[12px] h-8 text-[#e6edf3] hover:bg-[#161b22]"
            onClick={() => onCopy(selectedNode.label)}
          >
            <Copy className="h-3.5 w-3.5 mr-2" style={{ color: '#8b949e' }} />
            Copy value
          </Button>
          {selectedNode.metadata?.url && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-[12px] h-8 text-[#e6edf3] hover:bg-[#161b22]"
              onClick={() => onOpenUrl?.(selectedNode.metadata!.url!)}
            >
              <ExternalLink className="h-3.5 w-3.5 mr-2" style={{ color: '#60a5fa' }} />
              Open link
            </Button>
          )}
          {selectedNode.type !== 'root' && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-[12px] h-8 text-red-400 hover:bg-red-500/10 hover:text-red-300"
              onClick={() => onRemove(selectedNode.id)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Remove node
            </Button>
          )}
        </div>

        {/* Notes */}
        <div>
          <p className="text-[11px] font-medium mb-1.5" style={{ color: '#8b949e' }}>Notes</p>
          <Textarea
            value={notes}
            onChange={e => {
              setNotes(e.target.value);
              onUpdateNotes(selectedNode.id, e.target.value);
            }}
            placeholder="Add investigation notes..."
            className="bg-[#161b22] border-[#30363d] text-[#e6edf3] text-[12px] placeholder:text-[#484f58] min-h-[100px] focus-visible:ring-purple-500/30"
          />
        </div>

        {/* Pivot Suggestions */}
        {pivots.length > 0 && (
          <div>
            <p className="text-[11px] font-medium mb-2" style={{ color: '#8b949e' }}>Suggested Pivots</p>
            <div className="space-y-1.5">
              {pivots.map(pivot => (
                <Button
                  key={pivot}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-[11px] h-7 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22]"
                  onClick={() => onPivot?.(selectedNode.type, selectedNode.label)}
                >
                  <Search className="h-3 w-3 mr-2" style={{ color: '#34d399' }} />
                  {pivot}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NodeInspector;
