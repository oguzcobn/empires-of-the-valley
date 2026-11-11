import type { ReactElement } from 'react';
import type { ResourceId } from '../game/core/types';

type IconName = ResourceId | 'people' | 'happy' | 'worker' | 'home' | 'clock';

const PATHS: Record<IconName, ReactElement> = {
  wood: (
    <>
      <rect x="2" y="6" width="16" height="8" rx="4" fill="#9a6a3c" />
      <circle cx="15" cy="10" r="3.2" fill="#e0bd86" />
      <circle cx="15" cy="10" r="1.2" fill="#9a6a3c" />
    </>
  ),
  stone: (
    <>
      <path d="M3 14 5 7l5-3 6 3 2 7-4 3H6z" fill="#9aa0a6" />
      <path d="M5 7l5-3 1 6-5 2z" fill="#c3c8ce" />
    </>
  ),
  food: (
    <>
      <path d="M10 2c3 3 3 7 0 10C7 9 7 5 10 2z" fill="#e2bb45" />
      <path d="M5 7c3 1 5 3 5 7-4 0-6-3-5-7zM15 7c-3 1-5 3-5 7 4 0 6-3 5-7z" fill="#d49b2b" />
      <rect x="9.3" y="11" width="1.4" height="7" fill="#8a6a2a" />
    </>
  ),
  gold: (
    <>
      <circle cx="10" cy="10" r="7.5" fill="#f2c230" />
      <circle cx="10" cy="10" r="4.5" fill="none" stroke="#b98a12" strokeWidth="1.6" />
    </>
  ),
  tools: (
    <>
      <rect x="9" y="6" width="2.4" height="12" rx="1" fill="#8a5f38" />
      <path d="M4 3h10l2 3-2 3H4z" fill="#7d858e" />
    </>
  ),
  research: (
    <>
      <path
        d="M8 2h4v5l4 8a2 2 0 0 1-2 3H6a2 2 0 0 1-2-3l4-8z"
        fill="#cfe7f2"
        stroke="#51718f"
        strokeWidth="1.2"
      />
      <path d="M6.2 12h7.6l1.6 3.4a1 1 0 0 1-1 1.6H5.6a1 1 0 0 1-1-1.6z" fill="#5b8fd6" />
    </>
  ),
  people: (
    <>
      <circle cx="10" cy="6" r="3.4" fill="#f0c9a0" />
      <path d="M3.5 18c0-4 3-7 6.5-7s6.5 3 6.5 7z" fill="#d9634c" />
    </>
  ),
  worker: (
    <>
      <circle cx="10" cy="7" r="3.2" fill="#f0c9a0" />
      <path d="M5.5 6a4.5 4.5 0 0 1 9 0z" fill="#e0b23c" />
      <path d="M4 18c0-4 2.7-6.5 6-6.5s6 2.500 6 6.500z" fill="#4c8bd9" />
    </>
  ),
  happy: (
    <>
      <circle cx="10" cy="10" r="8" fill="#f7d354" />
      <circle cx="7" cy="8" r="1.2" fill="#5a3b22" />
      <circle cx="13" cy="8" r="1.2" fill="#5a3b22" />
      <path d="M6 12c2 3 6 3 8 0" fill="none" stroke="#5a3b22" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  home: (
    <>
      <path d="M2.500 10 10 3l7.500 7z" fill="#c0503a" />
      <rect x="5" y="10" width="10" height="7" fill="#eedfb8" />
      <rect x="8.5" y="12" width="3" height="5" fill="#5a3b22" />
    </>
  ),
  clock: (
    <>
      <circle cx="10" cy="10" r="7.5" fill="#fff8e6" stroke="#7a5232" strokeWidth="1.5" />
      <path d="M10 5.500V10l3 2" fill="none" stroke="#7a5232" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }): ReactElement {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
