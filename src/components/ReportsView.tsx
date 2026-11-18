import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Printer } from 'lucide-react';
import { api } from '../api';
import {
  formatDateRuLong,
  formatQty,
  getTodayIso,
  roundQty,
  type AppSettings,
  type DailyReportData,
  type Material,
  type PeriodReportData,
} from '../types';

interface ReportsViewProps {
  materials: Material[];
  settings: AppSettings;
  onPrintDaily: (first: DailyReportData, second: DailyReportData) => void;
}

function getMonthStartIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

export function ReportsView({ materials, settings, onPrintDaily }: ReportsViewProps) {
  const [subTab, setSubTab] = useState<'daily' | 'period' | 'purchase'>('daily');

  // Daily report state
  const [dailyDate1, setDailyDate1] = useState(getTodayIso());
  const [secondMode, setSecondMode] = useState<'duplicate' | 'other'>('duplicate');
  const [dailyDate2, setDailyDate2] = useState(getTodayIso());
  const [report1, setReport1] = useState<DailyReportData | null>(null);
  const [report2, setReport2] = useState<DailyReportData | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);

  // Period report state
  const [dateFrom, setDateFrom] = useState(getMonthStartIso());
  const [dateTo, setDateTo] = useState(getTodayIso());
  const [periodMaterialId, setPeriodMaterialId] = useState<number | ''>('');
  const [periodData, setPeriodData] = useState<PeriodReportData | null>(null);
  const [periodLoading, setPeriodLoading] = useState(false);

  // Purchase request state
  const [orderQtys, setOrderQtys] = useState<Record<number, string>>({});
  const [extraMaterialIds, setExtraMaterialIds] = useState<number[]>([]);
  const [copied, setCopied] = useState(false);

  const loadDaily = useCallback(async () => {
    setDailyLoading(true);
    try {
      const r1 = await api.getDailyReport(dailyDate1);
      setReport1(r1);
      if (secondMode === 'duplicate' || dailyDate2 === dailyDate1) {
        setReport2(r1);
      } else {
        const r2 = await api.getDailyReport(dailyDate2);
        setReport2(r2);
      }
    } finally {
      setDailyLoading(false);
    }
  }, [dailyDate1, dailyDate2, secondMode]);

  useEffect(() => {
    if (subTab === 'daily') {
      loadDaily();
    }
  }, [subTab, loadDaily]);

  const loadPeriod = useCallback(async () => {
    if (!dateFrom || !dateTo) return;
    setPeriodLoading(true);
    try {
      const res = await api.getPeriodReport(dateFrom, dateTo, periodMaterialId);
      setPeriodData(res);
    } finally {
      setPeriodLoading(false);
    }
  }, [dateFrom, dateTo, periodMaterialId]);

  useEffect(() => {
    if (subTab === 'period') {
      loadPeriod();
    }
  }, [subTab, loadPeriod]);

  const lowStockMaterials = useMemo(
    () =>
      materials.filter(
        (m) => m.is_active && m.min_stock !== null && m.current_stock <= m.min_stock
      ),
    [materials]
  );

  const purchaseList = useMemo(() => {
    const lowIds = new Set(lowStockMaterials.map((m) => m.id));
    const extras = materials.filter((m) => m.is_active && extraMaterialIds.includes(m.id) && !lowIds.has(m.id));
    return [...lowStockMaterials, ...extras];
  }, [lowStockMaterials, materials, extraMaterialIds]);

  const availableExtras = useMemo(() => {
    const used = new Set(purchaseList.map((m) => m.id));
    return materials.filter((m) => m.is_active && !used.has(m.id));
  }, [materials, purchaseList]);

  const handleCopyPurchase = async () => {
    const lines = purchaseList.map((m, idx) => {
      const defaultOrder =
        m.min_stock !== null ? Math.max(0, roundQty(m.min_stock * 2 - m.current_stock)) : 0;
      const qtyStr = orderQtys[m.id] ?? (defaultOrder > 0 ? String(defaultOrder) : '');
      return `${idx + 1}. ${m.name} — ${qtyStr || '?'} ${m.base_unit} (остаток: ${formatQty(m.current_stock)} ${m.base_unit})`;
    });
    const text = `Заявка на закупку от ${formatDateRuLong(getTodayIso())}\nОрганизация: ${settings.organization_name}\n\n${lines.join('\n')}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="space-y-5">
      {/* Sub-navigation tabs */}
      <div className="inline-flex flex-wrap p-1 bg-slate-200/70 rounded-lg">
        {[
          { id: 'daily', label: 'Отчёт за день' },
          { id: 'period', label: 'Аналитика за период' },
          { id: 'purchase', label: `Заявка на закупку${lowStockMaterials.length > 0 ? ` (${lowStockMaterials.length})` : ''}` },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSubTab(tab.id as 'daily' | 'period' | 'purchase')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              subTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 1. Daily Material Report */}
      {subTab === 'daily' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label htmlFor="daily-date-1" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Дата отчёта
                </label>
                <input
                  id="daily-date-1"
                  type="date"
                  value={dailyDate1}
                  onChange={(e) => setDailyDate1(e.target.value)}
                  className="h-11 px-3 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>

              <div>
                <span className="block text-sm font-medium text-slate-700 mb-1.5">
                  Второй экземпляр на листе А4
                </span>
                <div className="inline-flex p-1 bg-slate-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setSecondMode('duplicate')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md cursor-pointer ${
                      secondMode === 'duplicate' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    Дубль
                  </button>
                  <button
                    type="button"
                    onClick={() => setSecondMode('other')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md cursor-pointer ${
                      secondMode === 'other' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    Другая дата
                  </button>
                </div>
              </div>

              {secondMode === 'other' && (
                <div>
                  <label htmlFor="daily-date-2" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Вторая дата
                  </label>
                  <input
                    id="daily-date-2"
                    type="date"
                    value={dailyDate2}
                    onChange={(e) => setDailyDate2(e.target.value)}
                    className="h-11 px-3 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={!report1 || !report2}
              onClick={() => report1 && report2 && onPrintDaily(report1, report2)}
              className="inline-flex items-center justify-center gap-2 h-11 px-5 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Печать отчёта (А4)</span>
            </button>
          </div>

          {/* Preview of daily report */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-6">
            {dailyLoading ? (
              <div className="h-40 bg-slate-100 rounded animate-pulse" />
            ) : report1 ? (
              <>
                <div className="flex items-baseline justify-between border-b border-slate-200 pb-3">
                  <h3 className="text-base font-bold text-slate-900">
                    Материальный отчёт за {formatDateRuLong(report1.date)}
                  </h3>
                  <span className="text-xs text-slate-500">
                    Зав. складом: {settings.warehouse_manager_name || 'не указан в настройках'}
                  </span>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-slate-800 mb-2">Поступление на склад</h4>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <tr>
                          <th className="px-3.5 py-2 text-left font-medium">От кого</th>
                          <th className="px-3.5 py-2 text-left font-medium">№ накл.</th>
                          <th className="px-3.5 py-2 text-left font-medium">Наименование</th>
                          <th className="px-3.5 py-2 text-right font-medium">Количество</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {report1.income.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-3.5 py-4 text-center text-slate-500">
                              За выбранную дату поступлений нет
                            </td>
                          </tr>
                        ) : (
                          report1.income.map((r, i) => (
                            <tr key={i}>
                              <td className="px-3.5 py-2 text-slate-900">{r.counterparty}</td>
                              <td className="px-3.5 py-2 font-mono text-slate-700">{r.doc_number}</td>
                              <td className="px-3.5 py-2 text-slate-900">{r.material_name}</td>
                              <td className="px-3.5 py-2 text-right font-mono tabular-nums font-medium text-slate-900">
                                {formatQty(r.base_qty)} {r.base_unit}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-slate-800 mb-2">Отпуск со склада</h4>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <tr>
                          <th className="px-3.5 py-2 text-left font-medium">Кому</th>
                          <th className="px-3.5 py-2 text-left font-medium">№ накл.</th>
                          <th className="px-3.5 py-2 text-left font-medium">Наименование</th>
                          <th className="px-3.5 py-2 text-right font-medium">Количество</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {report1.expense.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-3.5 py-4 text-center text-slate-500">
                              За выбранную дату отпуска нет
                            </td>
                          </tr>
                        ) : (
                          report1.expense.map((r, i) => (
                            <tr key={i}>
                              <td className="px-3.5 py-2 text-slate-900">{r.counterparty}</td>
                              <td className="px-3.5 py-2 font-mono text-slate-700">{r.doc_number}</td>
                              <td className="px-3.5 py-2 text-slate-900">{r.material_name}</td>
                              <td className="px-3.5 py-2 text-right font-mono tabular-nums font-medium text-slate-900">
                                {formatQty(r.base_qty)} {r.base_unit}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* 2. Period Analytics */}
      {subTab === 'period' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="period-from" className="block text-sm font-medium text-slate-700 mb-1.5">
                Дата с
              </label>
              <input
                id="period-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full h-11 px-3 text-sm font-mono bg-white border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="period-to" className="block text-sm font-medium text-slate-700 mb-1.5">
                Дата по
              </label>
              <input
                id="period-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full h-11 px-3 text-sm font-mono bg-white border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="period-mat" className="block text-sm font-medium text-slate-700 mb-1.5">
                Материал
              </label>
              <select
                id="period-mat"
                value={periodMaterialId}
                onChange={(e) => setPeriodMaterialId(e.target.value ? Number(e.target.value) : '')}
                className="w-full h-11 px-3 text-sm bg-white border border-slate-300 rounded-lg"
              >
                <option value="">Все материалы</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {periodLoading ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <div className="h-48 bg-slate-100 rounded animate-pulse" />
            </div>
          ) : periodData ? (
            <>
              {/* Material movement summary */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 font-semibold text-slate-900 text-sm">
                  Движение материалов за период
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">Материал</th>
                        <th className="px-4 py-3 text-right font-medium">Нач. остаток</th>
                        <th className="px-4 py-3 text-right font-medium">Приход</th>
                        <th className="px-4 py-3 text-right font-medium">Расход</th>
                        <th className="px-4 py-3 text-right font-medium">Коррект.</th>
                        <th className="px-4 py-3 text-right font-medium">Кон. остаток</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {periodData.materials.map((row) => (
                        <tr key={row.material_id} className="hover:bg-slate-50/70">
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {row.material_name}{' '}
                            <span className="text-xs font-normal text-slate-500">({row.base_unit})</span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600">
                            {formatQty(row.opening_stock)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700">
                            {row.income_qty > 0 ? `+${formatQty(row.income_qty)}` : '0'}
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-blue-700">
                            {row.expense_qty > 0 ? `-${formatQty(row.expense_qty)}` : '0'}
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-amber-700">
                            {row.adjustment_qty > 0
                              ? `+${formatQty(row.adjustment_qty)}`
                              : formatQty(row.adjustment_qty)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                            {formatQty(row.closing_stock)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Counterparties breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {[
                  {
                    title: 'От кого поступило',
                    items: periodData.counterparties.filter((c) => c.doc_type === 'income'),
                    empty: 'Поступлений за период не было',
                  },
                  {
                    title: 'Кому отпущено',
                    items: periodData.counterparties.filter((c) => c.doc_type === 'expense'),
                    empty: 'Списаний за период не было',
                  },
                ].map((section) => (
                  <div key={section.title} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-slate-200 font-semibold text-slate-900 text-sm">
                      {section.title}
                    </div>
                    {section.items.length === 0 ? (
                      <div className="p-6 text-sm text-slate-500 text-center">{section.empty}</div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                          <tr>
                            <th className="px-4 py-2.5 text-left font-medium">Контрагент</th>
                            <th className="px-4 py-2.5 text-left font-medium">Материал</th>
                            <th className="px-4 py-2.5 text-right font-medium">Кол-во</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {section.items.map((cp, idx) => (
                            <tr key={idx}>
                              <td className="px-4 py-2.5 text-slate-900 font-medium">{cp.counterparty}</td>
                              <td className="px-4 py-2.5 text-slate-600">{cp.material_name}</td>
                              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-900">
                                {formatQty(cp.total_qty)} {cp.base_unit}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* 3. Purchase Request & Min Stock */}
      {subTab === 'purchase' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">Заявка на закупку</h3>
              <p className="text-sm text-slate-600 mt-0.5">
                Автоматически включает материалы с остатком не выше минимального. Можно добавить позиции вручную.
              </p>
            </div>
            {purchaseList.length > 0 && (
              <button
                type="button"
                onClick={handleCopyPurchase}
                className="inline-flex items-center justify-center gap-2 h-11 px-4 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg transition-colors shrink-0 cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Скопировано' : 'Копировать список'}</span>
              </button>
            )}
          </div>

          {purchaseList.length === 0 ? (
            <div className="p-6 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600 text-center">
              Материалов ниже минимального остатка сейчас нет. Задайте минимальный остаток в разделе «Материалы»
              или добавьте материал ниже вручную.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">Материал</th>
                    <th className="px-4 py-2.5 text-right font-medium">Остаток</th>
                    <th className="px-4 py-2.5 text-right font-medium">Мин. порог</th>
                    <th className="px-4 py-2.5 text-right font-medium w-44">К заказу</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {purchaseList.map((mat) => {
                    const suggested =
                      mat.min_stock !== null ? Math.max(0, roundQty(mat.min_stock * 2 - mat.current_stock)) : 0;
                    const val = orderQtys[mat.id] ?? (suggested > 0 ? String(suggested) : '');
                    return (
                      <tr key={mat.id}>
                        <td className="px-4 py-2.5 font-medium text-slate-900">{mat.name}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-amber-800 font-medium">
                          {formatQty(mat.current_stock)} {mat.base_unit}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-500">
                          {mat.min_stock !== null ? `${formatQty(mat.min_stock)} ${mat.base_unit}` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={val}
                              onChange={(e) =>
                                setOrderQtys((prev) => ({ ...prev, [mat.id]: e.target.value }))
                              }
                              placeholder="0"
                              className="w-24 h-9 px-2.5 text-right font-mono bg-white border border-slate-300 rounded-md"
                            />
                            <span className="text-slate-600 w-8 text-left">{mat.base_unit}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {availableExtras.length > 0 && (
            <div className="flex items-center gap-3 pt-1">
              <select
                value=""
                onChange={(e) => {
                  const id = Number(e.target.value);
                  if (id) setExtraMaterialIds((prev) => [...prev, id]);
                }}
                className="h-11 px-3 text-sm bg-white border border-slate-300 rounded-lg max-w-xs"
              >
                <option value="">+ Добавить материал в заявку...</option>
                {availableExtras.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} (ост. {formatQty(m.current_stock)} {m.base_unit})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
