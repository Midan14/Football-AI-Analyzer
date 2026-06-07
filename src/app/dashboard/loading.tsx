import { AppBootSplash } from "@/frontend/components/app-boot-splash";

export default function DashboardLoading() {
  return (
    <main className="viewport">
      <AppBootSplash
        message="Abriendo Football AI…"
        submessage="Verificando sesión y cargando partidos"
      />
    </main>
  );
}
