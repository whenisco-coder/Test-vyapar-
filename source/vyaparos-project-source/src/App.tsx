import React, { useState, useEffect } from 'react';
import { getAppService } from './domain/services';
import { BusinessSettings } from './domain/types';
import { Navigation, NavTab } from './ui/components/Navigation';
import { OnboardingView } from './ui/views/OnboardingView';
import { InvoicesView } from './ui/views/InvoicesView';
import { ProductsView } from './ui/views/ProductsView';
import { PurchasesView } from './ui/views/PurchasesView';
import { PartiesView } from './ui/views/PartiesView';
import { ArtisansView } from './ui/views/ArtisansView';
import { SettingsView } from './ui/views/SettingsView';
import { HardDrive, WifiOff, RefreshCw } from 'lucide-react';

export default function App() {
  const service = getAppService();
  const [initializing, setInitializing] = useState(true);
  const [isConfigured, setIsConfigured] = useState(false);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);
  const [currentTab, setCurrentTab] = useState<NavTab>('invoices');
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    initApp();
  }, []);

  const initApp = async () => {
    try {
      setInitializing(true);
      setInitError(null);
      const res = await service.init();
      setIsConfigured(res.isConfigured);

      if (res.isConfigured) {
        const settings = await service.settings.get();
        setBusinessSettings(settings);
      }
    } catch (err: any) {
      console.error('Initialization error:', err);
      setInitError(err.message || 'Failed to initialize database engine');
    } finally {
      setInitializing(false);
    }
  };

  const handleOnboardingComplete = async (data: {
    businessName: string;
    tradeName?: string;
    gstin?: string;
    stateCode: string;
    addressLine1?: string;
    city?: string;
    pincode?: string;
    phone?: string;
    email?: string;
    invoicePrefix?: string;
    loadStarterPack: boolean;
  }) => {
    const settings = await service.setupBusiness({
      ...data,
      loadStarterPack: data.loadStarterPack,
    });
    setBusinessSettings(settings);
    setIsConfigured(true);
  };

  if (initializing) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 font-bold text-2xl shadow-lg mb-4 animate-pulse">
          B
        </div>
        <h2 className="text-lg font-bold tracking-tight">Vyapar OS</h2>
        <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Mounting SQLite WASM & OPFS storage...
        </p>
      </div>
    );
  }

  if (initError) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white">
        <div className="max-w-md w-full bg-slate-800 p-6 rounded-2xl border border-rose-500/30 text-center space-y-4">
          <div className="inline-flex p-3 rounded-xl bg-rose-500/20 text-rose-400">
            <WifiOff className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold">Storage Engine Startup Issue</h2>
          <p className="text-xs text-slate-300">{initError}</p>
          <button
            onClick={initApp}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold"
          >
            Retry Startup
          </button>
        </div>
      </div>
    );
  }

  if (!isConfigured || !businessSettings) {
    return <OnboardingView onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col md:flex-row">
      {/* Navigation: Desktop Sidebar + Mobile Bottom Tab Bar */}
      <Navigation
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        businessName={businessSettings.trade_name || businessSettings.business_name}
      />

      {/* Main Content Area */}
      <main className="flex-1 md:ml-60 min-h-screen flex flex-col pb-20 md:pb-8">
        {/* Top Header */}
        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between no-print">
          <div className="flex items-center gap-2.5">
            <span className="font-bold text-sm text-slate-900 truncate">
              {businessSettings.trade_name || businessSettings.business_name}
            </span>
            {businessSettings.gstin && (
              <span className="hidden sm:inline-block font-mono text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                GSTIN: {businessSettings.gstin}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 text-slate-500">
              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              <span className="hidden sm:inline text-[11px] font-medium text-slate-600">
                Local Device Storage
              </span>
            </div>
          </div>
        </header>

        {/* Tab Content */}
        <div className="p-4 sm:p-6 flex-1 max-w-7xl w-full mx-auto">
          {currentTab === 'invoices' && <InvoicesView business={businessSettings} />}
          {currentTab === 'products' && <ProductsView business={businessSettings} />}
          {currentTab === 'purchases' && <PurchasesView business={businessSettings} />}
          {currentTab === 'parties' && <PartiesView business={businessSettings} />}
          {currentTab === 'artisans' && <ArtisansView business={businessSettings} />}
          {currentTab === 'settings' && (
            <SettingsView
              business={businessSettings}
              onBusinessUpdated={(updated) => setBusinessSettings(updated)}
            />
          )}
        </div>
      </main>
    </div>
  );
}
