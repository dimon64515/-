import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Plus, Printer, Trash2 } from 'lucide-react';
import { api } from '../api';
import {
  convertToBaseUnit,
  formatDateRuShort,
  formatQty,
  getAvailableInputUnits,
  getTodayIso,
  roundQty,
  type Material,
  type WarehouseDocument,
} from '../types';
import { MaterialSelect } from './MaterialSelect';

interface DraftLine {
  key: string;
  materialId: number | null;
  qtyText: string;
  unit: string;
}

interface OperationFormProps {
  mode: 'income' | 'expense';
  materials: Material[];
  onSaved: (doc: WarehouseDocument) => void;
  onPrint: (doc: WarehouseDocument) => void;
}

function parseQty(raw: string): number {
  const normalized = raw.replace(/\s+/g, '').replace(',', '.');
  if (!normalized) return NaN;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : NaN;
}

export function OperationForm({ mode, materials, onSaved, onPrint }: OperationFormProps) {
  const activeMaterials = useMemo(() => materials.filter((m) => m.is_active), [materials]);
  const materialsById = useMemo(() => {
    const map = new Map<number, Material>();
    for (const m of materials) map.set(m.id, m);
    return map;
  }, [materials]);

  const [docDate, setDocDate] = useState(getTodayIso());
  const [counterparty, setCounterparty] = useState('');
  const [throughWhom, setThroughWhom] = useState('');
  const [basis, setBasis] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [counterpartyHistory, setCounterpartyHistory] = useState<string[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([
    { key: '1', materialId: null, qtyText: '', unit: '' },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [savedDoc, setSavedDoc] = useState<WarehouseDocument | null>(null);

  useEffect(() => {
    setDocDate(getTodayIso());
    setCounterparty('');
    setThroughWhom('');
    setBasis('');
    setLines([{ key: String(Date.now()), materialId: null, qtyText: '', unit: '' }]);
    setError('');
    setSavedDoc(null);

    api
      .getCounterparties(mode)
      .then(setCounterpartyHistory)
      .catch(() => setCounterpartyHistory([]));
  }, [mode]);

  const filteredSuggestions = useMemo(() => {
    const q = counterparty.trim().toLowerCase();
    const list = q
      ? counterpartyHistory.filter((c) => c.toLowerCase().includes(q) && c.toLowerCase() !== q)
      : counterpartyHistory;
    return list.slice(0, 8);
  }, [counterparty, counterpartyHistory]);

  // Compute live converted values & stock check
  const lineAnalysis = useMemo(() => {
    const totalsByMat = new Map<number, number>();
    const parsed = lines.map((line) => {
      const mat = line.materialId ? materialsById.get(line.materialId) || null : null;
      const qty = parseQty(line.qtyText);
      const unit = line.unit || (mat ? mat.base_unit : '');
      const baseQty = mat && Number.isFinite(qty) && qty > 0 ? convertToBaseUnit(qty, unit, mat) : null;

      if (mat && baseQty !== null && baseQty > 0) {
        totalsByMat.set(mat.id, roundQty((totalsByMat.get(mat.id) || 0) + baseQty));
      }

      return { line, mat, qty, unit, baseQty };
    });

    const shortages: Array<{ material: Material; requested: number; available: number }> = [];
    if (mode === 'expense') {
      for (const [matId, totalReq] of totalsByMat.entries()) {
        const mat = materialsById.get(matId);
        if (mat && roundQty(mat.current_stock - totalReq) < 0) {
          shortages.push({
            material: mat,
            requested: totalReq,
            available: mat.current_stock,
          });
        }
      }
    }

    return { parsed, shortages };
  }, [lines, materialsById, mode]);

  const handleMaterialChange = (rowKey: string, mat: Material) => {
    setLines((prev) =>
      prev.map((row) =>
        row.key === rowKey ? { ...row, materialId: mat.id, unit: mat.base_unit } : row
      )
    );
  };

  const handleAddRow = () => {
    setLines((prev) => [
      ...prev,
      { key: `${Date.now()}_${Math.random()}`, materialId: null, qtyText: '', unit: '' },
    ]);
  };

  const handleRemoveRow = (rowKey: string) => {
    setLines((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== rowKey) : prev));
  };

  const handleResetForNew = () => {
    setSavedDoc(null);
    setCounterparty('');
    setThroughWhom('');
    setBasis('');
    setLines([{ key: String(Date.now()), materialId: null, qtyText: '', unit: '' }]);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!counterparty.trim()) {
      setError(mode === 'income' ? 'Укажите от кого поступил материал' : 'Укажите кому отпущен материал');
      return;
    }

    if (lineAnalysis.shortages.length > 0) {
      const s = lineAnalysis.shortages[0];
      setError(
        `Недостаточно на складе: «${s.material.name}» — доступно ${formatQty(s.available)} ${s.material.base_unit}, запрошено ${formatQty(s.requested)} ${s.material.base_unit}`
      );
      return;
    }

    const payloadLines: Array<{ material_id: number; input_qty: number; input_unit: string }> = [];
    for (let i = 0; i < lineAnalysis.parsed.length; i++) {
      const item = lineAnalysis.parsed[i];
      if (!item.mat) {
        setError(`Строка ${i + 1}: выберите материал`);
        return;
      }
      if (!Number.isFinite(item.qty) || item.qty <= 0) {
        setError(`Строка ${i + 1} («${item.mat.name}»): укажите количество больше нуля`);
        return;
      }
      if (item.baseQty === null || item.baseQty <= 0) {
        setError(`Строка ${i + 1} («${item.mat.name}»): проверьте единицу измерения`);
        return;
      }
      payloadLines.push({
        material_id: item.mat.id,
        input_qty: item.qty,
        input_unit: item.unit,
      });
    }

    setSubmitting(true);
    try {
      const created = await api.createDocument({
        doc_type: mode,
        doc_date: docDate,
        counterparty: counterparty.trim(),
        through_whom: throughWhom.trim(),
        basis: basis.trim(),
        lines: payloadLines,
      });
      setSavedDoc(created);
      onSaved(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить документ');
    } finally {
      setSubmitting(false);
    }
  };

  if (savedDoc) {
    return (
      <div className="max-w-3xl bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-11 h-11 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {mode === 'income' ? 'Приход сохранён' : 'Списание сохранено'}
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Накладная <span className="font-mono font-semibold text-slate-900">{savedDoc.doc_number}</span> от{' '}
              {formatDateRuShort(savedDoc.doc_date)} ·{' '}
              {mode === 'income' ? 'От кого: ' : 'Кому: '}
              <span className="font-medium text-slate-900">{savedDoc.counterparty}</span>
            </p>
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Материал</th>
                <th className="px-4 py-2.5 text-right font-medium">В документе</th>
                <th className="px-4 py-2.5 text-right font-medium">В базе</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {savedDoc.lines.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{l.material_name}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-800">
                    {formatQty(l.input_qty)} {l.input_unit}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-500">
                    {formatQty(l.base_qty)} {l.base_unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => onPrint(savedDoc)}
            className="inline-flex items-center justify-center gap-2 h-12 px-6 bg-blue-700 hover:bg-blue-800 text-white text-base font-semibold rounded-lg transition-colors cursor-pointer"
          >
            <Printer className="w-5 h-5" />
            <span>Распечатать накладную</span>
          </button>
          <button
            type="button"
            onClick={handleResetForNew}
            className="inline-flex items-center justify-center gap-2 h-12 px-5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-base font-medium rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-5 h-5" />
            <span>{mode === 'income' ? 'Новый приход' : 'Новое списание'}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl space-y-6">
      {/* Header fields */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="op-date" className="block text-sm font-medium text-slate-700 mb-1.5">
              Дата документа
            </label>
            <input
              id="op-date"
              type="date"
              value={docDate}
              onChange={(e) => setDocDate(e.target.value)}
              required
              className="w-full h-12 px-3.5 text-base bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700"
            />
          </div>

          <div className="sm:col-span-2 relative">
            <label htmlFor="op-counterparty" className="block text-sm font-medium text-slate-700 mb-1.5">
              {mode === 'income' ? 'От кого (поставщик / отправитель)' : 'Кому (объект / получатель)'}
            </label>
            <input
              id="op-counterparty"
              type="text"
              value={counterparty}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onChange={(e) => {
                setCounterparty(e.target.value);
                setShowSuggestions(true);
              }}
              placeholder={mode === 'income' ? 'Например: Трубокомплект' : 'Например: Ромашка или Красивый'}
              required
              className="w-full h-12 px-3.5 text-base bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700"
            />
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-300 rounded-lg shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100">
                {filteredSuggestions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setCounterparty(item);
                      setShowSuggestions(false);
                    }}
                    className="w-full px-3.5 py-2.5 text-left text-sm text-slate-800 hover:bg-blue-50 cursor-pointer"
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div>
            <label htmlFor="op-through" className="block text-sm font-medium text-slate-600 mb-1.5">
              Через кого (необязательно)
            </label>
            <input
              id="op-through"
              type="text"
              value={throughWhom}
              onChange={(e) => setThroughWhom(e.target.value)}
              placeholder="Водитель / ФИО"
              className="w-full h-11 px-3.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
          </div>
          <div>
            <label htmlFor="op-basis" className="block text-sm font-medium text-slate-600 mb-1.5">
              Основание (необязательно)
            </label>
            <input
              id="op-basis"
              type="text"
              value={basis}
              onChange={(e) => setBasis(e.target.value)}
              placeholder="Счёт, заявка или объект"
              className="w-full h-11 px-3.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
          </div>
        </div>
      </div>

      {/* Document lines */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-slate-900">Позиции документа</h2>
          <span className="text-xs text-slate-500">Строк: {lines.length}</span>
        </div>

        <div className="space-y-4">
          {lineAnalysis.parsed.map(({ line, mat, qty, unit, baseQty }, idx) => {
            const units = mat ? getAvailableInputUnits(mat) : [];
            const isShortage =
              mode === 'expense' &&
              mat !== null &&
              lineAnalysis.shortages.some((s) => s.material.id === mat.id);

            return (
              <div
                key={line.key}
                className={`p-4 rounded-lg border ${
                  isShortage ? 'border-red-300 bg-red-50/40' : 'border-slate-200 bg-slate-50/50'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start gap-3">
                  <div className="flex items-center gap-2 md:pt-2.5 shrink-0">
                    <span className="text-xs font-mono text-slate-500 w-5">{idx + 1}.</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <MaterialSelect
                      materials={activeMaterials}
                      value={line.materialId}
                      onChange={(selected) => handleMaterialChange(line.key, selected)}
                    />
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={line.qtyText}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((r) => (r.key === line.key ? { ...r, qtyText: e.target.value } : r))
                        )
                      }
                      placeholder="Кол-во"
                      aria-label="Количество"
                      className="w-28 sm:w-32 h-[46px] px-3 text-base font-mono tabular-nums text-right bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-700"
                    />

                    <select
                      value={unit}
                      disabled={!mat || units.length <= 1}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((r) => (r.key === line.key ? { ...r, unit: e.target.value } : r))
                        )
                      }
                      aria-label="Единица измерения"
                      className="h-[46px] px-3 text-sm font-medium bg-white border border-slate-300 rounded-lg text-slate-900 disabled:bg-slate-100 disabled:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-700"
                    >
                      {units.length > 0 ? (
                        units.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))
                      ) : (
                        <option value="">ед.</option>
                      )}
                    </select>

                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(line.key)}
                        className="w-11 h-[46px] flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        aria-label="Удалить строку"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Conversion info & hints */}
                {mat && (
                  <div className="mt-2 md:pl-7 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                    <div>
                      {baseQty !== null && Number.isFinite(qty) && qty > 0 && unit !== mat.base_unit ? (
                        <span>
                          Пересчёт в базу:{' '}
                          <span className="font-mono font-semibold text-slate-900">
                            {formatQty(baseQty)} {mat.base_unit}
                          </span>
                          {mat.specific_weight ? ` (уд. вес ${formatQty(mat.specific_weight)} кг/м` : ''}
                          {mat.rod_length && unit === 'хлыст' ? `, хлыст ${formatQty(mat.rod_length)} м` : ''}
                          {mat.specific_weight ? ')' : ''}
                        </span>
                      ) : (
                        <span>
                          Доступный остаток:{' '}
                          <span className="font-mono font-medium text-slate-800">
                            {formatQty(mat.current_stock)} {mat.base_unit}
                          </span>
                        </span>
                      )}
                    </div>

                    {mat.base_unit === 'м' && !mat.specific_weight && (
                      <span className="text-amber-700">
                        Для пересчёта в кг укажите удельный вес в разделе «Материалы»
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleAddRow}
          className="inline-flex items-center gap-2 h-11 px-4 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>+ строка</span>
        </button>
      </div>

      {/* Stock shortage warning */}
      {lineAnalysis.shortages.length > 0 && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-800" role="alert">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-red-700" />
          <div className="text-sm space-y-1">
            <div className="font-semibold">Списание невозможно — превышен остаток на складе:</div>
            {lineAnalysis.shortages.map((s) => (
              <div key={s.material.id}>
                {s.material.name}: доступно{' '}
                <span className="font-mono font-semibold">
                  {formatQty(s.available)} {s.material.base_unit}
                </span>
                , запрошено{' '}
                <span className="font-mono font-semibold">
                  {formatQty(s.requested)} {s.material.base_unit}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && lineAnalysis.shortages.length === 0 && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting || lineAnalysis.shortages.length > 0}
          className="h-12 px-7 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-base font-semibold rounded-lg transition-colors cursor-pointer"
        >
          {submitting
            ? 'Сохранение...'
            : mode === 'income'
              ? 'Сохранить приход'
              : 'Сохранить списание'}
        </button>
      </div>
    </form>
  );
}
