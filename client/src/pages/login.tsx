// client/src/pages/login.tsx - Updated for external API
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { loginSchema, type LoginRequest } from "@shared/schema";
import { Fuel ,User } from "lucide-react";

export default function Login() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { login, isAuthenticated, checkingAuth } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<LoginRequest>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (!checkingAuth && isAuthenticated) {
      console.log('🏠 Already authenticated, redirecting to dashboard');
      setLocation("/dashboard");
    }
  }, [checkingAuth, isAuthenticated, setLocation]);

  // Show loading spinner while checking auth
  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h2 className="text-lg font-semibold text-gray-700">Checking authentication...</h2>
            <p className="text-gray-500">Please wait</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Don't show login page if already authenticated (redirect will happen)
  if (isAuthenticated) {
    return null;
  }

  const onSubmit = async (data: LoginRequest) => {
    try {
      setIsLoading(true);
      console.log('🔐 Attempting login with external API...');
      
      await login(data.username, data.password);
      // Login function will handle the redirect to dashboard
      
    } catch (error: any) {
      console.error('❌ Login failed:', error);
      
      let errorMessage = "Invalid credentials. Please try again.";
      if (error.message.includes('404') || error.message.includes('500')) {
        errorMessage = "Login service is currently unavailable. Please try again later.";
      } else if (error.message.includes('network') || error.message.includes('fetch')) {
        errorMessage = "Network connection error. Please check your internet connection.";
      }
      
      toast({
        title: "Login Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
      <div className="w-full max-w-md">
        <Card className="shadow-xl">
          <CardContent className="p-8">
            {/* Company Logo Area */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-primary rounded-xl mx-auto flex items-center justify-center mb-4">
                <Fuel className="text-white text-2xl" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Fuel Monitor Portal</h1>
              <p className="text-gray-600 mt-2">Sensor Data Management System</p>
            </div>

            {/* Login Form */}
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div>
                <Label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                  Username
                </Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition duration-200"
                  {...form.register("username")}
                  disabled={isLoading}
                />
                {form.formState.errors.username && (
                  <p className="text-red-500 text-sm mt-1">{form.formState.errors.username.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition duration-200"
                  {...form.register("password")}
                  disabled={isLoading}
                />
                {form.formState.errors.password && (
                  <p className="text-red-500 text-sm mt-1">{form.formState.errors.password.message}</p>
                )}
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-primary text-white py-3 px-4 rounded-lg hover:bg-primary/90 transition duration-200 font-medium"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Signing In...
                  </>
                ) : (
                  <>
                    <User className="w-4 h-4 mr-2" />
                    Sign In
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">
                Authorized personnel only • Contact admin for access
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}