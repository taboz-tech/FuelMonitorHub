import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/api";
import { type User, type AuthResponse } from "@shared/schema";

interface AuthContextType {
  user: Omit<User, 'password'> | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  checkingAuth: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<Omit<User, 'password'> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [location, setLocation] = useLocation();

  // Centralized auth validation function
  const validateToken = async (token: string): Promise<boolean> => {
    try {
      console.log('🔍 Validating token with external API...');
      
      // Call the external API validation endpoint
      const response = await apiRequest('GET', '/api/auth/validate');
      
      if (response.ok) {
        const data = await response.json();
        if (data.valid && data.user) {
          setUser(data.user);
          console.log('✅ Token validated successfully for user:', data.user.username);
          return true;
        }
      }
      
      console.log('❌ Token validation failed - invalid response');
      return false;
    } catch (error) {
      console.error('❌ Token validation error:', error);
      return false;
    }
  };

  const parseTokenPayload = (token: string) => {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const now = Math.floor(Date.now() / 1000);
      
      console.log('📋 Token info:', {
        issuedAt: new Date(payload.iat * 1000),
        expiresAt: new Date(payload.exp * 1000),
        currentTime: new Date(now * 1000),
        isExpired: payload.exp < now,
        user: payload.username
      });
      
      // Check if token is expired
      if (payload.exp < now) {
        console.log('⏰ Token has expired');
        return null;
      }
      
      return payload;
    } catch (error) {
      console.error('❌ Error parsing token:', error);
      return null;
    }
  };

  // Initialize authentication on app load
  useEffect(() => {
    const initAuth = async () => {
      console.log('🔐 Initializing authentication...');
      setCheckingAuth(true);
      
      const token = localStorage.getItem('auth_token');
      
      if (token) {
        console.log('🔑 Found existing token, checking validity...');
        
        // First check if token is expired locally
        const tokenPayload = parseTokenPayload(token);
        if (!tokenPayload) {
          console.log('🗑️ Token expired or invalid, removing...');
          localStorage.removeItem('auth_token');
          setUser(null);
          setCheckingAuth(false);
          return;
        }
        
        // Token looks valid locally, now validate with external API
        const isValid = await validateToken(token);
        
        if (!isValid) {
          console.log('🗑️ External API rejected token, removing...');
          localStorage.removeItem('auth_token');
          setUser(null);
        } else {
          // Token is valid and user is already set by validateToken
          console.log('✅ Authentication restored from stored token');
        }
      } else {
        console.log('🔍 No token found in localStorage');
      }
      
      setCheckingAuth(false);
    };

    initAuth();
  }, []);

  // Global route protection - redirect to login if not authenticated
  useEffect(() => {
    if (!checkingAuth) {
      const publicRoutes = ['/', '/login'];
      const isPublicRoute = publicRoutes.includes(location);
      
      if (!user && !isPublicRoute) {
        console.log(`🚪 Redirecting to login from ${location} - user not authenticated`);
        setLocation('/login');
      } else if (user && (location === '/' || location === '/login')) {
        console.log('🏠 Authenticated user accessing public route, redirecting to dashboard');
        setLocation('/dashboard');
      }
    }
  }, [checkingAuth, user, location, setLocation]);

  const login = async (username: string, password: string) => {
    try {
      setIsLoading(true);
      console.log('🔐 Attempting login for user:', username);
      
      const response = await apiRequest("POST", "/api/auth/login", {
        username,
        password,
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Login failed' }));
        throw new Error(errorData.message || 'Login failed');
      }
      
      const data: AuthResponse = await response.json();
      
      // Store token
      localStorage.setItem('auth_token', data.token);
      
      // Set user
      setUser(data.user);
      
      console.log('✅ Login successful for user:', data.user.username);
      
      // Redirect to dashboard after successful login
      setLocation('/dashboard');
    } catch (error) {
      console.error('❌ Login error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      console.log('🚪 Logging out...');
      
      // Call logout endpoint if user is authenticated
      if (user) {
        try {
          await apiRequest("POST", "/api/auth/logout");
        } catch (error) {
          console.warn('⚠️ Logout API call failed:', error);
          // Continue with local logout even if API call fails
        }
      }
      
      // Clear local state
      localStorage.removeItem('auth_token');
      setUser(null);
      setLocation('/login');
    } catch (error) {
      console.error('❌ Logout error:', error);
      // Force local logout even if API fails
      localStorage.removeItem('auth_token');
      setUser(null);
      setLocation('/login');
    }
  };

  const value = {
    user,
    isAuthenticated: !!user,
    login,
    logout,
    isLoading,
    checkingAuth,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Custom hook for route protection
export function useRequireAuth(allowedRoles?: string[]) {
  const { user, checkingAuth } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!checkingAuth) {
      if (!user) {
        console.log('🚫 Route requires authentication, redirecting to login');
        setLocation('/login');
      } else if (allowedRoles && !allowedRoles.includes(user.role)) {
        console.log(`🚫 Route requires role ${allowedRoles.join(' or ')}, user has ${user.role}`);
        setLocation('/dashboard'); // Redirect to safe route
      }
    }
  }, [checkingAuth, user, allowedRoles, setLocation]);

  return { user, isLoading: checkingAuth };
}