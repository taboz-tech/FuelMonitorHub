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

  useEffect(() => {
    // Check for existing token on app initialization
    const token = localStorage.getItem('auth_token');
    if (token) {
      // Verify token is still valid by making a test request using apiRequest
      apiRequest('GET', '/api/dashboard')
        .then(response => {
          if (response.ok) {
            // Token is valid, get user info from token
            const payload = JSON.parse(atob(token.split('.')[1]));
            setUser({
              id: payload.id,
              username: payload.username,
              email: payload.email,
              role: payload.role,
              fullName: payload.fullName,
              isActive: true,
              lastLogin: null,
              createdAt: new Date(),
            });
          } else {
            // Token is invalid, remove it
            localStorage.removeItem('auth_token');
          }
        })
        .catch(() => {
          // Network error or token invalid
          localStorage.removeItem('auth_token');
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (username: string, password: string) => {
    try {
      const response = await apiRequest("POST", "/api/auth/login", {
        username,
        password,
      });
      
      const data: AuthResponse = await response.json();
      
      // Store token
      localStorage.setItem('auth_token', data.token);
      
      // Set user
      setUser(data.user);
      
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const logout = () => {
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