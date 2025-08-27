import { queryClient } from "./queryClient";

// Get the API base URL from environment variable
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://154.119.80.28:4172';

console.log('API Base URL:', API_BASE_URL);

let isRefreshing = false;

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
  
  console.log(`🌐 API Request: ${method} ${fullUrl} (attempt ${retryCount + 1})`);

  // 🚀 NO TIMEOUT - Let the API take as long as it needs for large datasets
  try {
    const res = await fetch(fullUrl, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
      // ❌ REMOVED: signal: controller.signal (no more timeout)
    });

    // Check if response is HTML (login page) instead of JSON
    const contentType = res.headers.get('content-type');
    const isHtml = contentType?.includes('text/html');
    
    if (isHtml) {
      console.error('🚨 Received HTML instead of JSON - likely authentication issue');
      console.error('Response status:', res.status);
      console.error('Response headers:', Object.fromEntries(res.headers.entries()));
      
      // For auth endpoints, don't clear token immediately
      if (!url.includes('/auth/')) {
        localStorage.removeItem('auth_token');
        window.location.href = '/login';
      }
      throw new Error('Server returned HTML instead of JSON');
    }

    // Log response details for debugging
    console.log(`📊 API Response: ${res.status} ${res.statusText}`);

    if (!res.ok) {
      // Handle different error cases
      if (res.status === 401 || res.status === 403) {
        console.log('🔒 Authentication failed, status:', res.status);
        
        // Only clear token and redirect for non-auth endpoints
        if (!url.includes('/auth/')) {
          localStorage.removeItem('auth_token');
          window.location.href = '/login';
        }
        throw new Error(`Authentication failed: ${res.status}`);
      }
      
      let errorMessage;
      try {
        const errorData = await res.json();
        errorMessage = errorData.message || res.statusText;
      } catch (e) {
        const errorText = await res.text();
        errorMessage = errorText || res.statusText;
      }
      
      console.error(`❌ API Error: ${res.status} - ${errorMessage}`);
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
      console.log(`✅ API Success: ${method} ${url.split('?')[0]}`);
      
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
      console.error('❌ JSON parse error:', parseError);
      console.error('Response preview:', responseText.substring(0, 200));
      
      // If it looks like HTML, it's likely an auth redirect
      if (responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
        if (!url.includes('/auth/')) {
          localStorage.removeItem('auth_token');
          window.location.href = '/login';
        }
        throw new Error('Received HTML instead of JSON');
      }
      
      throw new Error(`Invalid JSON response: ${parseError.message}`);
    }

  } catch (error) {
    console.error(`❌ API request failed (attempt ${retryCount + 1}):`, error);
    
    // Retry logic for network errors (not auth errors) - REDUCED retries for faster feedback
    if (retryCount < 1 && 
        !error.message.includes('authentication') && 
        !error.message.includes('HTML') &&
        !error.message.includes('401') &&
        !error.message.includes('403')) {
      console.log(`🔄 Retrying request (${retryCount + 1}/1)...`);
      await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)));
      return apiRequest(method, url, data, retryCount + 1);
    }
    
    throw error;
  }
}

export { queryClient };