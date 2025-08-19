import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import Header from "@/components/layout/header";
import Sidebar from "@/components/layout/sidebar";
import SiteCard from "@/components/dashboard/site-card";
import StatusOverview from "@/components/dashboard/status-overview";
import ActivityTable from "@/components/dashboard/activity-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, TrendingUp, AlertCircle, CheckCircle, Zap } from "lucide-react";
import { type DashboardData } from "@shared/schema";

export default function Dashboard() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [debugInfo, setDebugInfo] = useState<any>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/login");
    }
  }, [isAuthenticated, setLocation]);

  const { data: dashboardData, isLoading, refetch, error } = useQuery<DashboardData & { viewMode: string }>({
    queryKey: ["/api/dashboard"],
    enabled: isAuthenticated,
    refetchInterval: 30000, // Refresh every 30 seconds
    onSuccess: (data) => {
      console.log("Dashboard data received:", data);
      setDebugInfo(data);
    },
    onError: (error) => {
      console.error("Dashboard query error:", error);
    }
  });

  if (!isAuthenticated || !user) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex">
          <Sidebar />
          <main className="flex-1 p-6">
            <div className="animate-pulse space-y-6">
              <div className="h-8 bg-gray-200 rounded w-1/4"></div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-48 bg-gray-200 rounded-xl"></div>
                ))}
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex">
          <Sidebar />
          <main className="flex-1 p-6">
            <Card className="max-w-2xl mx-auto mt-8">
              <CardHeader>
                <CardTitle className="flex items-center text-red-600">
                  <AlertCircle className="w-5 h-5 mr-2" />
                  Dashboard Error
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 mb-4">Failed to load dashboard data:</p>
                <pre className="bg-gray-100 p-3 rounded text-sm overflow-x-auto">
                  {error?.toString()}
                </pre>
                <Button onClick={() => refetch()} className="mt-4">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Retry
                </Button>
              </CardContent>
            </Card>
          </main>
        </div>
      </div>
    );
  }

  const hasData = dashboardData && dashboardData.sites?.length > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6">
          {/* Page Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold text-gray-900">Dashboard Overview</h2>
                <div className="flex items-center mt-2 space-x-4">
                  <p className="text-gray-600">
                    {dashboardData?.viewMode === 'realtime' 
                      ? 'Showing real-time sensor data' 
                      : 'Showing daily closing readings'}
                  </p>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Last updated: {new Date().toLocaleTimeString()}
                  </span>
                </div>
              </div>
              
              <div className="flex space-x-3">
                <Button 
                  onClick={() => refetch()}
                  className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition duration-200"
                  disabled={isLoading}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh Data
                </Button>
              </div>
            </div>
          </div>

          {/* System Status Cards */}
          {dashboardData?.systemStatus && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <Card className="bg-white border-l-4 border-l-blue-500">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Sites Online</p>
                      <p className="text-2xl font-bold text-blue-600">
                        {dashboardData.systemStatus.sitesOnline}/{dashboardData.systemStatus.totalSites}
                      </p>
                    </div>
                    <CheckCircle className="h-8 w-8 text-blue-500" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border-l-4 border-l-red-500">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Low Fuel Alerts</p>
                      <p className="text-2xl font-bold text-red-600">{dashboardData.systemStatus.lowFuelAlerts}</p>
                    </div>
                    <AlertCircle className="h-8 w-8 text-red-500" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border-l-4 border-l-green-500">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Generators Running</p>
                      <p className="text-2xl font-bold text-green-600">{dashboardData.systemStatus.generatorsRunning}</p>
                    </div>
                    <Zap className="h-8 w-8 text-green-500" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border-l-4 border-l-purple-500">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Total Sites</p>
                      <p className="text-2xl font-bold text-purple-600">{dashboardData.systemStatus.totalSites}</p>
                    </div>
                    <TrendingUp className="h-8 w-8 text-purple-500" />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Site Cards */}
          {hasData ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
              {dashboardData.sites.map((site) => (
                <SiteCard key={site.id} site={site} />
              ))}
            </div>
          ) : (
            <Card className="mb-8">
              <CardContent className="p-8 text-center">
                <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Site Data Available</h3>
                <p className="text-gray-600 mb-4">
                  No sensor data found. This could mean:
                </p>
                <ul className="text-left text-gray-600 space-y-1 mb-6 max-w-md mx-auto">
                  <li>• Sensors are not connected or sending data</li>
                  <li>• Device IDs don't match between sites and sensor readings</li>
                  <li>• Database connection issues</li>
                </ul>
                <Button onClick={() => refetch()}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Retry Loading Data
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Fuel Consumption Trend Chart */}
            <Card className="bg-white">
              <CardHeader className="border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-semibold text-gray-900">
                    Fuel Consumption Trend
                  </CardTitle>
                  <select className="text-sm border border-gray-300 rounded-lg px-3 py-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    <option value="7">Last 7 Days</option>
                    <option value="30">Last 30 Days</option>
                    <option value="90">Last 3 Months</option>
                  </select>
                </div>
              </CardHeader>
              
              <CardContent className="p-6">
                <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300">
                  <div className="text-center">
                    <TrendingUp className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">Fuel consumption chart</p>
                    <p className="text-xs text-gray-400 mt-1">Chart integration ready</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* System Status Overview */}
            {dashboardData?.systemStatus && (
              <StatusOverview systemStatus={dashboardData.systemStatus} />
            )}
          </div>

          {/* Recent Activity Table */}
          {dashboardData?.recentActivity && dashboardData.recentActivity.length > 0 && (
            <ActivityTable activities={dashboardData.recentActivity} />
          )}

          {/* Debug Information (only in development) */}
          {process.env.NODE_ENV === 'development' && debugInfo && (
            <Card className="mt-8">
              <CardHeader>
                <CardTitle className="text-sm font-mono">Debug Information</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs bg-gray-100 p-4 rounded overflow-x-auto">
                  {JSON.stringify(debugInfo, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}