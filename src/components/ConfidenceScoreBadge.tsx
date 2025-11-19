import { Badge } from "@/components/ui/badge";
import { Shield, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfidenceScoreBadgeProps {
  score: number; // 0-100
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

const ConfidenceScoreBadge = ({ score, size = "md", showLabel = true }: ConfidenceScoreBadgeProps) => {
  const getConfidenceLevel = (score: number) => {
    if (score >= 80) return { label: "High Confidence", color: "text-success", bgColor: "bg-success/10", icon: ShieldCheck };
    if (score >= 50) return { label: "Medium Confidence", color: "text-warning", bgColor: "bg-warning/10", icon: Shield };
    if (score >= 25) return { label: "Low Confidence", color: "text-orange-500", bgColor: "bg-orange-500/10", icon: ShieldAlert };
    return { label: "Very Low", color: "text-destructive", bgColor: "bg-destructive/10", icon: ShieldQuestion };
  };

  const confidence = getConfidenceLevel(score);
  const Icon = confidence.icon;

  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-2.5 py-1",
    lg: "text-base px-3 py-1.5"
  };

  const iconSizes = {
    sm: "w-3 h-3",
    md: "w-3.5 h-3.5",
    lg: "w-4 h-4"
  };

  return (
    <Badge 
      variant="outline" 
      className={cn(
        "border",
        confidence.color,
        confidence.bgColor,
        sizeClasses[size],
        "flex items-center gap-1.5"
      )}
    >
      <Icon className={iconSizes[size]} />
      {showLabel && confidence.label}
      <span className="font-mono font-semibold ml-1">{score}%</span>
    </Badge>
  );
};

export default ConfidenceScoreBadge;
