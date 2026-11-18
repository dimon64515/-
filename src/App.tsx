import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  BookOpen,
  LogOut,
  Menu,
  Package,
  Settings,
  Warehouse,
  X,
} from 'lucide-react';
import { api, UnauthorizedError } from './api';
import { JournalView } from './components/JournalView';
import { LoginScreen } from './components/LoginScreen';
import { MaterialsView } from './components/MaterialsView';
import { OperationForm } from './components/OperationForm';
import { PrintDailyReport } from './components/PrintDailyReport';
import { PrintNakladnaya } from './components/PrintNakladnaya';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';
import { StockView } from './components/StockView';
import type {
  AppSettings,
  DailyReportData,
  Material,
  WarehouseDocument,
} from './types';

type ScreenId =
  | 'income'
  | 'expense'
  | 'journal'
  | 'stock'
  | 'reports'
  | 'materials'
  | 'settings';

const NAV_ITEMS: Array<{
  id: ScreenId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'income', label: 'Приход', icon: ArrowDownToLine },
  { id: 'expense', label: 'Списание', icon: ArrowUpFromLine },
  { id: 'journal', label: 'Журнал', icon: BookOpen },
  { id: 'stock', label: 'Остатки', icon: Warehouse },
  { id: 'reports', label: 'Отчёты', icon: BarChart3 },
  { id: 'materials', label: 'Материалы', icon: Package },
  { id: 'settings', label: 'Настройки', icon: Settings },
];

