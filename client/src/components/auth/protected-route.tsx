// client/src/components/auth/protected-route.tsx
import { ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, Shield } from 'lucide-react';

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

  // Show loading spinner while checking authentication
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-700">Checking authentication...</h2>
          <p className="text-gray-500">Please wait</p>
        </div>
      </div>
    );
  }

  // If not authenticated, show nothing (redirect will happen in useAuth)
  if (!user) {
    return null;
  }

  // Check role-based access
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Shield className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Access Restricted</h2>
            <p className="text-gray-600 mb-4">
              {fallbackMessage || `This section requires ${allowedRoles.join(' or ')} access.`}
            </p>
            <p className="text-sm text-gray-500 mb-4">
              Current role: <span className="font-medium">{user.role}</span>
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