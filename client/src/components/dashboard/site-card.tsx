import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Fuel, Thermometer, Zap, Power } from "lucide-react";
import { type SiteWithReadings } from "@shared/schema";

interface SiteCardProps {
  site: SiteWithReadings;
}

export default function SiteCard({ site }: SiteCardProps) {
  const getFuelLevelColor = (percentage: number) => {
    if (percentage < 25) return "bg-red-500";
    if (percentage < 50) return "bg-yellow-500";
    return "bg-green-500";
  };

  const getFuelLevelTextColor = (percentage: number) => {
    if (percentage < 25) return "text-red-600";
    if (percentage < 50) return "text-yellow-600";
    return "text-green-600";
  };

  const getStatusIndicator = (isOnline: boolean, type: 'generator' | 'zesa') => {
    const baseClasses = "w-3 h-3 rounded-full flex-shrink-0";
    if (isOnline) {
      return <div className={`${baseClasses} bg-green-500 shadow-sm`} title={`${type} Online`} />;
    }
    return <div className={`${baseClasses} bg-gray-400 shadow-sm`} title={`${type} Offline`} />;
  };

  const getAlertBadge = (alertStatus: string) => {
    switch (alertStatus) {
      case 'low_fuel':
        return <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-200">Low Fuel</Badge>;
      case 'generator_off':
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Generator Off</Badge>;
      default:
        return <Badge className="bg-green-100 text-green-800 border-green-200">Normal</Badge>;
    }
  };

  // Handle zero and undefined values properly
  const fuelLevel = Math.max(0, Math.min(100, site.fuelLevelPercentage ?? 0));
  const fuelVolume = parseFloat(site.latestReading?.fuelVolume || '0');
  const temperature = parseFloat(site.latestReading?.temperature || '0');

  // Log debug info for this site
  console.log(`SiteCard ${site.name}:`, {
    fuelLevelPercentage: site.fuelLevelPercentage,
    fuelLevel: fuelLevel,
    latestReading: site.latestReading,
    alertStatus: site.alertStatus
  });

  return (
    <Card className="bg-white hover:shadow-md transition-shadow duration-200 border border-gray-200">
      <CardContent className="p-6">
        {/* Header Section */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mr-3">
              <Fuel className="text-blue-600 text-xl" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 text-base">{site.name}</h3>
              <p className="text-sm text-gray-600">{site.location}</p>
            </div>
          </div>
          
          {/* Status Indicators */}
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-1">
              <Power className="w-3 h-3 text-gray-500" />
              {getStatusIndicator(site.generatorOnline, 'generator')}
            </div>
            <div className="flex items-center space-x-1">
              <Zap className="w-3 h-3 text-gray-500" />
              {getStatusIndicator(site.zesaOnline, 'zesa')}
            </div>
          </div>
        </div>
        
        {/* Fuel Level Section */}
        <div className="space-y-3">
          <div className="flex justify-between items-baseline">
            <span className="text-sm font-medium text-gray-700">Fuel Level</span>
            <span className={`font-bold text-2xl ${getFuelLevelTextColor(fuelLevel)}`}>
              {fuelLevel.toFixed(1)}%
            </span>
          </div>
          
          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 ${getFuelLevelColor(fuelLevel)}`}
              style={{ width: `${Math.max(2, fuelLevel)}%` }} // Show at least 2% width for visibility
            />
          </div>
          
          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
            <div className="flex items-center text-sm">
              <Fuel className="w-4 h-4 text-gray-400 mr-2" />
              <div>
                <div className="text-gray-600">Volume</div>
                <div className="font-medium text-gray-900">{fuelVolume.toFixed(0)}L</div>
              </div>
            </div>
            
            <div className="flex items-center text-sm">
              <Thermometer className="w-4 h-4 text-gray-400 mr-2" />
              <div>
                <div className="text-gray-600">Temp</div>
                <div className="font-medium text-gray-900">{temperature.toFixed(1)}°C</div>
              </div>
            </div>
          </div>
          
          {/* Alert Badge */}
          <div className="pt-3">
            {getAlertBadge(site.alertStatus)}
          </div>
          
          {/* Last Updated or No Data indicator */}
          <div className="text-xs text-gray-500 pt-2 border-t border-gray-100">
            {site.latestReading?.capturedAt ? (
              `Last updated: ${new Date(site.latestReading.capturedAt).toLocaleTimeString()}`
            ) : (
              <span className="text-orange-600 font-medium">No sensor readings available</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}