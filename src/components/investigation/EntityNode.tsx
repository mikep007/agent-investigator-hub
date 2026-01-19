import { memo } from 'react';
import { 
  User, Mail, Phone, AtSign, MapPin, Globe, 
  AlertTriangle, FileText, Check, Link2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { EntityNode as EntityNodeType, ENTITY_COLORS } from './types';

interface EntityNodeProps {
  node: EntityNodeType;
  isHovered: boolean;
  isDragging: boolean;
  zoom: number;
  onStartDrag: (e: React.MouseEvent) => void;
  onClick: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDoubleClick: (e: React.MouseEvent) => void;
}

const IconMap = {
  person: User,
  email: Mail,
  phone: Phone,
  username: AtSign,
  address: MapPin,
  platform: Globe,
  breach: AlertTriangle,
  document: FileText,
};

const EntityNode = memo(({
  node,
  isHovered,
  isDragging,
  zoom,
  onStartDrag,
  onClick,
  onContextMenu,
  onDoubleClick,
}: EntityNodeProps) => {
  const Icon = IconMap[node.type];
  const color = ENTITY_COLORS[node.type];
  const size = node.type === 'person' ? 40 : 32;
  
  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      onMouseDown={onStartDrag}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      className="entity-node"
    >
      {/* Selection/hover ring */}
      {(node.selected || isHovered) && (
        <circle
          r={size + 8}
          fill="transparent"
          stroke={color}
          strokeWidth={2}
          strokeDasharray={node.selected ? 'none' : '4 2'}
          className={cn(node.selected && 'animate-pulse')}
          opacity={0.6}
        />
      )}
      
      {/* Glow effect */}
      {(node.selected || isHovered) && (
        <circle
          r={size + 4}
          fill={color}
          opacity={0.15}
          filter="url(#entity-glow)"
        />
      )}
      
      {/* Main circle */}
      <circle
        r={size}
        fill={color}
        stroke={node.selected ? 'white' : 'transparent'}
        strokeWidth={2}
        className="transition-all duration-150"
        style={{
          filter: isHovered || node.selected ? `drop-shadow(0 0 8px ${color})` : 'none',
        }}
      />
      
      {/* Icon */}
      <foreignObject
        x={-size / 2}
        y={-size / 2}
        width={size}
        height={size}
        className="pointer-events-none"
      >
        <div className="flex items-center justify-center w-full h-full text-white">
          <Icon size={size * 0.5} />
        </div>
      </foreignObject>
      
      {/* Label */}
      <text
        y={size + 16}
        textAnchor="middle"
        className="text-[11px] fill-foreground font-medium select-none pointer-events-none"
        style={{ opacity: zoom < 0.5 ? 0 : 1 }}
      >
        {node.label.length > 20 ? node.label.substring(0, 18) + '...' : node.label}
      </text>
      
      {/* Type badge */}
      <g transform={`translate(${size - 4}, ${-size + 4})`}>
        <circle r={8} fill="hsl(var(--background))" stroke={color} strokeWidth={1.5} />
        <text
          textAnchor="middle"
          dominantBaseline="central"
          className="text-[7px] fill-foreground font-bold uppercase select-none pointer-events-none"
        >
          {node.type.charAt(0)}
        </text>
      </g>
      
      {/* Verified badge */}
      {node.metadata.verified && (
        <g transform={`translate(${size - 8}, ${size - 8})`}>
          <circle r={8} fill="#10B981" />
          <foreignObject x={-5} y={-5} width={10} height={10}>
            <div className="flex items-center justify-center text-white">
              <Check size={8} />
            </div>
          </foreignObject>
        </g>
      )}
      
      {/* Connection count indicator */}
      {node.connections.length > 0 && (
        <g transform={`translate(${-size + 8}, ${-size + 8})`}>
          <circle r={10} fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth={1} />
          <foreignObject x={-6} y={-6} width={12} height={12}>
            <div className="flex items-center justify-center text-[8px] font-bold text-muted-foreground">
              {node.connections.length}
            </div>
          </foreignObject>
        </g>
      )}
    </g>
  );
});

EntityNode.displayName = 'EntityNode';

export default EntityNode;
