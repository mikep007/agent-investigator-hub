import { Button } from "@/components/ui/button";
import { User, Grid3X3, Clock, FileText } from "lucide-react";
import { ViewMode } from "./types";

interface ViewModeToggleProps {
  currentMode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
}

const ViewModeToggle = ({ currentMode, onModeChange }: ViewModeToggleProps) => {
  const modes: { id: ViewMode; label: string; icon: React.ReactNode; description: string }[] = [
    { id: 'profile', label: 'Profile', icon: <User className="h-4 w-4" />, description: 'Person-centric view' },
    { id: 'grid', label: 'Platforms', icon: <Grid3X3 className="h-4 w-4" />, description: 'Account grid' },
    { id: 'timeline', label: 'Timeline', icon: <Clock className="h-4 w-4" />, description: 'Chronological' },
    { id: 'dossier', label: 'Dossier', icon: <FileText className="h-4 w-4" />, description: 'Intel report' },
  ];

  return (
    <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg">
      {modes.map((mode) => (
        <Button
          key={mode.id}
          variant={currentMode === mode.id ? "default" : "ghost"}
          size="sm"
          onClick={() => onModeChange(mode.id)}
          className="gap-2"
          title={mode.description}
        >
          {mode.icon}
          <span className="hidden sm:inline">{mode.label}</span>
        </Button>
      ))}
    </div>
  );
};

export default ViewModeToggle;
