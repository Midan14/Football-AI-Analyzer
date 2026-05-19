import { Suspense } from "react";
import { AuthErrorContent } from "./error-content";

export default function AuthErrorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] px-4">
        <div className="text-zinc-400 text-sm">Cargando...</div>
      </div>
    }>
      <AuthErrorContent />
    </Suspense>
  );
}
