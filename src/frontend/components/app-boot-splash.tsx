type AppBootSplashProps = {
  message?: string;
  submessage?: string;
};

export function AppBootSplash({
  message = "Cargando Football AI…",
  submessage = "Preparando dashboard y datos del día",
}: AppBootSplashProps) {
  return (
    <div className="app-boot-splash" role="status" aria-live="polite" aria-busy="true">
      <div className="app-boot-shield" aria-hidden="true">
        ⚽
      </div>
      <strong className="app-boot-title">Football AI Analyzer</strong>
      <p className="app-boot-message">{message}</p>
      {submessage ? <span className="app-boot-sub">{submessage}</span> : null}
      <div className="app-boot-spinner" aria-hidden="true" />
    </div>
  );
}
