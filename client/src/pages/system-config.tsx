import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import Header from "@/components/layout/header";
import Sidebar from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Database, Clock, Shield, AlertTriangle, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function SystemConfig() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("general");

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/login");
    } else if (user?.role !== 'admin') {
      setLocation("/dashboard");
    }
  }, [isAuthenticated, user, setLocation]);

  // Mock system configuration data
  const systemConfig = {
    general: {
      systemName: "Fuel Sensor Monitoring Portal",
      timezone: "Africa/Harare",
      maintenanceMode: false,
      autoBackup: true,
      backupFrequency: "daily",
    },
    database: {
      host: "41.191.232.15",
      port: "5437",
      database: "sensorsdb",
      connectionStatus: "connected",
      lastBackup: "2025-07-22T10:30:00Z",
    },
    scheduler: {
      dailyCaptureTime: "23:55",
      enabled: true,
      lastRun: "2025-07-21T23:55:00Z",
      nextRun: "2025-07-22T23:55:00Z",
    },
    security: {
      jwtExpiry: "24h",
      passwordMinLength: 8,
      maxLoginAttempts: 5,
      sessionTimeout: "2h",
    },
    notifications: {
      emailEnabled: false,
      smsEnabled: false,
      lowFuelAlert: true,
      systemErrorAlert: true,
    }
  };

  if (!isAuthenticated || user?.role !== 'admin') {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6 lg:p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <Settings className="h-8 w-8 text-red-600" />
              System Configuration
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Manage system settings, database configuration, and security options
            </p>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="database">Database</TabsTrigger>
              <TabsTrigger value="scheduler">Scheduler</TabsTrigger>
              <TabsTrigger value="security">Security</TabsTrigger>
              <TabsTrigger value="notifications">Notifications</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5 text-blue-600" />
                    General Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="systemName">System Name</Label>
                      <Input 
                        id="systemName" 
                        value={systemConfig.general.systemName}
                        className="border-blue-200 focus:border-blue-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="timezone">Timezone</Label>
                      <Select value={systemConfig.general.timezone}>
                        <SelectTrigger className="border-blue-200 focus:border-blue-500">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Africa/Harare">Africa/Harare</SelectItem>
                          <SelectItem value="Africa/Johannesburg">Africa/Johannesburg</SelectItem>
                          <SelectItem value="UTC">UTC</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg border-blue-200">
                      <div>
                        <Label className="text-base font-medium">Maintenance Mode</Label>
                        <p className="text-sm text-gray-600">Enable to restrict system access during maintenance</p>
                      </div>
                      <Switch 
                        checked={systemConfig.general.maintenanceMode}
                        className="data-[state=checked]:bg-red-600"
                      />
                    </div>
                    
                    <div className="flex items-center justify-between p-4 border rounded-lg border-blue-200">
                      <div>
                        <Label className="text-base font-medium">Auto Backup</Label>
                        <p className="text-sm text-gray-600">Automatically backup database daily</p>
                      </div>
                      <Switch 
                        checked={systemConfig.general.autoBackup}
                        className="data-[state=checked]:bg-blue-600"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button className="bg-blue-600 hover:bg-blue-700">
                      Save Changes
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="database" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-blue-600" />
                    Database Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Host</Label>
                      <Input value={systemConfig.database.host} disabled className="bg-gray-50" />
                    </div>
                    <div className="space-y-2">
                      <Label>Port</Label>
                      <Input value={systemConfig.database.port} disabled className="bg-gray-50" />
                    </div>
                    <div className="space-y-2">
                      <Label>Database</Label>
                      <Input value={systemConfig.database.database} disabled className="bg-gray-50" />
                    </div>
                    <div className="space-y-2">
                      <Label>Connection Status</Label>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-green-100 text-green-800 flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Connected
                        </Badge>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Database className="h-4 w-4 text-blue-600" />
                      <span className="font-medium text-blue-900">Last Backup</span>
                    </div>
                    <p className="text-sm text-blue-700">
                      {new Date(systemConfig.database.lastBackup).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex justify-between pt-4">
                    <Button variant="outline" className="border-red-200 text-red-600 hover:bg-red-50">
                      Test Connection
                    </Button>
                    <Button className="bg-blue-600 hover:bg-blue-700">
                      Create Backup
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="scheduler" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-blue-600" />
                    Scheduler Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="captureTime">Daily Capture Time</Label>
                      <Input 
                        id="captureTime" 
                        value={systemConfig.scheduler.dailyCaptureTime}
                        className="border-blue-200 focus:border-blue-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Badge className={systemConfig.scheduler.enabled ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                        {systemConfig.scheduler.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-gray-50 border rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="h-4 w-4 text-gray-600" />
                        <span className="font-medium">Last Run</span>
                      </div>
                      <p className="text-sm text-gray-600">
                        {new Date(systemConfig.scheduler.lastRun).toLocaleString()}
                      </p>
                    </div>
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="h-4 w-4 text-blue-600" />
                        <span className="font-medium text-blue-900">Next Run</span>
                      </div>
                      <p className="text-sm text-blue-700">
                        {new Date(systemConfig.scheduler.nextRun).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg border-blue-200">
                    <div>
                      <Label className="text-base font-medium">Enable Scheduler</Label>
                      <p className="text-sm text-gray-600">Automatically capture daily readings</p>
                    </div>
                    <Switch 
                      checked={systemConfig.scheduler.enabled}
                      className="data-[state=checked]:bg-blue-600"
                    />
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button className="bg-blue-600 hover:bg-blue-700">
                      Update Scheduler
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="security" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-red-600" />
                    Security Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="jwtExpiry">JWT Token Expiry</Label>
                      <Select value={systemConfig.security.jwtExpiry}>
                        <SelectTrigger className="border-red-200 focus:border-red-500">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1h">1 hour</SelectItem>
                          <SelectItem value="24h">24 hours</SelectItem>
                          <SelectItem value="7d">7 days</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="passwordLength">Minimum Password Length</Label>
                      <Input 
                        id="passwordLength" 
                        type="number"
                        value={systemConfig.security.passwordMinLength}
                        className="border-red-200 focus:border-red-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="maxAttempts">Max Login Attempts</Label>
                      <Input 
                        id="maxAttempts" 
                        type="number"
                        value={systemConfig.security.maxLoginAttempts}
                        className="border-red-200 focus:border-red-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sessionTimeout">Session Timeout</Label>
                      <Select value={systemConfig.security.sessionTimeout}>
                        <SelectTrigger className="border-red-200 focus:border-red-500">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="30m">30 minutes</SelectItem>
                          <SelectItem value="1h">1 hour</SelectItem>
                          <SelectItem value="2h">2 hours</SelectItem>
                          <SelectItem value="4h">4 hours</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                      <span className="font-medium text-red-900">Security Notice</span>
                    </div>
                    <p className="text-sm text-red-700">
                      Changes to security settings will require all users to log in again.
                    </p>
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button className="bg-red-600 hover:bg-red-700">
                      Update Security Settings
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notifications" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-blue-600" />
                    Notification Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg border-blue-200">
                      <div>
                        <Label className="text-base font-medium">Email Notifications</Label>
                        <p className="text-sm text-gray-600">Send alerts via email</p>
                      </div>
                      <Switch 
                        checked={systemConfig.notifications.emailEnabled}
                        className="data-[state=checked]:bg-blue-600"
                      />
                    </div>
                    
                    <div className="flex items-center justify-between p-4 border rounded-lg border-blue-200">
                      <div>
                        <Label className="text-base font-medium">SMS Notifications</Label>
                        <p className="text-sm text-gray-600">Send alerts via SMS</p>
                      </div>
                      <Switch 
                        checked={systemConfig.notifications.smsEnabled}
                        className="data-[state=checked]:bg-blue-600"
                      />
                    </div>
                    
                    <div className="flex items-center justify-between p-4 border rounded-lg border-red-200">
                      <div>
                        <Label className="text-base font-medium">Low Fuel Alerts</Label>
                        <p className="text-sm text-gray-600">Alert when fuel levels are low</p>
                      </div>
                      <Switch 
                        checked={systemConfig.notifications.lowFuelAlert}
                        className="data-[state=checked]:bg-red-600"
                      />
                    </div>
                    
                    <div className="flex items-center justify-between p-4 border rounded-lg border-red-200">
                      <div>
                        <Label className="text-base font-medium">System Error Alerts</Label>
                        <p className="text-sm text-gray-600">Alert on system errors and failures</p>
                      </div>
                      <Switch 
                        checked={systemConfig.notifications.systemErrorAlert}
                        className="data-[state=checked]:bg-red-600"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button className="bg-blue-600 hover:bg-blue-700">
                      Save Notification Settings
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
}