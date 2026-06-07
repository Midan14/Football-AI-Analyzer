"use client";

import { AlertTriangle, Ban, CheckCircle2, UsersRound } from "lucide-react";
import type { Fixture, MatchLineup } from "@/shared/domain";
import { buildSquadAvailability, motivationLabel } from "@/frontend/lib/match-event-display";

type MatchSquadPanelProps = {
  fixture: Fixture;
  lineups?: MatchLineup[];
};

function SideBlock({
  side,
}: {
  side: ReturnType<typeof buildSquadAvailability>["home"];
}) {
  return (
    <div className="mc-squad-side">
      <div className="mc-squad-side-header">
        <UsersRound size={16} />
        <strong>{side.teamName}</strong>
        {side.starters.length > 0 && (
          <span className="mc-squad-count">{side.confirmedCount} titulares</span>
        )}
      </div>

      {side.starters.length > 0 ? (
        <div className="mc-squad-block">
          <span className="mc-squad-label on">Van a jugar (titulares)</span>
          <ul>
            {side.starters.map((player) => (
              <li key={player} className="mc-squad-player ok">
                <CheckCircle2 size={12} /> {player}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mc-muted">Alineación titular pendiente de confirmación.</p>
      )}

      {side.substitutes.length > 0 && (
        <div className="mc-squad-block">
          <span className="mc-squad-label">Suplentes disponibles</span>
          <ul>
            {side.substitutes.map((player) => (
              <li key={player} className="mc-squad-player">
                {player}
              </li>
            ))}
          </ul>
        </div>
      )}

      {side.unavailable.length > 0 && (
        <div className="mc-squad-block">
          <span className="mc-squad-label off">No van a jugar / baja</span>
          <ul>
            {side.unavailable.map((row) => (
              <li key={`${row.player}-${row.reason}`} className="mc-squad-player bad">
                <Ban size={12} /> {row.player}
                <small>{row.reason}</small>
              </li>
            ))}
          </ul>
        </div>
      )}

      {side.injured.length === 0 && side.suspended.length === 0 && side.unavailable.length === 0 && (
        <p className="mc-muted">Sin bajas ni suspensiones reportadas.</p>
      )}
    </div>
  );
}

export function MatchSquadPanel({ fixture, lineups }: MatchSquadPanelProps) {
  const availability = buildSquadAvailability(fixture, lineups);

  return (
    <div className="mc-panel mc-squad-panel">
      <div className="mc-squad-motivation">
        <div>
          <span>Motivación local</span>
          <strong>
            {fixture.home.motivation}/100 · {motivationLabel(fixture.home.motivation)}
          </strong>
        </div>
        <div>
          <span>Motivación visitante</span>
          <strong>
            {fixture.away.motivation}/100 · {motivationLabel(fixture.away.motivation)}
          </strong>
        </div>
      </div>

      {(fixture.home.keyPlayer !== "N/D" || fixture.away.keyPlayer !== "N/D") && (
        <div className="mc-squad-key-players">
          {fixture.home.keyPlayer !== "N/D" && (
            <span>
              Clave local: {fixture.home.keyPlayer} ({fixture.home.keyPlayerStatus})
            </span>
          )}
          {fixture.away.keyPlayer !== "N/D" && (
            <span>
              Clave visita: {fixture.away.keyPlayer} ({fixture.away.keyPlayerStatus})
            </span>
          )}
        </div>
      )}

      <div className="mc-squad-grid">
        <SideBlock side={availability.home} />
        <SideBlock side={availability.away} />
      </div>

      {!lineups?.length && (
        <p className="mc-squad-hint">
          <AlertTriangle size={12} /> Cuando se confirmen alineaciones, cruzamos titulares con lesiones y suspensiones.
        </p>
      )}
    </div>
  );
}
