import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Providers } from "@/frontend/components/providers";
import { ErrorBoundary } from "@/frontend/components/error-boundary";
import { DashboardApp } from "@/frontend/features/dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/signin?callbackUrl=/dashboard");
  }

  return (
    <Providers>
      <ErrorBoundary>
        <DashboardApp />
      </ErrorBoundary>
    </Providers>
  );
}
