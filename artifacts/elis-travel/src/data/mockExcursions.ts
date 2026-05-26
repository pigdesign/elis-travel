import { ExcursionDTO } from '../types/mocks';

export const MOCK_EXCURSIONS: ExcursionDTO[] = [
  {
    id: 'exc-001',
    title: 'Tour delle Cinque Terre in Battello',
    destination: 'Cinque Terre, Liguria',
    departureDate: '2026-06-15T08:30:00Z',
    
    vehicleName: 'Minibus Sprinter',
    totalSeats: 19,
    minSeatsToConfirm: 12,
    availableSeats: 3, // 16 booked
    
    priceBase: 85.00,
    fixedCosts: 350.00, // Costo Bus
    variableCostsPerPerson: 25.00, // Traghetto + Pranzo leggero
    
    totalBooked: 16,
    totalPaid: 12, // 12 hanno pagato, 4 solo acconto o prenotazione
    estimatedMargin: (16 * 85) - 350 - (16 * 25), // 1360 - 350 - 400 = 610€
    
    status: 'open_for_payments',
    imageUrl: '/images/tour-1.png'
  },
  {
    id: 'exc-002',
    title: 'Firenze Rinascimentale e Uffizi',
    destination: 'Firenze, Toscana',
    departureDate: '2026-07-10T07:00:00Z',
    
    vehicleName: 'Pullman GT 50',
    totalSeats: 50,
    minSeatsToConfirm: 35,
    availableSeats: 0,
    
    priceBase: 120.00,
    fixedCosts: 800.00,
    variableCostsPerPerson: 45.00, // Biglietto Uffizi + Guida
    
    totalBooked: 50,
    totalPaid: 50,
    estimatedMargin: (50 * 120) - 800 - (50 * 45), // 6000 - 800 - 2250 = 2950€
    
    status: 'closed',
    imageUrl: '/images/tour-2.png'
  },
  {
    id: 'exc-003',
    title: 'Weekend in Costiera Amalfitana',
    destination: 'Amalfi, Campania',
    departureDate: '2026-09-05T06:00:00Z',
    
    vehicleName: 'Minibus 30 Posti',
    totalSeats: 30,
    minSeatsToConfirm: 20,
    availableSeats: 22, // Solo 8 booked, non parte ancora
    
    priceBase: 190.00,
    fixedCosts: 600.00,
    variableCostsPerPerson: 60.00, 
    
    totalBooked: 8,
    totalPaid: 0, // In fase di pre-adesione non si paga ancora
    estimatedMargin: (8 * 190) - 600 - (8 * 60), // 1520 - 600 - 480 = 440€ (ma non è confermata)
    
    status: 'collecting_requests',
  },
  {
    id: 'exc-004',
    title: 'Venezia Segreta e Tour Enogastronomico',
    destination: 'Venezia, Veneto',
    departureDate: '2026-10-20T08:00:00Z',
    
    vehicleName: 'Pullman GT 50',
    totalSeats: 50,
    minSeatsToConfirm: 30,
    availableSeats: 15, // 35 booked, confermata!
    
    priceBase: 150.00,
    fixedCosts: 900.00,
    variableCostsPerPerson: 55.00,
    
    totalBooked: 35,
    totalPaid: 5, // Appena confermata, pochi hanno già pagato l'acconto
    estimatedMargin: (35 * 150) - 900 - (35 * 55), // 5250 - 900 - 1925 = 2425€
    
    status: 'confirmed',
    imageUrl: '/images/tour-3.png'
  }
];
