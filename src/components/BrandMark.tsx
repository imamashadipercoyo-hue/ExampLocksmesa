import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';

const PRIMARY_LOGO_URL = 'https://iili.io/oqzIOmb.th.png';
const FALLBACK_LOGO_URL = '/src/assets/images/smesa_emblem_1795677664875.jpg';

interface BrandMarkProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

export function BrandMark({ size = 'md' }: BrandMarkProps) {
  const [stage, setStage] = useState<'primary' | 'fallback' | 'svg'>('primary');

  const dims =
    size === 'xs'
      ? 'h-8 w-8'
      : size === 'sm'
      ? 'h-9 w-9'
      : size === 'lg'
      ? 'h-16 w-16'
      : 'h-11 w-11';

  if (stage === 'svg') {
    return (
      <div
        className={`${dims} shrink-0 rounded-lg bg-[#0B1F3A] text-white flex items-center justify-center border border-blue-800`}
        aria-label="Logo SMK Negeri 1 Jember"
      >
        <ShieldCheck className={size === 'lg' ? 'w-8 h-8' : 'w-5 h-5'} />
      </div>
    );
  }

  return (
    <div
      className={`${dims} shrink-0 rounded-lg bg-white overflow-hidden border border-slate-200 flex items-center justify-center`}
    >
      <img
        src={stage === 'primary' ? PRIMARY_LOGO_URL : FALLBACK_LOGO_URL}
        alt="Logo SMK Negeri 1 Jember"
        referrerPolicy="no-referrer"
        onError={() => setStage((prev) => (prev === 'primary' ? 'fallback' : 'svg'))}
        className="w-full h-full object-contain p-0.5"
      />
    </div>
  );
}
