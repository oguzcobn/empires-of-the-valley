import { useEffect, useRef } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { Cost, ResourceId, ResourceMap } from '../game/core/types';
import { fmtAmount, t } from '../i18n';
import { Icon } from './icons';

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <header className="modal-head">
          <h2>{title}</h2>
          <button
            className="btn icon-btn"
            onClick={onClose}
            aria-label={t('ui.close')}
            title={`${t('ui.close')} (Esc)`}
          >
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/** Cost chips; a chip turns red (and gains a "!" marker) when the stock cannot cover it. */
export function CostList({ cost, stocks }: { cost: Cost; stocks?: ResourceMap }): ReactElement {
  const ids = Object.keys(cost) as ResourceId[];
  if (ids.length === 0) return <span className="muted">{t('ui.free')}</span>;
  return (
    <span className="cost-list">
      {ids.map((id) => {
        const lacking = stocks ? stocks[id] < (cost[id] ?? 0) : false;
        return (
          <span key={id} className={`cost ${lacking ? 'lacking' : ''}`} title={t(`resource.${id}`)}>
            <Icon name={id} size={15} />
            {fmtAmount(cost[id] ?? 0)}
            {lacking && <b aria-label={t('ui.notEnough')}>!</b>}
          </span>
        );
      })}
    </span>
  );
}

export function Bar({
  value,
  max,
  tone = 'ok',
}: {
  value: number;
  max: number;
  tone?: 'ok' | 'warn' | 'bad' | 'info';
}): ReactElement {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <span
      className={`bar ${tone}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

export function Row({ label, children }: { label: ReactNode; children: ReactNode }): ReactElement {
  return (
    <div className="row">
      <span className="row-label">{label}</span>
      <span className="row-value">{children}</span>
    </div>
  );
}
