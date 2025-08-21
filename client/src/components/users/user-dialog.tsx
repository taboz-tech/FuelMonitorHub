import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, User, Mail, Lock, UserCheck, MapPin } from "lucide-react";
import type { User as UserType } from "@shared/schema";

const userFormSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Please enter a valid email"),
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  role: z.enum(["admin", "supervisor", "manager"]),
  password: z.string().min(6, "Password must be at least 6 characters").optional(),
  isActive: z.boolean().default(true),
  siteIds: z.array(z.number()).optional(),
});

type UserFormValues = z.infer<typeof userFormSchema>;

interface Site {
  id: number;
  name: string;
  location: string;
  deviceId: string;
}

interface UserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: Omit<UserType, 'password'> | null;
  onSubmit: (data: UserFormValues) => Promise<void>;
  isLoading: boolean;
}

export default function UserDialog({ 
  open, 
  onOpenChange, 
  user, 
  onSubmit,
  isLoading 
}: UserDialogProps) {
  const isEdit = !!user;
  const [selectedSites, setSelectedSites] = useState<number[]>([]);
  
  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      username: "",
      email: "",
      fullName: "",
      role: "manager",
      password: "",
      isActive: true,
      siteIds: [],
    },
  });

  // Watch the role field to show/hide site assignments
  const selectedRole = form.watch("role");

  // Get all available sites for assignment
  const { data: sites } = useQuery<Site[]>({
    queryKey: ["/api/sites"],
    enabled: open && (selectedRole === 'manager' || selectedRole === 'supervisor'),
  });

  // Get existing user site assignments if editing
  const { data: userSites } = useQuery<{ siteId: number; siteName: string; siteLocation: string; }[]>({
    queryKey: [`/api/users/${user?.id}/sites`],
    enabled: open && isEdit && !!user?.id && (selectedRole === 'manager' || selectedRole === 'supervisor'),
  });

  // Reset form when dialog opens/closes or user changes
  useEffect(() => {
    if (open && user) {
      // Edit mode - populate form with existing user data
      form.reset({
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role as "admin" | "supervisor" | "manager",
        password: "", // Always empty for edit
        isActive: user.isActive,
        siteIds: [],
      });
    } else if (open) {
      // Add mode - reset to defaults
      form.reset({
        username: "",
        email: "",
        fullName: "",
        role: "manager",
        password: "",
        isActive: true,
        siteIds: [],
      });
      setSelectedSites([]);
    }
  }, [open, user, form]);

  // Update selected sites when user sites data loads
  useEffect(() => {
    if (userSites && isEdit) {
      const siteIds = userSites.map(us => us.siteId);
      setSelectedSites(siteIds);
      form.setValue('siteIds', siteIds);
    }
  }, [userSites, isEdit, form]);

  // Update form siteIds when selectedSites changes
  useEffect(() => {
    form.setValue('siteIds', selectedSites);
  }, [selectedSites, form]);

  const handleSiteToggle = (siteId: number) => {
    setSelectedSites(prev => {
      if (prev.includes(siteId)) {
        return prev.filter(id => id !== siteId);
      } else {
        if (selectedRole === 'manager') {
          // Manager can only be assigned to one site
          return [siteId];
        } else {
          // Supervisor can be assigned to multiple sites
          return [...prev, siteId];
        }
      }
    });
  };

  const handleSubmit = async (data: UserFormValues) => {
    try {
      // Include site assignments in the submission
      const submitData = {
        ...data,
        siteIds: selectedRole === 'admin' ? [] : selectedSites,
      };

      await onSubmit(submitData);
      
      // If this is a new user or we have site assignments to update
      if (selectedRole !== 'admin' && selectedSites.length > 0) {
        // Handle site assignments (will be done in parent component)
        console.log('Site assignments:', selectedSites);
      }

      form.reset();
      setSelectedSites([]);
      onOpenChange(false);
    } catch (error) {
      console.error("Form submission error:", error);
    }
  };

  const handleCancel = () => {
    form.reset();
    setSelectedSites([]);
    onOpenChange(false);
  };

  const getRoleDescription = (role: string) => {
    switch (role) {
      case 'admin':
        return 'Full system access to all sites and administration';
      case 'supervisor':
        return 'Access to multiple assigned sites';
      case 'manager':
        return 'Access to one assigned site only';
      default:
        return '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" />
            {isEdit ? "Edit User" : "Add New User"}
          </DialogTitle>
          <DialogDescription>
            {isEdit 
              ? "Update user information, role and site assignments." 
              : "Create a new user account with appropriate role and site assignments."
            }
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              {/* Username */}
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Username
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter username"
                        {...field}
                        disabled={isEdit} // Username can't be changed in edit mode
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Role */}
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="supervisor">Supervisor</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="text-xs text-gray-600 mt-1">
                      {getRoleDescription(field.value)}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Full Name */}
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter full name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Email */}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="Enter email address" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Password */}
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    {isEdit ? "New Password (optional)" : "Password"}
                  </FormLabel>
                  <FormControl>
                    <Input 
                      type="password" 
                      placeholder={isEdit ? "Leave blank to keep current password" : "Enter password"}
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Site Assignments - Only show for Manager and Supervisor */}
            {(selectedRole === 'manager' || selectedRole === 'supervisor') && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  <span className="font-medium">
                    Site Assignments {selectedRole === 'manager' ? '(Select One)' : '(Select Multiple)'}
                  </span>
                </div>
                
                {sites && sites.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                    {sites.map((site) => (
                      <div key={site.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`site-${site.id}`}
                          checked={selectedSites.includes(site.id)}
                          onCheckedChange={() => handleSiteToggle(site.id)}
                        />
                        <label 
                          htmlFor={`site-${site.id}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                        >
                          <div>
                            <div className="font-medium">{site.name}</div>
                            <div className="text-xs text-gray-500">{site.location} • {site.deviceId}</div>
                          </div>
                        </label>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 p-3 border rounded-lg bg-gray-50">
                    No sites available for assignment. Sites are automatically created from sensor data.
                  </div>
                )}

                {selectedRole === 'manager' && selectedSites.length > 1 && (
                  <div className="text-sm text-orange-600 bg-orange-50 p-2 rounded">
                    ⚠️ Managers can only be assigned to one site. Only the last selected site will be saved.
                  </div>
                )}

                {selectedSites.length > 0 && (
                  <div className="text-sm text-blue-600 bg-blue-50 p-2 rounded">
                    ✅ {selectedSites.length} site{selectedSites.length > 1 ? 's' : ''} selected
                  </div>
                )}
              </div>
            )}

            {/* Admin notice */}
            {selectedRole === 'admin' && (
              <div className="text-sm text-green-600 bg-green-50 p-3 rounded-lg flex items-center gap-2">
                <UserCheck className="h-4 w-4" />
                <span>Admin users have access to all sites automatically. No site assignment needed.</span>
              </div>
            )}

            {/* Active Status */}
            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Active User</FormLabel>
                    <div className="text-sm text-muted-foreground">
                      User can log in and access the system
                    </div>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isLoading}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEdit ? "Update User" : "Create User"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}