"use client";

import { Star, Zap } from "lucide-react";
import type { FixtureEdgeHint } from "@/frontend/hooks/use-fixture-edge-hints";
import type { Fixture } from "@/shared/domain";
import { formatKickoffTimeColombia } from "@/frontend/lib/date-utils";
import { fixtureStatusLabelEs } from "@/shared/fixture-status";

function formatKickoffTime(kickoff: string): string {
  return formatKickoffTimeColombia(kickoff).replace(" COT", "");
}

type CalendarFixtureRowProps = {
  fixture: Fixture;
  isSelected?: boolean;
  isFavorite?: boolean;
  edgeHint?: FixtureEdgeHint;
  onClick: () => void;
};

export function CalendarFixtureRow({
  fixture,
  isSelected = false,
  isFavorite = false,
  edgeHint,
  onClick,
}: CalendarFixtureRowProps) {
  return (
    <button
      type="button"
      className={`cal-fixture-row ${fixture.status} ${isSelected ? "selected" : ""} ${isFavorite ? "favorite" : ""}`}
      onClick={onClick}
    >
      {isFavorite && (
        <span className="cal-fx-fav">
          <Star size={10} />
        </span>
      )}

      <div className="cal-fx-time">
        {fixture.status === "live" ? (
          <span className="cal-fx-live">
            <span className="cal-live-dot" />
            {fixture.elapsed}′
          </span>
        ) : fixture.status === "final" ? (
          <span className="cal-fx-final">FT</span>
        ) : fixture.status === "postponed" ? (
          <span className="cal-fx-postponed" title={fixture.statusLong}>
            {fixtureStatusLabelEs("postponed", fixture.statusLong).slice(0, 4).toUpperCase()}
          </span>
        ) : fixture.status === "cancelled" ? (
          <span className="cal-fx-cancelled" title={fixture.statusLong}>
            {fixtureStatusLabelEs("cancelled", fixture.statusLong).slice(0, 4).toUpperCase()}
          </span>
        ) : (
          <span className="cal-fx-kickoff">{formatKickoffTime(fixture.kickoff)}</span>
        )}
      </div>

      <div className="cal-fx-team home">
        <strong>{fixture.home.name}</strong>
        {fixture.home.logo && <img src={fixture.home.logo} alt="" className="cal-fx-logo" />}
      </div>

      <div className="cal-fx-score">
        {fixture.result ? (
          <span className={`cal-score ${fixture.status === "live" ? "live" : ""}`}>
            {fixture.result.homeGoals} - {fixture.result.awayGoals}
          </span>
        ) : (
          <span className="cal-vs">vs</span>
        )}
      </div>

      <div className="cal-fx-team away">
        {fixture.away.logo && <img src={fixture.away.logo} alt="" className="cal-fx-logo" />}
        <strong>{fixture.away.name}</strong>
      </div>

      <div className="cal-fx-badges">
        {edgeHint?.hasValue && (
          <span className="cal-badge value" title={`Edge ${edgeHint.edge}% · ${edgeHint.market}`}>
            VALUE +{edgeHint.edge}%
          </span>
        )}
        {edgeHint?.hasMlSignal && (
          <span className="cal-badge ml" title={`Señal modelo · ${edgeHint.market}`}>
            AI
          </span>
        )}
      </div>

      <div className="cal-fx-odds">
        {fixture.market.homeWinOdds > 0 ? (
          <>
            <span className="cal-odd">{fixture.market.homeWinOdds.toFixed(2)}</span>
            <span className="cal-odd draw">{fixture.market.drawOdds.toFixed(2)}</span>
            <span className="cal-odd">{fixture.market.awayWinOdds.toFixed(2)}</span>
          </>
        ) : (
          <span className="cal-no-odds">—</span>
        )}
      </div>

      <div className="cal-fx-action">
        <Zap size={14} />
      </div>
    </button>
  );
}