const DEFAULT_SETTINGS: AppSettings = {
  organization_name: 'ООО «Склад»',
  director_name: '',
  accountant_name: '',
  warehouse_manager_name: '',
  issued_by_name: '',
  received_by_name: '',
  numbering_mode: 'continuous',
};

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [isDefaultPassword, setIsDefaultPassword] = useState(false);

  const [screen, setScreen] = useState<ScreenId>('income');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(true);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  const [printDoc, setPrintDoc] = useState<WarehouseDocument | null>(null);
  const [printDaily, setPrintDaily] = useState<{
    first: DailyReportData;
    second: DailyReportData;
  } | null>(null);

  const checkAuth = useCallback(async () => {
    try {
      const status = await api.authStatus();
      setAuthenticated(status.authenticated);
      setIsDefaultPassword(status.isDefaultPassword);
    } catch {
      setAuthenticated(false);
    } finally {
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const loadWorkspaceData = useCallback(async () => {
    setMaterialsLoading(true);
    try {
      const [mats, sets] = await Promise.all([api.getMaterials(false), api.getSettings()]);
      setMaterials(mats);
      setSettings(sets);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        setAuthenticated(false);
      }
    } finally {
      setMaterialsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authenticated) {
      loadWorkspaceData();
    }
  }, [authenticated, loadWorkspaceData]);

  const handleLogout = async () => {
    await api.logout();
    setAuthenticated(false);
    setMobileMenuOpen(false);
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500">Загрузка...</div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <LoginScreen
        isDefaultPassword={isDefaultPassword}
        onLoginSuccess={(isDef) => {
          setIsDefaultPassword(isDef);
          setAuthenticated(true);
        }}
      />
    );
  }

  const activeNav = NAV_ITEMS.find((n) => n.id === screen) || NAV_ITEMS[0];
  const isPrinting = Boolean(printDoc || printDaily);

  return (
    <>
      <div className={`min-h-screen bg-slate-50 flex flex-col lg:flex-row ${isPrinting ? 'no-print' : ''}`}>
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white border-r border-slate-200">
          <div className="h-16 px-6 flex items-center border-b border-slate-200">
            <span className="text-xl font-bold tracking-tight text-slate-900">Склад</span>
          </div>

          <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Главное меню">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = screen === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setScreen(item.id)}
                  className={`w-full h-11 px-3.5 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-blue-700' : 'text-slate-500'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="p-3 border-t border-slate-200">
            <button
              type="button"
              onClick={handleLogout}
              className="w-full h-11 px-3.5 rounded-lg flex items-center gap-3 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
            >
              <LogOut className="w-5 h-5 text-slate-500 shrink-0" />
              <span>Выйти</span>
            </button>
          </div>
        </aside>

        {/* Mobile Top Bar */}
        <header className="lg:hidden sticky top-0 z-30 h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="w-10 h-10 -ml-2 flex items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 cursor-pointer"
              aria-label="Открыть меню"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <span className="text-base font-bold text-slate-900 truncate">{activeNav.label}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {screen !== 'income' && (
              <button
                type="button"
                onClick={() => {
                  setScreen('income');
                  setMobileMenuOpen(false);
                }}
                className="h-9 px-3 text-xs font-semibold text-blue-700 bg-blue-50 rounded-lg whitespace-nowrap cursor-pointer"
              >
                Приход
              </button>
            )}
            {screen !== 'expense' && (
              <button
                type="button"
                onClick={() => {
                  setScreen('expense');
                  setMobileMenuOpen(false);
                }}
                className="h-9 px-3 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg whitespace-nowrap cursor-pointer"
              >
                Списание
              </button>
            )}
          </div>
        </header>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 top-14 z-30 bg-slate-900/40" onClick={() => setMobileMenuOpen(false)}>
            <div
              className="bg-white border-b border-slate-200 p-3 space-y-1 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = screen === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setScreen(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full h-12 px-4 rounded-lg flex items-center gap-3 text-base font-medium cursor-pointer ${
                      isActive ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
              <div className="pt-2 mt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full h-12 px-4 rounded-lg flex items-center gap-3 text-base font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  <LogOut className="w-5 h-5 shrink-0" />
                  <span>Выйти</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
          {/* Desktop Top Header */}
          <header className="hidden lg:flex h-16 bg-white border-b border-slate-200 px-8 items-center justify-between gap-8">
            <h1 className="text-xl font-bold text-slate-900 whitespace-nowrap">{activeNav.label}</h1>

            <div className="flex items-center gap-3 shrink-0">
              {screen !== 'income' && (
                <button
                  type="button"
                  onClick={() => setScreen('income')}
                  className="h-10 px-4 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Оформить приход
                </button>
              )}
              {screen !== 'expense' && (
                <button
                  type="button"
                  onClick={() => setScreen('expense')}
                  className="h-10 px-4 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Оформить списание
                </button>
              )}
            </div>
          </header>

          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl w-full">
            {screen === 'income' && (
              <OperationForm
                mode="income"
                materials={materials}
                onSaved={() => loadWorkspaceData()}
                onPrint={(doc) => setPrintDoc(doc)}
              />
            )}

            {screen === 'expense' && (
              <OperationForm
                mode="expense"
                materials={materials}
                onSaved={() => loadWorkspaceData()}
                onPrint={(doc) => setPrintDoc(doc)}
              />
            )}

            {screen === 'journal' && (
              <JournalView
                materials={materials}
                onPrint={(doc) => setPrintDoc(doc)}
                onDocumentCancelled={() => loadWorkspaceData()}
              />
            )}

            {screen === 'stock' && (
              <StockView
                materials={materials}
                loading={materialsLoading}
                onAdjusted={() => loadWorkspaceData()}
              />
            )}

            {screen === 'reports' && (
              <ReportsView
                materials={materials}
                settings={settings}
                onPrintDaily={(first, second) => setPrintDaily({ first, second })}
              />
            )}

            {screen === 'materials' && (
              <MaterialsView
                materials={materials}
                loading={materialsLoading}
                onChanged={() => loadWorkspaceData()}
              />
            )}

            {screen === 'settings' && (
              <SettingsView
                settings={settings}
                onSettingsUpdated={(next) => setSettings(next)}
                onPasswordChanged={() => setIsDefaultPassword(false)}
              />
            )}
          </main>
        </div>
      </div>

      {/* Print Modals */}
      {printDoc && (
        <PrintNakladnaya
          document={printDoc}
          settings={settings}
          onClose={() => setPrintDoc(null)}
        />
      )}

      {printDaily && (
        <PrintDailyReport
          firstReport={printDaily.first}
          secondReport={printDaily.second}
          settings={settings}
          onClose={() => setPrintDaily(null)}
        />
      )}
    </>
  );
}
