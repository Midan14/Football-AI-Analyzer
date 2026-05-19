"use client";

import { useBankroll } from "@/frontend/hooks/use-bankroll";
import { Wallet, TrendingUp, TrendingDown, Target } from "lucide-react";

export function BankrollPanel() {
  const { data, isLoading } = useBankroll();

  if (isLoading) {
    return (
      <div className="p-4 border rounded-lg bg-muted/50">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Wallet className="w-4 h-4 animate-pulse" />
          Cargando bankroll...
        </div>
      </div>
    );
  }

  const bankroll = data?.data?.bankroll || 1000;
  const netProfit = data?.data?.netProfit || 0;
  const roi = data?.data?.roi || 0;
  const totalPredictions = data?.data?.totalPredictions || 0;
  const unitSize = data?.data?.unitSize || 10;
  const maxStake = data?.data?.maxRecommendedStake || 50;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 border rounded-lg bg-primary/5">
          <div className="text-xs text-muted-foreground mb-1">Bankroll Total</div>
          <div className="text-2xl font-bold">${bankroll.toFixed(2)}</div>
        </div>
        <div className={`p-3 border rounded-lg ${netProfit >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
          <div className="text-xs text-muted-foreground mb-1">Profit Neto</div>
          <div className={`text-2xl font-bold flex items-center gap-1 ${netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {netProfit >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            ${netProfit.toFixed(2)}
          </div>
        </div>
        <div className="p-3 border rounded-lg">
          <div className="text-xs text-muted-foreground mb-1">ROI</div>
          <div className={`text-xl font-semibold ${roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {roi.toFixed(2)}%
          </div>
        </div>
        <div className="p-3 border rounded-lg">
          <div className="text-xs text-muted-foreground mb-1">Predicciones</div>
          <div className="text-xl font-semibold">{totalPredictions}</div>
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1">
          <Target className="w-4 h-4 text-blue-500" />
          <span>1u = ${unitSize.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-1">
          <Wallet className="w-4 h-4 text-orange-500" />
          <span>Max stake: ${maxStake.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
