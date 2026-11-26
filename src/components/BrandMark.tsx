import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';

interface BrandMarkProps {
  size?: 'sm' | 'md' | 'lg';
}

export function BrandMark({ size = 'md' }: BrandMarkProps) {
  const [imgError, setImgError] = useState(false);

  const dims =
    size === 'sm' ? 'h-9 w-9' : size === 'lg' ? 'h-16 w-16' : 'h-11 w-11';

  if (imgError) {
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
        src="/src/assets/images/smesa_emblem_1795677664875.jpg"
        alt="Lambang SMK Negeri 1 Jember"
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className="w-full h-full object-contain p-0.5"
      />
    </div>
  );
}
