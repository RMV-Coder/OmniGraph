import { useState, useCallback } from 'react';
import type { HttpMethod, ProxyRequest, ProxyResponse } from '../types';

export interface ApiClientState {
  request: ProxyRequest;
  response: ProxyResponse | null;
  loading: boolean;
  error: string | null;
}

const DEFAULT_BASE_URL = 'http://localhost:3000';

const DEFAULT_REQUEST: ProxyRequest = {
  method: 'GET',
  url: '',
  headers: {},
  queryParams: {},
  body: null,
};

export function useApiClient() {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [request, setRequest] = useState<ProxyRequest>({ ...DEFAULT_REQUEST });
  const [response, setResponse] = useState<ProxyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setMethod = useCallback((method: HttpMethod) => {
    setRequest(prev => ({ ...prev, method }));
  }, []);

  const setUrl = useCallback((url: string) => {
    setRequest(prev => ({ ...prev, url }));
  }, []);

  const setHeader = useCallback((key: string, value: string) => {
    setRequest(prev => ({
      ...prev,
      headers: { ...prev.headers, [key]: value },
    }));
  }, []);

  const removeHeader = useCallback((key: string) => {
    setRequest(prev => {
      const headers = { ...prev.headers };
      delete headers[key];
      return { ...prev, headers };
    });
  }, []);

  const setQueryParam = useCallback((key: string, value: string) => {
    setRequest(prev => ({
      ...prev,
      queryParams: { ...prev.queryParams, [key]: value },
    }));
  }, []);

  const removeQueryParam = useCallback((key: string) => {
    setRequest(prev => {
      const queryParams = { ...prev.queryParams };
      delete queryParams[key];
      return { ...prev, queryParams };
    });
  }, []);

  const setBody = useCallback((body: string | null) => {
    setRequest(prev => ({ ...prev, body }));
  }, []);

  const prefill = useCallback((method: HttpMethod, url: string) => {
    setRequest({
      method,
      url,
      headers: { 'Content-Type': 'application/json' },
      queryParams: {},
      body: null,
    });
    setResponse(null);
    setError(null);
  }, []);

  const send = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      // Resolve the full URL: if the user typed a full URL (http://...), use as-is.
      // Otherwise, prepend the base URL.
      let fullUrl = request.url;
      if (fullUrl && !/^https?:\/\//i.test(fullUrl)) {
        // Strip trailing slash from base, ensure leading slash on path
        const base = baseUrl.replace(/\/+$/, '');
        const urlPath = fullUrl.startsWith('/') ? fullUrl : '/' + fullUrl;
        fullUrl = base + urlPath;
      }

      const res = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...request, url: fullUrl }),
      });

      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        throw new Error(`Proxy returned non-JSON response (${res.status} ${res.statusText})`);
      }

      const data: ProxyResponse = await res.json();
      setResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [request, baseUrl]);

  const reset = useCallback(() => {
    setRequest({ ...DEFAULT_REQUEST });
    setResponse(null);
    setError(null);
  }, []);

  return {
    baseUrl,
    setBaseUrl,
    request,
    response,
    loading,
    error,
    setMethod,
    setUrl,
    setHeader,
    removeHeader,
    setQueryParam,
    removeQueryParam,
    setBody,
    prefill,
    send,
    reset,
  };
}
