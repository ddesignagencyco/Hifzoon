import React from 'react';

export interface EyebrowProps {
  children: React.ReactNode;
  centered?: boolean;
  dark?: boolean;
  className?: string;
}

export function Eyebrow({
  children,
  centered = false,
  dark = false,
  className = '',
}: EyebrowProps) {
  const textColor = dark ? 'text-[#c49a55]' : 'text-[#a97f3c]';
  const lineColor = dark ? 'bg-[#c49a55]' : 'bg-[#a97f3c]';

  return (
    <div
      className={`inline-flex items-center gap-2 text-[12.5px] font-bold uppercase tracking-[0.14em] ${textColor} ${
        centered ? 'justify-center mx-auto' : ''
      } ${className}`}
    >
      <span className={`inline-block w-[22px] h-[1.5px] shrink-0 ${lineColor}`} />
      <span>{children}</span>
      {centered && (
        <span className={`inline-block w-[22px] h-[1.5px] shrink-0 ${lineColor}`} />
      )}
    </div>
  );
}
