import { useState, useCallback } from 'react';
import type { HttpMethod, ProxyRequest, ProxyResponse } from '../types';

export interface ApiClientState {
  request: ProxyRequest;
  response: ProxyResponse | null;
  loading: boolean;
  error: string | null;
}

const DEFAULT_REQUEST: ProxyRequest = {
  method: 'GET',
  url: '',
  headers: {},
  queryParams: {},
  body: null,
};

export function useApiClient() {
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
      const res = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      const data: ProxyResponse = await res.json();
      setResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [request]);

  const reset = useCallback(() => {
    setRequest({ ...DEFAULT_REQUEST });
    setResponse(null);
    setError(null);
  }, []);

  return {
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
