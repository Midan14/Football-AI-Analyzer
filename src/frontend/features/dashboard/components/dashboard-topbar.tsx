"use client";

import Image from "next/image";
import { RefreshCw, Search } from "lucide-react";
import type { Country, Fixture, League } from "@/shared/domain";
import { TopSelect } from "../dashboard-components";

type DashboardTopbarProps = {
  countries: Country[];
  leagues: League[];
  fixtures: Fixture[];
  selectedCountry: string;
  selectedLeague: string;
  selectedDate: string;
  selectedFixtureId: string;
  selectedFixture?: Fixture;
  teamSearch: string;
  teamSearchOpen: boolean;
  teamSearchResults: Fixture[];
  loading: boolean;
  statusMessage: string;
  onSelectCountry: (countryId: string) => void;
  onSelectLeague: (leagueId: string) => void;
  onSelectDate: (date: string) => void;
  onSelectFixture: (fixtureId: string) => void;
  onTeamSearchChange: (query: string) => void;
  onTeamSearchOpenChange: (open: boolean) => void;
  onOpenSearchFixture: (fixture: Fixture) => void;
  onRefresh: () => void;
};

export function DashboardTopbar({
  countries,
  leagues,
  fixtures,
  selectedCountry,
  selectedLeague,
  selectedDate,
  selectedFixtureId,
  selectedFixture,
  teamSearch,
  teamSearchOpen,
  teamSearchResults,
  loading,
  statusMessage,
  onSelectCountry,
  onSelectLeague,
  onSelectDate,
  onSelectFixture,
  onTeamSearchChange,
  onTeamSearchOpenChange,
  onOpenSearchFixture,
  onRefresh,
}: DashboardTopbarProps) {
  const selectedCountryRecord = countries.find((country) => country.id === selectedCountry);

  return (
    <header className="topbar">
      <div className="selectors-chain">
        <div className="top-select-with-flag">
          {selectedCountryRecord?.flag ? (
            <Image src={selectedCountryRecord.flag} alt="" width={24} height={16} className="country-flag" />
          ) : null}
          <TopSelect
            label="País"
            value={selectedCountry}
            onChange={onSelectCountry}
            options={[{ value: "", label: "Seleccionar país..." }, ...countries.map((country) => ({ value: country.id, label: country.name }))]}
          />
        </div>
        <span className="chain-arrow">→</span>
        <TopSelect
          label="Liga"
          value={selectedLeague}
          onChange={onSelectLeague}
          options={[{ value: "", label: "Seleccionar liga..." }, ...leagues.map((league) => ({ value: league.id, label: league.name }))]}
        />
        <span className="chain-arrow">→</span>
        <label className="top-select">
          <span>Fecha</span>
          <input value={selectedDate} onChange={(event) => onSelectDate(event.target.value)} type="date" />
        </label>
        {fixtures.length > 0 && selectedFixtureId && (
          <>
            <span className="chain-arrow">→</span>
            <TopSelect
              label="Partido"
              value={selectedFixtureId}
              onChange={onSelectFixture}
              options={[{ value: "", label: "Seleccionar partido..." }, ...fixtures.map((fixture) => ({
                value: fixture.id,
                label: `${fixture.home.name} vs ${fixture.away.name}`,
              }))]}
            />
          </>
        )}
        <span className="chain-arrow">|</span>
        <div style={{ position: "relative" }}>
          <label className="top-select" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Search size={14} style={{ color: "#71717a", flexShrink: 0 }} />
            <input
              value={teamSearch}
              onChange={(event) => {
                onTeamSearchChange(event.target.value);
                onTeamSearchOpenChange(true);
              }}
              onFocus={() => onTeamSearchOpenChange(true)}
              onBlur={() => setTimeout(() => onTeamSearchOpenChange(false), 180)}
              placeholder="Buscar equipo..."
              style={{ background: "transparent", border: "none", outline: "none", color: "#f4f4f5", fontSize: 13, width: 140 }}
              aria-label="Buscar equipo en partidos cargados"
            />
          </label>
          {teamSearchOpen && teamSearchResults.length > 0 && (
            <div style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              zIndex: 50,
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              borderRadius: 8,
              minWidth: 260,
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              overflow: "hidden",
            }}>
              {teamSearchResults.map((fixture) => (
                <button
                  key={fixture.id}
                  onMouseDown={() => onOpenSearchFixture(fixture)}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "10px 14px",
                    textAlign: "left",
                    background: "transparent",
                    border: "none",
                    borderBottom: "1px solid #2a2a2a",
                    color: "#f4f4f5",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  <strong>{fixture.home.name}</strong>
                  <span style={{ color: "#71717a", margin: "0 6px" }}>vs</span>
                  <strong>{fixture.away.name}</strong>
                  <span style={{ color: "#52525b", fontSize: 11, marginLeft: 8 }}>{fixture.leagueName}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="top-status">
        <strong>
          {fixtures.length} partidos
          {selectedFixture ? ` · ${selectedFixture.home.name} vs ${selectedFixture.away.name}` : ""}
        </strong>
        <span>{loading ? "Actualizando datos..." : statusMessage}</span>
      </div>
      <button className="refresh" aria-label="Refrescar dashboard" onClick={onRefresh}>
        <RefreshCw size={28} />
      </button>
    </header>
  );
}
