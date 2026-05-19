import { Providers } from "@/frontend/components/providers";
import { ErrorBoundary } from "@/frontend/components/error-boundary";
import { DashboardApp } from "@/frontend/features/dashboard";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <Providers>
      <ErrorBoundary>
        <DashboardApp />
      </ErrorBoundary>
    </Providers>
  );
}
