"use client";

import { parseStatNumber } from "@/frontend/lib/live-matches-utils";
import type { LiveStatistic } from "@/frontend/hooks/use-live";

type LiveStatBarProps = {
  stat: LiveStatistic;
};

export function LiveStatBar({ stat }: LiveStatBarProps) {
  const homeValue = parseStatNumber(stat.home);
  const awayValue = parseStatNumber(stat.away);
  const total = homeValue + awayValue || 1;
  const homePct = Math.round((homeValue / total) * 100);
  const awayPct = 100 - homePct;

  return (
    <div className="live-stat-bar-row">
      <span className="live-stat-bar-value home">{stat.home}</span>
      <div className="live-stat-bar-track">
        <span className="live-stat-bar-label">{stat.type}</span>
        <div className="live-stat-bar-fill">
          <i className="home" style={{ width: `${homePct}%` }} />
          <i className="away" style={{ width: `${awayPct}%` }} />
        </div>
      </div>
      <span className="live-stat-bar-value away">{stat.away}</span>
    </div>
  );
}
