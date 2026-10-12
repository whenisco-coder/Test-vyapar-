import React from 'react';
import { FileText, Package, ShoppingCart, Users, Settings, Handshake } from 'lucide-react';

export type NavTab = 'invoices' | 'products' | 'purchases' | 'parties' | 'artisans' | 'settings';

interface NavigationProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  businessName?: string;
  isOffline?: boolean;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentTab,
  onSelectTab,
  businessName = 'Business OS',
  isOffline = false,
}) => {
  const tabs = [
    { id: 'invoices' as NavTab, label: 'Invoices', icon: FileText },
    { id: 'products' as NavTab, label: 'Products', icon: Package },
    { id: 'purchases' as NavTab, label: 'Purchases', icon: ShoppingCart },
    { id: 'parties' as NavTab, label: 'Parties', icon: Users },
    { id: 'artisans' as NavTab, label: 'Artisans', icon: Handshake },
    { id: 'settings' as NavTab, label: 'Settings', icon: Settings },
  ];

  return (
    <>
      {/* Desktop Sidebar (visible on md and above) */}
      <aside className="hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 bg-slate-900 border-r border-slate-800 z-30">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold text-lg shadow-sm">
            B
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-bold text-white truncate tracking-tight">
              {businessName}
            </h1>
            <p className="text-[11px] font-medium text-emerald-400 flex items-center gap-1.5 mt-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Offline Ready
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1.5 px-3 py-4 overflow-y-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors select-none min-h-[44px] ${
                  isActive
                    ? 'bg-slate-800 text-white font-semibold shadow-xs'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                <Icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer info in sidebar */}
        <div className="p-4 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
          <div className="flex items-center justify-between">
            <span>Storage Engine</span>
            <span className="font-semibold text-slate-200">SQLite OPFS</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Version</span>
            <span className="font-mono text-slate-300">v0.1.0</span>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Tab Bar (visible below md) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900 border-t border-slate-800 shadow-lg pb-safe">
        <div className="grid grid-cols-6 h-16">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`flex flex-col items-center justify-center gap-1 py-1 px-1 transition-colors select-none min-h-[48px] ${
                  isActive ? 'text-indigo-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`}
                aria-label={tab.label}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="text-[10px] tracking-tight truncate max-w-[60px]">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
