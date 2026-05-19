import { z } from "zod";

// Auth schemas
export const RegisterSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
  name: z.string().min(2, "Nombre muy corto"),
});

export const LoginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string(),
});

export const UpdateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  timezone: z.string().optional(),
  language: z.enum(["es", "en"]).optional(),
  modelMode: z.enum(["CONSERVATIVE", "BALANCED", "AGGRESSIVE"]).optional(),
  notificationsEnabled: z.boolean().optional(),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().email("Email inválido"),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(20, "Token inválido"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
