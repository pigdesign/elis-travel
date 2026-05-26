export type ExcursionStatus = 'draft' | 'published' | 'collecting_requests' | 'confirmed' | 'open_for_payments' | 'closed' | 'cancelled';

export interface ExcursionDTO {
  id: string;
  title: string;
  destination: string;
  departureDate: string; // ISO 8601 string
  
  // Regole Operative & Veicolo
  vehicleName: string;
  totalSeats: number;
  minSeatsToConfirm: number;
  availableSeats: number;
  
  // Analisi Economica (Conto Economico)
  priceBase: number;
  fixedCosts: number; // Es. Costo Bus
  variableCostsPerPerson: number; // Es. Pasto + Ingressi
  
  // Metriche calcolate
  totalBooked: number;
  totalPaid: number;
  estimatedMargin: number; // (totalBooked * priceBase) - fixedCosts - (totalBooked * variableCostsPerPerson)
  
  status: ExcursionStatus;
  imageUrl?: string;
}

// OFFERTE (Pacchetti viaggio flessibili, no date fisse, orientati al lead)
export type OfferStatus = 'draft' | 'published' | 'archived';

export interface OfferDTO {
  id: string;
  title: string;
  destination: string;
  durationDays: number;
  durationNights: number;
  priceFrom: number;
  status: OfferStatus;
  imageUrl?: string;
  createdAt: string;
}

// LEADS (Richieste di contatto o preventivo)
export type LeadStatus = 'new' | 'contacted' | 'quote_sent' | 'closed' | 'sold';

export interface LeadDTO {
  id: string;
  customerName: string;
  email: string;
  phone?: string;
  status: LeadStatus;
  createdAt: string; // ISO 8601 string
  notesCount: number; // Numero di note interne (per mostrare un'iconcina nella UI)
  relatedItem?: {
    type: 'offer' | 'excursion';
    id: string;
    title: string;
  };
}
