import type { ReactElement } from 'react';
import type { ArchitectureStyle } from '../game/core/types';
import { t } from '../i18n';

/** Small illustrated preview of a culture's houses (replaced by rendered sprites when available). */
export function CulturePreview({ style }: { style: ArchitectureStyle }): ReactElement {
  if (style === 'scottish')
    return (
      <svg viewBox="0 0 200 110" role="img" aria-label={t('style.scottish.long')} className="culture-svg">
        <path d="M0 95 200 95 200 110 0 110z" fill="#7fb56a" />
        <g>
          <path d="M30 60h70v35H30z" fill="#a9aca8" />
          <path d="M30 60 65 34 100 60z" fill="#4e5d6c" />
          <path d="M24 60h8v-10h-4v-6h4v-6h4v22z" fill="#9a9d98" />
          <rect x="92" y="38" width="8" height="18" fill="#8d908b" />
          <rect x="44" y="70" width="10" height="13" fill="#e8eef2" stroke="#fff" />
          <rect x="76" y="70" width="10" height="13" fill="#e8eef2" stroke="#fff" />
          <rect x="60" y="76" width="10" height="19" fill="#3f4b57" />
        </g>
        <g>
          <path d="M120 40h46v55h-46z" fill="#f3efe6" />
          <path d="M116 40 143 18 170 40z" fill="#4e5d6c" />
          <path d="M166 50a7 7 0 0 1 14 0v45h-14z" fill="#f3efe6" />
          <path d="M164 52 173 30 182 52z" fill="#4e5d6c" />
          <rect x="128" y="50" width="8" height="12" fill="#9ec4dc" />
          <rect x="150" y="50" width="8" height="12" fill="#9ec4dc" />
          <rect x="128" y="70" width="8" height="12" fill="#9ec4dc" />
          <rect x="139" y="78" width="9" height="17" fill="#2f5fa7" />
        </g>
      </svg>
    );
  return (
    <svg viewBox="0 0 200 110" role="img" aria-label={t('style.turkish.long')} className="culture-svg">
      <path d="M0 95 200 95 200 110 0 110z" fill="#7fb56a" />
      <g>
        <path d="M28 70h60v25H28z" fill="#c9b48e" />
        <path d="M22 44h72v26H22z" fill="#f6f1e6" />
        <path d="M22 44h72M22 57h72M34 44v26M58 44v26M82 44v26M22 70l12-26M58 70l12-26" stroke="#5a3b22" strokeWidth="2" />
        <path d="M56 50h26v18H56z" fill="#f6f1e6" stroke="#5a3b22" strokeWidth="2" />
        <path d="M10 44 58 24 106 44z" fill="#c0503a" />
        <rect x="62" y="53" width="6" height="10" fill="#7b5236" />
        <rect x="71" y="53" width="6" height="10" fill="#7b5236" />
        <path d="M50 95V80a6 6 0 0 1 12 0v15z" fill="#5a3b22" />
      </g>
      <g>
        <path d="M122 52h56v43h-56z" fill="#e2c07c" />
        <path d="M134 52a16 16 0 0 1 32 0z" fill="#8d97a1" />
        <path d="M150 34v3" stroke="#c9a23a" strokeWidth="2" />
        <path d="M130 95V75a6 6 0 0 1 12 0v20zM158 95V75a6 6 0 0 1 12 0v20z" fill="#7b5236" />
        <rect x="184" y="20" width="5" height="75" fill="#efe6d2" />
        <path d="M182 20 186.5 6 191 20z" fill="#8d97a1" />
      </g>
    </svg>
  );
}
