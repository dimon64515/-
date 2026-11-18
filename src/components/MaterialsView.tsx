import React, { useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { api } from '../api';
import { formatQty, type Material } from '../types';

interface MaterialsViewProps {
  materials: Material[];
  loading: boolean;
  onChanged: () => void;
}

const UNIT_OPTIONS = ['шт', 'кг', 'м', 'т', 'л', 'м²', 'м³', 'уп'];

function parseOptionalNumber(raw: string): number | null {
  const cleaned = raw.replace(/\s+/g, '').replace(',', '.');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

export function MaterialsView({ materials, loading, onChanged }: MaterialsViewProps) {
  const [search, setSearch] = useState('');
  const [showHidden, setShowHidden] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);

  const [name, setName] = useState('');
  const [baseUnit, setBaseUnit] = useState('шт');
  const [specificWeight, setSpecificWeight] = useState('');
  const [rodLength, setRodLength] = useState('');
  const [minStock, setMinStock] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return materials.filter((m) => {
      if (!showHidden && !m.is_active) return false;
      if (q && !m.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [materials, search, showHidden]);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setBaseUnit('шт');
    setSpecificWeight('');
    setRodLength('');
    setMinStock('');
    setIsActive(true);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (mat: Material) => {
    setEditing(mat);
    setName(mat.name);
    setBaseUnit(mat.base_unit);
    setSpecificWeight(mat.specific_weight !== null ? String(mat.specific_weight).replace('.', ',') : '');
    setRodLength(mat.rod_length !== null ? String(mat.rod_length).replace('.', ',') : '');
    setMinStock(mat.min_stock !== null ? String(mat.min_stock).replace('.', ',') : '');
    setIsActive(mat.is_active);
    setError('');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const w = parseOptionalNumber(specificWeight);
    const l = parseOptionalNumber(rodLength);
    const min = parseOptionalNumber(minStock);

    if (!name.trim()) {
      setError('Укажите наименование материала');
      return;
    }
    if (Number.isNaN(w) || (w !== null && w <= 0)) {
      setError('Удельный вес должен быть положительным числом');
      return;
    }
    if (Number.isNaN(l) || (l !== null && l <= 0)) {
      setError('Длина хлыста должна быть положительным числом');
      return;
    }
    if (Number.isNaN(min) || (min !== null && min < 0)) {
      setError('Минимальный остаток не может быть отрицательным');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await api.updateMaterial(editing.id, {
          name: name.trim(),
          base_unit: baseUnit.trim(),
          specific_weight: w,
          rod_length: l,
          min_stock: min,
          is_active: isActive,
        });
      } else {
        await api.createMaterial({
          name: name.trim(),
          base_unit: baseUnit.trim(),
          specific_weight: w,
          rod_length: l,
          min_stock: min,
        });
      }
      setModalOpen(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    setError('');
    setSaving(true);
    try {
      await api.deleteMaterial(editing.id);
      setModalOpen(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить материал');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск материала..."
              className="w-full h-11 pl-10 pr-3.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(e) => setShowHidden(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-blue-700 focus:ring-blue-700"
            />
            <span>Показывать скрытые</span>
          </label>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 h-11 px-4 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Добавить материал</span>
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-11 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Материал</th>
                  <th className="px-4 py-3 text-left font-medium">Базовая ед.</th>
                  <th className="px-4 py-3 text-right font-medium">Уд. вес, кг/м</th>
                  <th className="px-4 py-3 text-right font-medium">Хлыст, м</th>
                  <th className="px-4 py-3 text-right font-medium">Мин. остаток</th>
                  <th className="px-4 py-3 text-left font-medium">Статус</th>
                  <th className="px-4 py-3 text-right font-medium w-28">Правка</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((mat) => {
                  const needsWeightHint =
                    mat.base_unit === 'м' &&
                    mat.specific_weight === null &&
                    (mat.name.toLowerCase().includes('труба') || mat.name.toLowerCase().includes('уголок'));

                  return (
                    <tr key={mat.id} className={!mat.is_active ? 'opacity-55 bg-slate-50/40' : 'hover:bg-slate-50/70'}>
                      <td className="px-4 py-3 font-medium text-slate-900">{mat.name}</td>
                      <td className="px-4 py-3 text-slate-700">{mat.base_unit}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {mat.specific_weight !== null ? (
                          <span className="text-slate-900">{formatQty(mat.specific_weight)}</span>
                        ) : needsWeightHint ? (
                          <button
                            type="button"
                            onClick={() => openEdit(mat)}
                            className="text-xs font-sans text-amber-700 hover:underline cursor-pointer"
                          >
                            внести
                          </button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                        {mat.rod_length !== null ? formatQty(mat.rod_length) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                        {mat.min_stock !== null ? formatQty(mat.min_stock) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={mat.is_active ? 'text-emerald-700' : 'text-slate-500'}>
                          {mat.is_active ? 'Активен' : 'Скрыт'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openEdit(mat)}
                          className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Изменить</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">
                {editing ? 'Редактировать материал' : 'Новый материал'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
                aria-label="Закрыть"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 overflow-y-auto space-y-4">
              <div>
                <label htmlFor="mat-name" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Наименование
                </label>
                <input
                  id="mat-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Например: Труба проф. 20×40×2"
                  className="w-full h-11 px-3.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="mat-unit" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Базовая единица
                  </label>
                  <select
                    id="mat-unit"
                    value={UNIT_OPTIONS.includes(baseUnit) ? baseUnit : 'custom'}
                    onChange={(e) => {
                      if (e.target.value !== 'custom') setBaseUnit(e.target.value);
                    }}
                    className="w-full h-11 px-3 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  >
                    {UNIT_OPTIONS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="mat-min" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Мин. остаток (опционально)
                  </label>
                  <input
                    id="mat-min"
                    type="text"
                    inputMode="decimal"
                    value={minStock}
                    onChange={(e) => setMinStock(e.target.value)}
                    placeholder="Не задан"
                    className="w-full h-11 px-3.5 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="mat-weight" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Удельный вес, кг/м
                  </label>
                  <input
                    id="mat-weight"
                    type="text"
                    inputMode="decimal"
                    value={specificWeight}
                    onChange={(e) => setSpecificWeight(e.target.value)}
                    placeholder="Например: 0,617"
                    className="w-full h-11 px-3.5 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>
                <div>
                  <label htmlFor="mat-rod" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Длина хлыста, м
                  </label>
                  <input
                    id="mat-rod"
                    type="text"
                    inputMode="decimal"
                    value={rodLength}
                    onChange={(e) => setRodLength(e.target.value)}
                    placeholder="Например: 12"
                    className="w-full h-11 px-3.5 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>
              </div>

              {editing && (
                <div className="pt-1">
                  <label className="inline-flex items-center gap-2.5 text-sm font-medium text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-700"
                    />
                    <span>Активен (показывать в приходе и списании)</span>
                  </label>
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                <div>
                  {editing && !editing.has_movements && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleDelete}
                      className="inline-flex items-center gap-1.5 h-10 px-3 text-sm font-medium text-red-700 hover:bg-red-50 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Удалить</span>
                    </button>
                  )}
                  {editing && editing.has_movements && (
                    <span className="text-xs text-slate-500">
                      Есть движения — удаление недоступно, можно скрыть
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="h-11 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg cursor-pointer"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="h-11 px-5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg cursor-pointer"
                  >
                    {saving ? 'Сохранение...' : 'Сохранить'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
