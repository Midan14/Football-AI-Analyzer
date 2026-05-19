import { describe, expect, it } from "vitest";
import {
  mapFixtureStatus,
  mapMatchResult,
  mapHalfTimeScore,
  mapCornersFromStats,
  mapCardsFromEvents,
  mapPenaltyAwarded,
  mapScorersFromEvents,
  mapBookedPlayersFromEvents,
} from "./sportmonks-result-mapper";

describe("mapFixtureStatus", () => {
  it("treats NS / TBA / null as pre-match", () => {
    expect(mapFixtureStatus("NS")).toBe("pre-match");
    expect(mapFixtureStatus("TBA")).toBe("pre-match");
    expect(mapFixtureStatus(null)).toBe("pre-match");
    expect(mapFixtureStatus(undefined)).toBe("pre-match");
  });

  it("treats FT / AET / FT_PEN / AWARDED as final", () => {
    expect(mapFixtureStatus("FT")).toBe("final");
    expect(mapFixtureStatus("AET")).toBe("final");
    expect(mapFixtureStatus("FT_PEN")).toBe("final");
    expect(mapFixtureStatus("AWARDED")).toBe("final");
  });

  it("treats CANCELLED / ABANDONED as final (the resolver flags abandoned)", () => {
    expect(mapFixtureStatus("CANCELLED")).toBe("final");
    expect(mapFixtureStatus("ABANDONED")).toBe("final");
  });

  it("treats live states as live", () => {
    expect(mapFixtureStatus("INPLAY_1ST_HALF")).toBe("live");
    expect(mapFixtureStatus("HT")).toBe("live");
  });
});

describe("mapMatchResult", () => {
  const scores = [
    { description: "1ST_HALF", score: { goals: 1, participant: "home" as const } },
    { description: "1ST_HALF", score: { goals: 0, participant: "away" as const } },
    { description: "CURRENT", score: { goals: 2, participant: "home" as const } },
    { description: "CURRENT", score: { goals: 1, participant: "away" as const } },
  ];

  it("returns null for non-final fixtures", () => {
    expect(mapMatchResult("NS", scores)).toBeNull();
    expect(mapMatchResult("INPLAY_1ST_HALF", scores)).toBeNull();
  });

  it("uses CURRENT scores for final tally", () => {
    const r = mapMatchResult("FT", scores);
    expect(r).toEqual({ homeGoals: 2, awayGoals: 1, totalGoals: 3, bttsActual: true, firstHalfHome: 1, firstHalfAway: 0 });
  });

  it("flags abandoned without requiring scores", () => {
    const r = mapMatchResult("ABANDONED", null);
    expect(r?.abandoned).toBe(true);
  });

  it("returns null when scores are missing for a final fixture", () => {
    expect(mapMatchResult("FT", null)).toBeNull();
    expect(mapMatchResult("FT", [])).toBeNull();
  });

  it("computes bttsActual=false when one team scored zero", () => {
    const noBtts = [
      { description: "CURRENT", score: { goals: 3, participant: "home" as const } },
      { description: "CURRENT", score: { goals: 0, participant: "away" as const } },
    ];
    expect(mapMatchResult("FT", noBtts)?.bttsActual).toBe(false);
  });

  it("returns null when participant tags are malformed", () => {
    const broken = [
      { description: "CURRENT", score: { goals: 2, participant: "home" as const } },
    ];
    expect(mapMatchResult("FT", broken)).toBeNull();
  });
});

describe("mapHalfTimeScore", () => {
  it("extracts HT score from 1ST_HALF entries", () => {
    const r = mapHalfTimeScore([
      { description: "1ST_HALF", score: { goals: 1, participant: "home" } },
      { description: "1ST_HALF", score: { goals: 0, participant: "away" } },
      { description: "CURRENT", score: { goals: 2, participant: "home" } },
    ]);
    expect(r).toEqual({ home: 1, away: 0 });
  });
  it("returns null when 1ST_HALF entries are missing", () => {
    expect(mapHalfTimeScore([{ description: "CURRENT", score: { goals: 2, participant: "home" } }])).toBeNull();
  });
});

