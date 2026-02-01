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
import { toast } from "sonner";

export default function Settings() {
  const handleSave = () => {
    toast.success("Settings saved successfully");
  };

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
                  <Input id="company" placeholder="Your Company" />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select defaultValue="utc-8">
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
                  <Switch defaultChecked />
                </div>

                <Button onClick={handleSave}>Save Changes</Button>
              </CardContent>
            </Card>
          </TabsContent>

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
                  <Switch defaultChecked />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Start Time</Label>
                    <Input type="time" defaultValue="09:00" />
                  </div>
                  <div className="space-y-2">
                    <Label>End Time</Label>
                    <Input type="time" defaultValue="18:00" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Working Days</Label>
                  <div className="flex flex-wrap gap-2">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, idx) => (
                      <Button
                        key={day}
                        variant={idx < 5 ? "default" : "outline"}
                        size="sm"
                        className="w-12"
                      >
                        {day}
                      </Button>
                    ))}
                  </div>
                </div>

                <Button onClick={handleSave}>Save Changes</Button>
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
                  <Switch />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Quiet Start</Label>
                    <Input type="time" defaultValue="22:00" />
                  </div>
                  <div className="space-y-2">
                    <Label>Quiet End</Label>
                    <Input type="time" defaultValue="08:00" />
                  </div>
                </div>

                <Button onClick={handleSave}>Save Changes</Button>
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
                  <Switch defaultChecked />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Min Delay (seconds)</Label>
                    <Input type="number" defaultValue="15" min="5" />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Delay (seconds)</Label>
                    <Input type="number" defaultValue="90" min="10" />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Max Messages per Conversation/Day</Label>
                    <Input type="number" defaultValue="5" min="1" />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Messages per Page/Hour</Label>
                    <Input type="number" defaultValue="30" min="10" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Min Gap Between Messages (seconds)</Label>
                  <Input type="number" defaultValue="60" min="30" />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Approve Before Send (Default)</Label>
                    <p className="text-sm text-muted-foreground">
                      Require approval for AI-generated replies by default
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <Button onClick={handleSave}>Save Changes</Button>
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
                      AD
                    </div>
                    <div>
                      <p className="font-medium">Admin User</p>
                      <p className="text-sm text-muted-foreground">admin@example.com</p>
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
                  defaultValue="spam
scam
unsubscribe
stop messaging"
                />
                <Button onClick={handleSave}>Save Keywords</Button>
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
                />
                <Button onClick={handleSave}>Save List</Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
