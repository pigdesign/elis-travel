import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
      <p className="text-muted-foreground">Benvenuto nel pannello di amministrazione di Elis Travel.</p>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="border-none shadow-sm rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Richieste Totali</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">124</div>
            <p className="text-xs text-muted-foreground mt-1">+12% questo mese</p>
          </CardContent>
        </Card>
        
        <Card className="border-none shadow-sm rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Offerte Attive</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">12</div>
            <p className="text-xs text-muted-foreground mt-1">3 in scadenza</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Conversion Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">24.5%</div>
            <p className="text-xs text-muted-foreground mt-1">+2.4% questo mese</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
