// client/src/pages/dashboard.tsx - Updated for external API
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import ProtectedRoute from "@/components/auth/protected-route";
import Header from "@/components/layout/header";
import Sidebar from "@/components/layout/sidebar";
import SiteCard from "@/components/dashboard/site-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, AlertCircle, CheckCircle, Zap } from "lucide-react";
import { type DashboardData } from "@shared/schema";

export default function Dashboard() {
  const { user } = useAuth();

  // Get admin view mode for dashboard API call
  const { data: viewModeData } = useQuery<{ viewMode: string }>({
    queryKey: ["/api/admin/view-mode"],
    enabled: user?.role === 'admin',
  });

  // Dashboard data query with proper mode parameter
  const { data: dashboardData, isLoading: dashboardLoading, refetch, error } = useQuery<DashboardData & { viewMode: string }>({
    queryKey: ["/api/dashboard", viewModeData?.viewMode],
    queryFn: async () => {
      let url = "/api/dashboard";
      
      // Add mode parameter based on user role and preference
      if (user?.role === 'admin' && viewModeData?.viewMode) {
        url += `?mode=${viewModeData.viewMode}`;
      } else {
        // Non-admin users always get closing mode
        url += "?mode=closing";
      }
      
      console.log(`🌐 Fetching dashboard data: ${url}`);
      
      const response = await apiRequest("GET", url);
      const data = await response.json();
      
      console.log("📊 Dashboard data received:", data);
      return data;
    },
    enabled: !!user, // Only run when user is available
    refetchInterval: user?.role === 'admin' && viewModeData?.viewMode === 'realtime' ? 30000 : 60000, // Faster refresh for real-time
  });

  const hasData = dashboardData && dashboardData.sites && Array.isArray(dashboardData.sites) && dashboardData.sites.length > 0;
  
  console.log("📊 Dashboard final render:", {
    hasData,
    sitesCount: dashboardData?.sites?.length,
    viewMode: dashboardData?.viewMode,
    user: user?.username
  });

  return (
    <ProtectedRoute>
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
                      Welcome back, {user?.fullName} ({user?.role})
                    </p>
                    <p className="text-gray-500">
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
                    disabled={dashboardLoading}
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${dashboardLoading ? 'animate-spin' : ''}`} />
                    Refresh Data
                  </Button>
                </div>
              </div>
            </div>

            {/* Enhanced System Status Cards - 5 Cards */}
            {dashboardData?.systemStatus && (
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
                {/* Sites Online */}
                <Card className="bg-white border-l-4 border-l-blue-500">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Sites Online</p>
                        <p className="text-xl font-bold text-blue-600">
                          {dashboardData.systemStatus.sitesOnline}/{dashboardData.systemStatus.totalSites}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Active & reporting</p>
                      </div>
                      <CheckCircle className="h-6 w-6 text-blue-500" />
                    </div>
                  </CardContent>
                </Card>

                {/* Low Fuel Alerts */}
                <Card className="bg-white border-l-4 border-l-red-500">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Low Fuel Alerts</p>
                        <p className="text-xl font-bold text-red-600">
                          {dashboardData.systemStatus.lowFuelAlerts}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Below 25% threshold</p>
                      </div>
                      <AlertCircle className="h-6 w-6 text-red-500" />
                    </div>
                  </CardContent>
                </Card>

                {/* Generators Running */}
                <Card className="bg-white border-l-4 border-l-green-500">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Generators Running</p>
                        <p className="text-xl font-bold text-green-600">
                          {dashboardData.systemStatus.generatorsRunning}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Currently operational</p>
                      </div>
                      <Zap className="h-6 w-6 text-green-500" />
                    </div>
                  </CardContent>
                </Card>

                {/* ZESA Running */}
                <Card className="bg-white border-l-4 border-l-yellow-500">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">ZESA Running</p>
                        <p className="text-xl font-bold text-yellow-600">
                          {dashboardData.systemStatus.zesaRunning}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Grid power active</p>
                      </div>
                      <div className="h-6 w-6 flex items-center justify-center">
                        <div className="w-4 h-4 bg-yellow-500 rounded-sm flex items-center justify-center">
                          <Zap className="h-3 w-3 text-white" />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Offline Sites */}
                <Card className="bg-white border-l-4 border-l-gray-500">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Offline Sites</p>
                        <p className="text-xl font-bold text-gray-600">
                          {dashboardData.systemStatus.offlineSites}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">No recent data</p>
                      </div>
                      <div className="h-6 w-6 bg-gray-400 rounded-full flex items-center justify-center">
                        <div className="w-2 h-2 bg-white rounded-full"></div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Loading State */}
            {dashboardLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-700">Loading Dashboard...</h3>
                  <p className="text-gray-500">Fetching latest sensor data...</p>
                </div>
              </div>
            )}

            {/* Error State */}
            {error && (
              <Card className="mb-8">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      Dashboard Error
                    </h3>
                    <p className="text-gray-600 mb-4">{error.toString()}</p>
                    <Button onClick={() => refetch()}>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Retry
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Site Cards */}
            {!dashboardLoading && !error && hasData && (
              <>
                <div className="mb-4">
                  <h3 className="text-xl font-semibold text-gray-900">
                    Site Status ({dashboardData.sites.length} sites)
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
                  {dashboardData.sites.map((site) => (
                    <SiteCard key={site.id} site={site} />
                  ))}
                </div>
              </>
            )}

            {/* No Data State */}
            {!dashboardLoading && !error && !hasData && (
              <Card>
                <CardContent className="p-8 text-center">
                  <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No Sites Found
                  </h3>
                  <p className="text-gray-600 mb-4">
                    No sites are configured for your account or role.
                  </p>
                  <Button onClick={() => refetch()}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Retry Loading
                  </Button>
                </CardContent>
              </Card>
            )}
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}