describe("mapCornersFromStats", () => {
  const participants = { homeId: 100, awayId: 200 };
  it("matches participants by id", () => {
    const r = mapCornersFromStats(
      [
        { type: { developer_name: "Corners" }, data: { value: 7 }, participant_id: 100 },
        { type: { developer_name: "Corners" }, data: { value: 3 }, participant_id: 200 },
        { type: { developer_name: "Shots" }, data: { value: 12 }, participant_id: 100 },
      ],
      participants
    );
    expect(r).toEqual({ home: 7, away: 3 });
  });
  it("falls back to location when ids absent", () => {
    const r = mapCornersFromStats(
      [
        { type: { name: "Corners" }, data: { value: 4 }, location: "home" },
        { type: { name: "Corners" }, data: { value: 6 }, location: "away" },
      ],
      participants
    );
    expect(r).toEqual({ home: 4, away: 6 });
  });
  it("returns null when no corner stats exist", () => {
    expect(mapCornersFromStats([{ type: { name: "Shots" }, data: { value: 10 }, participant_id: 100 }], participants)).toBeNull();
  });
});

describe("mapCardsFromEvents", () => {
  const participants = { homeId: 100, awayId: 200 };
  it("counts yellow and red by team using type_id", () => {
    const r = mapCardsFromEvents(
      [
        { type_id: 19, participant_id: 100, player_name: "A" }, // yellow home
        { type_id: 19, participant_id: 200, player_name: "B" }, // yellow away
        { type_id: 19, participant_id: 200, player_name: "C" }, // yellow away
        { type_id: 20, participant_id: 100, player_name: "D" }, // red home
        { type_id: 21, participant_id: 200, player_name: "E" }, // yellow-red away
      ],
      participants
    );
    expect(r).toEqual({ yellowHome: 1, yellowAway: 2, redHome: 1, redAway: 1 });
  });
  it("falls back to type.developer_name", () => {
    const r = mapCardsFromEvents(
      [{ type: { developer_name: "yellowcard" }, participant_id: 100, player_name: "A" }],
      participants
    );
    expect(r?.yellowHome).toBe(1);
  });
  it("returns null when no card events", () => {
    expect(mapCardsFromEvents([{ type_id: 14, participant_id: 100, player_name: "Goal" }], participants)).toBeNull();
  });
});

describe("mapPenaltyAwarded / mapScorersFromEvents / mapBookedPlayersFromEvents", () => {
  const participants = { homeId: 100, awayId: 200 };
  const events = [
    { type_id: 14, participant_id: 100, player_name: "Messi", minute: 14 },
    { type_id: 16, participant_id: 200, player_name: "Mbappe", minute: 30 }, // penalty goal
    { type_id: 19, participant_id: 100, player_name: "Ramos", minute: 22 }, // yellow
    { type_id: 22, participant_id: 200, player_name: "Mbappe", minute: 30 }, // penalty awarded
  ];
  it("detects penalty awarded", () => {
    expect(mapPenaltyAwarded(events)).toBe(true);
    expect(mapPenaltyAwarded([{ type_id: 14, player_name: "X" }])).toBe(false);
  });
  it("returns scorers sorted by minute with team mapping", () => {
    const r = mapScorersFromEvents(events, participants);
    expect(r).toEqual([
      { player: "Messi", team: "home", minute: 14 },
      { player: "Mbappe", team: "away", minute: 30 },
    ]);
  });
  it("returns unique booked players", () => {
    expect(mapBookedPlayersFromEvents(events)).toEqual(["Ramos"]);
  });
});

describe("mapMatchResult with extras", () => {
  const participants = { homeId: 100, awayId: 200 };
  it("enriches base result with corners, cards, scorers, penalty and HT", () => {
    const r = mapMatchResult(
      "FT",
      [
        { description: "1ST_HALF", score: { goals: 1, participant: "home" } },
        { description: "1ST_HALF", score: { goals: 0, participant: "away" } },
        { description: "CURRENT", score: { goals: 2, participant: "home" } },
        { description: "CURRENT", score: { goals: 1, participant: "away" } },
      ],
      {
        events: [
          { type_id: 14, participant_id: 100, player_name: "Striker", minute: 12 },
          { type_id: 19, participant_id: 200, player_name: "Defender", minute: 50 },
          { type_id: 22, participant_id: 100, player_name: "Striker", minute: 75 },
        ],
        statistics: [
          { type: { developer_name: "Corners" }, data: { value: 6 }, participant_id: 100 },
          { type: { developer_name: "Corners" }, data: { value: 4 }, participant_id: 200 },
        ],
        participants,
      }
    );
    expect(r?.firstHalfHome).toBe(1);
    expect(r?.corners).toEqual({ home: 6, away: 4 });
    expect(r?.cards?.yellowAway).toBe(1);
    expect(r?.penaltyAwarded).toBe(true);
    expect(r?.scorers?.[0].player).toBe("Striker");
    expect(r?.bookedPlayers).toContain("Defender");
  });
});
