import { useState, useEffect } from 'react';
import { ExcursionDTO } from '../types/mocks';
import { MOCK_EXCURSIONS } from '../data/mockExcursions';

export function useExcursions() {
  const [data, setData] = useState<ExcursionDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simuliamo un ritardo di rete di 600ms per dare realismo alla UI (loading state)
    const timer = setTimeout(() => {
      setData(MOCK_EXCURSIONS);
      setIsLoading(false);
    }, 600);

    return () => clearTimeout(timer);
  }, []);

  return { data, isLoading };
}
