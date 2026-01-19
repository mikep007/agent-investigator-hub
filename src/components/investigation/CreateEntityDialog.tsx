import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EntityType, EntityNode, ENTITY_COLORS } from './types';
import { User, Mail, Phone, AtSign, MapPin, Globe, AlertTriangle, FileText } from 'lucide-react';

interface CreateEntityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (node: Partial<EntityNode>) => void;
  defaultType?: EntityType;
  position: { x: number; y: number };
}

const entityTypeOptions: { type: EntityType; icon: typeof User; label: string; placeholder: string }[] = [
  { type: 'person', icon: User, label: 'Person', placeholder: 'John Doe' },
  { type: 'email', icon: Mail, label: 'Email', placeholder: 'john@example.com' },
  { type: 'phone', icon: Phone, label: 'Phone', placeholder: '+1 555-123-4567' },
  { type: 'username', icon: AtSign, label: 'Username', placeholder: 'johndoe123' },
  { type: 'address', icon: MapPin, label: 'Address', placeholder: '123 Main St, City, ST' },
  { type: 'platform', icon: Globe, label: 'Platform', placeholder: 'Twitter, Instagram, etc.' },
];

export const CreateEntityDialog = ({
  open,
  onOpenChange,
  onCreate,
  defaultType = 'person',
  position,
}: CreateEntityDialogProps) => {
  const [type, setType] = useState<EntityType>(defaultType);
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  
  const selectedOption = entityTypeOptions.find(o => o.type === type);
  const Icon = selectedOption?.icon || User;
  
  const handleCreate = () => {
    if (!value.trim()) return;
    
    onCreate({
      type,
      label: label.trim() || value.trim(),
      x: position.x,
      y: position.y,
      vx: 0,
      vy: 0,
      locked: false,
      selected: false,
      metadata: {
        value: value.trim(),
        verified: false,
      },
      connections: [],
    });
    
    setValue('');
    setLabel('');
    onOpenChange(false);
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div 
              className="p-2 rounded-lg"
              style={{ backgroundColor: ENTITY_COLORS[type] + '20' }}
            >
              <Icon className="h-5 w-5" style={{ color: ENTITY_COLORS[type] }} />
            </div>
            Create Entity Node
          </DialogTitle>
          <DialogDescription>
            Add a new entity to the investigation graph. This can be linked to other entities.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="type">Entity Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as EntityType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {entityTypeOptions.map(({ type, icon: TypeIcon, label }) => (
                  <SelectItem key={type} value={type}>
                    <div className="flex items-center gap-2">
                      <div 
                        className="h-4 w-4 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: ENTITY_COLORS[type] }}
                      >
                        <TypeIcon className="h-2.5 w-2.5 text-white" />
                      </div>
                      {label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="value">Value</Label>
            <Input
              id="value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={selectedOption?.placeholder}
            />
            <p className="text-xs text-muted-foreground">
              The actual data (email address, phone number, etc.)
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="label">Display Label (optional)</Label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={value || 'Auto-generated from value'}
            />
            <p className="text-xs text-muted-foreground">
              How this node appears on the graph
            </p>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!value.trim()}>
            Create Node
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateEntityDialog;
