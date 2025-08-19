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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<Omit<User, 'password'> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();

  const validateToken = async (token: string): Promise<boolean> => {
    try {
      console.log('🔍 Validating token...');
      
      // Call the auth validation endpoint
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
      
      return {
        id: payload.id,
        username: payload.username,
        email: payload.email,
        role: payload.role,
        fullName: payload.fullName,
        isActive: true,
        lastLogin: null,
        createdAt: new Date(),
      };
    } catch (error) {
      console.error('❌ Error parsing token:', error);
      return null;
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('auth_token');
      
      if (token) {
        console.log('🔑 Found existing token, checking validity...');
        
        // First check if token is expired locally
        const userData = parseTokenPayload(token);
        if (!userData) {
          console.log('🗑️ Token expired or invalid, removing...');
          localStorage.removeItem('auth_token');
          setIsLoading(false);
          return;
        }
        
        // Token looks valid, now validate with server
        const isValid = await validateToken(token);
        
        if (!isValid) {
          console.log('🗑️ Server rejected token, removing...');
          localStorage.removeItem('auth_token');
          setUser(null);
        } else {
          // Token is valid and user is already set by validateToken
          console.log('✅ Authentication restored from stored token');
        }
      } else {
        console.log('🔍 No token found in localStorage');
      }
      
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (username: string, password: string) => {
    try {
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
    } catch (error) {
      console.error('❌ Login error:', error);
      throw error;
    }
  };

  const logout = () => {
    console.log('🚪 Logging out...');
    localStorage.removeItem('auth_token');
    setUser(null);
    setLocation('/login');
  };

  const value = {
    user,
    isAuthenticated: !!user,
    login,
    logout,
    isLoading,
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