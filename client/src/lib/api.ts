// Replace your client/src/lib/api.ts with this:

import { queryClient } from "./queryClient";

// Get the API base URL from environment variable
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://154.119.80.28:4172';

console.log('API Base URL:', API_BASE_URL); // Debug log

let isRefreshing = false;
let refreshPromise: Promise<string> | null = null;

async function refreshToken(): Promise<string> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = new Promise(async (resolve, reject) => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('No token to refresh');
      }

      // Try to refresh the token or re-authenticate
      // For now, we'll just redirect to login if token fails
      throw new Error('Token refresh needed');
    } catch (error) {
      // Clear invalid token and redirect to login
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
      reject(error);
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  });

  return refreshPromise;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  retryCount: number = 0
): Promise<Response> {
  const token = localStorage.getItem('auth_token');
  
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Construct full URL
  const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;
  
  console.log(`Making API request to: ${fullUrl}`); // Debug log

  try {
    const res = await fetch(fullUrl, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });

    // Check if response is HTML (login page) instead of JSON
    const contentType = res.headers.get('content-type');
    const isHtml = contentType?.includes('text/html');
    
    if (isHtml) {
      console.error('Received HTML instead of JSON - likely authentication issue');
      // Clear token and redirect to login
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
      throw new Error('Authentication required - redirecting to login');
    }

    if (!res.ok) {
      // Handle different error cases
      if (res.status === 401 || res.status === 403) {
        console.log('Authentication failed, clearing token');
        localStorage.removeItem('auth_token');
        window.location.href = '/login';
        throw new Error(`Authentication failed: ${res.status}`);
      }
      
      let errorMessage;
      try {
        const errorText = await res.text();
        errorMessage = errorText || res.statusText;
      } catch (e) {
        errorMessage = res.statusText;
      }
      
      throw new Error(`${res.status}: ${errorMessage}`);
    }

    // Verify we have JSON response
    const responseText = await res.text();
    if (!responseText.trim()) {
      throw new Error('Empty response from server');
    }

    // Try to parse JSON
    try {
      const jsonData = JSON.parse(responseText);
      // Return a Response-like object with the parsed data
      return {
        ok: true,
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
        json: async () => jsonData,
        text: async () => responseText,
      } as Response;
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      console.error('Response text:', responseText.substring(0, 200));
      
      // If it looks like HTML, redirect to login
      if (responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
        localStorage.removeItem('auth_token');
        window.location.href = '/login';
        throw new Error('Received HTML instead of JSON - authentication required');
      }
      
      throw new Error(`Invalid JSON response: ${parseError.message}`);
    }

  } catch (error) {
    console.error(`API request failed (attempt ${retryCount + 1}):`, error);
    
    // Retry logic for network errors (not auth errors)
    if (retryCount < 2 && !error.message.includes('authentication') && !error.message.includes('HTML')) {
      console.log(`Retrying request (${retryCount + 1}/2)...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
      return apiRequest(method, url, data, retryCount + 1);
    }
    
    throw error;
  }
}

export { queryClient };