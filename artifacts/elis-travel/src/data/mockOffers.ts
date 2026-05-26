import { OfferDTO } from '../types/mocks';

export const MOCK_OFFERS: OfferDTO[] = [
  {
    id: 'off-101',
    title: 'Fuga Romantica alle Maldive',
    destination: 'Maldive',
    durationDays: 8,
    durationNights: 7,
    priceFrom: 2450.00,
    status: 'published',
    createdAt: '2026-03-15T10:00:00Z',
    imageUrl: '/images/dest-greece.png' // Using an existing image just for visual
  },
  {
    id: 'off-102',
    title: 'Giappone Classico e Moderno',
    destination: 'Tokyo, Kyoto, Osaka',
    durationDays: 14,
    durationNights: 13,
    priceFrom: 3200.00,
    status: 'published',
    createdAt: '2026-04-01T09:30:00Z',
    imageUrl: '/images/dest-japan.png'
  },
  {
    id: 'off-103',
    title: 'Tour della Svizzera in Treno',
    destination: 'Alpi Svizzere',
    durationDays: 5,
    durationNights: 4,
    priceFrom: 850.00,
    status: 'draft',
    createdAt: '2026-04-18T14:15:00Z',
    imageUrl: '/images/dest-swiss.png'
  },
  {
    id: 'off-104',
    title: 'Estate in Sardegna',
    destination: 'Costa Smeralda',
    durationDays: 7,
    durationNights: 6,
    priceFrom: 1100.00,
    status: 'archived',
    createdAt: '2025-12-10T11:00:00Z',
  }
];
