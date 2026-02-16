import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Loader2, Facebook, Eye, EyeOff, CheckCircle, AlertCircle, Copy, Code, Paintbrush, Upload, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { useSettings, useUpdateSettings, type AppSettings } from "@/hooks/useSettings";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useFacebookSettings, useUpdateFacebookSettings } from "@/hooks/useAppSettings";
import { useIsPlatformAdmin, useOrganization } from "@/hooks/useOrganization";
import { TeamManagementTab } from "@/components/settings/TeamManagementTab";

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
      setWebhookToken(fbSettings.facebook_webhook_verify_token || "");
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
    if (!appId) { toast.error("Please enter App ID first"); return; }
    try {
      const testResponse = await fetch(`https://graph.facebook.com/v19.0/${appId}?fields=id,name`);
      if (testResponse.ok) { setTestResult("success"); toast.success("App ID is valid!"); }
      else { setTestResult("error"); toast.error("Invalid App ID or App is not public"); }
    } catch { setTestResult("error"); toast.error("Connection test failed"); }
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
              <CardDescription>Configure your Facebook App credentials for OAuth login</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 p-4">
            <p className="text-sm text-muted-foreground"><strong>Setup Instructions:</strong></p>
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
                <Input id="fb-app-id" placeholder="Enter your Facebook App ID" value={appId} onChange={(e) => setAppId(e.target.value)} />
                <Button variant="outline" onClick={handleTestConnection} disabled={!appId}>
                  {testResult === "success" && <CheckCircle className="h-4 w-4 text-green-500 mr-1" />}
                  {testResult === "error" && <AlertCircle className="h-4 w-4 text-destructive mr-1" />}
                  Test
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fb-app-secret">Facebook App Secret</Label>
              <div className="relative">
                <Input id="fb-app-secret" type={showSecret ? "text" : "password"} placeholder="Enter your Facebook App Secret" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} />
                <Button type="button" variant="ghost" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setShowSecret(!showSecret)}>
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Required for long-lived token exchange and token refresh</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhook-token">Webhook Verify Token</Label>
              <Input id="webhook-token" placeholder="Enter verify token" value={webhookToken} onChange={(e) => setWebhookToken(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                Use this token when setting up webhooks in Facebook Developer Console
              </p>
            </div>
          </div>

          <Button onClick={handleSave} disabled={updateFbSettings.isPending}>
            {updateFbSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Facebook Settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhook URL</CardTitle>
          <CardDescription>Use this URL when configuring webhooks in Facebook App settings</CardDescription>
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

// API Tab Component
function APITab() {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  
  const { data: pages, isLoading: pagesLoading } = useQuery({
    queryKey: ["connected-pages-api"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("connected_pages")
        .select("id, page_name")
        .eq("connection_status", "active")
        .order("page_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: apiKeys, isLoading: keysLoading, refetch: refetchKeys } = useQuery({
    queryKey: ["api-integrations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_integrations")
        .select("*");
      if (error) throw error;
      return data as { id: string; page_id: string; api_key: string; is_active: boolean }[];
    },
  });

  const generateKey = async (pageId: string) => {
    const { data: org } = await supabase
      .from("organization_members")
      .select("organization_id")
      .single();
    if (!org) { toast.error("Organization not found"); return; }

    const { error } = await supabase
      .from("api_integrations")
      .upsert({
        organization_id: org.organization_id,
        page_id: pageId,
        is_active: true,
      }, { onConflict: "organization_id,page_id" });

    if (error) { toast.error("Failed to generate API key"); return; }
    toast.success("API Key generated!");
    refetchKeys();
  };

  const toggleKeyActive = async (integrationId: string, currentActive: boolean) => {
    const { error } = await supabase
      .from("api_integrations")
      .update({ is_active: !currentActive })
      .eq("id", integrationId);
    if (error) { toast.error("Failed to update"); return; }
    refetchKeys();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied!");
  };

  const leadsEndpoint = `${baseUrl}/functions/v1/leads-api`;

  const getKeyForPage = (pageId: string) => apiKeys?.find(k => k.page_id === pageId);

  return (
    <TabsContent value="api" className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Code className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>API Integration</CardTitle>
              <CardDescription>प्रत्येक page को लागि unique API Key — third-party मा key र URL मात्र राख्नुहोस्</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Instructions */}
          <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4 space-y-2">
            <p className="text-sm font-medium">कसरी काम गर्छ?</p>
            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
              <li>जुन page को lead चाहिन्छ त्यसको <strong>API Key Generate</strong> गर्नुहोस्</li>
              <li><strong>API Key</strong> र <strong>URL</strong> copy गरेर third-party system मा paste गर्नुहोस्</li>
              <li>Third-party ले lead पठाउँदा automatically सही page मा जान्छ — page_id चाहिँदैन!</li>
            </ol>
          </div>

          {/* API Base URL - always visible */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">API Base URL</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-muted p-2.5 text-xs font-mono break-all">{leadsEndpoint}</code>
              <Button variant="outline" size="icon" className="h-9 w-9 flex-shrink-0" onClick={() => copyToClipboard(leadsEndpoint)}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Per-page API Keys */}
          {(pagesLoading || keysLoading) ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
          ) : (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Pages & API Keys</Label>
              {pages?.map(page => {
                const existingKey = getKeyForPage(page.id);
                const isVisible = showKeys[page.id] || false;
                return (
                  <div key={page.id} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{page.page_name}</span>
                        {existingKey && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${existingKey.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {existingKey.is_active ? 'Active' : 'Disabled'}
                          </span>
                        )}
                      </div>
                      {!existingKey ? (
                        <Button size="sm" onClick={() => generateKey(page.id)}>
                          Generate API Key
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant={existingKey.is_active ? "destructive" : "default"}
                          onClick={() => toggleKeyActive(existingKey.id, existingKey.is_active)}
                        >
                          {existingKey.is_active ? "Disable" : "Enable"}
                        </Button>
                      )}
                    </div>

                    {existingKey && (
                      <>
                        {/* API Key */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1 rounded bg-muted p-2 text-xs font-mono break-all">
                            {isVisible ? existingKey.api_key : '••••••••••••••••••••••••••••••••'}
                          </div>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowKeys(prev => ({ ...prev, [page.id]: !prev[page.id] }))}>
                            {isVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(existingKey.api_key)}>
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        {/* Ready cURL */}
                        <div className="rounded bg-muted p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium">POST - Lead Create</p>
                            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => copyToClipboard(`curl -X POST "${leadsEndpoint}" \\\n  -H "X-API-Key: ${existingKey.api_key}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"full_name":"John Doe","phone":"9841234567","product":"Example","source":"Website"}'`)}>
                              <Copy className="h-3 w-3 mr-1" /> Copy
                            </Button>
                          </div>
                          <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">{`curl -X POST "${leadsEndpoint}" \\
  -H "X-API-Key: <YOUR_API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{"full_name":"John Doe","phone":"9841234567"}'`}</pre>
                        </div>

                        <div className="rounded bg-muted p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium">GET - Fetch Leads</p>
                            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => copyToClipboard(`curl "${leadsEndpoint}?limit=50" \\\n  -H "X-API-Key: ${existingKey.api_key}"`)}>
                              <Copy className="h-3 w-3 mr-1" /> Copy
                            </Button>
                          </div>
                          <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">{`curl "${leadsEndpoint}?limit=50" \\
  -H "X-API-Key: <YOUR_API_KEY>"`}</pre>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
              {(!pages || pages.length === 0) && (
                <p className="text-sm text-muted-foreground">कुनै active page छैन। पहिले Pages section मा page connect गर्नुहोस्।</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}

// Branding Tab Component
function BrandingTab() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const [systemName, setSystemName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings) {
      setSystemName((settings as any).system_name || "SocialBox");
      setLogoUrl((settings as any).logo_url || "");
    }
  }, [settings]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be under 2MB");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `logo-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("branding")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("branding")
        .getPublicUrl(fileName);

      setLogoUrl(publicUrl);
      toast.success("Logo uploaded!");
    } catch (err: any) {
      toast.error(err.message || "Failed to upload logo");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync({
        system_name: systemName,
        logo_url: logoUrl,
      } as any);
      toast.success("Branding settings saved!");
    } catch {
      toast.error("Failed to save branding settings");
    }
  };

  if (isLoading) {
    return (
      <TabsContent value="branding" className="space-y-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </TabsContent>
    );
  }

  return (
    <TabsContent value="branding" className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Paintbrush className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Branding</CardTitle>
              <CardDescription>Customize your system name and logo</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="system-name">System Name</Label>
            <Input
              id="system-name"
              placeholder="SocialBox"
              value={systemName}
              onChange={(e) => setSystemName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Login page र sidebar मा देखिने नाम</p>
          </div>

          <div className="space-y-2">
            <Label>Logo</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoUpload}
            />
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <div className="rounded-lg border p-3 bg-muted flex items-center justify-center">
                  <img src={logoUrl} alt="Logo" className="max-h-14 max-w-[160px] object-contain" onError={(e) => { (e.target as HTMLImageElement).src = ''; }} />
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-6 flex items-center justify-center bg-muted/50">
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                {logoUrl ? "Change Logo" : "Upload Logo"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">PNG/SVG recommended, max 2MB</p>
          </div>

          <Button onClick={handleSave} disabled={updateSettings.isPending}>
            {updateSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Branding
          </Button>
        </CardContent>
      </Card>
    </TabsContent>
  );
}

export default function Settings() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const { user } = useAuth();
  const { data: isPlatformAdmin } = useIsPlatformAdmin(user?.id);
  const { data: org } = useOrganization(user?.id);
  
  const [localSettings, setLocalSettings] = useState<AppSettings>({});

  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
    }
  }, [settings]);

  // Auto-fill company name from organization if empty
  useEffect(() => {
    if (org && !localSettings.company_name) {
      setLocalSettings(prev => ({ ...prev, company_name: org.name }));
    }
  }, [org, localSettings.company_name]);

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
            <TabsTrigger value="team">Team Members</TabsTrigger>
            <TabsTrigger value="branding">Branding</TabsTrigger>
            <TabsTrigger value="api">API</TabsTrigger>
            {isPlatformAdmin && <TabsTrigger value="facebook">Facebook Integration</TabsTrigger>}
          </TabsList>

          <TabsContent value="general" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>General Settings</CardTitle>
                <CardDescription>Configure basic application settings</CardDescription>
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
                  <p className="text-xs text-muted-foreground">Signup मा दिएको organization name auto-fill हुन्छ। यहाँ बाट change गर्न सकिन्छ।</p>
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
                      <SelectItem value="utc+5:45">Nepal Time (UTC+5:45)</SelectItem>
                      <SelectItem value="utc+8">Asia/Manila (UTC+8)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">Receive email alerts for important events</p>
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
                <CardDescription>Manage your account</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <p className="font-medium">{user?.email}</p>
                    <p className="text-sm text-muted-foreground">Signed in</p>
                  </div>
                  <Button variant="outline" onClick={handleSignOut}>Sign Out</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Facebook Integration Settings - Platform Admin Only */}
          {isPlatformAdmin && <FacebookIntegrationTab />}

          <TabsContent value="team" className="space-y-6">
            <TeamManagementTab />
          </TabsContent>

          <BrandingTab />
          <APITab />
        </Tabs>
      </div>
    </div>
  );
}
