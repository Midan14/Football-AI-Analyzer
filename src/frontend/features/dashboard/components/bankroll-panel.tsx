"use client";

import { useBankroll } from "@/frontend/hooks/use-bankroll";
import { Wallet, TrendingUp, TrendingDown, Target } from "lucide-react";

export function BankrollPanel({ compact = false }: { compact?: boolean }) {
  const { data, isLoading } = useBankroll();

  if (isLoading) {
    return (
      <div className={`br-panel ${compact ? "br-panel-compact" : ""} br-loading`}>
        <Wallet size={18} className="spin" />
        <span>Cargando bankroll...</span>
      </div>
    );
  }

  const bankroll = data?.data?.bankroll || 1000;
  const netProfit = data?.data?.netProfit || 0;
  const roi = data?.data?.roi || 0;
  const totalPredictions = data?.data?.totalPredictions || 0;
  const unitSize = data?.data?.unitSize || 10;
  const maxStake = data?.data?.maxRecommendedStake || 50;
  const profitPositive = netProfit >= 0;
  const profitText = `${profitPositive ? "+" : "-"}$${Math.abs(netProfit).toFixed(2)}`;

  return (
    <div className={`br-panel ${compact ? "br-panel-compact" : ""}`}>
      <div className="br-stat-grid">
        <div className="br-stat-card primary">
          <span className="br-stat-label">Bankroll total</span>
          <strong className="br-stat-value">${bankroll.toFixed(2)}</strong>
        </div>
        <div className={`br-stat-card ${profitPositive ? "positive" : "negative"}`}>
          <span className="br-stat-label">Profit neto</span>
          <strong className="br-stat-value">
            {profitPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            {profitText}
          </strong>
        </div>
        <div className={`br-stat-card ${roi >= 0 ? "positive" : "negative"}`}>
          <span className="br-stat-label">ROI</span>
          <strong className="br-stat-value">{roi.toFixed(1)}%</strong>
        </div>
        <div className="br-stat-card">
          <span className="br-stat-label">Predicciones</span>
          <strong className="br-stat-value">{totalPredictions}</strong>
        </div>
      </div>

      <div className="br-meta">
        <div className="br-meta-item">
          <Target size={14} />
          <span>1u = ${unitSize.toFixed(2)}</span>
        </div>
        <div className="br-meta-item">
          <Wallet size={14} />
          <span>Máx. stake ${maxStake.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
