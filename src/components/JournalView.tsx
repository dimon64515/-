import React, { useCallback, useEffect, useState } from 'react';
import { Ban, Printer, Search, X } from 'lucide-react';
import { api } from '../api';
import {
  formatDateRuShort,
  formatQty,
  type Material,
  type WarehouseDocument,
} from '../types';

interface JournalViewProps {
  materials: Material[];
  onPrint: (doc: WarehouseDocument) => void;
  onDocumentCancelled: () => void;
}

const DOC_TYPE_LABEL: Record<string, string> = {
  income: 'Приход',
  expense: 'Списание',
  adjustment: 'Корректировка',
};

const DOC_TYPE_COLOR: Record<string, string> = {
  income: 'text-emerald-700',
  expense: 'text-blue-700',
  adjustment: 'text-amber-700',
};

export function JournalView({ materials, onPrint, onDocumentCancelled }: JournalViewProps) {
  const [docs, setDocs] = useState<WarehouseDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [materialId, setMaterialId] = useState<number | ''>('');
  const [counterparty, setCounterparty] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<WarehouseDocument | null>(null);

  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.getDocuments({
        type: typeFilter,
        dateFrom,
        dateTo,
        materialId,
        counterparty,
        docNumber,
        includeCancelled: true,
      });
      setDocs(list);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, dateFrom, dateTo, materialId, counterparty, docNumber]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const handleConfirmCancel = async () => {
    if (!selectedDoc) return;
    setCancelError('');
    setCancelling(true);
    try {
      const updated = await api.cancelDocument(selectedDoc.id, cancelReason);
      setSelectedDoc(updated);
      setConfirmCancelOpen(false);
      setCancelReason('');
      await loadDocs();
      onDocumentCancelled();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Не удалось отменить документ');
    } finally {
      setCancelling(false);
    }
  };

  const resetFilters = () => {
    setTypeFilter('');
    setDateFrom('');
    setDateTo('');
    setMaterialId('');
    setCounterparty('');
    setDocNumber('');
  };

  const hasFilters = Boolean(typeFilter || dateFrom || dateTo || materialId || counterparty || docNumber);

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex p-1 bg-slate-100 rounded-lg">
            {[
              { id: '', label: 'Все' },
              { id: 'income', label: 'Приход' },
              { id: 'expense', label: 'Списание' },
              { id: 'adjustment', label: 'Корректировка' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTypeFilter(tab.id)}
                className={`px-3.5 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  typeFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {hasFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-sm text-blue-700 hover:text-blue-800 font-medium cursor-pointer"
            >
              Сбросить фильтры
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <input
            type="text"
            value={docNumber}
            onChange={(e) => setDocNumber(e.target.value)}
            placeholder="№ накладной (П-000001)"
            className="h-11 px-3 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700"
          />

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              placeholder="Контрагент..."
              className="w-full h-11 pl-9 pr-3 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
          </div>

          <select
            value={materialId}
            onChange={(e) => setMaterialId(e.target.value ? Number(e.target.value) : '')}
            className="h-11 px-3 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-700"
          >
            <option value="">Все материалы</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label="Дата с"
            className="h-11 px-3 text-sm font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-700"
          />

          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="Дата по"
            className="h-11 px-3 text-sm font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-700"
          />
        </div>
      </div>

      {/* Table / List */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : docs.length === 0 ? (
          <div className="p-10 text-center text-slate-500">
            <p className="text-base font-medium text-slate-700">Операций пока нет</p>
            <p className="text-sm mt-1">
              {hasFilters
                ? 'По заданным фильтрам документы не найдены.'
                : 'Оформите первый приход, списание или корректировку остатков.'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Номер</th>
                    <th className="px-4 py-3 text-left font-medium">Дата</th>
                    <th className="px-4 py-3 text-left font-medium">Операция</th>
                    <th className="px-4 py-3 text-left font-medium">Контрагент</th>
                    <th className="px-4 py-3 text-left font-medium">Позиции</th>
                    <th className="px-4 py-3 text-right font-medium">Статус</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {docs.map((doc) => {
                    const isCancelled = doc.status === 'cancelled';
                    const summary = doc.lines
                      .map((l) => `${l.material_name} (${formatQty(l.input_qty)} ${l.input_unit})`)
                      .join(', ');

                    return (
                      <tr
                        key={doc.id}
                        onClick={() => {
                          setSelectedDoc(doc);
                          setConfirmCancelOpen(false);
                          setCancelError('');
                        }}
                        className={`hover:bg-slate-50 transition-colors cursor-pointer ${
                          isCancelled ? 'opacity-60' : ''
                        }`}
                      >
                        <td className="px-4 py-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                          {doc.doc_number}
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                          {formatDateRuShort(doc.doc_date)}
                        </td>
                        <td className={`px-4 py-3 font-medium whitespace-nowrap ${DOC_TYPE_COLOR[doc.doc_type]}`}>
                          {DOC_TYPE_LABEL[doc.doc_type]}
                        </td>
                        <td className="px-4 py-3 text-slate-900 max-w-[200px] truncate">
                          {doc.counterparty || '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-600 max-w-md truncate">{summary}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {isCancelled ? (
                            <span className="text-red-700 font-medium">Отменён</span>
                          ) : (
                            <span className="text-slate-500">Проведён</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-slate-200">
              {docs.map((doc) => {
                const isCancelled = doc.status === 'cancelled';
                return (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => {
                      setSelectedDoc(doc);
                      setConfirmCancelOpen(false);
                      setCancelError('');
                    }}
                    className={`w-full p-4 text-left hover:bg-slate-50 transition-colors cursor-pointer ${
                      isCancelled ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-mono font-semibold text-slate-900">{doc.doc_number}</span>
                      <span className="text-xs font-mono text-slate-500">
                        {formatDateRuShort(doc.doc_date)}
                      </span>
                    </div>
                    <div className="text-sm text-slate-700 mb-1">
                      <span className={`font-medium ${DOC_TYPE_COLOR[doc.doc_type]}`}>
                        {DOC_TYPE_LABEL[doc.doc_type]}
                      </span>
                      <span className="mx-1.5 text-slate-400">·</span>
                      <span>{doc.counterparty || '—'}</span>
                      {isCancelled && (
                        <>
                          <span className="mx-1.5 text-slate-400">·</span>
                          <span className="text-red-700 font-medium">Отменён</span>
                        </>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      {doc.lines
                        .map((l) => `${l.material_name} (${formatQty(l.input_qty)} ${l.input_unit})`)
                        .join(', ')}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Operation detail modal */}
      {selectedDoc && (
        <div className="fixed inset-0 z-40 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-lg font-bold text-slate-900">
                  <span className="font-mono">{selectedDoc.doc_number}</span>
                  <span className="text-slate-400 font-normal">·</span>
                  <span className={DOC_TYPE_COLOR[selectedDoc.doc_type]}>
                    {DOC_TYPE_LABEL[selectedDoc.doc_type]}
                  </span>
                </div>
                <div className="text-sm text-slate-500 mt-0.5">
                  от {formatDateRuShort(selectedDoc.doc_date)}
                  {selectedDoc.status === 'cancelled' && (
                    <span className="text-red-700 font-semibold ml-2">· Документ отменён</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDoc(null)}
                className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
                aria-label="Закрыть"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-slate-500 block text-xs">
                    {selectedDoc.doc_type === 'income'
                      ? 'От кого'
                      : selectedDoc.doc_type === 'expense'
                        ? 'Кому'
                        : 'Тип'}
                  </span>
                  <span className="font-medium text-slate-900">{selectedDoc.counterparty || '—'}</span>
                </div>
                {selectedDoc.through_whom && (
                  <div>
                    <span className="text-slate-500 block text-xs">Через кого</span>
                    <span className="font-medium text-slate-900">{selectedDoc.through_whom}</span>
                  </div>
                )}
                {selectedDoc.basis && (
                  <div className="sm:col-span-2">
                    <span className="text-slate-500 block text-xs">Основание</span>
                    <span className="font-medium text-slate-900">{selectedDoc.basis}</span>
                  </div>
                )}
                {selectedDoc.note && (
                  <div className="sm:col-span-2">
                    <span className="text-slate-500 block text-xs">Примечание</span>
                    <span className="text-slate-800">{selectedDoc.note}</span>
                  </div>
                )}
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="px-3.5 py-2.5 text-left font-medium">Материал</th>
                      <th className="px-3.5 py-2.5 text-right font-medium">В документе</th>
                      <th className="px-3.5 py-2.5 text-right font-medium">В учёте (база)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedDoc.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="px-3.5 py-2.5 font-medium text-slate-900">{l.material_name}</td>
                        <td className="px-3.5 py-2.5 text-right font-mono tabular-nums text-slate-800">
                          {l.input_qty > 0 && selectedDoc.doc_type === 'adjustment' ? '+' : ''}
                          {formatQty(l.input_qty)} {l.input_unit}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono tabular-nums text-slate-500">
                          {l.base_qty > 0 && selectedDoc.doc_type === 'adjustment' ? '+' : ''}
                          {formatQty(l.base_qty)} {l.base_unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedDoc.status === 'cancelled' && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                  <span className="font-semibold">Причина отмены:</span>{' '}
                  {selectedDoc.cancel_reason || 'Не указана'}
                </div>
              )}

              {cancelError && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800" role="alert">
                  {cancelError}
                </div>
              )}

              {confirmCancelOpen && selectedDoc.status === 'active' && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                  <div className="text-sm font-semibold text-slate-900">
                    Подтвердите отмену документа {selectedDoc.doc_number}
                  </div>
                  <p className="text-xs text-slate-600">
                    Документ останется в журнале с пометкой «Отменён», а остатки будут пересчитаны.
                  </p>
                  <input
                    type="text"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Причина отмены (необязательно)"
                    className="w-full h-10 px-3 text-sm bg-white border border-slate-300 rounded-lg"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={cancelling}
                      onClick={handleConfirmCancel}
                      className="h-10 px-4 bg-red-700 hover:bg-red-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg cursor-pointer"
                    >
                      {cancelling ? 'Отмена...' : 'Подтвердить отмену'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmCancelOpen(false);
                        setCancelError('');
                      }}
                      className="h-10 px-4 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-sm font-medium rounded-lg cursor-pointer"
                    >
                      Назад
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
              <div>
                {selectedDoc.status === 'active' && !confirmCancelOpen && (
                  <button
                    type="button"
                    onClick={() => setConfirmCancelOpen(true)}
                    className="inline-flex items-center gap-1.5 h-11 px-4 text-sm font-medium text-red-700 hover:bg-red-50 border border-red-200 bg-white rounded-lg transition-colors cursor-pointer"
                  >
                    <Ban className="w-4 h-4" />
                    <span>Отменить документ</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {selectedDoc.doc_type !== 'adjustment' && (
                  <button
                    type="button"
                    onClick={() => {
                      const docToPrint = selectedDoc;
                      setSelectedDoc(null);
                      onPrint(docToPrint);
                    }}
                    className="inline-flex items-center gap-2 h-11 px-5 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Печать</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedDoc(null)}
                  className="h-11 px-4 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-sm font-medium rounded-lg cursor-pointer"
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
