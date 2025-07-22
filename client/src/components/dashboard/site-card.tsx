import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Fuel } from "lucide-react";
import { type SiteWithReadings } from "@shared/schema";

interface SiteCardProps {
  site: SiteWithReadings;
}

export default function SiteCard({ site }: SiteCardProps) {
  const getFuelLevelColor = (percentage: number) => {
    if (percentage < 25) return "bg-red-500";
    if (percentage < 50) return "bg-yellow-500";
    return "bg-primary";
  };

  const getStatusDotColor = (status: boolean) => {
    return status ? "bg-green-500" : "bg-red-500";
  };

  const getAlertBadge = (alertStatus: string) => {
    switch (alertStatus) {
      case 'low_fuel':
        return <Badge className="bg-red-100 text-red-800">Low Fuel</Badge>;
      case 'generator_off':
        return <Badge className="bg-yellow-100 text-yellow-800">Generator Off</Badge>;
      default:
        return <Badge className="bg-green-100 text-green-800">Normal</Badge>;
    }
  };

  return (
    <Card className="bg-white rounded-xl shadow-sm border border-gray-200">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <Fuel className="text-primary text-xl" />
            </div>
            <div className="ml-3">
              <h3 className="font-semibold text-gray-900">{site.name}</h3>
              <p className="text-sm text-gray-600">{site.location}</p>
            </div>
          </div>
          <div className="flex space-x-1">
            <div 
              className={`w-3 h-3 rounded-full ${getStatusDotColor(site.generatorOnline)}`}
              title={`Generator ${site.generatorOnline ? 'Online' : 'Offline'}`}
            />
            <div 
              className={`w-3 h-3 rounded-full ${getStatusDotColor(site.zesaOnline)}`}
              title={`ZESA ${site.zesaOnline ? 'Online' : 'Offline'}`}
            />
          </div>
        </div>
        
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Fuel Level</span>
            <span className={`font-bold text-lg ${
              site.fuelLevelPercentage < 25 ? 'text-red-500' : 'text-gray-900'
            }`}>
              {site.fuelLevelPercentage.toFixed(1)}%
            </span>
          </div>
          
          <Progress 
            value={site.fuelLevelPercentage} 
            className="w-full h-2"
          />
          
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">
              Volume: {site.latestReading?.fuelVolume || '0'}L
            </span>
            <span className="text-gray-600">
              Temp: {site.latestReading?.temperature || '0'}°C
            </span>
          </div>
          
          <div className="pt-2">
            {getAlertBadge(site.alertStatus)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
