// Replace client/src/lib/queryClient.ts - Remove timeouts for large datasets

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
      staleTime: 60000, // 1 minute stale time
      // ❌ REMOVED ALL RETRY AND TIMEOUT LOGIC - Let large queries complete
      retry: false, // No retries for large datasets
      retryDelay: 0,
    },
    mutations: {
      retry: false, // No retries for processing operations
    },
  },
});