import React from 'react';

export interface PillTabItem {
  id: string;
  label: string;
  badge?: string;
}

export interface PillTabsProps {
  items: PillTabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
  dark?: boolean;
}

export function PillTabs({
  items,
  activeId,
  onChange,
  className = '',
  dark = false,
}: PillTabsProps) {
  const trackBg = dark ? 'bg-white/10' : 'bg-[#f3eee4]';

  return (
    <div
      className={`inline-flex items-center gap-1 p-1 rounded-full ${trackBg} max-w-full overflow-x-auto no-scrollbar ${className}`}
      role="tablist"
    >
      {items.map((item) => {
        const isActive = activeId === item.id;
        return (
          <button
            key={item.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(item.id)}
            className={`px-4 py-2 rounded-full text-[14px] font-medium transition-all duration-200 cursor-pointer whitespace-nowrap flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-[#c49a55] ${
              isActive
                ? 'bg-[#143a2f] text-white shadow-sm'
                : dark
                ? 'text-[#c4d3cd] hover:text-white'
                : 'text-[#3c4a45] hover:text-[#10201b]'
            }`}
          >
            <span>{item.label}</span>
            {item.badge && (
              <span
                className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                  isActive
                    ? 'bg-[#c49a55] text-[#0a1f19]'
                    : 'bg-[#c49a55]/20 text-[#a97f3c]'
                }`}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
