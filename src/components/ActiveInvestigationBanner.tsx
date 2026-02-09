import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Search } from "lucide-react";

const STORAGE_KEY = 'osint-investigation-state';

const ActiveInvestigationBanner = () => {
  const navigate = useNavigate();

  let targetName: string | null = null;
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      const state = JSON.parse(stored);
      if (state.activeInvestigation && state.targetName) {
        targetName = state.targetName;
      }
    }
  } catch {
    // ignore
  }

  if (!targetName) return null;

  return (
    <div className="mb-4 flex items-center gap-2 px-4 py-2 rounded-lg border border-primary/30 bg-primary/5">
      <Search className="w-4 h-4 text-primary shrink-0" />
      <span className="text-sm text-muted-foreground">
        Active investigation: <strong className="text-foreground">{targetName}</strong>
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto gap-1.5 text-primary hover:text-primary"
        onClick={() => navigate('/')}
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Return to Results
      </Button>
    </div>
  );
};

export default ActiveInvestigationBanner;
