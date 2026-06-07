"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { Fixture } from "@/shared/domain";
import { useLocalStorage } from "@/frontend/hooks/use-local-storage";
import {
  fetchLiveDetail,
  fetchLiveFixtures,
  type LiveEvent,
  type LiveMatchDetail,
} from "@/frontend/hooks/use-live";
import {
  FAVORITE_TEAM_IDS_KEY,
  LIVE_SOUND_ENABLED_KEY,
} from "@/frontend/lib/favorite-team-storage";
import {
  classifyLiveEvent,
  createLiveEventTracker,
  detectGoalFromScoreChange,
  detectNewLiveEvents,
  favoriteTeamNameInFixture,
  fixtureHasFavoriteTeam,
  formatLiveEventAlertMessage,
  markGoalCountAlerted,
  shouldPlaySoundForKind,
  toastTypeForKind,
  wasGoalCountAlreadyAlerted,
  type LiveEventAlert,
  type LiveEventAlertKind,
  type LiveEventTracker,
} from "@/frontend/lib/live-event-alerts";
import { playEventSound, unlockAudioContext } from "@/frontend/lib/sounds";
import { showBrowserMatchNotification } from "@/frontend/lib/browser-notifications";

type UseFavoriteTeamLiveAlertsOptions = {
  enabled?: boolean;
  onAlert?: (alert: LiveEventAlert, toast: { message: string; type: "success" | "warning" | "info" }) => void;
};

function buildAlert(
  fixture: Fixture,
  event: LiveEvent,
  favoriteTeamIds: string[]
): LiveEventAlert {
  const kind = classifyLiveEvent(event.type, event.detail);
  return {
    fixtureId: fixture.id,
    fixtureLabel: `${fixture.home.name} vs ${fixture.away.name}`,
    favoriteTeamName: favoriteTeamNameInFixture(fixture, favoriteTeamIds),
    event,
    kind,
  };
}

function dispatchAlert(
  alert: LiveEventAlert,
  soundEnabled: boolean,
  onAlert?: UseFavoriteTeamLiveAlertsOptions["onAlert"]
) {
  if (shouldPlaySoundForKind(alert.kind) && soundEnabled) {
    playEventSound(alert.event.type, alert.event.detail);
  }

  onAlert?.(alert, {
    message: formatLiveEventAlertMessage(alert),
    type: toastTypeForKind(alert.kind),
  });

  if (shouldPlaySoundForKind(alert.kind)) {
    showBrowserMatchNotification(
      alert.fixtureLabel,
      formatLiveEventAlertMessage(alert),
      `${alert.fixtureId}-${alert.kind}-${alert.event.time}-${alert.event.player}`
    );
  }
}

