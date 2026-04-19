import { useEffect, useState } from 'react';
import './InstallPrompt.css';

const DISMISS_KEY = 'install-prompt-dismissed';
const DISMISS_TTL = 1000 * 60 * 60 * 24 * 14; // 14 days

function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function isIOSSafari() {
  const ua = window.navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIOS && isSafari;
}

function wasRecentlyDismissed() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    return Number.isFinite(ts) && Date.now() - ts < DISMISS_TTL;
  } catch {
    return false;
  }
}

function markDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

function InstallPrompt() {
  const [mode, setMode] = useState(null); // 'android' | 'ios' | null
  const [deferred, setDeferred] = useState(null);

  useEffect(() => {
    if (isStandalone() || wasRecentlyDismissed()) return;

    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferred(e);
      setMode('android');
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    // iOS Safari has no beforeinstallprompt → show a hint after a short delay
    let iosTimer = null;
    if (isIOSSafari()) {
      iosTimer = setTimeout(() => setMode('ios'), 6000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  const dismiss = () => {
    markDismissed();
    setMode(null);
  };

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') markDismissed();
    setDeferred(null);
    setMode(null);
  };

  if (!mode) return null;

  if (mode === 'android') {
    return (
      <div className="install-prompt">
        <div className="install-prompt-body">
          <div className="install-prompt-icon">☀️</div>
          <div className="install-prompt-text">
            <strong>Installer l'app</strong>
            <span>Un accès rapide aux terrasses, même hors-ligne.</span>
          </div>
        </div>
        <div className="install-prompt-actions">
          <button className="install-prompt-btn ghost" onClick={dismiss}>Plus tard</button>
          <button className="install-prompt-btn primary" onClick={install}>Installer</button>
        </div>
      </div>
    );
  }

  return (
    <div className="install-prompt ios">
      <button className="install-prompt-close" onClick={dismiss} aria-label="Fermer">✕</button>
      <div className="install-prompt-body">
        <div className="install-prompt-icon">☀️</div>
        <div className="install-prompt-text">
          <strong>Ajouter à l'écran d'accueil</strong>
          <span>
            Touchez <span className="ios-share-icon" aria-hidden="true">⬆︎</span> puis
            « Sur l'écran d'accueil ».
          </span>
        </div>
      </div>
    </div>
  );
}

export default InstallPrompt;
