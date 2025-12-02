import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FindingData, ViewMode } from "./types";
import ViewModeToggle from "./ViewModeToggle";
import PersonProfileCard from "./PersonProfileCard";
import PlatformGrid from "./PlatformGrid";
import TimelineView from "./TimelineView";
import IntelligenceDossier from "./IntelligenceDossier";

interface ResultsDisplayProps {
  findings: FindingData[];
  targetName?: string;
  investigationId?: string;
  onVerifyPlatform?: (platformUrl: string, status: 'verified' | 'inaccurate') => void;
  onDeepDive?: (platform: string, findingId: string) => void;
}

const ResultsDisplay = ({ 
  findings, 
  targetName, 
  investigationId,
  onVerifyPlatform,
  onDeepDive 
}: ResultsDisplayProps) => {
  const [viewMode, setViewMode] = useState<ViewMode>('profile');

  const renderView = () => {
    switch (viewMode) {
      case 'profile':
        return <PersonProfileCard findings={findings} targetName={targetName} />;
      case 'grid':
        return (
          <PlatformGrid 
            findings={findings} 
            onVerify={onVerifyPlatform}
            onDeepDive={onDeepDive}
          />
        );
      case 'timeline':
        return <TimelineView findings={findings} />;
      case 'dossier':
        return (
          <IntelligenceDossier 
            findings={findings} 
            targetName={targetName}
            investigationId={investigationId}
          />
        );
      default:
        return <PersonProfileCard findings={findings} targetName={targetName} />;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* View Mode Toggle */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">Investigation Results</h3>
        <ViewModeToggle currentMode={viewMode} onModeChange={setViewMode} />
      </div>

      {/* Results Content */}
      <div className="flex-1 min-h-0">
        {renderView()}
      </div>
    </div>
  );
};

export default ResultsDisplay;
