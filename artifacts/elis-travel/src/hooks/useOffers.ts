import { useState, useEffect } from 'react';
import { OfferDTO } from '../types/mocks';
import { MOCK_OFFERS } from '../data/mockOffers';

export function useOffers() {
  const [data, setData] = useState<OfferDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simuliamo un ritardo di rete di 500ms
    const timer = setTimeout(() => {
      setData(MOCK_OFFERS);
      setIsLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  return { data, isLoading };
}
