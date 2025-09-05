// client/src/App.tsx - Updated with centralized authentication
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Analytics from "@/pages/analytics";
import Users from "@/pages/users";
import SystemConfig from "@/pages/system-config";
import NotFound from "@/pages/not-found";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

function AppContent() {
  const { checkingAuth, isAuthenticated } = useAuth();

  // Show global loading spinner while checking authentication
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Loader2 className="animate-spin h-12 w-12 text-blue-600 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-700">Initializing Application</h2>
            <p className="text-gray-500">Checking authentication status...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/login" component={Login} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/users" component={Users} />
      <Route path="/system-config" component={SystemConfig} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <AppContent />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;