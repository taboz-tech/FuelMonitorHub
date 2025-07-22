import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, AlertTriangle, Power } from "lucide-react";

interface SystemStatus {
  sitesOnline: number;
  totalSites: number;
  lowFuelAlerts: number;
  generatorsRunning: number;
}

interface StatusOverviewProps {
  systemStatus: SystemStatus;
}

export default function StatusOverview({ systemStatus }: StatusOverviewProps) {
  return (
    <Card className="bg-white rounded-xl shadow-sm border border-gray-200">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-gray-900">
          System Status Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
            <div className="flex items-center">
              <CheckCircle className="text-green-500 text-xl mr-3" />
              <div>
                <p className="font-medium text-gray-900">Sites Online</p>
                <p className="text-sm text-gray-600">All monitoring systems active</p>
              </div>
            </div>
            <span className="text-2xl font-bold text-green-500">
              {systemStatus.sitesOnline}/{systemStatus.totalSites}
            </span>
          </div>

          <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg">
            <div className="flex items-center">
              <AlertTriangle className="text-red-500 text-xl mr-3" />
              <div>
                <p className="font-medium text-gray-900">Low Fuel Alerts</p>
                <p className="text-sm text-gray-600">Sites below 25% threshold</p>
              </div>
            </div>
            <span className="text-2xl font-bold text-red-500">
              {systemStatus.lowFuelAlerts}
            </span>
          </div>

          <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center">
              <Power className="text-primary text-xl mr-3" />
              <div>
                <p className="font-medium text-gray-900">Generators Running</p>
                <p className="text-sm text-gray-600">Currently operational units</p>
              </div>
            </div>
            <span className="text-2xl font-bold text-primary">
              {systemStatus.generatorsRunning}/{systemStatus.totalSites}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
