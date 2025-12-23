import { ChevronRight, Search, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface InvestigationHistoryItem {
  id: string;
  name: string;
  investigationId: string | null;
}

interface InvestigationBreadcrumbProps {
  history: InvestigationHistoryItem[];
  onNavigate: (index: number) => void;
}

const InvestigationBreadcrumb = ({ history, onNavigate }: InvestigationBreadcrumbProps) => {
  if (history.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 px-4 py-2 bg-muted/50 rounded-lg border border-border/50 overflow-x-auto">
      <History className="w-4 h-4 text-muted-foreground shrink-0 mr-1" />
      <span className="text-xs text-muted-foreground shrink-0 mr-2">Investigation Trail:</span>
      {history.map((item, index) => (
        <div key={item.id} className="flex items-center shrink-0">
          {index > 0 && (
            <ChevronRight className="w-4 h-4 text-muted-foreground mx-1" />
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNavigate(index)}
            className={cn(
              "h-7 px-2 text-xs font-medium",
              index === history.length - 1
                ? "bg-primary/10 text-primary hover:bg-primary/20"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Search className="w-3 h-3 mr-1" />
            {item.name}
          </Button>
        </div>
      ))}
    </div>
  );
};

export default InvestigationBreadcrumb;
