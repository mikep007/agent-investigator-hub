import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BookmarkPlus } from "lucide-react";
import SaveToCaseDialog from "../cases/SaveToCaseDialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SaveToCaseButtonProps {
  item: {
    item_type: 'finding' | 'profile' | 'platform' | 'breach' | 'note';
    title: string;
    content: any;
    source_url?: string;
    source_investigation_id?: string;
    tags?: string[];
  };
  variant?: "default" | "ghost" | "outline";
  size?: "default" | "sm" | "icon";
  showLabel?: boolean;
}

const SaveToCaseButton = ({ 
  item, 
  variant = "ghost", 
  size = "sm",
  showLabel = false 
}: SaveToCaseButtonProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={variant}
              size={size}
              onClick={(e) => {
                e.stopPropagation();
                setDialogOpen(true);
              }}
              className={size === "icon" ? "h-8 w-8" : ""}
            >
              <BookmarkPlus className={`h-4 w-4 ${showLabel ? "mr-2" : ""}`} />
              {showLabel && "Save to Case"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Save to case file</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <SaveToCaseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        item={item}
      />
    </>
  );
};

export default SaveToCaseButton;
