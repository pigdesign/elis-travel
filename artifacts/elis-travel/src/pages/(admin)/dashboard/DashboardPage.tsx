import { useEffect } from "react";
import { useLocation } from "wouter";
import {
  Mail,
  Inbox,
  Ticket,
  Mountain,
  Calendar,
  ChevronRight,
  Globe,
} from "lucide-react";
import {
  useGetDashboardStats,
  getGetDashboardStatsQueryKey,
} from "@workspace/api-client-react";
import type {
  DashboardRecentLead,
  DashboardUpcomingExcursion,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { label: string; className: string; dot: string }> = {
  new: { label: "Nuova", className: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
  contacted: { label: "Contattata", className: "bg-yellow-100 text-yellow-700", dot: "bg-yellow-500" },
  quote_sent: { label: "Preventivo inviato", className: "bg-purple-100 text-purple-700", dot: "bg-purple-500" },
  won: { label: "Vinto", className: "bg-green-100 text-green-700", dot: "bg-green-500" },
  lost: { label: "Perso", className: "bg-red-100 text-red-700", dot: "bg-red-400" },
};

function timeAgo(date: string | Date): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return `${diff}s fa`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min fa`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h fa`;
  return `${Math.floor(diff / 86400)}g fa`;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function daysUntil(date: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.floor((target.getTime() - today.getTime()) / 86_400_000);
}

export function DashboardPage() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  useEffect(() => {
    void qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
  }, [qc]);

  const { data, isLoading } = useGetDashboardStats();

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <div className="p-12 text-center text-muted-foreground">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Caricamento dati...
        </div>
      </div>
    );
  }

  const newLeads = data.leadsByStatus.new;
  const wonLeads = data.leadsByStatus.won;
  const inProgressLeads = data.leadsByStatus.contacted + data.leadsByStatus.quote_sent;

  const STATUS_BREAKDOWN: { key: keyof typeof data.leadsByStatus; label: string; className: string; dot: string }[] = [
    { key: "new", label: "Nuove", className: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
    { key: "contacted", label: "Contattate", className: "bg-yellow-100 text-yellow-700", dot: "bg-yellow-500" },
    { key: "quote_sent", label: "Preventivo", className: "bg-purple-100 text-purple-700", dot: "bg-purple-500" },
    { key: "won", label: "Vinte", className: "bg-green-100 text-green-700", dot: "bg-green-500" },
    { key: "lost", label: "Perse", className: "bg-red-100 text-red-700", dot: "bg-red-400" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Benvenuto nel pannello di amministrazione di Elis Travel.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-none shadow-sm rounded-2xl">
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Nuove richieste
            </CardTitle>
            <Inbox className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{newLeads}</div>
            <p className="text-xs text-muted-foreground mt-1">
              da gestire ora
            </p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm rounded-2xl">
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Richieste totali
            </CardTitle>
            <Mail className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{data.leadsTotal}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {inProgressLeads} in lavorazione · {wonLeads} vinte
            </p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm rounded-2xl">
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Gite prossime
            </CardTitle>
            <Mountain className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              {data.upcomingExcursionsCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">prossimi 30 giorni</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm rounded-2xl">
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Offerte pubblicate
            </CardTitle>
            <Ticket className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{data.offersPublished}</div>
            <p className="text-xs text-muted-foreground mt-1">visibili al pubblico</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-sm rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Richieste per stato
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {STATUS_BREAKDOWN.map((s) => (
              <button
                key={s.key}
                onClick={() => navigate(`~/admin/leads`)}
                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-muted/30 hover:bg-muted/60 transition-colors text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn("w-2 h-2 rounded-full flex-shrink-0", s.dot)} />
                  <span className="text-xs font-medium text-muted-foreground truncate">
                    {s.label}
                  </span>
                </div>
                <span className={cn("text-sm font-bold px-2 py-0.5 rounded-full", s.className)}>
                  {data.leadsByStatus[s.key]}
                </span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-none shadow-sm rounded-2xl">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base font-semibold">
              Ultime richieste
            </CardTitle>
            <button
              onClick={() => navigate("~/admin/leads")}
              className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
            >
              Vedi tutte <ChevronRight className="w-3 h-3" />
            </button>
          </CardHeader>
          <CardContent className="p-0">
            {data.recentLeads.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-muted-foreground">
                Nessuna richiesta ricevuta.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {(data.recentLeads as DashboardRecentLead[]).map((lead) => {
                  const cfg = STATUS_CONFIG[lead.status] ?? STATUS_CONFIG["new"];
                  return (
                    <button
                      key={lead.id}
                      onClick={() => navigate(`~/admin/leads?lead=${lead.id}`)}
                      className="w-full text-left px-6 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-foreground truncate">
                            {lead.customerName}
                          </span>
                          {lead.type === "offer" && lead.offerName && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground truncate">
                              <Ticket className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{lead.offerName}</span>
                            </span>
                          )}
                          {lead.type === "excursion" && lead.excursionName && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground truncate">
                              <Mountain className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{lead.excursionName}</span>
                            </span>
                          )}
                          {lead.type === "generic" && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Globe className="w-3 h-3" /> generica
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">
                          {lead.email}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span
                          className={cn(
                            "hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium",
                            cfg.className,
                          )}
                        >
                          <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
                          {cfg.label}
                        </span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {timeAgo(lead.receivedAt)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm rounded-2xl">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base font-semibold">
              Gite in scadenza (30 giorni)
            </CardTitle>
            <button
              onClick={() => navigate("~/admin/excursions")}
              className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
            >
              Vedi tutte <ChevronRight className="w-3 h-3" />
            </button>
          </CardHeader>
          <CardContent className="p-0">
            {data.upcomingExcursions.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-muted-foreground">
                Nessuna gita in programma nei prossimi 30 giorni.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {(data.upcomingExcursions as DashboardUpcomingExcursion[]).map((ex) => {
                  const days = daysUntil(ex.date);
                  const reachedThreshold =
                    ex.adherentsCount >= ex.minThreshold;
                  return (
                    <button
                      key={ex.id}
                      onClick={() => navigate(`~/admin/excursions/${ex.id}`)}
                      className="w-full text-left px-6 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors"
                    >
                      <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-foreground truncate">
                          {ex.name}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">
                          {ex.location} · {formatDate(ex.date)}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                        <span
                          className={cn(
                            "text-xs font-semibold px-2 py-0.5 rounded-full",
                            days <= 7
                              ? "bg-red-100 text-red-700"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {days === 0
                            ? "oggi"
                            : days === 1
                              ? "domani"
                              : `tra ${days}g`}
                        </span>
                        <span
                          className={cn(
                            "text-xs",
                            reachedThreshold
                              ? "text-green-700"
                              : "text-muted-foreground",
                          )}
                        >
                          {ex.adherentsCount}/{ex.minThreshold} adesioni
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