export function useFavoriteTeamLiveAlerts(options?: UseFavoriteTeamLiveAlertsOptions) {
  const [favoriteTeamIds] = useLocalStorage<string[]>(FAVORITE_TEAM_IDS_KEY, []);
  const [soundEnabled, setSoundEnabled] = useLocalStorage<boolean>(LIVE_SOUND_ENABLED_KEY, true);
  const [lastAlert, setLastAlert] = useState<LiveEventAlert | null>(null);
  const [audioReady, setAudioReady] = useState(false);
  const trackersRef = useRef<Map<string, LiveEventTracker>>(new Map());

  const pollingEnabled =
    (options?.enabled ?? true) &&
    favoriteTeamIds.length > 0 &&
    typeof window !== "undefined";

  const liveListQuery = useQuery({
    queryKey: ["live-fixtures", "favorite-alerts"],
    queryFn: fetchLiveFixtures,
    enabled: pollingEnabled,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    staleTime: 6_000,
    refetchOnWindowFocus: true,
  });

  const favoriteLiveFixtures = useMemo(() => {
    const fixtures = liveListQuery.data?.fixtures ?? [];
    return fixtures.filter((fixture) => fixtureHasFavoriteTeam(fixture, favoriteTeamIds));
  }, [liveListQuery.data?.fixtures, favoriteTeamIds]);

  const detailQueries = useQueries({
    queries: favoriteLiveFixtures.map((fixture) => ({
      queryKey: ["live-detail", "favorite-alert", fixture.id],
      queryFn: () => fetchLiveDetail(fixture.id),
      enabled: pollingEnabled,
      refetchInterval: 10_000,
      refetchIntervalInBackground: true,
      staleTime: 5_000,
    })),
  });

  const getTracker = useCallback((fixtureId: string): LiveEventTracker => {
    const existing = trackersRef.current.get(fixtureId);
    if (existing) return existing;
    const created = createLiveEventTracker();
    trackersRef.current.set(fixtureId, created);
    return created;
  }, []);

  const processFixtureEvents = useCallback(
    (detail: LiveMatchDetail) => {
      const fixtureId = detail.fixture.id;
      let tracker = getTracker(fixtureId);

      const { alerts: newEvents, next } = detectNewLiveEvents(fixtureId, detail.events, tracker);
      tracker = next;

      const emitAlert = (event: LiveEvent) => {
        const kind = classifyLiveEvent(event.type, event.detail);
        if (kind === "goal" && wasGoalCountAlreadyAlerted(fixtureId, detail.fixture, tracker)) {
          return;
        }

        const alert = buildAlert(detail.fixture, event, favoriteTeamIds);
        if (kind === "goal") {
          tracker = markGoalCountAlerted(fixtureId, detail.fixture, tracker);
        }
        setLastAlert(alert);
        dispatchAlert(alert, soundEnabled, options?.onAlert);
      };

      if (newEvents.length === 0 && detail.events.length === 0) {
        const scoreBump = detectGoalFromScoreChange(detail.fixture, tracker);
        tracker = scoreBump.next;
        if (
          scoreBump.alert &&
          !wasGoalCountAlreadyAlerted(fixtureId, detail.fixture, tracker)
        ) {
          tracker = markGoalCountAlerted(fixtureId, detail.fixture, tracker);
          emitAlert(scoreBump.alert);
        }
      } else {
        for (const event of newEvents) {
          emitAlert(event);
        }
      }

      trackersRef.current.set(fixtureId, tracker);
    },
    [favoriteTeamIds, getTracker, options?.onAlert, soundEnabled]
  );

  useEffect(() => {
    for (const query of detailQueries) {
      if (query.data) {
        processFixtureEvents(query.data);
      }
    }
  }, [detailQueries, processFixtureEvents]);

  useEffect(() => {
    if (!pollingEnabled || !soundEnabled) return;

    for (const fixture of favoriteLiveFixtures) {
      const hasDetail = detailQueries.some((q) => q.data?.fixture.id === fixture.id);
      if (hasDetail) continue;

      let tracker = getTracker(fixture.id);
      const scoreBump = detectGoalFromScoreChange(fixture, tracker);
      tracker = scoreBump.next;
      trackersRef.current.set(fixture.id, tracker);

      if (scoreBump.alert && !wasGoalCountAlreadyAlerted(fixture.id, fixture, tracker)) {
        tracker = markGoalCountAlerted(fixture.id, fixture, tracker);
        const alert = buildAlert(fixture, scoreBump.alert, favoriteTeamIds);
        setLastAlert(alert);
        dispatchAlert(alert, soundEnabled, options?.onAlert);
      }
    }
  }, [
    favoriteLiveFixtures,
    detailQueries,
    favoriteTeamIds,
    getTracker,
    options?.onAlert,
    pollingEnabled,
    soundEnabled,
  ]);

  useEffect(() => {
    const liveIds = new Set(favoriteLiveFixtures.map((f) => f.id));
    for (const fixtureId of trackersRef.current.keys()) {
      if (!liveIds.has(fixtureId)) {
        trackersRef.current.delete(fixtureId);
      }
    }
  }, [favoriteLiveFixtures]);

  useEffect(() => {
    if (!pollingEnabled) return;

    const unlock = () => {
      unlockAudioContext();
      setAudioReady(true);
    };

    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [pollingEnabled]);

  const toggleSound = useCallback(() => {
    unlockAudioContext();
    setAudioReady(true);
    setSoundEnabled((prev) => !prev);
  }, [setSoundEnabled]);

  return {
    favoriteTeamIds,
    favoriteLiveCount: favoriteLiveFixtures.length,
    soundEnabled,
    setSoundEnabled,
    toggleSound,
    audioReady,
    lastAlert,
    isPolling: pollingEnabled && liveListQuery.isFetching,
    liveProvider: liveListQuery.data?.provider ?? "unknown",
  };
}

export type { LiveEventAlert, LiveEventAlertKind };
