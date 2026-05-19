import { NextResponse } from "next/server";

const apiResponse = {
  type: "object",
  properties: {
    success: { type: "boolean" },
    data: {},
    error: {
      type: "object",
      properties: {
        code: { type: "string" },
        message: { type: "string" },
      },
    },
  },
};

export function GET() {
  return NextResponse.json({
    openapi: "3.1.0",
    info: {
      title: "Football AI Analyzer API",
      version: "1.0.0",
    },
    paths: {
      "/api/countries": {
        get: {
          summary: "List countries",
          responses: { "200": { description: "Countries response", content: { "application/json": { schema: apiResponse } } } },
        },
      },
      "/api/leagues": {
        get: {
          summary: "List leagues",
          parameters: [{ name: "countryId", in: "query", schema: { type: "string" } }],
          responses: { "200": { description: "Leagues response", content: { "application/json": { schema: apiResponse } } } },
        },
      },
      "/api/fixtures": {
        get: {
          summary: "List fixtures",
          parameters: [
            { name: "leagueId", in: "query", schema: { type: "string" } },
            { name: "date", in: "query", schema: { type: "string", format: "date" } },
          ],
          responses: { "200": { description: "Fixtures response", content: { "application/json": { schema: apiResponse } } } },
        },
      },
      "/api/match/{fixtureId}": {
        get: {
          summary: "Get match details",
          parameters: [{ name: "fixtureId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Match response", content: { "application/json": { schema: apiResponse } } } },
        },
      },
      "/api/analyze/{fixtureId}": {
        get: {
          summary: "Analyze a fixture",
          security: [{ sessionAuth: [] }],
          parameters: [{ name: "fixtureId", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Analysis response", content: { "application/json": { schema: apiResponse } } },
            "401": { description: "Not authenticated" },
            "429": { description: "Rate limit exceeded" },
          },
        },
      },
      "/api/deep-analyze/{fixtureId}": {
        get: {
          summary: "Run deep analysis for a fixture",
          security: [{ sessionAuth: [] }],
          parameters: [{ name: "fixtureId", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Deep analysis response", content: { "application/json": { schema: apiResponse } } },
            "401": { description: "Not authenticated" },
            "429": { description: "Rate limit exceeded" },
            "503": { description: "Provider unavailable" },
          },
        },
      },
      "/api/predictions": {
        get: {
          summary: "List authenticated user's predictions",
          security: [{ sessionAuth: [] }],
          responses: { "200": { description: "Predictions response", content: { "application/json": { schema: apiResponse } } } },
        },
        post: {
          summary: "Create a prediction",
          security: [{ sessionAuth: [] }],
          responses: { "201": { description: "Prediction created", content: { "application/json": { schema: apiResponse } } } },
        },
      },
      "/api/user/watchlist": {
        get: {
          summary: "List authenticated user's watchlist",
          security: [{ sessionAuth: [] }],
          responses: { "200": { description: "Watchlist response", content: { "application/json": { schema: apiResponse } } } },
        },
        post: {
          summary: "Add fixture to watchlist",
          security: [{ sessionAuth: [] }],
          responses: { "201": { description: "Watchlist item created", content: { "application/json": { schema: apiResponse } } } },
        },
      },
      "/api/performance": {
        get: {
          summary: "Resolved prediction performance metrics",
          security: [{ sessionAuth: [] }],
          parameters: [{ name: "groupBy", in: "query", schema: { type: "string", enum: ["market", "league"] } }],
          responses: { "200": { description: "Performance metrics response", content: { "application/json": { schema: apiResponse } } } },
        },
      },
      "/api/cron/resolve-predictions": {
        get: {
          summary: "System prediction resolver job",
          security: [{ cronBearer: [] }],
          responses: {
            "200": { description: "Resolve job summary", content: { "application/json": { schema: apiResponse } } },
            "401": { description: "Invalid cron secret" },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        sessionAuth: {
          type: "apiKey",
          in: "cookie",
          name: "next-auth.session-token",
        },
        cronBearer: {
          type: "http",
          scheme: "bearer",
        },
      },
    },
  });
}
