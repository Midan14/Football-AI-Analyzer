"use client";

import type { MatchEvent, MatchStatistic } from "@/shared/domain";
import {
  buildCornerSummary,
  classifyMatchEventForDisplay,
  formatEventMinute,
  sortEventsChronologically,
} from "@/frontend/lib/match-event-display";

type MatchEventTimelineProps = {
  events?: MatchEvent[];
  statistics?: MatchStatistic[];
  reverse?: boolean;
};

export function MatchEventTimeline({ events, statistics, reverse = true }: MatchEventTimelineProps) {
  const cornerSummary = buildCornerSummary(statistics);
  const sorted = sortEventsChronologically(events ?? []);
  const list = reverse ? [...sorted].reverse() : sorted;

  if (list.length === 0 && !cornerSummary) {
    return (
      <div className="mc-event-empty">
        <p>Sin incidencias registradas todavía. Los goles, tarjetas, penaltis y VAR aparecerán aquí en vivo.</p>
      </div>
    );
  }

  return (
    <div className="mc-event-timeline">
      {cornerSummary && (
        <div className="mc-event-corner-summary">
          <span className="mc-event-icon corner">🚩</span>
          <strong>{cornerSummary}</strong>
          <small>Resumen agregado · no siempre hay córner evento a evento</small>
        </div>
      )}

      {list.map((event, index) => {
        const display = classifyMatchEventForDisplay(event.type, event.detail);
        return (
          <div
            key={`${event.time}-${event.player}-${event.detail}-${index}`}
            className={`mc-event-row mc-event-tone-${display.tone} mc-event-cat-${display.category}`}
          >
            <span className="mc-event-minute">{formatEventMinute(event)}</span>
            <span className="mc-event-icon" aria-hidden="true">
              {display.icon}
            </span>
            <div className="mc-event-body">
              <strong>{display.label}</strong>
              <span>
                {event.player || event.detail}
                {event.assist ? ` · Asistencia: ${event.assist}` : ""}
              </span>
              <small>{event.team}</small>
            </div>
          </div>
        );
      })}
    </div>
  );
}
