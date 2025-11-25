import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Bell, BellOff, Trash2, Shield, Mail, User, Phone } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BreachTimeline } from "@/components/BreachTimeline";

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
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="alerts">Breach Alerts</TabsTrigger>
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