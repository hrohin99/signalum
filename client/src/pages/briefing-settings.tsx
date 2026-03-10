import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Zap, Send } from "lucide-react";

interface BriefingSettings {
  briefingEnabled: boolean;
  briefingDay: string;
  briefingTime: string;
  briefingEmail: string | null;
  briefingLastSent: string | null;
}

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const TIMES = [
  { value: "06:00", label: "6:00 AM" },
  { value: "07:00", label: "7:00 AM" },
  { value: "08:00", label: "8:00 AM" },
  { value: "09:00", label: "9:00 AM" },
  { value: "10:00", label: "10:00 AM" },
];

export default function BriefingSettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [enabled, setEnabled] = useState(false);
  const [day, setDay] = useState("monday");
  const [time, setTime] = useState("08:00");
  const [email, setEmail] = useState("");

  const { data: settings, isLoading } = useQuery<BriefingSettings>({
    queryKey: ["/api/briefing/settings"],
  });

  useEffect(() => {
    if (settings) {
      setEnabled(settings.briefingEnabled);
      setDay(settings.briefingDay);
      setTime(settings.briefingTime);
      setEmail(settings.briefingEmail || user?.email || "");
    } else if (user?.email && !email) {
      setEmail(user.email);
    }
  }, [settings, user]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/briefing/settings", {
        briefingEnabled: enabled,
        briefingDay: day,
        briefingTime: time,
        briefingEmail: email,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/briefing/settings"] });
      toast({ title: "Settings saved", description: "Your briefing preferences have been updated." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/briefing/send-now", {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Test briefing sent", description: "Check your email inbox." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to send", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="loading-briefing-settings">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground" data-testid="text-briefing-title">Briefing Preferences</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure your weekly intelligence briefing email.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="briefing-toggle" className="text-sm font-medium">
                Enable weekly briefing
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Receive an AI-generated summary of your tracked entities
              </p>
            </div>
            <Switch
              id="briefing-toggle"
              checked={enabled}
              onCheckedChange={setEnabled}
              data-testid="switch-briefing-enabled"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="briefing-day">Day of week</Label>
            <Select value={day} onValueChange={setDay}>
              <SelectTrigger id="briefing-day" data-testid="select-briefing-day">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS.map((d) => (
                  <SelectItem key={d} value={d} data-testid={`option-day-${d}`}>
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="briefing-time">Send time</Label>
            <Select value={time} onValueChange={setTime}>
              <SelectTrigger id="briefing-time" data-testid="select-briefing-time">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMES.map((t) => (
                  <SelectItem key={t.value} value={t.value} data-testid={`option-time-${t.value}`}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="briefing-email">Email address</Label>
            <Input
              id="briefing-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              data-testid="input-briefing-email"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              data-testid="button-save-briefing"
            >
              {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save preferences
            </Button>
            <Button
              variant="outline"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
              data-testid="button-send-test-briefing"
            >
              {testMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Send test briefing now
            </Button>
          </div>

          {settings?.briefingLastSent && (
            <p className="text-xs text-muted-foreground" data-testid="text-last-sent">
              Last sent: {new Date(settings.briefingLastSent).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
