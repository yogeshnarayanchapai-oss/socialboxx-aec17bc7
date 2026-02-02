import { useState, useEffect } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Facebook, Eye, EyeOff, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useSettings, useUpdateSettings, type AppSettings } from "@/hooks/useSettings";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useFacebookSettings, useUpdateFacebookSettings } from "@/hooks/useAppSettings";

// Facebook Integration Settings Component
function FacebookIntegrationTab() {
  const { data: fbSettings, isLoading } = useFacebookSettings();
  const updateFbSettings = useUpdateFacebookSettings();
  
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [webhookToken, setWebhookToken] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);

  useEffect(() => {
    if (fbSettings) {
      setAppId(fbSettings.facebook_app_id || "");
      setAppSecret(fbSettings.facebook_app_secret || "");
      setWebhookToken(fbSettings.facebook_webhook_verify_token || "socialbox_verify_token");
    }
  }, [fbSettings]);

  const handleSave = async () => {
    try {
      await updateFbSettings.mutateAsync({
        facebook_app_id: appId,
        facebook_app_secret: appSecret,
        facebook_webhook_verify_token: webhookToken,
      });
      toast.success("Facebook settings saved!");
    } catch (error) {
      toast.error("Failed to save Facebook settings");
    }
  };

  const handleTestConnection = async () => {
    setTestResult(null);
    
    if (!appId) {
      toast.error("Please enter App ID first");
      return;
    }

    try {
      // Simple test: try to initialize FB SDK with the app ID
      const testResponse = await fetch(
        `https://graph.facebook.com/v19.0/${appId}?fields=id,name`
      );
      
      if (testResponse.ok) {
        setTestResult("success");
        toast.success("App ID is valid!");
      } else {
        setTestResult("error");
        toast.error("Invalid App ID or App is not public");
      }
    } catch (error) {
      setTestResult("error");
      toast.error("Connection test failed");
    }
  };

  if (isLoading) {
    return (
      <TabsContent value="facebook" className="space-y-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </TabsContent>
    );
  }

  return (
    <TabsContent value="facebook" className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1877F2]/10">
              <Facebook className="h-5 w-5 text-[#1877F2]" />
            </div>
            <div>
              <CardTitle>Facebook App Configuration</CardTitle>
              <CardDescription>
                Configure your Facebook App credentials for OAuth login
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 p-4">
            <p className="text-sm text-muted-foreground">
              <strong>Setup Instructions:</strong>
            </p>
            <ol className="mt-2 list-decimal list-inside text-sm text-muted-foreground space-y-1">
              <li>Go to <a href="https://developers.facebook.com" target="_blank" rel="noopener" className="text-primary underline">developers.facebook.com</a></li>
              <li>Create or select your app</li>
              <li>Copy App ID and App Secret from Settings → Basic</li>
              <li>Add your domain to "App Domains"</li>
              <li>Enable "Facebook Login" product</li>
            </ol>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fb-app-id">Facebook App ID</Label>
              <div className="flex gap-2">
                <Input
                  id="fb-app-id"
                  placeholder="Enter your Facebook App ID"
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                />
                <Button 
                  variant="outline" 
                  onClick={handleTestConnection}
                  disabled={!appId}
                >
                  {testResult === "success" && <CheckCircle className="h-4 w-4 text-green-500 mr-1" />}
                  {testResult === "error" && <AlertCircle className="h-4 w-4 text-destructive mr-1" />}
                  Test
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fb-app-secret">Facebook App Secret</Label>
              <div className="relative">
                <Input
                  id="fb-app-secret"
                  type={showSecret ? "text" : "password"}
                  placeholder="Enter your Facebook App Secret"
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowSecret(!showSecret)}
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Required for long-lived token exchange and token refresh
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhook-token">Webhook Verify Token</Label>
              <Input
                id="webhook-token"
                placeholder="socialbox_verify_token"
                value={webhookToken}
                onChange={(e) => setWebhookToken(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Use this token when setting up webhooks in Facebook Developer Console
              </p>
            </div>
          </div>

          <Button 
            onClick={handleSave}
            disabled={updateFbSettings.isPending}
          >
            {updateFbSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Facebook Settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhook URL</CardTitle>
          <CardDescription>
            Use this URL when configuring webhooks in Facebook App settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-muted p-3 font-mono text-sm break-all">
            {import.meta.env.VITE_SUPABASE_URL}/functions/v1/facebook-webhook
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Subscribe to: messages, messaging_postbacks, messaging_optins
          </p>
        </CardContent>
      </Card>
    </TabsContent>
  );
}

export default function Settings() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const { user } = useAuth();
  
  const [localSettings, setLocalSettings] = useState<AppSettings>({});
  const [workingDays, setWorkingDays] = useState<string[]>([]);

  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
      setWorkingDays(settings.working_days || ["Mon", "Tue", "Wed", "Thu", "Fri"]);
    }
  }, [settings]);

  const handleSave = async (updates: Partial<AppSettings>) => {
    try {
      await updateSettings.mutateAsync(updates);
      toast.success("Settings saved successfully");
    } catch (error) {
      toast.error("Failed to save settings");
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out successfully");
  };

  const toggleWorkingDay = (day: string) => {
    const newDays = workingDays.includes(day)
      ? workingDays.filter(d => d !== day)
      : [...workingDays, day];
    setWorkingDays(newDays);
    setLocalSettings({ ...localSettings, working_days: newDays });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Settings"
        description="Configure your social inbox preferences"
      />

      <div className="p-6">
        <Tabs defaultValue="general" className="space-y-6">
          <TabsList className="flex-wrap">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="facebook">Facebook Integration</TabsTrigger>
            <TabsTrigger value="business-hours">Business Hours</TabsTrigger>
            <TabsTrigger value="human-mode">Human Mode</TabsTrigger>
            <TabsTrigger value="team">Team Members</TabsTrigger>
            <TabsTrigger value="blacklist">Blacklist</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>General Settings</CardTitle>
                <CardDescription>
                  Configure basic application settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="company">Company Name</Label>
                  <Input 
                    id="company" 
                    placeholder="Your Company"
                    value={localSettings.company_name || ""}
                    onChange={(e) => setLocalSettings({ ...localSettings, company_name: e.target.value })}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select 
                    value={localSettings.timezone || "utc-8"}
                    onValueChange={(value) => setLocalSettings({ ...localSettings, timezone: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="utc-8">Pacific Time (UTC-8)</SelectItem>
                      <SelectItem value="utc-5">Eastern Time (UTC-5)</SelectItem>
                      <SelectItem value="utc+0">UTC</SelectItem>
                      <SelectItem value="utc+8">Asia/Manila (UTC+8)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive email alerts for important events
                    </p>
                  </div>
                  <Switch 
                    checked={localSettings.email_notifications ?? true}
                    onCheckedChange={(checked) => setLocalSettings({ ...localSettings, email_notifications: checked })}
                  />
                </div>

                <Button 
                  onClick={() => handleSave({
                    company_name: localSettings.company_name,
                    timezone: localSettings.timezone,
                    email_notifications: localSettings.email_notifications,
                  })}
                  disabled={updateSettings.isPending}
                >
                  {updateSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Account</CardTitle>
                <CardDescription>
                  Manage your account
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <p className="font-medium">{user?.email}</p>
                    <p className="text-sm text-muted-foreground">Signed in</p>
                  </div>
                  <Button variant="outline" onClick={handleSignOut}>
                    Sign Out
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Facebook Integration Settings */}
          <FacebookIntegrationTab />

          <TabsContent value="business-hours" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Business Hours</CardTitle>
                <CardDescription>
                  Set your operating hours for automated responses
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable Business Hours</Label>
                    <p className="text-sm text-muted-foreground">
                      Only send automated replies during business hours
                    </p>
                  </div>
                  <Switch 
                    checked={localSettings.business_hours_enabled ?? true}
                    onCheckedChange={(checked) => setLocalSettings({ ...localSettings, business_hours_enabled: checked })}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Start Time</Label>
                    <Input 
                      type="time" 
                      value={localSettings.business_hours_start || "09:00"}
                      onChange={(e) => setLocalSettings({ ...localSettings, business_hours_start: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Time</Label>
                    <Input 
                      type="time" 
                      value={localSettings.business_hours_end || "18:00"}
                      onChange={(e) => setLocalSettings({ ...localSettings, business_hours_end: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Working Days</Label>
                  <div className="flex flex-wrap gap-2">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                      <Button
                        key={day}
                        variant={workingDays.includes(day) ? "default" : "outline"}
                        size="sm"
                        className="w-12"
                        onClick={() => toggleWorkingDay(day)}
                      >
                        {day}
                      </Button>
                    ))}
                  </div>
                </div>

                <Button 
                  onClick={() => handleSave({
                    business_hours_enabled: localSettings.business_hours_enabled,
                    business_hours_start: localSettings.business_hours_start,
                    business_hours_end: localSettings.business_hours_end,
                    working_days: workingDays,
                  })}
                  disabled={updateSettings.isPending}
                >
                  {updateSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quiet Hours</CardTitle>
                <CardDescription>
                  Completely pause all automated messages during these hours
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable Quiet Hours</Label>
                    <p className="text-sm text-muted-foreground">
                      No automated messages will be sent during quiet hours
                    </p>
                  </div>
                  <Switch 
                    checked={localSettings.quiet_hours_enabled ?? false}
                    onCheckedChange={(checked) => setLocalSettings({ ...localSettings, quiet_hours_enabled: checked })}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Quiet Start</Label>
                    <Input 
                      type="time" 
                      value={localSettings.quiet_hours_start || "22:00"}
                      onChange={(e) => setLocalSettings({ ...localSettings, quiet_hours_start: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Quiet End</Label>
                    <Input 
                      type="time" 
                      value={localSettings.quiet_hours_end || "08:00"}
                      onChange={(e) => setLocalSettings({ ...localSettings, quiet_hours_end: e.target.value })}
                    />
                  </div>
                </div>

                <Button 
                  onClick={() => handleSave({
                    quiet_hours_enabled: localSettings.quiet_hours_enabled,
                    quiet_hours_start: localSettings.quiet_hours_start,
                    quiet_hours_end: localSettings.quiet_hours_end,
                  })}
                  disabled={updateSettings.isPending}
                >
                  {updateSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="human-mode" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Human-Like Behavior</CardTitle>
                <CardDescription>
                  Configure settings to make automated responses appear more natural
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable Human Mode</Label>
                    <p className="text-sm text-muted-foreground">
                      Add random delays and limits to mimic human behavior
                    </p>
                  </div>
                  <Switch 
                    checked={localSettings.human_mode_enabled ?? true}
                    onCheckedChange={(checked) => setLocalSettings({ ...localSettings, human_mode_enabled: checked })}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Min Delay (seconds)</Label>
                    <Input 
                      type="number" 
                      value={localSettings.min_delay || 15}
                      onChange={(e) => setLocalSettings({ ...localSettings, min_delay: parseInt(e.target.value) })}
                      min="5" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Delay (seconds)</Label>
                    <Input 
                      type="number" 
                      value={localSettings.max_delay || 90}
                      onChange={(e) => setLocalSettings({ ...localSettings, max_delay: parseInt(e.target.value) })}
                      min="10" 
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Max Messages per Conversation/Day</Label>
                    <Input 
                      type="number" 
                      value={localSettings.max_messages_per_conversation || 5}
                      onChange={(e) => setLocalSettings({ ...localSettings, max_messages_per_conversation: parseInt(e.target.value) })}
                      min="1" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Messages per Page/Hour</Label>
                    <Input 
                      type="number" 
                      value={localSettings.max_messages_per_page_hour || 30}
                      onChange={(e) => setLocalSettings({ ...localSettings, max_messages_per_page_hour: parseInt(e.target.value) })}
                      min="10" 
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Min Gap Between Messages (seconds)</Label>
                  <Input 
                    type="number" 
                    value={localSettings.min_gap_between_messages || 60}
                    onChange={(e) => setLocalSettings({ ...localSettings, min_gap_between_messages: parseInt(e.target.value) })}
                    min="30" 
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Approve Before Send (Default)</Label>
                    <p className="text-sm text-muted-foreground">
                      Require approval for AI-generated replies by default
                    </p>
                  </div>
                  <Switch 
                    checked={localSettings.approve_before_send ?? true}
                    onCheckedChange={(checked) => setLocalSettings({ ...localSettings, approve_before_send: checked })}
                  />
                </div>

                <Button 
                  onClick={() => handleSave({
                    human_mode_enabled: localSettings.human_mode_enabled,
                    min_delay: localSettings.min_delay,
                    max_delay: localSettings.max_delay,
                    max_messages_per_conversation: localSettings.max_messages_per_conversation,
                    max_messages_per_page_hour: localSettings.max_messages_per_page_hour,
                    min_gap_between_messages: localSettings.min_gap_between_messages,
                    approve_before_send: localSettings.approve_before_send,
                  })}
                  disabled={updateSettings.isPending}
                >
                  {updateSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="team" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Team Members</CardTitle>
                <CardDescription>
                  Manage team access and permissions
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-medium">
                      {user?.email?.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium">{user?.email}</p>
                      <p className="text-sm text-muted-foreground">You</p>
                    </div>
                  </div>
                  <span className="status-badge bg-primary/10 text-primary">Admin</span>
                </div>

                <Button variant="outline" className="w-full">
                  + Invite Team Member
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="blacklist" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Blacklist Keywords</CardTitle>
                <CardDescription>
                  Messages containing these keywords will not trigger automation
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="Enter keywords, one per line..."
                  className="min-h-[150px]"
                  value={(localSettings.blacklist_keywords || []).join("\n")}
                  onChange={(e) => setLocalSettings({ 
                    ...localSettings, 
                    blacklist_keywords: e.target.value.split("\n").filter(Boolean) 
                  })}
                />
                <Button 
                  onClick={() => handleSave({ blacklist_keywords: localSettings.blacklist_keywords })}
                  disabled={updateSettings.isPending}
                >
                  {updateSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Keywords
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Do Not Contact List</CardTitle>
                <CardDescription>
                  Contacts that should never receive automated messages
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="Enter phone numbers or Facebook IDs, one per line..."
                  className="min-h-[150px]"
                  value={(localSettings.do_not_contact || []).join("\n")}
                  onChange={(e) => setLocalSettings({ 
                    ...localSettings, 
                    do_not_contact: e.target.value.split("\n").filter(Boolean) 
                  })}
                />
                <Button 
                  onClick={() => handleSave({ do_not_contact: localSettings.do_not_contact })}
                  disabled={updateSettings.isPending}
                >
                  {updateSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save List
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
