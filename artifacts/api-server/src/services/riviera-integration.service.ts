export interface RmsCustomer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  externalRef?: string | null;
}

export interface RmsSearchResult {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
}

export interface RmsSyncPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  lastUpdatedAt: string;
}

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export class RivieraIntegrationService {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor() {
    this.baseUrl = (process.env.RIVIERA_RMS_BASE_URL ?? "").replace(/\/$/, "");
    this.apiKey = process.env.RIVIERA_API_KEY ?? "";
  }

  private get headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "X-Api-Key": this.apiKey,
    };
  }

  private isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  async searchCustomers(query: string): Promise<ServiceResult<RmsSearchResult[]>> {
    if (!this.isConfigured()) {
      return { success: false, error: "RivieraTransferRMS non configurato (variabili d'ambiente mancanti)." };
    }
    try {
      const url = `${this.baseUrl}/api/integration/customers?q=${encodeURIComponent(query)}`;
      const resp = await fetch(url, {
        method: "GET",
        headers: this.headers,
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        return { success: false, error: `RMS ha risposto con errore ${resp.status}: ${text.slice(0, 200)}` };
      }
      const data = (await resp.json()) as RmsSearchResult[];
      return { success: true, data };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Impossibile raggiungere RMS: ${msg}` };
    }
  }

  async syncCustomerToRms(
    customer: RmsCustomer,
    lastUpdatedAt: Date,
  ): Promise<ServiceResult<{ rmsId: string }>> {
    if (!this.isConfigured()) {
      return { success: false, error: "RivieraTransferRMS non configurato (variabili d'ambiente mancanti)." };
    }
    const payload: RmsSyncPayload = {
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phone ?? null,
      lastUpdatedAt: lastUpdatedAt.toISOString(),
    };
    try {
      const url = `${this.baseUrl}/api/integration/customers/sync`;
      const resp = await fetch(url, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        return { success: false, error: `RMS ha risposto con errore ${resp.status}: ${text.slice(0, 200)}` };
      }
      const data = (await resp.json()) as { id?: string; rmsId?: string };
      return { success: true, data: { rmsId: data.id ?? data.rmsId ?? customer.id } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Impossibile raggiungere RMS: ${msg}` };
    }
  }
}

export const rivieraService = new RivieraIntegrationService();
