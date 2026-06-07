import { z } from "zod";
import { ANALYSIS_MODEL_MODES, ANALYSIS_SCENARIO_IDS } from "@/shared/analysis-preferences";

export const AnalysisQuerySchema = z.object({
  refresh: z.enum(["0", "1"]).optional(),
  modelMode: z.enum(ANALYSIS_MODEL_MODES).optional(),
  scenario: z.enum(ANALYSIS_SCENARIO_IDS).optional(),
});
