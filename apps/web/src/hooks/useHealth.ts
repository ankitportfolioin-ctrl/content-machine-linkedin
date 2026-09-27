import { useState, useEffect, useCallback } from 'react';
import { checkHealth, checkReady, HealthResponse } from '../services/api';

export function useHealth() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [ready, setReady] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [healthData, readyData] = await Promise.all([checkHealth(), checkReady()]);
      setHealth(healthData);
      setReady(readyData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check health');
      setHealth(null);
      setReady(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  return { health, ready, loading, error, refetch: fetchHealth };
}