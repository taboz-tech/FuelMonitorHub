import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/api";
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

  // Admin view mode toggle
  const { data: viewModeData } = useQuery<{ viewMode: string }>({
    queryKey: ["/api/admin/view-mode"],
    enabled: user?.role === 'admin',
  });

  const updateViewModeMutation = useMutation({
    mutationFn: async (viewMode: string) => {
      await apiRequest("PUT", "/api/admin/view-mode", { viewMode });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/view-mode"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update view mode",
        variant: "destructive",
      });
    },
  });

  const handleLogout = () => {
    logout();
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
        return 'bg-purple-100 text-purple-600';
      case 'supervisor':
        return 'bg-blue-100 text-blue-600';
      case 'manager':
        return 'bg-green-100 text-green-600';
      default:
        return 'bg-gray-100 text-gray-600';
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
                      : 'text-gray-700'
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
                      : 'text-gray-700'
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
                <Button variant="ghost" className="flex items-center space-x-2">
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
