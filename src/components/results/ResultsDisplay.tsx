import { useState } from "react";
import { FindingData, ViewMode } from "./types";
import ViewModeToggle from "./ViewModeToggle";
import PersonProfileCard from "./PersonProfileCard";
import OSINTResultsGrid from "./OSINTResultsGrid";
import TimelineView from "./TimelineView";
import IntelligenceDossier from "./IntelligenceDossier";

interface ResultsDisplayProps {
  findings: FindingData[];
  targetName?: string;
  investigationId?: string;
  inputKeywords?: string[];
  aiSuggestedPersons?: string[];
  onVerifyPlatform?: (platformUrl: string, status: 'verified' | 'inaccurate') => void;
  onDeepDive?: (platform: string, findingId: string) => void;
  onPivot?: (type: string, value: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

const ResultsDisplay = ({ 
  findings, 
  targetName, 
  investigationId,
  inputKeywords = [],
  aiSuggestedPersons = [],
  onVerifyPlatform,
  onDeepDive,
  onPivot,
  onRefresh,
  isRefreshing
}: ResultsDisplayProps) => {
  // Default to OSINT Industries-style grid view
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const renderView = () => {
    switch (viewMode) {
      case 'profile':
        return (
          <PersonProfileCard 
            findings={findings} 
            targetName={targetName}
            inputKeywords={inputKeywords}
            aiSuggestedPersons={aiSuggestedPersons}
          />
        );
      case 'grid':
        return (
          <OSINTResultsGrid 
            findings={findings} 
            targetName={targetName}
            investigationId={investigationId}
            inputKeywords={inputKeywords}
            aiSuggestedPersons={aiSuggestedPersons}
            onVerify={onVerifyPlatform}
            onDeepDive={onDeepDive}
            onPivot={onPivot}
            onRefresh={onRefresh}
            isRefreshing={isRefreshing}
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
        return (
          <OSINTResultsGrid 
            findings={findings} 
            targetName={targetName}
            investigationId={investigationId}
            inputKeywords={inputKeywords}
            aiSuggestedPersons={aiSuggestedPersons}
            onVerify={onVerifyPlatform}
            onDeepDive={onDeepDive}
            onPivot={onPivot}
            onRefresh={onRefresh}
            isRefreshing={isRefreshing}
          />
        );
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
