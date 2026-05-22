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
        delete: {
          summary: "Clear cached analysis for a fixture",
          security: [{ sessionAuth: [] }],
          parameters: [{ name: "fixtureId", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Cache clear response", content: { "application/json": { schema: apiResponse } } },
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
      "/api/cron/ml-retrain": {
        get: {
          summary: "System ML retraining job",
          security: [{ cronSecret: [] }],
          responses: {
            "200": { description: "Retraining summary", content: { "application/json": { schema: apiResponse } } },
            "401": { description: "Invalid cron secret" },
            "500": { description: "Cron secret not configured" },
          },
        },
      },
      "/api/ml/train": {
        post: {
          summary: "Trigger ML model training",
          security: [{ sessionAuth: [] }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    extract: { type: "boolean" },
                    leagueId: { type: "string" },
                    limit: { type: "integer", minimum: 10, maximum: 1000 },
                    trials: { type: "integer", minimum: 1, maximum: 100 },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Training status", content: { "application/json": { schema: apiResponse } } },
            "400": { description: "Validation error" },
            "401": { description: "Not authenticated" },
            "403": { description: "Admin role required" },
            "429": { description: "Rate limit exceeded" },
          },
        },
      },
      "/api/alerts/stream": {
        get: {
          summary: "Stream active alert evaluations via SSE",
          security: [{ sessionAuth: [] }],
          responses: {
            "200": { description: "SSE alert stream" },
            "401": { description: "Not authenticated" },
            "429": { description: "Rate limit exceeded" },
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
        cronSecret: {
          type: "apiKey",
          in: "header",
          name: "x-cron-secret",
        },
      },
    },
  });
}
