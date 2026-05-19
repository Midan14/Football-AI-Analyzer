"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error") ?? "Default";

  const messages: Record<string, string> = {
    Configuration: "Error de configuración del servidor. Verifica NEXTAUTH_SECRET y DATABASE_URL.",
    CredentialsSignin: "Credenciales incorrectas. Verifica tu email y contraseña.",
    AccessDenied: "Acceso denegado.",
    OAuthSignin: "Error al iniciar con proveedor externo.",
    OAuthCallback: "Error en el callback del proveedor externo.",
    OAuthCreateAccount: "No se pudo crear la cuenta con el proveedor externo.",
    EmailCreateAccount: "No se pudo crear la cuenta.",
    Callback: "Error interno del sistema de autenticación.",
    Default: "Ha ocurrido un error inesperado.",
  };

  const message = messages[error] ?? messages.Default;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] px-4">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-red-500/10 mb-4">
          <AlertTriangle className="w-7 h-7 text-red-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Error de autenticación</h1>
        <p className="text-sm text-zinc-400 mb-6">{message}</p>
        <Link
          href="/auth/signin"
          className="inline-block py-2.5 px-6 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl transition-colors text-sm"
        >
          Volver al inicio de sesión
        </Link>
      </div>
    </div>
  );
}
