import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  MousePointer2, Search, Link2, Eraser, Move, 
  Undo2, Redo2, ZoomIn, ZoomOut, Maximize2
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type CanvasTool = 'select' | 'search' | 'link' | 'eraser' | 'pan';

interface CanvasToolbarProps {
  activeTool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToScreen: () => void;
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
}

const tools: { id: CanvasTool; icon: typeof MousePointer2; label: string; shortcut: string }[] = [
  { id: 'select', icon: MousePointer2, label: 'Select', shortcut: 'V' },
  { id: 'search', icon: Search, label: 'Search', shortcut: 'S' },
  { id: 'link', icon: Link2, label: 'Link Entities', shortcut: 'L' },
  { id: 'eraser', icon: Eraser, label: 'Delete', shortcut: 'D' },
];

export const CanvasToolbar = ({
  activeTool,
  onToolChange,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onFitToScreen,
  canUndo,
  canRedo,
  zoom,
}: CanvasToolbarProps) => {
  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
      <div className="flex items-center gap-1 px-3 py-2 bg-background/95 border border-border rounded-xl shadow-lg backdrop-blur-sm">
        {/* History controls */}
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-lg"
                onClick={onUndo}
                disabled={!canUndo}
              >
                <Undo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Undo (Ctrl+Z)</p>
            </TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-lg"
                onClick={onRedo}
                disabled={!canRedo}
              >
                <Redo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Redo (Ctrl+Shift+Z)</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        <Separator orientation="vertical" className="h-6 mx-1" />
        
        {/* Tool buttons */}
        <TooltipProvider delayDuration={200}>
          {tools.map((tool) => {
            const Icon = tool.icon;
            const isActive = activeTool === tool.id;
            
            return (
              <Tooltip key={tool.id}>
                <TooltipTrigger asChild>
                  <Button
                    variant={isActive ? 'default' : 'ghost'}
                    size="icon"
                    className={cn(
                      'h-9 w-9 rounded-lg transition-all',
                      isActive && 'bg-primary text-primary-foreground shadow-md'
                    )}
                    onClick={() => onToolChange(tool.id)}
                  >
                    <Icon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{tool.label} ({tool.shortcut})</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </TooltipProvider>
        
        <Separator orientation="vertical" className="h-6 mx-1" />
        
        {/* Zoom controls */}
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-lg"
                onClick={onZoomOut}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Zoom Out (-)</p>
            </TooltipContent>
          </Tooltip>
          
          <div className="px-2 min-w-[50px] text-center text-sm font-mono text-muted-foreground">
            {Math.round(zoom * 100)}%
          </div>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-lg"
                onClick={onZoomIn}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Zoom In (+)</p>
            </TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-lg"
                onClick={onFitToScreen}
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Fit to Screen (F)</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
};

export default CanvasToolbar;
