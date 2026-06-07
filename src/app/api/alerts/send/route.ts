import { NextRequest } from "next/server";
import { successResponse, errorResponse, withErrorHandling, Errors } from "@/lib/api-utils";
import { auth } from "@/auth";

/**
 * POST /api/alerts/send
 * Send alert notification via email when value bet is detected
 * Auto-generates email content from opportunity data
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return errorResponse(Errors.UNAUTHORIZED);

  const body = await request.json();
  const { to, opportunity } = body;

  if (!to || !opportunity) {
    return errorResponse({ code: "MISSING_FIELDS", message: "to and opportunity requeridos" }, 400);
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.log("[EMAIL ALERT - NO RESEND KEY]", { to, opportunity });
    return successResponse({
      sent: false,
      reason: "RESEND_API_KEY not configured",
      logged: true,
      setupInstructions: [
        "1. Ve a https://resend.com y crea una cuenta gratuita",
        "2. Genera una API key",
        "3. Agrega RESEND_API_KEY=tu_key_aqui al .env.local",
        "4. Agrega EMAIL_FROM=Football AI <noreply@tudominio.com>",
      ],
    });
  }

  // Build email HTML
  const html = buildAlertEmail(opportunity);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "Football AI <noreply@example.com>",
        to,
        subject: `🎯 Value Bet Detectado: ${opportunity.fixture?.homeTeam?.name || "Local"} vs ${opportunity.fixture?.awayTeam?.name || "Visitante"}`,
        html,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(error);
    }
    const data = await res.json();

    return successResponse({ sent: true, id: data.id });
  } catch (error) {
    console.error("[EMAIL SEND ERROR]", error);
    return errorResponse(Errors.SERVICE_UNAVAILABLE);
  }
});

function buildAlertEmail(opportunity: any): string {
  const fixture = opportunity.fixture;
  const bestBet = opportunity.bestBet;
  const valueBets = opportunity.valueBets || [];

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 24px; }
    .header { background: #3b82f6; color: white; padding: 16px; border-radius: 8px 8px 0 0; margin: -24px -24px 20px -24px; }
    .match { font-size: 20px; font-weight: bold; margin-bottom: 8px; }
    .league { color: #666; margin-bottom: 20px; }
    .bet { background: #f0fdf4; border: 1px solid #86efac; padding: 12px; border-radius: 6px; margin-bottom: 12px; }
    .bet-title { font-weight: bold; color: #166534; }
    .edge { color: #16a34a; font-weight: bold; }
    .stake { background: #eff6ff; padding: 8px 12px; border-radius: 4px; margin-top: 8px; }
    .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>🎯 Football AI Alert</h2>
    </div>
    
    <div class="match">${fixture?.homeTeam?.name || "Local"} vs ${fixture?.awayTeam?.name || "Visitante"}</div>
    <div class="league">${fixture?.league || "Liga"} | ${fixture?.date || "Fecha"}</div>
    
    ${valueBets.map((bet: any) => `
      <div class="bet">
        <div class="bet-title">${bet.market}</div>
        <div>Edge: <span class="edge">+${bet.edge}%</span> | Probabilidad modelo: ${bet.modelProbability}%</div>
        <div>Cuota justa: ${bet.fairOdds}</div>
      </div>
    `).join("")}
    
    ${bestBet ? `
      <div class="stake">
        <strong>Apuesta recomendada:</strong> ${bestBet.market} @ ${bestBet.fairOdds} (Stake: ${opportunity.stakeSuggestion}u)
      </div>
    ` : ""}
    
    <div class="footer">
      Este email fue generado automáticamente por Football AI Analyzer.
      <br/>
      Las predicciones son análisis estadísticos, no garantías.
    </div>
  </div>
</body>
</html>
  `;
}
