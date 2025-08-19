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
      console.log('Validating token...');
      const response = await apiRequest('GET', '/api/dashboard');
      
      if (response.ok) {
        // Token is valid, extract user info from token
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
        console.log('Token validated successfully');
        return true;
      } else {
        console.log('Token validation failed');
        return false;
      }
    } catch (error) {
      console.error('Token validation error:', error);
      return false;
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('auth_token');
      
      if (token) {
        console.log('Found existing token, validating...');
        const isValid = await validateToken(token);
        
        if (!isValid) {
          console.log('Token invalid, removing...');
          localStorage.removeItem('auth_token');
        }
      } else {
        console.log('No token found');
      }
      
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (username: string, password: string) => {
    try {
      console.log('Attempting login...');
      const response = await apiRequest("POST", "/api/auth/login", {
        username,
        password,
      });
      
      const data: AuthResponse = await response.json();
      
      // Store token
      localStorage.setItem('auth_token', data.token);
      
      // Set user
      setUser(data.user);
      
      console.log('Login successful');
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const logout = () => {
    console.log('Logging out...');
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