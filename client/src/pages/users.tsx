import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import Header from "@/components/layout/header";
import Sidebar from "@/components/layout/sidebar";
import UserDialog from "@/components/users/user-dialog";
import DeleteUserDialog from "@/components/users/delete-user-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Plus, Edit, Trash2, Search, Users2, Filter, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { type User } from "@shared/schema";

export default function Users() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // State management
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Omit<User, 'password'> | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/login");
    } else if (user?.role !== 'admin') {
      setLocation("/dashboard");
    }
  }, [isAuthenticated, user, setLocation]);

  // Fetch users
  const { data: users, isLoading, error } = useQuery<Omit<User, 'password'>[]>({
    queryKey: ["/api/users"],
    enabled: isAuthenticated && user?.role === 'admin',
    staleTime: 30000, // 30 seconds
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async (userData: any) => {
      console.log('Creating user with data:', userData);
      const { siteIds, ...userDataWithoutSites } = userData;
      
      // First create the user
      const response = await apiRequest("POST", "/api/users", userDataWithoutSites);
      const newUser = await response.json();
      
      // Then assign sites if needed and not admin
      if (userData.role !== 'admin' && siteIds && siteIds.length > 0) {
        console.log('Assigning sites to new user:', siteIds);
        await apiRequest("POST", `/api/users/${newUser.id}/sites`, { siteIds });
      }
      
      return newUser;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Success",
        description: "User created successfully with site assignments",
      });
    },
    onError: (error: any) => {
      console.error("Create user error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create user",
        variant: "destructive",
      });
    },
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async ({ id, userData }: { id: number; userData: any }) => {
      console.log('Updating user with data:', userData);
      const { siteIds, ...userDataWithoutSites } = userData;
      
      // First update the user
      const response = await apiRequest("PUT", `/api/users/${id}`, userDataWithoutSites);
      const updatedUser = await response.json();
      
      // Then update site assignments if needed and not admin
      if (userData.role !== 'admin' && siteIds !== undefined) {
        console.log('Updating site assignments:', siteIds);
        await apiRequest("POST", `/api/users/${id}/sites`, { siteIds });
      }
      
      return updatedUser;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Success",
        description: "User updated successfully with site assignments",
      });
    },
    onError: (error: any) => {
      console.error("Update user error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update user",
        variant: "destructive",
      });
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      await apiRequest("DELETE", `/api/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Success",
        description: "User deleted successfully",
      });
    },
    onError: (error: any) => {
      console.error("Delete user error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete user",
        variant: "destructive",
      });
    },
  });

  // Event handlers
  const handleAddUser = () => {
    setSelectedUser(null);
    setUserDialogOpen(true);
  };

  const handleEditUser = (userToEdit: Omit<User, 'password'>) => {
    setSelectedUser(userToEdit);
    setUserDialogOpen(true);
  };

  const handleDeleteUser = (userToDelete: Omit<User, 'password'>) => {
    setSelectedUser(userToDelete);
    setDeleteDialogOpen(true);
  };

  const handleUserSubmit = async (userData: any) => {
    if (selectedUser) {
      // Update existing user
      await updateUserMutation.mutateAsync({ 
        id: selectedUser.id, 
        userData 
      });
    } else {
      // Create new user
      await createUserMutation.mutateAsync(userData);
    }
  };

  const handleDeleteConfirm = async () => {
    if (selectedUser) {
      await deleteUserMutation.mutateAsync(selectedUser.id);
    }
  };

  // Utility functions
  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'supervisor':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'manager':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getInitials = (fullName: string) => {
    return fullName
      .split(' ')
      .map(name => name.charAt(0).toUpperCase())
      .join('')
      .slice(0, 2);
  };

  // Filter users based on search term and role filter
  const filteredUsers = users?.filter(userItem => {
    const matchesSearch = userItem.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         userItem.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         userItem.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRole = roleFilter === "all" || userItem.role === roleFilter;
    
    return matchesSearch && matchesRole;
  }) || [];

  // Get role statistics
  const roleStats = users?.reduce((acc, user) => {
    acc[user.role] = (acc[user.role] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  if (!isAuthenticated || user?.role !== 'admin') {
    return null;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex">
          <Sidebar />
          <main className="flex-1 p-6">
            <Card className="max-w-2xl mx-auto mt-8">
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-red-600 mb-4">
                    <Users2 className="h-12 w-12 mx-auto" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Failed to Load Users
                  </h3>
                  <p className="text-gray-600">{error.message}</p>
                  <Button 
                    onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/users"] })}
                    className="mt-4"
                  >
                    Try Again
                  </Button>
                </div>
              </CardContent>
            </Card>
          </main>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex">
          <Sidebar />
          <main className="flex-1 p-6">
            <div className="animate-pulse space-y-6">
              <div className="flex items-center justify-between">
                <div className="h-8 bg-gray-200 rounded w-1/4"></div>
                <div className="h-10 bg-gray-200 rounded w-32"></div>
              </div>
              <div className="h-96 bg-gray-200 rounded-xl"></div>
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
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <Users2 className="h-7 w-7 text-primary" />
                  User Management
                </h2>
                <p className="text-gray-600 mt-1">Manage user accounts, roles, and site assignments</p>
              </div>
              <Button 
                onClick={handleAddUser}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition duration-200"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add User
              </Button>
            </div>
          </div>

          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Users</p>
                    <p className="text-2xl font-bold text-gray-900">{users?.length || 0}</p>
                  </div>
                  <div className="h-8 w-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Users2 className="h-4 w-4 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Admins</p>
                    <p className="text-2xl font-bold text-red-600">{roleStats.admin || 0}</p>
                  </div>
                  <Badge className="bg-red-100 text-red-800">Admin</Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Supervisors</p>
                    <p className="text-2xl font-bold text-blue-600">{roleStats.supervisor || 0}</p>
                  </div>
                  <Badge className="bg-blue-100 text-blue-800">Supervisor</Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Managers</p>
                    <p className="text-2xl font-bold text-green-600">{roleStats.manager || 0}</p>
                  </div>
                  <Badge className="bg-green-100 text-green-800">Manager</Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters and Search */}
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="Search users by name, username, or email..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-gray-500" />
                  <select 
                    value={roleFilter} 
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  >
                    <option value="all">All Roles</option>
                    <option value="admin">Admins</option>
                    <option value="supervisor">Supervisors</option>
                    <option value="manager">Managers</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Users Table */}
          <Card>
            <CardHeader>
              <CardTitle>
                System Users 
                {searchTerm || roleFilter !== "all" ? (
                  <span className="text-sm font-normal text-gray-500 ml-2">
                    ({filteredUsers.length} of {users?.length || 0} users)
                  </span>
                ) : (
                  <span className="text-sm font-normal text-gray-500 ml-2">
                    ({users?.length || 0} users)
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Site Access
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Last Login
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredUsers.map((userItem) => (
                      <tr key={userItem.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <Avatar className="w-10 h-10 mr-3">
                              <AvatarFallback className="bg-primary text-white text-sm">
                                {getInitials(userItem.fullName)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium text-gray-900">{userItem.fullName}</div>
                              <div className="text-sm text-gray-600">@{userItem.username}</div>
                              <div className="text-sm text-gray-500">{userItem.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge className={getRoleBadgeColor(userItem.role)}>
                            {userItem.role.charAt(0).toUpperCase() + userItem.role.slice(1)}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {userItem.role === 'admin' ? (
                            <div className="flex items-center text-blue-600">
                              <MapPin className="w-4 h-4 mr-1" />
                              <span className="font-medium">All Sites</span>
                            </div>
                          ) : (
                            <div className="flex items-center text-gray-600">
                              <MapPin className="w-4 h-4 mr-1" />
                              <span>
                                {userItem.role === 'manager' ? 'Assigned Site' : 'Multiple Sites'}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {userItem.lastLogin 
                            ? new Date(userItem.lastLogin).toLocaleDateString()
                            : <span className="text-gray-400">Never</span>
                          }
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge className={userItem.isActive 
                            ? "bg-green-100 text-green-800" 
                            : "bg-red-100 text-red-800"
                          }>
                            {userItem.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="text-primary hover:text-primary/80"
                            onClick={() => handleEditUser(userItem)}
                          >
                            <Edit className="w-4 h-4 mr-1" />
                            Edit
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="text-red-600 hover:text-red-800"
                            onClick={() => handleDeleteUser(userItem)}
                            disabled={userItem.id === user?.id} // Prevent self-deletion
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {filteredUsers.length === 0 && (
                  <div className="text-center py-8">
                    <Users2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      {searchTerm || roleFilter !== "all" ? "No users found" : "No users yet"}
                    </h3>
                    <p className="text-gray-600 mb-4">
                      {searchTerm || roleFilter !== "all" 
                        ? "Try adjusting your search or filter criteria."
                        : "Get started by creating your first user account."
                      }
                    </p>
                    {(!searchTerm && roleFilter === "all") && (
                      <Button onClick={handleAddUser} className="bg-primary">
                        <Plus className="w-4 h-4 mr-2" />
                        Add User
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* User Dialog */}
          <UserDialog
            open={userDialogOpen}
            onOpenChange={setUserDialogOpen}
            user={selectedUser}
            onSubmit={handleUserSubmit}
            isLoading={createUserMutation.isPending || updateUserMutation.isPending}
          />

          {/* Delete Dialog */}
          <DeleteUserDialog
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            user={selectedUser}
            onConfirm={handleDeleteConfirm}
            isLoading={deleteUserMutation.isPending}
          />
        </main>
      </div>
    </div>
  );
}