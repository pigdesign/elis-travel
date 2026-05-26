import { LeadDTO } from '../types/mocks';

export const MOCK_LEADS: LeadDTO[] = [
  {
    id: 'ld-001',
    customerName: 'Mario Rossi',
    email: 'mario.rossi@example.com',
    phone: '+39 333 1234567',
    status: 'new',
    createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 mins ago
    notesCount: 0,
    relatedItem: {
      type: 'offer',
      id: 'off-101',
      title: 'Fuga Romantica alle Maldive'
    }
  },
  {
    id: 'ld-002',
    customerName: 'Giulia Bianchi',
    email: 'giulia.b@example.com',
    status: 'contacted',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
    notesCount: 2,
    relatedItem: {
      type: 'excursion',
      id: 'exc-004',
      title: 'Venezia Segreta e Tour Enogastronomico'
    }
  },
  {
    id: 'ld-003',
    customerName: 'Luca Verdi',
    email: 'luca.verdi88@gmail.com',
    phone: '+39 340 9876543',
    status: 'quote_sent',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), // 2 days ago
    notesCount: 5,
    relatedItem: {
      type: 'offer',
      id: 'off-102',
      title: 'Giappone Classico e Moderno'
    }
  },
  {
    id: 'ld-004',
    customerName: 'Francesca Neri',
    email: 'fra.neri@azienda.it',
    status: 'sold',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(), // 5 days ago
    notesCount: 1,
  },
  {
    id: 'ld-005',
    customerName: 'Alessandro Gialli',
    email: 'alex.g@example.com',
    phone: '+39 328 5556667',
    status: 'closed',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(), // 10 days ago
    notesCount: 3,
    relatedItem: {
      type: 'offer',
      id: 'off-103',
      title: 'Tour della Svizzera in Treno'
    }
  }
];
