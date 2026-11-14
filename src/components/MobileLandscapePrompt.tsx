import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { needsLandscapeHint, requestLandscapeMode } from '../app/landscape';

/** Requests immersive landscape where possible, otherwise teaches manual device rotation. */
export function MobileLandscapePrompt(): ReactElement | null {
  const [portraitPhone, setPortraitPhone] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [manual, setManual] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse)');
    const update = () => {
      const show = needsLandscapeHint(window.innerWidth, window.innerHeight, coarse.matches);
      setPortraitPhone(show);
      if (!show) {
        setDismissed(false);
        setManual(false);
      }
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    coarse.addEventListener?.('change', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      coarse.removeEventListener?.('change', update);
    };
  }, []);

  if (!portraitPhone || dismissed) return null;

  const enterLandscape = async () => {
    setPending(true);
    const locked = await requestLandscapeMode(document, screen);
    if (!locked) setManual(true);
    setPending(false);
  };

  return (
    <div className="mobile-landscape-prompt" role="dialog" aria-label="Mobil yatay oyun önerisi" data-testid="mobile-landscape-prompt">
      <div className="landscape-phone-symbol" aria-hidden="true">↻</div>
      <strong>Yatay Ekranda Oyna</strong>
      <p>Şehir haritasını ve oyun menülerini daha rahat görmek için telefonunu yan çevir.</p>
      {manual && <p role="status" className="landscape-manual">Tarayıcın otomatik döndürmeye izin vermedi. Telefonun ekran döndürme kilidini kapatıp cihazı yatay çevir.</p>}
      <button type="button" className="btn primary" disabled={pending} onClick={() => void enterLandscape()} data-testid="mobile-landscape-request">
        {pending ? 'Açılıyor…' : '⤢ Yatay Oyna / Tam Ekran'}
      </button>
      <button type="button" className="btn" onClick={() => setDismissed(true)}>Dikey Devam Et</button>
    </div>
  );
}
