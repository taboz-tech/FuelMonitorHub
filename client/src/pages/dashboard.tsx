// client/src/pages/dashboard.tsx - Updated with Loading Component
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import ProtectedRoute from "@/components/auth/protected-route";
import Header from "@/components/layout/header";
import Sidebar from "@/components/layout/sidebar";
import SiteCard from "@/components/dashboard/site-card";
import { Loading, PageLoading } from "@/components/ui/loading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, AlertCircle, CheckCircle, Zap, Eye, Clock } from "lucide-react";
import { type DashboardData } from "@shared/schema";

export default function Dashboard() {
  const { user } = useAuth();
  
  // View mode state - only admins can toggle, others default to closing
  const [viewMode, setViewMode] = useState<'closing' | 'realtime'>(
    user?.role === 'admin' ? 'closing' : 'closing'
  );

  // Dashboard data query with proper mode parameter
  const { data: dashboardData, isLoading: dashboardLoading, refetch, error } = useQuery<DashboardData & { viewMode: string }>({
    queryKey: ["/api/dashboard", viewMode],
    queryFn: async () => {
      // Always include mode parameter
      const url = `/api/dashboard?mode=${viewMode}`;
      
      console.log(`🌐 Fetching dashboard data: ${url}`);
      
      const response = await apiRequest("GET", url);
      if (!response.ok) {
        throw new Error(`Dashboard API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      console.log("📊 Dashboard data received:", data);
      return {
        ...data,
        viewMode // Add the current view mode to the response
      };
    },
    enabled: !!user, // Only run when user is available
    refetchInterval: viewMode === 'realtime' ? 30000 : 60000, // Faster refresh for real-time
    staleTime: viewMode === 'realtime' ? 15000 : 30000,
  });

  const hasData = dashboardData && dashboardData.sites && Array.isArray(dashboardData.sites) && dashboardData.sites.length > 0;

  // Handle view mode toggle (admin only)
  const handleViewModeToggle = (mode: 'closing' | 'realtime') => {
    if (user?.role !== 'admin') return; // Safety check
    setViewMode(mode);
    // Invalidate queries to force refetch with new mode
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
  };
  
  console.log("📊 Dashboard render:", {
    hasData,
    sitesCount: dashboardData?.sites?.length,
    viewMode,
    userRole: user?.role,
    isAdmin: user?.role === 'admin'
  });

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex">
          <Sidebar />
          <main className="flex-1 p-6">
            {/* Loading State - Full Dashboard Loading */}
            {dashboardLoading && (
              <Loading 
                variant="page"
                size="lg"
                message="Loading Dashboard"
                submessage={`Fetching ${viewMode === 'realtime' ? 'real-time' : 'daily closing'} sensor data...`}
              />
            )}

            {/* Error State */}
            {error && !dashboardLoading && (
              <div className="min-h-[60vh] flex items-center justify-center">
                <Card className="max-w-md mx-auto">
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">
                        Dashboard Error
                      </h3>
                      <p className="text-gray-600 mb-4">{error.toString()}</p>
                      <div className="space-x-2">
                        <Button onClick={() => refetch()}>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Retry
                        </Button>
                        {user?.role === 'admin' && viewMode === 'realtime' && (
                          <Button 
                            variant="outline" 
                            onClick={() => handleViewModeToggle('closing')}
                          >
                            Switch to Closing View
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Dashboard Content - Only show when not loading and no error */}
            {!dashboardLoading && !error && (
              <>
                {/* Page Header with View Mode Toggle */}
                <div className="mb-8">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-3xl font-bold text-gray-900">Dashboard Overview</h2>
                      <div className="flex items-center mt-2 space-x-4">
                        <p className="text-gray-600">
                          Welcome back, {user?.fullName} ({user?.role})
                        </p>
                        <p className="text-gray-500">
                          {viewMode === 'realtime' 
                            ? 'Showing real-time sensor data' 
                            : 'Showing daily closing readings'}
                        </p>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Last updated: {new Date().toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex space-x-3 items-center">
                      {/* Admin View Mode Toggle */}
                      {user?.role === 'admin' && (
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-gray-700">Data View:</span>
                          <div className="flex items-center bg-gray-100 rounded-lg p-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`px-3 py-1 text-sm font-medium rounded-md transition-all duration-200 ${
                                viewMode === 'closing'
                                  ? 'bg-primary text-white'
                                  : 'text-gray-700 hover:bg-gray-200'
                              }`}
                              onClick={() => handleViewModeToggle('closing')}
                              disabled={dashboardLoading}
                            >
                              <Clock className="w-3 h-3 mr-1" />
                              Daily Closing
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`px-3 py-1 text-sm font-medium rounded-md transition-all duration-200 ${
                                viewMode === 'realtime'
                                  ? 'bg-primary text-white'
                                  : 'text-gray-700 hover:bg-gray-200'
                              }`}
                              onClick={() => handleViewModeToggle('realtime')}
                              disabled={dashboardLoading}
                            >
                              <Eye className="w-3 h-3 mr-1" />
                              Real-time
                            </Button>
                          </div>
                        </div>
                      )}
                      
                      {/* Non-admin view mode indicator */}
                      {user?.role !== 'admin' && (
                        <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                          <Clock className="w-3 h-3 mr-1" />
                          Daily Closing View
                        </Badge>
                      )}
                      
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

                {/* Site Cards */}
                {hasData ? (
                  <>
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-xl font-semibold text-gray-900">
                        Site Status ({dashboardData.sites.length} sites)
                      </h3>
                      <Badge 
                        className={`${
                          viewMode === 'realtime' 
                            ? 'bg-green-100 text-green-800 border-green-200' 
                            : 'bg-blue-100 text-blue-800 border-blue-200'
                        }`}
                      >
                        {viewMode === 'realtime' ? (
                          <>
                            <Eye className="w-3 h-3 mr-1" />
                            Real-time Data
                          </>
                        ) : (
                          <>
                            <Clock className="w-3 h-3 mr-1" />
                            Daily Closing Data
                          </>
                        )}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
                      {dashboardData.sites.map((site) => (
                        <SiteCard key={site.id} site={site} />
                      ))}
                    </div>
                  </>
                ) : (
                  /* No Data State */
                  <Card>
                    <CardContent className="p-8 text-center">
                      <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">
                        No Sites Found
                      </h3>
                      <p className="text-gray-600 mb-4">
                        No sites are configured for your account or role.
                      </p>
                      <div className="space-x-2">
                        <Button onClick={() => refetch()}>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Retry Loading
                        </Button>
                        {user?.role === 'admin' && (
                          <Button 
                            variant="outline"
                            onClick={() => handleViewModeToggle(viewMode === 'realtime' ? 'closing' : 'realtime')}
                          >
                            Try {viewMode === 'realtime' ? 'Closing' : 'Real-time'} View
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}