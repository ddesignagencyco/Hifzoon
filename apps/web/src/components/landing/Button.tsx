import React from 'react';
import Link from 'next/link';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'gold' | 'green' | 'outline' | 'ghostLight';
  size?: 'default' | 'sm';
  href?: string;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  className?: string;
  children: React.ReactNode;
}

export function Button({
  variant = 'green',
  size = 'default',
  href,
  icon,
  iconPosition = 'left',
  className = '',
  children,
  ...props
}: ButtonProps) {
  const baseStyles =
    'inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-200 cursor-pointer select-none whitespace-nowrap shrink-0 focus:outline-none focus:ring-2 focus:ring-[#c49a55] focus:ring-offset-2';

  const sizeStyles = {
    default: 'h-[52px] px-[26px] text-[15.5px]',
    sm: 'h-[40px] px-[18px] text-[13.5px]',
  };

  const variantStyles = {
    gold: 'bg-[#c49a55] text-[#0a1f19] hover:bg-[#b58c49] shadow-sm font-semibold active:translate-y-px',
    green: 'bg-[#143a2f] text-white hover:bg-[#0f2c24] shadow-sm font-medium active:translate-y-px',
    outline: 'bg-white border border-[#e6dfd1] text-[#10201b] hover:bg-[#f3eee4] hover:border-[#dcd5c9] shadow-sm active:translate-y-px',
    ghostLight: 'border border-white/28 text-white hover:bg-white/10 active:translate-y-px',
  };

  const combinedClasses = `${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`;

  const content = (
    <span className="inline-flex items-center justify-center gap-2 whitespace-nowrap">
      {icon && iconPosition === 'left' && (
        <span className="shrink-0 flex items-center [&>svg]:w-[18px] [&>svg]:h-[18px]">{icon}</span>
      )}
      <span className="inline-flex items-center justify-center gap-2 whitespace-nowrap">{children}</span>
      {icon && iconPosition === 'right' && (
        <span className="shrink-0 flex items-center [&>svg]:w-[18px] [&>svg]:h-[18px]">{icon}</span>
      )}
    </span>
  );

  if (href) {
    return (
      <Link href={href} className={combinedClasses}>
        {content}
      </Link>
    );
  }

  return (
    <button className={combinedClasses} {...props}>
      {content}
    </button>
  );
}
