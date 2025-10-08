// client/src/components/auth/protected-route.tsx - Updated with Loading Component
import { ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { PageLoading } from '@/components/ui/loading';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: string[];
  fallbackMessage?: string;
}

export default function ProtectedRoute({ 
  children, 
  allowedRoles,
  fallbackMessage 
}: ProtectedRouteProps) {
  const { user, checkingAuth } = useAuth();

  // Show loading screen while checking authentication
  if (checkingAuth) {
    return (
      <PageLoading 
        message="Checking authentication..." 
        submessage="Please wait while we verify your access"
      />
    );
  }

  // If not authenticated, show nothing (redirect will happen in useAuth)
  if (!user) {
    return (
      <PageLoading 
        message="Redirecting to login..." 
        submessage="You need to be logged in to access this page"
      />
    );
  }

  // Check role-based access
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md mx-4">
          <CardContent className="pt-6 text-center">
            <Shield className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Access Restricted</h2>
            <p className="text-gray-600 mb-4">
              {fallbackMessage || `This section requires ${allowedRoles.join(' or ')} access.`}
            </p>
            <p className="text-sm text-gray-500 mb-4">
              Current role: <span className="font-medium capitalize">{user.role}</span>
            </p>
            <Button onClick={() => window.location.href = '/dashboard'}>
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // User is authenticated and has proper role
  return <>{children}</>;
}