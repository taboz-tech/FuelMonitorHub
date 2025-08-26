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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend
} from "recharts";
import { 
  Fuel, 
  Zap, 
  Power, 
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Filter,
  BarChart3
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CumulativeReading {
  siteId: number;
  siteName: string;
  deviceId: string;
  fuelConsumed: number;
  fuelTopped: number;
  fuelConsumedPercent: number;
  fuelToppedPercent: number;
  generatorHours: number;
  zesaHours: number;
  offlineHours: number;
  status: string;
  calculatedAt: string;
}

interface CumulativeResponse {
  date: string;
  processedAt: string;
  sites: CumulativeReading[];
  summary: {
    totalSites: number;
    processedSites: number;
    errorSites: number;
    totalFuelConsumed: number;
    totalFuelTopped: number;
    totalGeneratorHours: number;
    totalZesaHours: number;
    totalOfflineHours: number;
  };
}

interface HistoricalReading {
  id: number;
  date: string;
  totalFuelConsumed: string;
  totalFuelToppedup: string;
  totalGeneratorRuntime: string;
  totalZesaRuntime: string;
  totalOfflineTime: string;
  calculatedAt: string;
  siteName: string;
}

export default function Analytics() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // State management
  const [activeTab, setActiveTab] = useState("daily");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [processingDate, setProcessingDate] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/login");
    }
  }, [isAuthenticated, setLocation]);

  // Process cumulative readings mutation
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
      // Refresh historical data
      queryClient.invalidateQueries({ queryKey: ["/api/cumulative-readings"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to process readings",
        variant: "destructive",
      });
    },
  });

  // Get historical readings
  const { data: historicalData, isLoading: historicalLoading, error: historicalError } = useQuery<{
    readings: HistoricalReading[];
    summary: { totalReadings: number };
  }>({
    queryKey: ["/api/cumulative-readings", dateRange.startDate, dateRange.endDate],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });
      const response = await apiRequest("GET", `/api/cumulative-readings?${params}`);
      return response.json();
    },
    enabled: isAuthenticated,
  });

  // Process readings for current date
  const handleProcessToday = () => {
    processCumulativeMutation.mutate();
  };

  // Process readings for specific date
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

  // Prepare chart data
  const prepareDailyChartData = () => {
    if (!historicalData?.readings) return [];

    // Group by date and aggregate
    const dateGroups = historicalData.readings.reduce((acc, reading) => {
      const date = reading.date;
      if (!acc[date]) {
        acc[date] = {
          date,
          fuelConsumed: 0,
          generatorHours: 0,
          zesaHours: 0,
          offlineHours: 0,
          sites: 0
        };
      }
      acc[date].fuelConsumed += parseFloat(reading.totalFuelConsumed) || 0;
      acc[date].generatorHours += parseFloat(reading.totalGeneratorRuntime) || 0;
      acc[date].zesaHours += parseFloat(reading.totalZesaRuntime) || 0;
      acc[date].offlineHours += parseFloat(reading.totalOfflineTime) || 0;
      acc[date].sites += 1;
      return acc;
    }, {} as Record<string, any>);

    return Object.values(dateGroups).sort((a: any, b: any) => a.date.localeCompare(b.date));
  };

  // Prepare site comparison data
  const prepareSiteComparisonData = () => {
    if (!historicalData?.readings) return [];

    // Group by site and aggregate
    const siteGroups = historicalData.readings.reduce((acc, reading) => {
      const siteName = reading.siteName;
      if (!acc[siteName]) {
        acc[siteName] = {
          siteName,
          totalFuelConsumed: 0,
          totalGeneratorHours: 0,
          totalZesaHours: 0,
          readings: 0
        };
      }
      acc[siteName].totalFuelConsumed += parseFloat(reading.totalFuelConsumed) || 0;
      acc[siteName].totalGeneratorHours += parseFloat(reading.totalGeneratorRuntime) || 0;
      acc[siteName].totalZesaHours += parseFloat(reading.totalZesaRuntime) || 0;
      acc[siteName].readings += 1;
      return acc;
    }, {} as Record<string, any>);

    return Object.values(siteGroups)
      .sort((a: any, b: any) => b.totalFuelConsumed - a.totalFuelConsumed)
      .slice(0, 10); // Top 10 sites
  };

  // Prepare power distribution data
  const preparePowerDistributionData = () => {
    if (!historicalData?.readings) return [];

    const totals = historicalData.readings.reduce((acc, reading) => {
      acc.generator += parseFloat(reading.totalGeneratorRuntime) || 0;
      acc.zesa += parseFloat(reading.totalZesaRuntime) || 0;
      acc.offline += parseFloat(reading.totalOfflineTime) || 0;
      return acc;
    }, { generator: 0, zesa: 0, offline: 0 });

    return [
      { name: 'Generator', value: Math.round(totals.generator * 100) / 100, fill: '#ef4444' },
      { name: 'ZESA', value: Math.round(totals.zesa * 100) / 100, fill: '#3b82f6' },
      { name: 'Offline', value: Math.round(totals.offline * 100) / 100, fill: '#6b7280' }
    ];
  };

  if (!isAuthenticated) {
    return null;
  }

  const dailyChartData = prepareDailyChartData();
  const siteComparisonData = prepareSiteComparisonData();
  const powerDistributionData = preparePowerDistributionData();

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
                <p className="text-gray-600 mt-2">
                  Comprehensive fuel consumption and power usage analytics
                </p>
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

          {/* Filters */}
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex items-center space-x-4">
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
                <Button
                  onClick={() => {
                    const today = new Date().toISOString().split('T')[0];
                    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                    setDateRange({ startDate: weekAgo, endDate: today });
                  }}
                  variant="outline"
                  size="sm"
                >
                  Last 7 Days
                </Button>
                <Button
                  onClick={() => {
                    const today = new Date().toISOString().split('T')[0];
                    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                    setDateRange({ startDate: monthAgo, endDate: today });
                  }}
                  variant="outline"
                  size="sm"
                >
                  Last 30 Days
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Summary Cards */}
          {historicalData && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <Card className="bg-gradient-to-r from-red-500 to-red-600 text-white">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-red-100 text-sm">Total Fuel Consumed</p>
                      <p className="text-2xl font-bold">
                        {Math.round(historicalData.readings.reduce((sum, r) => sum + (parseFloat(r.totalFuelConsumed) || 0), 0))}L
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
                        {Math.round(historicalData.readings.reduce((sum, r) => sum + (parseFloat(r.totalGeneratorRuntime) || 0), 0) * 10) / 10}h
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
                        {Math.round(historicalData.readings.reduce((sum, r) => sum + (parseFloat(r.totalZesaRuntime) || 0), 0) * 10) / 10}h
                      </p>
                    </div>
                    <Zap className="h-8 w-8 text-green-200" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-r from-gray-500 to-gray-600 text-white">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-100 text-sm">Data Points</p>
                      <p className="text-2xl font-bold">
                        {historicalData.readings.length}
                      </p>
                    </div>
                    <BarChart3 className="h-8 w-8 text-gray-200" />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Charts and Analytics */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="daily">Daily Trends</TabsTrigger>
              <TabsTrigger value="sites">Site Comparison</TabsTrigger>
              <TabsTrigger value="power">Power Distribution</TabsTrigger>
              <TabsTrigger value="details">Detailed Data</TabsTrigger>
            </TabsList>

            <TabsContent value="daily" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Fuel Consumption Trend */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Fuel className="h-5 w-5 text-red-500" />
                      Daily Fuel Consumption
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={dailyChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Line 
                          type="monotone" 
                          dataKey="fuelConsumed" 
                          stroke="#ef4444" 
                          strokeWidth={2}
                          name="Fuel (L)"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Power Usage Trend */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Power className="h-5 w-5 text-blue-500" />
                      Daily Power Usage
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={dailyChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line 
                          type="monotone" 
                          dataKey="generatorHours" 
                          stroke="#ef4444" 
                          name="Generator (h)"
                        />
                        <Line 
                          type="monotone" 
                          dataKey="zesaHours" 
                          stroke="#3b82f6" 
                          name="ZESA (h)"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="sites" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Top 10 Sites by Fuel Consumption</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={siteComparisonData} layout="horizontal">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="siteName" type="category" width={120} />
                      <Tooltip />
                      <Bar dataKey="totalFuelConsumed" fill="#ef4444" name="Fuel Consumed (L)" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="power" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Power Source Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={powerDistributionData}
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          dataKey="value"
                          label={({ name, value }) => `${name}: ${value}h`}
                        >
                          {powerDistributionData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Power Efficiency Metrics</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {powerDistributionData.map((item) => (
                      <div key={item.name} className="space-y-2">
                        <div className="flex justify-between">
                          <span className="font-medium">{item.name}</span>
                          <span className="text-sm text-gray-600">{item.value}h</span>
                        </div>
                        <Progress 
                          value={item.value / Math.max(...powerDistributionData.map(d => d.value)) * 100}
                          className="h-2"
                        />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="details" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Detailed Readings</span>
                    <Button variant="outline" size="sm">
                      <Download className="w-4 h-4 mr-2" />
                      Export CSV
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {historicalLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="w-6 h-6 animate-spin mr-2" />
                      Loading data...
                    </div>
                  ) : historicalError ? (
                    <div className="text-center py-8 text-red-600">
                      <AlertCircle className="w-12 h-12 mx-auto mb-4" />
                      <p>Error loading data: {historicalError.message}</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left">Date</th>
                            <th className="px-4 py-2 text-left">Site</th>
                            <th className="px-4 py-2 text-right">Fuel (L)</th>
                            <th className="px-4 py-2 text-right">Generator (h)</th>
                            <th className="px-4 py-2 text-right">ZESA (h)</th>
                            <th className="px-4 py-2 text-right">Offline (h)</th>
                            <th className="px-4 py-2 text-left">Processed</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {historicalData?.readings.slice(0, 50).map((reading) => (
                            <tr key={reading.id} className="hover:bg-gray-50">
                              <td className="px-4 py-2">{reading.date}</td>
                              <td className="px-4 py-2">{reading.siteName}</td>
                              <td className="px-4 py-2 text-right font-mono">
                                {parseFloat(reading.totalFuelConsumed).toFixed(1)}
                              </td>
                              <td className="px-4 py-2 text-right font-mono">
                                {parseFloat(reading.totalGeneratorRuntime).toFixed(1)}
                              </td>
                              <td className="px-4 py-2 text-right font-mono">
                                {parseFloat(reading.totalZesaRuntime).toFixed(1)}
                              </td>
                              <td className="px-4 py-2 text-right font-mono">
                                {parseFloat(reading.totalOfflineTime).toFixed(1)}
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-500">
                                {new Date(reading.calculatedAt).toLocaleDateString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      
                      {historicalData?.readings && historicalData.readings.length > 50 && (
                        <div className="text-center py-4 text-gray-500">
                          Showing first 50 of {historicalData.readings.length} records
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
}