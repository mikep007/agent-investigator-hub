// Investigation Graph Types - Palette-inspired entity system

export type EntityType = 
  | 'person' 
  | 'email' 
  | 'phone' 
  | 'username' 
  | 'address' 
  | 'platform'
  | 'breach'
  | 'document';

export interface EntityNode {
  id: string;
  type: EntityType;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  locked: boolean;
  selected: boolean;
  metadata: EntityMetadata;
  connections: string[]; // IDs of connected nodes
}

export interface EntityMetadata {
  value?: string;
  source?: string;
  confidence?: number;
  verified?: boolean;
  url?: string;
  platform?: string;
  timestamp?: string;
  firstName?: string;
  lastName?: string;
  age?: number;
  location?: string;
  image?: string;
}

export interface EntityConnection {
  id: string;
  sourceId: string;
  targetId: string;
  type: ConnectionType;
  confidence: number;
  label?: string;
}

export type ConnectionType = 
  | 'owns'           // Person owns this email/phone/username
  | 'associated'     // Associated with (weaker link)
  | 'breached_at'    // Email found in breach
  | 'registered_on'  // Account registered on platform
  | 'lives_at'       // Person lives at address
  | 'related_to'     // Person related to person
  | 'matches';       // Selector matches person

export interface EntityGroup {
  id: string;
  name: string;
  color: string;
  nodeIds: string[];
}

export interface InvestigationCanvas {
  nodes: EntityNode[];
  connections: EntityConnection[];
  groups: EntityGroup[];
  zoom: number;
  pan: { x: number; y: number };
}

export interface CanvasTool {
  id: 'select' | 'search' | 'link' | 'eraser' | 'pan';
  icon: string;
  label: string;
  shortcut?: string;
}

export interface TimelineEvent {
  id: string;
  entityId: string;
  timestamp: string;
  type: 'created' | 'breached' | 'active' | 'discovered';
  label: string;
  platform?: string;
}

// Color scheme for entity types
export const ENTITY_COLORS: Record<EntityType, string> = {
  person: 'hsl(var(--primary))',
  email: '#3B82F6',      // Blue
  phone: '#10B981',      // Green
  username: '#8B5CF6',   // Purple
  address: '#F59E0B',    // Amber
  platform: '#EC4899',   // Pink
  breach: '#EF4444',     // Red
  document: '#6B7280',   // Gray
};

// Icons for entity types (as component names from lucide-react)
export const ENTITY_ICONS: Record<EntityType, string> = {
  person: 'User',
  email: 'Mail',
  phone: 'Phone',
  username: 'AtSign',
  address: 'MapPin',
  platform: 'Globe',
  breach: 'AlertTriangle',
  document: 'FileText',
};
