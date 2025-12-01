import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { Card } from '@/components/ui/card';

interface InvestigationStats {
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

interface ComparisonChartsProps {
  data: InvestigationStats[];
}

const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

export const ComparisonCharts = ({ data }: ComparisonChartsProps) => {
  // Prepare data for Total Findings chart
  const findingsData = data.map(inv => ({
    name: inv.target.length > 20 ? inv.target.substring(0, 20) + '...' : inv.target,
    findings: inv.totalFindings,
    avgConfidence: inv.avgConfidence,
  }));

  // Prepare data for Findings Type Distribution
  const allTypes = new Set<string>();
  data.forEach(inv => {
    Object.keys(inv.findingsByType).forEach(type => allTypes.add(type));
  });

  const findingsTypeData = data.map(inv => {
    const typeData: any = {
      name: inv.target.length > 15 ? inv.target.substring(0, 15) + '...' : inv.target,
    };
    allTypes.forEach(type => {
      typeData[type] = inv.findingsByType[type] || 0;
    });
    return typeData;
  });

  // Prepare data for Verification Status Pie Chart
  const totalVerificationStatus = data.reduce((acc, inv) => {
    acc.verified += inv.verificationStatus.verified;
    acc.needs_review += inv.verificationStatus.needs_review;
    acc.inaccurate += inv.verificationStatus.inaccurate;
    return acc;
  }, { verified: 0, needs_review: 0, inaccurate: 0 });

  const verificationPieData = [
    { name: 'Verified', value: totalVerificationStatus.verified },
    { name: 'Needs Review', value: totalVerificationStatus.needs_review },
    { name: 'Inaccurate', value: totalVerificationStatus.inaccurate },
  ].filter(item => item.value > 0);

  const VERIFICATION_COLORS = ['#10b981', '#f59e0b', '#ef4444'];

  // Prepare data for Platforms & Breaches comparison
  const platformsBreachesData = data.map(inv => ({
    name: inv.target.length > 15 ? inv.target.substring(0, 15) + '...' : inv.target,
    platforms: inv.platforms.length,
    breaches: inv.breaches,
  }));

  // Prepare radar chart data for multi-metric comparison
  const radarData = Array.from(allTypes).slice(0, 6).map(type => {
    const radarPoint: any = { subject: type };
    data.forEach(inv => {
      radarPoint[inv.target.substring(0, 10)] = inv.findingsByType[type] || 0;
    });
    return radarPoint;
  });

  return (
    <div className="space-y-6" id="comparison-charts">
      {/* Total Findings & Confidence */}
      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4">Total Findings & Average Confidence</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={findingsData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="name" className="text-xs" />
            <YAxis yAxisId="left" orientation="left" stroke="#8b5cf6" />
            <YAxis yAxisId="right" orientation="right" stroke="#3b82f6" />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'hsl(var(--card))', 
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px'
              }}
            />
            <Legend />
            <Bar yAxisId="left" dataKey="findings" fill="#8b5cf6" name="Total Findings" />
            <Bar yAxisId="right" dataKey="avgConfidence" fill="#3b82f6" name="Avg Confidence %" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Findings by Type */}
      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4">Findings Distribution by Type</h3>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={findingsTypeData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="name" className="text-xs" />
            <YAxis />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'hsl(var(--card))', 
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px'
              }}
            />
            <Legend />
            {Array.from(allTypes).map((type, index) => (
              <Bar key={type} dataKey={type} stackId="a" fill={COLORS[index % COLORS.length]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Verification Status */}
        <Card className="p-6">
          <h3 className="text-lg font-bold mb-4">Overall Verification Status</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={verificationPieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {verificationPieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={VERIFICATION_COLORS[index % VERIFICATION_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        {/* Platforms & Breaches */}
        <Card className="p-6">
          <h3 className="text-lg font-bold mb-4">Platforms & Breaches</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={platformsBreachesData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="name" className="text-xs" />
              <YAxis />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
              />
              <Legend />
              <Bar dataKey="platforms" fill="#10b981" name="Platforms Found" />
              <Bar dataKey="breaches" fill="#ef4444" name="Breaches Detected" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Radar Chart for Multi-Metric Comparison */}
      {radarData.length > 0 && data.length <= 4 && (
        <Card className="p-6">
          <h3 className="text-lg font-bold mb-4">Multi-Metric Radar Comparison</h3>
          <ResponsiveContainer width="100%" height={400}>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="subject" />
              <PolarRadiusAxis />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
              />
              <Legend />
              {data.map((inv, index) => (
                <Radar
                  key={inv.id}
                  name={inv.target.substring(0, 10)}
                  dataKey={inv.target.substring(0, 10)}
                  stroke={COLORS[index % COLORS.length]}
                  fill={COLORS[index % COLORS.length]}
                  fillOpacity={0.3}
                />
              ))}
            </RadarChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
};
