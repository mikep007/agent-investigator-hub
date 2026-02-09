import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { 
  Users, User, Mail, Phone, Coins, Globe, Shield, Search,
  MapPin, AlertTriangle, FileText, Camera, Database, Fingerprint,
  Eye, Radio, Wifi, Lock, Server, Hash
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OSINTTool {
  cat: string;
  name: string;
  desc: string;
  icon: string;
  color: string;
  nodeType: string;
}

const TOOLS: OSINTTool[] = [
  { cat: 'Identity', name: 'SocialHunter', desc: 'Social media profile finder', icon: 'Users', color: 'emerald', nodeType: 'platform' },
  { cat: 'Username', name: 'Maigret', desc: 'Username search across 300+ sites', icon: 'User', color: 'blue', nodeType: 'username' },
  { cat: 'Username', name: 'Sherlock', desc: 'Hunt usernames across social networks', icon: 'Search', color: 'purple', nodeType: 'username' },
  { cat: 'Email', name: 'Holehe', desc: 'Email verification & linked accounts', icon: 'Mail', color: 'amber', nodeType: 'email' },
  { cat: 'Email', name: 'LeakCheck', desc: 'Check if email appears in data breaches', icon: 'AlertTriangle', color: 'red', nodeType: 'breach' },
  { cat: 'Phone', name: 'PhoneInfoga', desc: 'Phone number OSINT', icon: 'Phone', color: 'rose', nodeType: 'phone' },
  { cat: 'Phone', name: 'WhatsApp', desc: 'WhatsApp registration check', icon: 'Wifi', color: 'green', nodeType: 'platform' },
  { cat: 'Phone', name: 'Telegram', desc: 'Telegram account lookup', icon: 'Radio', color: 'sky', nodeType: 'platform' },
  { cat: 'People', name: 'People Search', desc: 'Public records & contact info', icon: 'Database', color: 'cyan', nodeType: 'person' },
  { cat: 'People', name: 'FamilyTreeNow', desc: 'Family tree & relative finder', icon: 'Users', color: 'teal', nodeType: 'person' },
  { cat: 'Address', name: 'Property Records', desc: 'Property ownership lookup', icon: 'MapPin', color: 'orange', nodeType: 'address' },
  { cat: 'Crypto', name: 'Wallet Explorer', desc: 'Blockchain wallet tracing', icon: 'Coins', color: 'violet', nodeType: 'platform' },
  { cat: 'Face', name: 'Face Search', desc: 'Facial recognition search', icon: 'Camera', color: 'pink', nodeType: 'person' },
  { cat: 'Domain', name: 'WHOIS', desc: 'Domain registration lookup', icon: 'Globe', color: 'indigo', nodeType: 'platform' },
  { cat: 'Breach', name: 'HaveIBeenPwned', desc: 'Breach database search', icon: 'Shield', color: 'red', nodeType: 'breach' },
  { cat: 'Document', name: 'Document Search', desc: 'Public document finder', icon: 'FileText', color: 'slate', nodeType: 'document' },
];

const ICON_MAP: Record<string, typeof Users> = {
  Users, User, Mail, Phone, Coins, Globe, Shield, Search,
  MapPin, AlertTriangle, FileText, Camera, Database, Fingerprint,
  Eye, Radio, Wifi, Lock, Server, Hash,
};

const COLOR_MAP: Record<string, string> = {
  emerald: 'text-emerald-400 border-emerald-500/30 hover:border-emerald-500/60',
  blue: 'text-blue-400 border-blue-500/30 hover:border-blue-500/60',
  purple: 'text-purple-400 border-purple-500/30 hover:border-purple-500/60',
  amber: 'text-amber-400 border-amber-500/30 hover:border-amber-500/60',
  rose: 'text-rose-400 border-rose-500/30 hover:border-rose-500/60',
  red: 'text-red-400 border-red-500/30 hover:border-red-500/60',
  green: 'text-green-400 border-green-500/30 hover:border-green-500/60',
  sky: 'text-sky-400 border-sky-500/30 hover:border-sky-500/60',
  cyan: 'text-cyan-400 border-cyan-500/30 hover:border-cyan-500/60',
  teal: 'text-teal-400 border-teal-500/30 hover:border-teal-500/60',
  orange: 'text-orange-400 border-orange-500/30 hover:border-orange-500/60',
  violet: 'text-violet-400 border-violet-500/30 hover:border-violet-500/60',
  pink: 'text-pink-400 border-pink-500/30 hover:border-pink-500/60',
  indigo: 'text-indigo-400 border-indigo-500/30 hover:border-indigo-500/60',
  slate: 'text-slate-400 border-slate-500/30 hover:border-slate-500/60',
};

const ICON_COLOR_MAP: Record<string, string> = {
  emerald: 'text-emerald-400',
  blue: 'text-blue-400',
  purple: 'text-purple-400',
  amber: 'text-amber-400',
  rose: 'text-rose-400',
  red: 'text-red-400',
  green: 'text-green-400',
  sky: 'text-sky-400',
  cyan: 'text-cyan-400',
  teal: 'text-teal-400',
  orange: 'text-orange-400',
  violet: 'text-violet-400',
  pink: 'text-pink-400',
  indigo: 'text-indigo-400',
  slate: 'text-slate-400',
};

interface OSINTToolPaletteProps {
  onDragTool: (tool: OSINTTool) => void;
  onClickTool: (tool: OSINTTool) => void;
}

const OSINTToolPalette = ({ onDragTool, onClickTool }: OSINTToolPaletteProps) => {
  const [search, setSearch] = useState('');

  const filteredTools = useMemo(() => {
    if (!search.trim()) return TOOLS;
    const q = search.toLowerCase();
    return TOOLS.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.cat.toLowerCase().includes(q) ||
      t.desc.toLowerCase().includes(q)
    );
  }, [search]);

  return (
    <div className="flex flex-col h-full" style={{ background: '#0d1117' }}>
      <div className="p-4 border-b" style={{ borderColor: '#21262d' }}>
        <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: '#34d399' }}>
          <Shield className="h-5 w-5" />
          OSINT Nexus
        </h2>
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search tools or entities..."
          className="mt-3 bg-[#161b22] border-[#30363d] text-[#e6edf3] placeholder:text-[#484f58] focus-visible:ring-emerald-500/50 focus-visible:border-emerald-500/50"
        />
      </div>
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-2 gap-3">
          {filteredTools.map(tool => {
            const Icon = ICON_MAP[tool.icon] || Globe;
            const colorClass = COLOR_MAP[tool.color] || COLOR_MAP.emerald;
            const iconColor = ICON_COLOR_MAP[tool.color] || 'text-emerald-400';

            return (
              <div
                key={tool.name}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/json', JSON.stringify(tool));
                  onDragTool(tool);
                }}
                onClick={() => onClickTool(tool)}
                className={cn(
                  "bg-[#161b22] border rounded-xl p-3 cursor-grab active:cursor-grabbing transition-all hover:bg-[#1c2128]",
                  colorClass
                )}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={cn("h-5 w-5 flex-shrink-0", iconColor)} />
                  <div className="min-w-0">
                    <div className="font-medium text-[13px]" style={{ color: '#e6edf3' }}>{tool.name}</div>
                    <div className="text-[10px] truncate" style={{ color: '#8b949e' }}>{tool.desc}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {filteredTools.length === 0 && (
          <p className="text-center text-sm mt-8" style={{ color: '#484f58' }}>No tools match "{search}"</p>
        )}
      </div>
    </div>
  );
};

export default OSINTToolPalette;
