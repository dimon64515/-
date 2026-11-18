import React, { useMemo, useState } from 'react';
import { AlertTriangle, Search, SlidersHorizontal, X } from 'lucide-react';
import { api } from '../api';
import { formatQty, getTodayIso, roundQty, type Material } from '../types';

interface StockViewProps {
  materials: Material[];
  loading: boolean;
  onAdjusted: () => void;
}

function parseQty(raw: string): number {
  const normalized = raw.replace(/\s+/g, '').replace(',', '.');
  if (!normalized) return NaN;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : NaN;
}

export function StockView({ materials, loading, onAdjusted }: StockViewProps) {
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'in_stock' | 'low'>('all');
  const [adjusting, setAdjusting] = useState<Material | null>(null);
  const [actualQtyText, setActualQtyText] = useState('');
  const [adjDate, setAdjDate] = useState(getTodayIso());
  const [adjNote, setAdjNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const activeMaterials = useMemo(() => materials.filter((m) => m.is_active), [materials]);
  const allZero = useMemo(
    () => activeMaterials.length > 0 && activeMaterials.every((m) => m.current_stock === 0),
    [activeMaterials]
  );

  const lowCount = useMemo(
    () =>
      activeMaterials.filter(
        (m) => m.min_stock !== null && m.current_stock <= m.min_stock
      ).length,
    [activeMaterials]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeMaterials.filter((m) => {
      if (q && !m.name.toLowerCase().includes(q)) return false;
      if (filterMode === 'in_stock' && m.current_stock <= 0) return false;
      if (filterMode === 'low' && (m.min_stock === null || m.current_stock > m.min_stock)) return false;
      return true;
    });
  }, [activeMaterials, search, filterMode]);

  const openAdjust = (mat: Material) => {
    setAdjusting(mat);
    setActualQtyText(String(mat.current_stock).replace('.', ','));
    setAdjDate(getTodayIso());
    setAdjNote('');
    setError('');
  };

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjusting) return;
    setError('');

    const actual = parseQty(actualQtyText);
    if (!Number.isFinite(actual) || actual < 0) {
      setError('Укажите корректное фактическое количество (0 или больше)');
      return;
    }

    setSaving(true);
    try {
      await api.createDocument({
        doc_type: 'adjustment',
        doc_date: adjDate,
        material_id: adjusting.id,
        actual_qty: actual,
        note: adjNote.trim() || 'Корректировка по факту',
      });
      setAdjusting(null);
      onAdjusted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить корректировку');
    } finally {
      setSaving(false);
    }
  };

  const parsedActual = parseQty(actualQtyText);
  const delta =
    adjusting && Number.isFinite(parsedActual) && parsedActual >= 0
      ? roundQty(parsedActual - adjusting.current_stock)
      : null;

  return (
    <div className="space-y-5">
      {allZero && !loading && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-slate-800">
          <div className="font-semibold text-slate-900">Начальный запуск склада</div>
          <p className="mt-1 text-slate-600">
            Сейчас все остатки равны нулю. Чтобы занести фактическое наличие на складе, нажмите
            «Корректировка» напротив нужного материала или оформите приход.
          </p>
        </div>
      )}

      {/* Search and filter bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию материала..."
            className="w-full h-11 pl-10 pr-3.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700"
          />
        </div>

        <div className="inline-flex p-1 bg-slate-100 rounded-lg self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`px-3.5 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              filterMode === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Все ({activeMaterials.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('in_stock')}
            className={`px-3.5 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              filterMode === 'in_stock'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            В наличии
          </button>
          {lowCount > 0 && (
            <button
              type="button"
              onClick={() => setFilterMode('low')}
              className={`px-3.5 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filterMode === 'low'
                  ? 'bg-white text-amber-800 shadow-sm'
                  : 'text-amber-700 hover:text-amber-900'
              }`}
            >
              Ниже минимума ({lowCount})
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-11 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-slate-500">
            <p className="text-base font-medium text-slate-700">Материалы не найдены</p>
            <p className="text-sm mt-1">Измените строку поиска или фильтр.</p>
          </div>
        ) : (
          <>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Материал</th>
                    <th className="px-4 py-3 text-right font-medium">Текущий остаток</th>
                    <th className="px-4 py-3 text-left font-medium w-24">Ед. изм.</th>
                    <th className="px-4 py-3 text-right font-medium">Мин. остаток</th>
                    <th className="px-4 py-3 text-right font-medium w-40">Действие</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((mat) => {
                    const isLow = mat.min_stock !== null && mat.current_stock <= mat.min_stock;
                    return (
                      <tr key={mat.id} className={isLow ? 'bg-amber-50/50' : 'hover:bg-slate-50/70'}>
                        <td className="px-4 py-3.5 font-medium text-slate-900">
                          <div className="flex items-center gap-2">
                            <span>{mat.name}</span>
                            {isLow && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>Мало</span>
                              </span>
                            )}
                          </div>
                        </td>
                        <td
                          className={`px-4 py-3.5 text-right font-mono tabular-nums text-base font-semibold ${
                            mat.current_stock === 0
                              ? 'text-slate-400'
                              : isLow
                                ? 'text-amber-800'
                                : 'text-slate-900'
                          }`}
                        >
                          {formatQty(mat.current_stock)}
                        </td>
                        <td className="px-4 py-3.5 text-slate-600">{mat.base_unit}</td>
                        <td className="px-4 py-3.5 text-right font-mono tabular-nums text-slate-500">
                          {mat.min_stock !== null ? `${formatQty(mat.min_stock)} ${mat.base_unit}` : '—'}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => openAdjust(mat)}
                            className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                            <span>Корректировка</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <div className="sm:hidden divide-y divide-slate-200">
              {filtered.map((mat) => {
                const isLow = mat.min_stock !== null && mat.current_stock <= mat.min_stock;
                return (
                  <div key={mat.id} className={`p-4 flex items-center justify-between gap-3 ${isLow ? 'bg-amber-50/40' : ''}`}>
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 truncate">{mat.name}</div>
                      <div className="mt-1 flex items-center gap-2 text-sm">
                        <span className="font-mono font-semibold tabular-nums text-slate-900">
                          {formatQty(mat.current_stock)} {mat.base_unit}
                        </span>
                        {isLow && (
                          <span className="text-xs font-medium text-amber-800">
                            · Мало (мин. {formatQty(mat.min_stock!)})
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openAdjust(mat)}
                      className="h-10 px-3 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg shrink-0 cursor-pointer"
                    >
                      Корректировка
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Adjustment modal */}
      {adjusting && (
        <div className="fixed inset-0 z-40 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Корректировка остатка</h3>
              <button
                type="button"
                onClick={() => setAdjusting(null)}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
                aria-label="Закрыть"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAdjustment} className="p-5 space-y-4">
              <div>
                <div className="text-sm font-semibold text-slate-900">{adjusting.name}</div>
                <div className="text-sm text-slate-600 mt-1">
                  По учёту сейчас:{' '}
                  <span className="font-mono font-semibold text-slate-900">
                    {formatQty(adjusting.current_stock)} {adjusting.base_unit}
                  </span>
                </div>
              </div>

              <div>
                <label htmlFor="adj-actual" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Фактическое количество ({adjusting.base_unit})
                </label>
                <input
                  id="adj-actual"
                  type="text"
                  inputMode="decimal"
                  value={actualQtyText}
                  onChange={(e) => setActualQtyText(e.target.value)}
                  autoFocus
                  className="w-full h-12 px-3.5 text-lg font-mono tabular-nums bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
                {delta !== null && delta !== 0 && (
                  <p className="text-xs text-slate-600 mt-1.5">
                    Программа создаст корректировку:{' '}
                    <span className={`font-mono font-semibold ${delta > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {delta > 0 ? `+${formatQty(delta)}` : formatQty(delta)} {adjusting.base_unit}
                    </span>
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="adj-date" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Дата
                </label>
                <input
                  id="adj-date"
                  type="date"
                  value={adjDate}
                  onChange={(e) => setAdjDate(e.target.value)}
                  className="w-full h-11 px-3 text-sm font-mono bg-white border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label htmlFor="adj-note" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Комментарий (необязательно)
                </label>
                <input
                  id="adj-note"
                  type="text"
                  value={adjNote}
                  onChange={(e) => setAdjNote(e.target.value)}
                  placeholder="Например: Инвентаризация или ввод остатков"
                  className="w-full h-11 px-3 text-sm bg-white border border-slate-300 rounded-lg"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjusting(null)}
                  className="h-11 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={saving || delta === 0}
                  className="h-11 px-5 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-semibold rounded-lg cursor-pointer"
                >
                  {saving ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
