import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import Header from "@/components/layout/header";
import Sidebar from "@/components/layout/sidebar";
import SiteCard from "@/components/dashboard/site-card";
import StatusOverview from "@/components/dashboard/status-overview";
import ActivityTable from "@/components/dashboard/activity-table";
import { Button } from "@/components/ui/button";
import { RefreshCw, TrendingUp } from "lucide-react";
import { type DashboardData } from "@shared/schema";

export default function Dashboard() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/login");
    }
  }, [isAuthenticated, setLocation]);

  const { data: dashboardData, isLoading, refetch } = useQuery<DashboardData & { viewMode: string }>({
    queryKey: ["/api/dashboard"],
    enabled: isAuthenticated,
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
                <h2 className="text-2xl font-bold text-gray-900">Dashboard Overview</h2>
                <p className="text-gray-600 mt-1">
                  <span>
                    {dashboardData?.viewMode === 'realtime' 
                      ? 'Showing real-time sensor data' 
                      : 'Showing daily closing readings'}
                  </span>
                  <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded">
                    Last updated: {new Date().toLocaleString()}
                  </span>
                </p>
              </div>
              
              <Button 
                onClick={() => refetch()}
                className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition duration-200"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh Data
              </Button>
            </div>
          </div>

          {/* Site Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {dashboardData?.sites.map((site) => (
              <SiteCard key={site.id} site={site} />
            ))}
          </div>

          {/* Charts and Status Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Fuel Consumption Trend Chart */}
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Fuel Consumption Trend</h3>
                <select className="text-sm border border-gray-300 rounded-lg px-3 py-1">
                  <option value="7">Last 7 Days</option>
                  <option value="30">Last 30 Days</option>
                  <option value="90">Last 3 Months</option>
                </select>
              </div>
              
              <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <TrendingUp className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-500">Fuel consumption chart</p>
                  <p className="text-xs text-gray-400 mt-1">Chart integration ready</p>
                </div>
              </div>
            </div>

            {/* System Status Overview */}
            {dashboardData?.systemStatus && (
              <StatusOverview systemStatus={dashboardData.systemStatus} />
            )}
          </div>

          {/* Recent Activity Table */}
          {dashboardData?.recentActivity && (
            <ActivityTable activities={dashboardData.recentActivity} />
          )}
        </main>
      </div>
    </div>
  );
}
