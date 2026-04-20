import { Card, CardContent } from "@/components/ui/card";

export function LeadsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Richieste</h1>
        <p className="text-muted-foreground">Visualizza e gestisci le richieste dei clienti (Leads).</p>
      </div>

      <Card className="border-none shadow-sm rounded-2xl">
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-4 md:p-6 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center hover:bg-muted/30 transition-colors">
                <div>
                  <div className="font-bold text-foreground mb-1">Richiesta Viaggio Maldive #{1000 + i}</div>
                  <div className="text-sm text-muted-foreground">da Mario Rossi • ciao@email.it</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 bg-accent/20 text-accent-foreground text-xs font-bold rounded-full">Nuova</span>
                  <span className="text-xs text-muted-foreground">2 ore fa</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
