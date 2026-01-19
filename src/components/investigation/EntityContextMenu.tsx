import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { 
  Plus, Link2, Unlink, Trash2, Copy, Search, 
  User, Mail, Phone, AtSign, MapPin, Globe, 
  Lock, Unlock, Eye, EyeOff, Group
} from 'lucide-react';
import { EntityType, ENTITY_COLORS } from './types';

interface EntityContextMenuProps {
  children: React.ReactNode;
  onCreateNode: (type: EntityType, position: { x: number; y: number }) => void;
  onLinkNodes: () => void;
  onUnlinkNode: () => void;
  onDeleteNode: () => void;
  onDuplicateNode: () => void;
  onPivotSearch: () => void;
  onLockNode: () => void;
  onGroupNodes: () => void;
  hasSelection: boolean;
  hasMultipleSelection: boolean;
  contextPosition: { x: number; y: number };
  selectedNodeLocked?: boolean;
}

const entityTypes: { type: EntityType; icon: typeof User; label: string }[] = [
  { type: 'person', icon: User, label: 'Person' },
  { type: 'email', icon: Mail, label: 'Email' },
  { type: 'phone', icon: Phone, label: 'Phone' },
  { type: 'username', icon: AtSign, label: 'Username' },
  { type: 'address', icon: MapPin, label: 'Address' },
  { type: 'platform', icon: Globe, label: 'Platform' },
];

export const EntityContextMenu = ({
  children,
  onCreateNode,
  onLinkNodes,
  onUnlinkNode,
  onDeleteNode,
  onDuplicateNode,
  onPivotSearch,
  onLockNode,
  onGroupNodes,
  hasSelection,
  hasMultipleSelection,
  contextPosition,
  selectedNodeLocked,
}: EntityContextMenuProps) => {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {/* Create new entity submenu */}
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Plus className="mr-2 h-4 w-4" />
            Create Node
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48">
            {entityTypes.map(({ type, icon: Icon, label }) => (
              <ContextMenuItem
                key={type}
                onClick={() => onCreateNode(type, contextPosition)}
              >
                <div 
                  className="mr-2 h-4 w-4 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: ENTITY_COLORS[type] }}
                >
                  <Icon className="h-2.5 w-2.5 text-white" />
                </div>
                {label}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        
        {hasSelection && (
          <>
            <ContextMenuSeparator />
            
            {hasMultipleSelection ? (
              <>
                <ContextMenuItem onClick={onLinkNodes}>
                  <Link2 className="mr-2 h-4 w-4" />
                  Link Selected Nodes
                </ContextMenuItem>
                <ContextMenuItem onClick={onGroupNodes}>
                  <Group className="mr-2 h-4 w-4" />
                  Group Selection
                </ContextMenuItem>
              </>
            ) : (
              <>
                <ContextMenuItem onClick={onPivotSearch}>
                  <Search className="mr-2 h-4 w-4" />
                  Pivot Search
                </ContextMenuItem>
                <ContextMenuItem onClick={onLinkNodes}>
                  <Link2 className="mr-2 h-4 w-4" />
                  Link to...
                </ContextMenuItem>
                <ContextMenuItem onClick={onUnlinkNode}>
                  <Unlink className="mr-2 h-4 w-4" />
                  Remove Links
                </ContextMenuItem>
              </>
            )}
            
            <ContextMenuSeparator />
            
            <ContextMenuItem onClick={onDuplicateNode}>
              <Copy className="mr-2 h-4 w-4" />
              Duplicate
            </ContextMenuItem>
            
            <ContextMenuItem onClick={onLockNode}>
              {selectedNodeLocked ? (
                <>
                  <Unlock className="mr-2 h-4 w-4" />
                  Unlock Position
                </>
              ) : (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Lock Position
                </>
              )}
            </ContextMenuItem>
            
            <ContextMenuSeparator />
            
            <ContextMenuItem 
              onClick={onDeleteNode}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
};

export default EntityContextMenu;
