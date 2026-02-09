import { useState, useEffect } from "react";
import ActiveInvestigationBanner from "@/components/ActiveInvestigationBanner";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Bell, BellOff, Trash2, Shield, Mail, User, Phone, TrendingUp, BarChart3 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BreachTimeline } from "@/components/BreachTimeline";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

interface MonitoredSubject {
  id: string;
  subject_type: string;
  subject_value: string;
  last_checked_at: string | null;
  created_at: string;
}

interface BreachAlert {
  id: string;
  monitored_subject_id: string;
  breach_source: string;
  breach_date: string | null;
  breach_data: any;
  is_read: boolean;
  created_at: string;
  monitored_subjects: {
    subject_type: string;
    subject_value: string;
  };
}

interface SubjectRisk {
  subject_value: string;
  subject_type: string;
  breach_count: number;
  risk_score: number;
}

export default function BreachMonitoring() {
  const [monitoredSubjects, setMonitoredSubjects] = useState<MonitoredSubject[]>([]);
  const [breachAlerts, setBreachAlerts] = useState<BreachAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingSubject, setAddingSubject] = useState(false);
  const [newSubjectType, setNewSubjectType] = useState<string>("email");
  const [newSubjectValue, setNewSubjectValue] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
    
    // Set up real-time subscriptions
    const alertsChannel = supabase
      .channel('breach_alerts_changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'breach_alerts' },
        () => fetchBreachAlerts()
      )
      .subscribe();

    const subjectsChannel = supabase
      .channel('monitored_subjects_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'monitored_subjects' },
        () => fetchMonitoredSubjects()
      )
      .subscribe();

    return () => {
      alertsChannel.unsubscribe();
      subjectsChannel.unsubscribe();
    };
  }, []);

  const fetchData = async () => {
    await Promise.all([fetchMonitoredSubjects(), fetchBreachAlerts()]);
    setLoading(false);
  };

  const fetchMonitoredSubjects = async () => {
    const { data, error } = await supabase
      .from('monitored_subjects')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching monitored subjects:', error);
      return;
    }

    setMonitoredSubjects(data || []);
  };

  const fetchBreachAlerts = async () => {
    const { data, error } = await supabase
      .from('breach_alerts')
      .select(`
        *,
        monitored_subjects (
          subject_type,
          subject_value
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching breach alerts:', error);
      return;
    }

    setBreachAlerts(data || []);
  };

  const addMonitoredSubject = async () => {
    if (!newSubjectValue.trim()) {
      toast({
        title: "Error",
        description: "Please enter a value to monitor",
        variant: "destructive",
      });
      return;
    }

    setAddingSubject(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in",
        variant: "destructive",
      });
      setAddingSubject(false);
      return;
    }

    const { error } = await supabase
      .from('monitored_subjects')
      .insert({
        user_id: user.id,
        subject_type: newSubjectType,
        subject_value: newSubjectValue.trim(),
      });

    setAddingSubject(false);

    if (error) {
      if (error.code === '23505') {
        toast({
          title: "Already Monitoring",
          description: "This subject is already being monitored",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to add monitored subject",
          variant: "destructive",
        });
      }
      return;
    }

    toast({
      title: "Success",
      description: "Subject added to monitoring",
    });

    setNewSubjectValue("");
    fetchMonitoredSubjects();
  };

  const removeMonitoredSubject = async (id: string) => {
    const { error } = await supabase
      .from('monitored_subjects')
      .delete()
      .eq('id', id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to remove monitored subject",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Success",
      description: "Subject removed from monitoring",
    });

    fetchMonitoredSubjects();
  };

  const markAlertAsRead = async (id: string) => {
    const { error } = await supabase
      .from('breach_alerts')
      .update({ is_read: true })
      .eq('id', id);

    if (error) {
      console.error('Error marking alert as read:', error);
      return;
    }

    fetchBreachAlerts();
  };

  const unreadCount = breachAlerts.filter(alert => !alert.is_read).length;

  // Analytics calculations
  const getBreachTrends = () => {
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);
    
    const trends: { [key: string]: number } = {};
    breachAlerts.forEach(alert => {
      const date = new Date(alert.created_at);
      if (date >= last30Days) {
        const dateKey = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        trends[dateKey] = (trends[dateKey] || 0) + 1;
      }
    });
    
    return Object.entries(trends).map(([date, count]) => ({ date, count }));
  };

  const getPlatformStats = () => {
    const platforms: { [key: string]: number } = {};
    breachAlerts.forEach(alert => {
      platforms[alert.breach_source] = (platforms[alert.breach_source] || 0) + 1;
    });
    
    return Object.entries(platforms)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  };

  const getSubjectRisks = (): SubjectRisk[] => {
    const risks: { [key: string]: { count: number; type: string; value: string } } = {};
    
    breachAlerts.forEach(alert => {
      const key = alert.monitored_subject_id;
      if (!risks[key]) {
        risks[key] = {
          count: 0,
          type: alert.monitored_subjects.subject_type,
          value: alert.monitored_subjects.subject_value,
        };
      }
      risks[key].count++;
    });
    
    return Object.values(risks)
      .map(r => ({
        subject_value: r.value,
        subject_type: r.type,
        breach_count: r.count,
        risk_score: Math.min(r.count * 20, 100), // Max 100
      }))
      .sort((a, b) => b.risk_score - a.risk_score);
  };

  const breachTrends = getBreachTrends();
  const platformStats = getPlatformStats();
  const subjectRisks = getSubjectRisks();

  const COLORS = ['hsl(var(--destructive))', 'hsl(var(--primary))', 'hsl(var(--accent))', 'hsl(var(--muted-foreground))', 'hsl(var(--secondary))'];

  const getRiskColor = (score: number) => {
    if (score >= 80) return 'text-destructive';
    if (score >= 50) return 'text-orange-500';
    return 'text-yellow-500';
  };

  const getRiskBadgeVariant = (score: number): "destructive" | "default" | "secondary" => {
    if (score >= 80) return 'destructive';
    if (score >= 50) return 'default';
    return 'secondary';
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'email':
        return <Mail className="h-4 w-4" />;
      case 'username':
        return <User className="h-4 w-4" />;
      case 'phone':
        return <Phone className="h-4 w-4" />;
      default:
        return <Shield className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <ActiveInvestigationBanner />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Breach Monitoring</h1>
          <p className="text-muted-foreground mt-2">
            Monitor subjects for new data breaches and receive alerts
          </p>
        </div>
        {unreadCount > 0 && (
          <Badge variant="destructive" className="text-lg px-4 py-2">
            <Bell className="h-4 w-4 mr-2" />
            {unreadCount} New Alert{unreadCount !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      <Tabs defaultValue="alerts" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="alerts">Breach Alerts</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="monitored">Monitored Subjects</TabsTrigger>
        </TabsList>

        <TabsContent value="alerts" className="space-y-4">
          {breachAlerts.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground">
                  <BellOff className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No breach alerts yet</p>
                  <p className="text-sm mt-2">Add subjects to monitor and you'll be notified of any breaches</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            breachAlerts.map((alert) => (
              <Card key={alert.id} className={!alert.is_read ? 'border-destructive' : ''}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-destructive" />
                      <div>
                        <CardTitle className="text-lg">
                          New Breach Detected: {alert.breach_source}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-1">
                          {getTypeIcon(alert.monitored_subjects.subject_type)}
                          {alert.monitored_subjects.subject_value}
                          {alert.breach_date && ` • ${alert.breach_date}`}
                        </CardDescription>
                      </div>
                    </div>
                    {!alert.is_read && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => markAlertAsRead(alert.id)}
                      >
                        Mark as Read
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="font-medium">Leaked Data:</p>
                    <div className="bg-muted p-4 rounded-lg space-y-1">
                      {Object.entries(alert.breach_data).map(([key, value]) => (
                        <div key={key} className="text-sm">
                          <span className="font-medium capitalize">{key}:</span>{' '}
                          <span className="text-muted-foreground">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-4">
                    Detected: {new Date(alert.created_at).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          {breachAlerts.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No breach data available yet</p>
                  <p className="text-sm mt-2">Analytics will appear once breach alerts are detected</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Breach Trends */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Breach Trends (Last 30 Days)
                  </CardTitle>
                  <CardDescription>
                    Daily breach detection activity
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={breachTrends}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
                      <YAxis stroke="hsl(var(--muted-foreground))" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px'
                        }}
                      />
                      <Line type="monotone" dataKey="count" stroke="hsl(var(--destructive))" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Most Compromised Platforms */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Most Compromised Platforms
                  </CardTitle>
                  <CardDescription>
                    Top 10 breach sources affecting your monitored subjects
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={platformStats} layout="horizontal">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
                      <YAxis dataKey="name" type="category" width={100} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px'
                        }}
                      />
                      <Bar dataKey="count" fill="hsl(var(--primary))" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Risk Scores */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Subject Risk Scores
                  </CardTitle>
                  <CardDescription>
                    Risk assessment based on breach count and severity
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {subjectRisks.map((risk, index) => (
                      <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-3 flex-1">
                          {getTypeIcon(risk.subject_type)}
                          <div className="flex-1">
                            <p className="font-medium">{risk.subject_value}</p>
                            <p className="text-sm text-muted-foreground capitalize">
                              {risk.subject_type} • {risk.breach_count} breach{risk.breach_count !== 1 ? 'es' : ''} detected
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className={`text-2xl font-bold ${getRiskColor(risk.risk_score)}`}>
                              {risk.risk_score}
                            </p>
                            <p className="text-xs text-muted-foreground">Risk Score</p>
                          </div>
                          <Badge variant={getRiskBadgeVariant(risk.risk_score)}>
                            {risk.risk_score >= 80 ? 'Critical' : risk.risk_score >= 50 ? 'High' : 'Medium'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="monitored" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Add Subject to Monitor</CardTitle>
              <CardDescription>
                Monitor email addresses, usernames, or phone numbers for data breaches
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="subject-type">Type</Label>
                  <Select value={newSubjectType} onValueChange={setNewSubjectType}>
                    <SelectTrigger id="subject-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">Email Address</SelectItem>
                      <SelectItem value="username">Username</SelectItem>
                      <SelectItem value="phone">Phone Number</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="subject-value">Value</Label>
                  <Input
                    id="subject-value"
                    placeholder={
                      newSubjectType === 'email'
                        ? 'email@example.com'
                        : newSubjectType === 'phone'
                        ? '+1234567890'
                        : 'username'
                    }
                    value={newSubjectValue}
                    onChange={(e) => setNewSubjectValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        addMonitoredSubject();
                      }
                    }}
                  />
                </div>
                <Button onClick={addMonitoredSubject} disabled={addingSubject}>
                  {addingSubject ? 'Adding...' : 'Add to Monitoring'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Alert>
            <Bell className="h-4 w-4" />
            <AlertDescription>
              Monitored subjects are checked daily for new breaches. You'll receive alerts via email and in-app notifications.
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            {monitoredSubjects.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center text-muted-foreground">
                    <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No subjects being monitored yet</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              monitoredSubjects.map((subject) => (
                <Card key={subject.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {getTypeIcon(subject.subject_type)}
                        <div>
                          <p className="font-medium">{subject.subject_value}</p>
                          <p className="text-sm text-muted-foreground capitalize">
                            {subject.subject_type}
                            {subject.last_checked_at && (
                              <> • Last checked: {new Date(subject.last_checked_at).toLocaleDateString()}</>
                            )}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeMonitoredSubject(subject.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}