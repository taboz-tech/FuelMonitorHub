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

  // FIXED: Better timestamp formatting
  const formatLastUpdated = (timestamp: string | Date) => {
    if (!timestamp) return "No data available";
    
    try {
      const date = new Date(timestamp);
      const now = new Date();
      
      // Check if the date is valid
      if (isNaN(date.getTime())) return "Invalid date";
      
      const diffMs = now.getTime() - date.getTime();
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      const months = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
      ];
      
      // Format based on how recent the data is
      if (diffMinutes < 1) {
        return "Just now";
      } else if (diffMinutes < 60) {
        return `${diffMinutes} min${diffMinutes === 1 ? '' : 's'} ago`;
      } else if (diffHours < 24 && date.toDateString() === now.toDateString()) {
        // Same day
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `Today, ${hours}:${minutes}`;
      } else if (diffDays < 7) {
        // Within a week
        const day = date.getDate().toString().padStart(2, '0');
        const month = months[date.getMonth()];
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${day} ${month}, ${hours}:${minutes}`;
      } else {
        // Older than a week
        const day = date.getDate().toString().padStart(2, '0');
        const month = months[date.getMonth()];
        const year = date.getFullYear();
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        
        if (year === now.getFullYear()) {
          return `${day} ${month}, ${hours}:${minutes}`;
        } else {
          return `${day} ${month} ${year}, ${hours}:${minutes}`;
        }
      }
    } catch (error) {
      console.error('Error formatting timestamp:', error);
      return "Invalid date format";
    }
  };

  // FIXED: Handle zero and undefined values properly
  const fuelLevel = Math.max(0, Math.min(100, site.fuelLevelPercentage ?? 0));
  const fuelVolume = site.latestReading?.fuelVolume ? parseFloat(site.latestReading.fuelVolume) : 0;
  const temperature = site.latestReading?.temperature ? parseFloat(site.latestReading.temperature) : 0;

  // Clean up the site name - remove "simbisa-" prefix and make it readable
  const cleanSiteName = site.name
    .replace(/^simbisa-/, '')
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  const cleanLocation = site.location
    .replace('Auto-generated location', '')
    .replace(/^simbisa-/, '')
    .trim() || cleanSiteName;

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
              <h3 className="font-semibold text-gray-900 text-base">{cleanSiteName}</h3>
              <p className="text-sm text-gray-600">{cleanLocation}</p>
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
              style={{ width: `${Math.max(2, fuelLevel)}%` }}
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
          
          {/* FIXED: Last Updated with meaningful timestamp */}
          <div className="text-xs text-gray-500 pt-2 border-t border-gray-100">
            {site.latestReading?.capturedAt ? (
              <>
                <span className="font-medium">Last updated:</span> {formatLastUpdated(site.latestReading.capturedAt)}
              </>
            ) : (
              <span className="text-orange-600 font-medium">No recent sensor data available</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}