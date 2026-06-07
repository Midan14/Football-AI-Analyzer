import type { Fixture } from "@/shared/domain";
import type { GoalModelContextAdjustment } from "./squad-impact";

const ENABLED = process.env.ENABLE_LLM_CONTEXT === "true";
const API_KEY = process.env.OPENAI_API_KEY?.trim() || process.env.NETLIFY_AI_GATEWAY_KEY?.trim();
const MODEL = process.env.LLM_CONTEXT_MODEL?.trim() || "gpt-4o-mini";
const BASE_URL = process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";

type LlmPayload = {
  homeAttackMult: number;
  awayAttackMult: number;
  homeDefenseLeak: number;
  awayDefenseLeak: number;
  summary: string;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function parseLlmJson(text: string): LlmPayload | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[0]) as Partial<LlmPayload>;
    if (
      typeof raw.homeAttackMult !== "number" ||
      typeof raw.awayAttackMult !== "number" ||
      typeof raw.homeDefenseLeak !== "number" ||
      typeof raw.awayDefenseLeak !== "number"
    ) {
      return null;
    }
    return {
      homeAttackMult: clamp(raw.homeAttackMult, 0.88, 1.12),
      awayAttackMult: clamp(raw.awayAttackMult, 0.88, 1.12),
      homeDefenseLeak: clamp(raw.homeDefenseLeak, 1, 1.15),
      awayDefenseLeak: clamp(raw.awayDefenseLeak, 1, 1.15),
      summary: typeof raw.summary === "string" ? raw.summary.slice(0, 280) : "",
    };
  } catch {
    return null;
  }
}

function buildPrompt(fixture: Fixture): string {
  const homeInj = fixture.squad?.home.injuries
    .map((i) => `${i.player} (${i.position}, ${i.status}, impact ${i.impact})`)
    .join("; ");
  const awayInj = fixture.squad?.away.injuries
    .map((i) => `${i.player} (${i.position}, ${i.status}, impact ${i.impact})`)
    .join("; ");

  return [
    "Eres analista táctico de fútbol. Devuelve SOLO JSON válido sin markdown.",
    "Ajusta multiplicadores conservadores para expected goals (1.0 = neutro).",
    "homeAttackMult/awayAttackMult: 0.88-1.12 (ataque).",
    "homeDefenseLeak/awayDefenseLeak: 1.0-1.15 (>1 = defensa más permeable).",
    'Formato: {"homeAttackMult":1,"awayAttackMult":1,"homeDefenseLeak":1,"awayDefenseLeak":1,"summary":"..."}',
    "",
    `Partido: ${fixture.home.name} vs ${fixture.away.name}`,
    `Liga: ${fixture.leagueName} | Fecha: ${fixture.kickoff}`,
    `Local forma ${fixture.home.form.join("")} | xG ${fixture.home.xgFor}/${fixture.home.xgAgainst} | key ${fixture.home.keyPlayer} (${fixture.home.keyPlayerStatus})`,
    `Visitante forma ${fixture.away.form.join("")} | xG ${fixture.away.xgFor}/${fixture.away.xgAgainst} | key ${fixture.away.keyPlayer} (${fixture.away.keyPlayerStatus})`,
    `Bajas local: ${homeInj || "ninguna"}`,
    `Bajas visitante: ${awayInj || "ninguna"}`,
    `Alineación confirmada: ${fixture.coverage.hasLineups}`,
    `Motivación local/visitante: ${fixture.home.motivation}/${fixture.away.motivation}`,
    `Contexto: mustWin H/A ${fixture.context.mustWinHome}/${fixture.context.mustWinAway}, playoff ${fixture.context.playoff}`,
  ].join("\n");
}

/**
 * Optional LLM layer — returns bounded multipliers when ENABLE_LLM_CONTEXT=true
 * and an API key is configured. Never throws.
 */
export async function fetchLlmContextAdjustment(
  fixture: Fixture
): Promise<GoalModelContextAdjustment | null> {
  if (!ENABLED || !API_KEY) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 320,
        messages: [
          {
            role: "system",
            content:
              "Respond only with a single JSON object. Be conservative; avoid extreme multipliers without strong evidence.",
          },
          { role: "user", content: buildPrompt(fixture) },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = parseLlmJson(content);
    if (!parsed) return null;

    return {
      homeAttackMult: parsed.homeAttackMult,
      awayAttackMult: parsed.awayAttackMult,
      homeDefenseLeak: parsed.homeDefenseLeak,
      awayDefenseLeak: parsed.awayDefenseLeak,
      summary: parsed.summary,
      source: "llm",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
