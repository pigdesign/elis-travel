import { useState, useEffect } from 'react';
import { LeadDTO } from '../types/mocks';
import { MOCK_LEADS } from '../data/mockLeads';

export function useLeads() {
  const [data, setData] = useState<LeadDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simuliamo un ritardo di rete di 400ms
    const timer = setTimeout(() => {
      setData(MOCK_LEADS);
      setIsLoading(false);
    }, 400);

    return () => clearTimeout(timer);
  }, []);

  return { data, isLoading };
}
