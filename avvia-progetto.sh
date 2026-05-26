#!/bin/bash

echo "🚀 Avvio di ElisTravel (Ambiente di Sviluppo)..."
echo "------------------------------------------------"

# Carica le variabili d'ambiente ignorando i commenti
echo "Caricamento variabili da .env.local..."
export $(grep -v '^#' .env.local | xargs)

# Avvia sia il frontend che il backend in parallelo usando pnpm
echo "Avvio Frontend (Vite) e Backend (Express) in parallelo..."
echo "Il sito sarà disponibile a breve su: http://localhost:3001"
echo "Premi Ctrl+C per fermare i server."
echo "------------------------------------------------"

pnpm --parallel --filter @workspace/api-server --filter @workspace/elis-travel run dev
