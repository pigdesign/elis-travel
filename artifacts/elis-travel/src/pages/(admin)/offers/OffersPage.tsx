import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/shared/Button";
import { Plus } from "lucide-react";

export function OffersPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Offerte</h1>
          <p className="text-muted-foreground">Gestisci i pacchetti viaggio e le offerte.</p>
        </div>
        <Button className="bg-primary hover:bg-primary/90 text-white rounded-full">
          <Plus className="w-4 h-4 mr-2" />
          Nuova Offerta
        </Button>
      </div>

      <Card className="border-none shadow-sm rounded-2xl p-12 text-center">
        <CardContent className="pt-6">
          <div className="text-muted-foreground mb-4">Nessuna offerta creata al momento.</div>
          <Button variant="outline" className="rounded-full">Crea la prima offerta</Button>
        </CardContent>
      </Card>
    </div>
  );
}
