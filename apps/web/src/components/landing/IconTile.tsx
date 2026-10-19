import React from 'react';

export interface IconTileProps {
  children: React.ReactNode;
  className?: string;
}

export function IconTile({ children, className = '' }: IconTileProps) {
  return (
    <div
      className={`w-[46px] h-[46px] rounded-[14px] bg-[#f0f6f3] flex items-center justify-center text-[#1c4c3e] shrink-0 [&>svg]:w-[22px] [&>svg]:h-[22px] ${className}`}
    >
      {children}
    </div>
  );
}
