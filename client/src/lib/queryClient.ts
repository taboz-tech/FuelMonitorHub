import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { apiRequest } from "./api";

export const getQueryFn: <T>(options: {
  on401: "returnNull" | "throw";
}) => QueryFunction<T> = 
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    try {
      const url = queryKey.join("");
      console.log('Query function called for:', url);
      
      const res = await apiRequest("GET", url);
      const data = await res.json();
      
      console.log('Query successful for:', url, data);
      return data;
    } catch (error) {
      console.error('Query failed for:', queryKey.join(""), error);
      
      if (error.message.includes('401') || error.message.includes('authentication')) {
        if (unauthorizedBehavior === "returnNull") {
          return null;
        }
        // Let the error bubble up to trigger auth handling
        throw error;
      }
      
      throw error;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 30000, // 30 seconds
      retry: (failureCount, error) => {
        console.log('Query retry check:', { failureCount, error: error.message });
        
        // Don't retry auth errors
        if (error.message.includes('authentication') || 
            error.message.includes('401') || 
            error.message.includes('403') ||
            error.message.includes('HTML')) {
          return false;
        }
        
        // Retry up to 2 times for other errors
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: false,
    },
  },
});