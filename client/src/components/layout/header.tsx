// client/src/components/layout/header.tsx - Updated for external API
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Fuel, ChevronDown, LogOut, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Header() {
  const { user, logout } = useAuth();
  const { toast } = useToast();

  // Admin view mode toggle - only fetch if user is admin
  const { data: viewModeData } = useQuery<{ viewMode: string }>({
    queryKey: ["/api/admin/view-mode"],
    enabled: user?.role === 'admin',
    staleTime: 30000, // 30 seconds
  });

  const updateViewModeMutation = useMutation({
    mutationFn: async (viewMode: string) => {
      await apiRequest("PUT", "/api/admin/view-mode", { viewMode });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/view-mode"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({
        title: "View Mode Updated",
        description: `Switched to ${viewModeData?.viewMode === 'closing' ? 'real-time' : 'daily closing'} view`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update view mode",
        variant: "destructive",
      });
    },
  });

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
      // Force logout even if API call fails
      window.location.href = '/login';
    }
  };

  const handleViewModeToggle = (mode: string) => {
    updateViewModeMutation.mutate(mode);
  };

  const getInitials = (fullName: string) => {
    return fullName
      .split(' ')
      .map(name => name.charAt(0).toUpperCase())
      .join('')
      .slice(0, 2);
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-100 text-red-600 border-red-200';
      case 'supervisor':
        return 'bg-blue-100 text-blue-600 border-blue-200';
      case 'manager':
        return 'bg-green-100 text-green-600 border-green-200';
      default:
        return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo and Title */}
          <div className="flex items-center">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center mr-3">
              <Fuel className="text-white text-sm" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">Fuel Monitor Portal</h1>
          </div>

          {/* Admin Toggle (Only for Admin Users) */}
          {user?.role === 'admin' && (
            <div className="flex items-center space-x-4">
              <span className="text-sm font-medium text-gray-700">Data View:</span>
              <div className="flex items-center bg-gray-100 rounded-lg p-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-all duration-200 ${
                    viewModeData?.viewMode === 'closing'
                      ? 'bg-primary text-white'
                      : 'text-gray-700 hover:bg-gray-200'
                  }`}
                  onClick={() => handleViewModeToggle('closing')}
                  disabled={updateViewModeMutation.isPending}
                >
                  Daily Closing
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-all duration-200 ${
                    viewModeData?.viewMode === 'realtime'
                      ? 'bg-primary text-white'
                      : 'text-gray-700 hover:bg-gray-200'
                  }`}
                  onClick={() => handleViewModeToggle('realtime')}
                  disabled={updateViewModeMutation.isPending}
                >
                  Real-time
                </Button>
              </div>
            </div>
          )}

          {/* User Menu */}
          <div className="flex items-center space-x-4">
            {/* Role Badge */}
            <Badge className={getRoleBadgeColor(user?.role || '')}>
              <User className="w-3 h-3 mr-1" />
              {user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'User'}
            </Badge>

            {/* User Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center space-x-2 hover:bg-gray-100">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-primary text-white text-sm">
                      {user?.fullName ? getInitials(user.fullName) : 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium">{user?.fullName}</span>
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
}