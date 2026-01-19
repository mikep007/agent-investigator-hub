import { memo } from 'react';
import { EntityConnection, EntityNode, ENTITY_COLORS } from './types';

interface ConnectionLineProps {
  connection: EntityConnection;
  sourceNode: EntityNode | undefined;
  targetNode: EntityNode | undefined;
  isHighlighted: boolean;
  isSelected: boolean;
  onClick: (e: React.MouseEvent) => void;
}

const CONNECTION_COLORS: Record<string, string> = {
  owns: '#10B981',       // Green - strong ownership
  associated: '#6B7280', // Gray - weaker link
  breached_at: '#EF4444', // Red - breach
  registered_on: '#3B82F6', // Blue - registration
  lives_at: '#F59E0B',   // Amber - location
  related_to: '#8B5CF6', // Purple - relationship
  matches: '#EC4899',    // Pink - match
};

const ConnectionLine = memo(({
  connection,
  sourceNode,
  targetNode,
  isHighlighted,
  isSelected,
  onClick,
}: ConnectionLineProps) => {
  if (!sourceNode || !targetNode) return null;
  
  const color = CONNECTION_COLORS[connection.type] || 'hsl(var(--border))';
  const midX = (sourceNode.x + targetNode.x) / 2;
  const midY = (sourceNode.y + targetNode.y) / 2;
  
  // Calculate offset to not overlap with node circles
  const dx = targetNode.x - sourceNode.x;
  const dy = targetNode.y - sourceNode.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const sourceRadius = sourceNode.type === 'person' ? 40 : 32;
  const targetRadius = targetNode.type === 'person' ? 40 : 32;
  
  if (distance < sourceRadius + targetRadius + 10) return null;
  
  const startX = sourceNode.x + (dx / distance) * sourceRadius;
  const startY = sourceNode.y + (dy / distance) * sourceRadius;
  const endX = targetNode.x - (dx / distance) * targetRadius;
  const endY = targetNode.y - (dy / distance) * targetRadius;
  
  return (
    <g className="connection-line" onClick={onClick}>
      {/* Clickable area (wider) */}
      <line
        x1={startX}
        y1={startY}
        x2={endX}
        y2={endY}
        stroke="transparent"
        strokeWidth={12}
        className="cursor-pointer"
      />
      
      {/* Main line */}
      <line
        x1={startX}
        y1={startY}
        x2={endX}
        y2={endY}
        stroke={isHighlighted || isSelected ? color : 'hsl(var(--border))'}
        strokeWidth={isHighlighted || isSelected ? 2.5 : 1.5}
        strokeOpacity={isHighlighted || isSelected ? 1 : 0.5}
        strokeDasharray={connection.confidence < 0.5 ? '6 3' : 'none'}
        className="transition-all duration-150"
        markerEnd="url(#arrow)"
      />
      
      {/* Connection type label */}
      {(isHighlighted || isSelected) && connection.label && (
        <g transform={`translate(${midX}, ${midY})`}>
          <rect
            x={-30}
            y={-10}
            width={60}
            height={20}
            rx={4}
            fill="hsl(var(--background))"
            stroke={color}
            strokeWidth={1}
          />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            className="text-[9px] fill-foreground font-medium select-none pointer-events-none"
          >
            {connection.label || connection.type.replace('_', ' ')}
          </text>
        </g>
      )}
      
      {/* Confidence indicator */}
      {connection.confidence < 1 && (
        <text
          x={midX}
          y={midY - 12}
          textAnchor="middle"
          className="text-[8px] fill-muted-foreground select-none pointer-events-none"
        >
          {Math.round(connection.confidence * 100)}%
        </text>
      )}
    </g>
  );
});

ConnectionLine.displayName = 'ConnectionLine';

export default ConnectionLine;
