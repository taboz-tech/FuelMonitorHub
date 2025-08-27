import { useState, useEffect } from "react";
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
import { Badge } from "@/components/ui/badge";
import { 
  Fuel, 
  Zap, 
  Power, 
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Filter,
  BarChart3,
  Calendar,
  Clock
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CumulativeReading {
  siteId: number;
  siteName: string;
  deviceId: string;
  totalFuelConsumed: number;
  totalGeneratorHours: number;
  totalZesaHours: number;
  readingDays: number;
  dateRange: {
    first: string;
    last: string;
  };
}

interface CumulativeResponse {
  sites: CumulativeReading[];
  summary: {
    dateRange: {
      start: string;
      end: string;
      isRange: boolean;
    };
    totalSites: number;
    totalFuelConsumed: number;
    totalGeneratorHours: number;
    totalZesaHours: number;
    averageFuelPerSite: number;
    daysIncluded: number;
  };
}

export default function Analytics() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // State management
  const [dateRange, setDateRange] = useState(() => {
    const today = new Date().toISOString().split('T')[0];
    return {
      startDate: today,
      endDate: today
    };
  });
  const [processingDate, setProcessingDate] = useState("");

  // Wait for auth to complete before redirecting
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  // Process cumulative readings mutation (single day only)
  const processCumulativeMutation = useMutation({
    mutationFn: async (date?: string) => {
      const payload = date ? { date } : {};
      const response = await apiRequest("POST", "/api/cumulative-readings", payload);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: `Processed ${data.summary.processedSites} sites successfully`,
      });
      // Refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/cumulative-readings"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to process readings",
        variant: "destructive",
      });
    },
  });

  // Get cumulative readings for date range
  const { data: cumulativeData, isLoading: dataLoading, error: dataError } = useQuery<CumulativeResponse>({
    queryKey: ["/api/cumulative-readings", dateRange.startDate, dateRange.endDate],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });
      
      const response = await apiRequest("GET", `/api/cumulative-readings?${params}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.status}`);
      }
      
      return response.json();
    },
    enabled: !authLoading && isAuthenticated && !!user,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });

  // Show loading spinner while auth is loading
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h2 className="text-lg font-semibold text-gray-700">Checking authentication...</h2>
          <p className="text-gray-500">Please wait</p>
        </div>
      </div>
    );
  }

  // If auth completed but user is not authenticated, show nothing (redirect will happen)
  if (!authLoading && !isAuthenticated) {
    return null;
  }

  // If user is not available yet, show error
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Authentication Error</h2>
            <p className="text-gray-600 mb-4">User information not available</p>
            <Button onClick={() => window.location.reload()}>
              Reload Page
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Event handlers
  const handleProcessToday = () => {
    processCumulativeMutation.mutate();
  };

  const handleProcessDate = () => {
    if (!processingDate) {
      toast({
        title: "Error",
        description: "Please select a date to process",
        variant: "destructive",
      });
      return;
    }
    processCumulativeMutation.mutate(processingDate);
  };

  const handleSetToday = () => {
    const today = new Date().toISOString().split('T')[0];
    setDateRange({ startDate: today, endDate: today });
  };

  const handleSetLast7Days = () => {
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setDateRange({ startDate: weekAgo, endDate: today });
  };

  const handleSetLast30Days = () => {
    const today = new Date().toISOString().split('T')[0];
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setDateRange({ startDate: monthAgo, endDate: today });
  };

  // Format numbers with proper units
  const formatFuel = (liters: number) => `${liters.toFixed(1)}L`;
  const formatHours = (hours: number) => `${hours.toFixed(1)}h`;

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
                <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                  <BarChart3 className="h-8 w-8 text-primary" />
                  Analytics & Reports
                </h2>
                <div className="flex items-center mt-2 space-x-4">
                  <p className="text-gray-600">
                    Welcome back, {user.fullName} ({user.role})
                  </p>
                  <p className="text-gray-500">
                    Fuel consumption and power usage analytics
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <Button
                  onClick={handleProcessToday}
                  disabled={processCumulativeMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {processCumulativeMutation.isPending ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4 mr-2" />
                  )}
                  Process Today
                </Button>
                
                <div className="flex items-center space-x-2">
                  <Input
                    type="date"
                    value={processingDate}
                    onChange={(e) => setProcessingDate(e.target.value)}
                    className="w-40"
                  />
                  <Button
                    onClick={handleProcessDate}
                    disabled={processCumulativeMutation.isPending}
                    variant="outline"
                  >
                    Process Date
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Date Range Filters */}
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex items-center space-x-4 flex-wrap">
                <Filter className="h-5 w-5 text-gray-500" />
                
                <div className="flex items-center space-x-2">
                  <Label>From:</Label>
                  <Input
                    type="date"
                    value={dateRange.startDate}
                    onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                    className="w-40"
                  />
                </div>
                
                <div className="flex items-center space-x-2">
                  <Label>To:</Label>
                  <Input
                    type="date"
                    value={dateRange.endDate}
                    onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                    className="w-40"
                  />
                </div>
                
                {/* Quick date buttons */}
                <Button
                  onClick={handleSetToday}
                  variant="outline"
                  size="sm"
                  className={dateRange.startDate === dateRange.endDate && 
                    dateRange.startDate === new Date().toISOString().split('T')[0] ? 
                    'bg-blue-100 text-blue-700 border-blue-300' : ''}
                >
                  <Calendar className="w-4 h-4 mr-1" />
                  Today
                </Button>
                
                <Button
                  onClick={handleSetLast7Days}
                  variant="outline"
                  size="sm"
                >
                  Last 7 Days
                </Button>
                
                <Button
                  onClick={handleSetLast30Days}
                  variant="outline"
                  size="sm"
                >
                  Last 30 Days
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Loading State */}
          {dataLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-700">Loading Analytics Data...</h3>
                <p className="text-gray-500">Fetching cumulative readings...</p>
              </div>
            </div>
          )}

          {/* Error State */}
          {dataError && (
            <Card className="mb-6">
              <CardContent className="p-6 text-center">
                <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Failed to Load Analytics Data</h3>
                <p className="text-gray-600 mb-4">{dataError.message}</p>
                <Button onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/cumulative-readings"] })}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Retry Loading
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Summary Cards */}
          {!dataLoading && cumulativeData?.summary && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <Card className="bg-gradient-to-r from-red-500 to-red-600 text-white">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-red-100 text-sm">Total Fuel Consumed</p>
                      <p className="text-2xl font-bold">
                        {formatFuel(cumulativeData.summary.totalFuelConsumed)}
                      </p>
                      <p className="text-red-200 text-xs mt-1">
                        {cumulativeData.summary.daysIncluded} day{cumulativeData.summary.daysIncluded > 1 ? 's' : ''}
                      </p>
                    </div>
                    <Fuel className="h-8 w-8 text-red-200" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-blue-100 text-sm">Generator Hours</p>
                      <p className="text-2xl font-bold">
                        {formatHours(cumulativeData.summary.totalGeneratorHours)}
                      </p>
                      <p className="text-blue-200 text-xs mt-1">
                        Avg: {formatHours(cumulativeData.summary.totalGeneratorHours / Math.max(1, cumulativeData.summary.daysIncluded))} per day
                      </p>
                    </div>
                    <Power className="h-8 w-8 text-blue-200" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-r from-green-500 to-green-600 text-white">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-green-100 text-sm">ZESA Hours</p>
                      <p className="text-2xl font-bold">
                        {formatHours(cumulativeData.summary.totalZesaHours)}
                      </p>
                      <p className="text-green-200 text-xs mt-1">
                        Avg: {formatHours(cumulativeData.summary.totalZesaHours / Math.max(1, cumulativeData.summary.daysIncluded))} per day
                      </p>
                    </div>
                    <Zap className="h-8 w-8 text-green-200" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-r from-purple-500 to-purple-600 text-white">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-purple-100 text-sm">Sites Analyzed</p>
                      <p className="text-2xl font-bold">
                        {cumulativeData.summary.totalSites}
                      </p>
                      <p className="text-purple-200 text-xs mt-1">
                        Avg fuel: {formatFuel(cumulativeData.summary.averageFuelPerSite)}
                      </p>
                    </div>
                    <BarChart3 className="h-8 w-8 text-purple-200" />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Date Range Info */}
          {!dataLoading && cumulativeData?.summary && (
            <div className="mb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <Badge variant="outline" className="px-3 py-1">
                    <Calendar className="w-3 h-3 mr-1" />
                    {cumulativeData.summary.dateRange.isRange 
                      ? `${cumulativeData.summary.dateRange.start} to ${cumulativeData.summary.dateRange.end}`
                      : cumulativeData.summary.dateRange.start
                    }
                  </Badge>
                  <Badge variant="outline" className="px-3 py-1">
                    <Clock className="w-3 h-3 mr-1" />
                    {cumulativeData.summary.daysIncluded} day{cumulativeData.summary.daysIncluded > 1 ? 's' : ''} of data
                  </Badge>
                </div>
                <Button variant="outline" size="sm">
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </Button>
              </div>
            </div>
          )}

          {/* Main Data Table */}
          {!dataLoading && cumulativeData?.sites ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Site Analytics Summary</span>
                  <Badge className="bg-blue-100 text-blue-800">
                    {cumulativeData.sites.length} sites
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-gray-700">Site Name</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-700">Device ID</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-700">
                          <div className="flex items-center justify-end">
                            <Fuel className="w-4 h-4 mr-1 text-red-500" />
                            Fuel Consumed
                          </div>
                        </th>
                        <th className="px-4 py-3 text-right font-medium text-gray-700">
                          <div className="flex items-center justify-end">
                            <Power className="w-4 h-4 mr-1 text-blue-500" />
                            Generator Hours
                          </div>
                        </th>
                        <th className="px-4 py-3 text-right font-medium text-gray-700">
                          <div className="flex items-center justify-end">
                            <Zap className="w-4 h-4 mr-1 text-green-500" />
                            ZESA Hours
                          </div>
                        </th>
                        <th className="px-4 py-3 text-center font-medium text-gray-700">Data Days</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {cumulativeData.sites.map((site) => (
                        <tr key={site.siteId} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">{site.siteName}</div>
                          </td>
                          <td className="px-4 py-3">
                            <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                              {site.deviceId}
                            </code>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`font-mono font-bold ${
                              site.totalFuelConsumed > 100 ? 'text-red-600' : 
                              site.totalFuelConsumed > 50 ? 'text-orange-600' : 'text-gray-900'
                            }`}>
                              {formatFuel(site.totalFuelConsumed)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-mono text-blue-600 font-medium">
                              {formatHours(site.totalGeneratorHours)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-mono text-green-600 font-medium">
                              {formatHours(site.totalZesaHours)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant="outline" className="text-xs">
                              {site.readingDays} day{site.readingDays > 1 ? 's' : ''}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                      
                      {/* Totals Row */}
                      {cumulativeData.sites.length > 1 && (
                        <tr className="bg-gray-100 font-bold border-t-2">
                          <td className="px-4 py-3 font-bold text-gray-900">TOTALS</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">
                            {cumulativeData.sites.length} sites
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-mono font-bold text-red-700 text-base">
                              {formatFuel(cumulativeData.summary.totalFuelConsumed)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-mono font-bold text-blue-700 text-base">
                              {formatHours(cumulativeData.summary.totalGeneratorHours)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-mono font-bold text-green-700 text-base">
                              {formatHours(cumulativeData.summary.totalZesaHours)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge className="bg-blue-100 text-blue-800">
                              {cumulativeData.summary.daysIncluded} day{cumulativeData.summary.daysIncluded > 1 ? 's' : ''}
                            </Badge>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {cumulativeData.sites.length === 0 && (
                    <div className="text-center py-12">
                      <BarChart3 className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                      <h3 className="text-lg font-medium text-gray-900 mb-3">No Data Available</h3>
                      <p className="text-gray-600 mb-6 max-w-md mx-auto">
                        No cumulative readings found for the selected date range. 
                        Process data for specific dates to generate analytics.
                      </p>
                      <Button onClick={handleProcessToday} className="bg-green-600 hover:bg-green-700">
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Process Today's Data
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : !dataLoading && (
            /* Empty State */
            <div className="text-center py-12">
              <BarChart3 className="h-24 w-24 mx-auto mb-6 text-gray-400" />
              <h3 className="text-xl font-medium text-gray-900 mb-3">No Analytics Data Available</h3>
              <p className="text-gray-600 mb-6 max-w-md mx-auto">
                Start by processing today's data to generate analytics reports and view consumption patterns.
              </p>
              <div className="space-x-3">
                <Button onClick={handleProcessToday} className="bg-green-600 hover:bg-green-700">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Process Today's Data
                </Button>
                <Button 
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/cumulative-readings"] })}
                  variant="outline"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh Data
                </Button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}