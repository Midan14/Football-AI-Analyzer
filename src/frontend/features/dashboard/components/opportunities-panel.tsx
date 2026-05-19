"use client";

import { useOpportunities } from "@/frontend/hooks/use-opportunities";
import { TrendingUp, AlertCircle, DollarSign } from "lucide-react";

export function OpportunitiesPanel() {
  const { data, isLoading } = useOpportunities(3, 55);

  if (isLoading) {
    return (
      <div className="p-4 border rounded-lg bg-muted/50">
        <div className="flex items-center gap-2 text-muted-foreground">
          <TrendingUp className="w-4 h-4 animate-pulse" />
          Buscando oportunidades...
        </div>
      </div>
    );
  }

  const opportunities = data?.data?.opportunities || [];

  if (opportunities.length === 0) {
    return (
      <div className="p-4 border rounded-lg">
        <div className="flex items-center gap-2 text-muted-foreground">
          <AlertCircle className="w-4 h-4" />
          Sin oportunidades de value en tu watchlist
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-green-500" />
          Oportunidades Detectadas ({opportunities.length})
        </h3>
      </div>
      
      {opportunities.slice(0, 5).map((opp: any) => (
        <div key={opp.fixtureId} className="p-3 border rounded-lg hover:bg-muted/50 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-sm">
              {opp.fixture?.homeTeam?.name || "Local"} vs {opp.fixture?.awayTeam?.name || "Visitante"}
            </span>
            <span className="text-xs text-muted-foreground">
              {opp.fixture?.league || "Liga"}
            </span>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {opp.valueBets?.map((bet: any) => (
              <div key={bet.market} className="flex items-center gap-1 text-xs bg-green-50 text-green-700 px-2 py-1 rounded">
                <DollarSign className="w-3 h-3" />
                {bet.market}: +{bet.edge}% edge
              </div>
            ))}
          </div>
          
          {opp.bestBet && (
            <div className="mt-2 text-xs text-muted-foreground">
              Mejor apuesta: {opp.bestBet.market} @ {opp.bestBet.fairOdds} (Stake sugerido: {opp.stakeSuggestion}u)
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
