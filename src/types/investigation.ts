export interface InvestigationStats {
  id: string;
  target: string;
  status: string;
  created_at: string;
  totalFindings: number;
  findingsByType: Record<string, number>;
  platforms: string[];
  breaches: number;
  avgConfidence: number;
  verificationStatus: {
    verified: number;
    needs_review: number;
    inaccurate: number;
  };
}
