import React from 'react';
import { Printer, X } from 'lucide-react';
import { formatDateRuLong, formatQty, type AppSettings, type WarehouseDocument } from '../types';

interface PrintNakladnayaProps {
  document: WarehouseDocument;
  settings: AppSettings;
  onClose: () => void;
}

export function PrintNakladnaya({ document: doc, settings, onClose }: PrintNakladnayaProps) {
  const sender = doc.doc_type === 'income' ? doc.counterparty : settings.organization_name || '________________';
  const recipient = doc.doc_type === 'income' ? settings.organization_name || '________________' : doc.counterparty;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 overflow-y-auto flex flex-col items-center p-2 sm:p-6 print:static print:inset-auto print:bg-white print:p-0 print:block">
      {/* Toolbar - hidden during print */}
      <div className="no-print w-full max-w-[210mm] bg-white border border-slate-200 rounded-t-xl px-4 py-3 flex items-center justify-between gap-4 shadow-sm">
        <div className="text-sm font-medium text-slate-700 truncate">
          Предпросмотр печати: Накладная {doc.doc_number}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Печать</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-medium rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>Закрыть</span>
          </button>
        </div>
      </div>

      {/* Printable A4 sheet */}
      <div className="print-sheet w-full max-w-[210mm] bg-white border border-t-0 border-slate-200 rounded-b-xl p-6 sm:p-10 text-black shadow-sm">
        {doc.status === 'cancelled' && (
          <div className="mb-4 p-2 border-2 border-red-700 text-red-700 text-center font-bold text-sm uppercase tracking-wide">
            ДОКУМЕНТ ОТМЕНЁН ({doc.cancel_reason || 'аннулирован'})
          </div>
        )}

        {/* Header fields matching paper blank */}
        <div className="space-y-2 text-sm leading-snug mb-6">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold w-28 shrink-0">Отправитель:</span>
            <span className="flex-1 border-b border-black pb-0.5 min-h-[20px]">{sender}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-semibold w-28 shrink-0">Получатель:</span>
            <span className="flex-1 border-b border-black pb-0.5 min-h-[20px]">{recipient}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-semibold w-28 shrink-0">Через кого:</span>
            <span className="flex-1 border-b border-black pb-0.5 min-h-[20px]">{doc.through_whom || ''}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-semibold w-28 shrink-0">Основание:</span>
            <span className="flex-1 border-b border-black pb-0.5 min-h-[20px]">{doc.basis || ''}</span>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-center text-base sm:text-lg font-bold tracking-wide mb-5">
          НАКЛАДНАЯ № <span className="font-mono">{doc.doc_number}</span> от {formatDateRuLong(doc.doc_date)}
        </h2>

        {/* Table */}
        <table className="w-full border-collapse border border-black text-sm mb-8">
          <thead>
            <tr className="bg-slate-50 print:bg-transparent">
              <th className="border border-black px-2 py-1.5 text-center font-semibold w-12">№ п/п</th>
              <th className="border border-black px-2.5 py-1.5 text-left font-semibold">Наименование</th>
              <th className="border border-black px-2 py-1.5 text-center font-semibold w-20">Ед. изм.</th>
              <th className="border border-black px-2 py-1.5 text-right font-semibold w-24">Кол-во</th>
              <th className="border border-black px-2 py-1.5 text-right font-semibold w-24">Цена</th>
              <th className="border border-black px-2 py-1.5 text-right font-semibold w-28">Сумма</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((line, idx) => (
              <tr key={line.id || idx}>
                <td className="border border-black px-2 py-1.5 text-center tabular-nums">{idx + 1}</td>
                <td className="border border-black px-2.5 py-1.5 text-left">{line.material_name}</td>
                <td className="border border-black px-2 py-1.5 text-center">{line.input_unit}</td>
                <td className="border border-black px-2 py-1.5 text-right font-mono tabular-nums font-medium">
                  {formatQty(line.input_qty)}
                </td>
                <td className="border border-black px-2 py-1.5"></td>
                <td className="border border-black px-2 py-1.5"></td>
              </tr>
            ))}
            {/* Total empty rows or summary line */}
            <tr>
              <td colSpan={4} className="border border-black px-2.5 py-1.5 text-right font-semibold">
                Всего наименований: {doc.lines.length}
              </td>
              <td className="border border-black px-2 py-1.5 text-right font-semibold">Итого:</td>
              <td className="border border-black px-2 py-1.5"></td>
            </tr>
          </tbody>
        </table>

        {doc.note && (
          <div className="text-xs text-slate-700 print:text-black mb-6">
            <span className="font-semibold">Примечание:</span> {doc.note}
          </div>
        )}

        {/* Signatures block */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-5 text-sm pt-2">
          <div className="flex items-end gap-2">
            <span className="font-semibold whitespace-nowrap">Директор</span>
            <span className="flex-1 border-b border-black text-center text-xs pb-0.5 min-h-[20px]">
              {settings.director_name || ''}
            </span>
          </div>
          <div className="flex items-end gap-2">
            <span className="font-semibold whitespace-nowrap">Гл. бухгалтер</span>
            <span className="flex-1 border-b border-black text-center text-xs pb-0.5 min-h-[20px]">
              {settings.accountant_name || ''}
            </span>
          </div>
          <div className="flex items-end gap-2">
            <span className="font-semibold whitespace-nowrap">Отпустил</span>
            <span className="flex-1 border-b border-black text-center text-xs pb-0.5 min-h-[20px]">
              {settings.issued_by_name || ''}
            </span>
          </div>
          <div className="flex items-end gap-2">
            <span className="font-semibold whitespace-nowrap">Принял</span>
            <span className="flex-1 border-b border-black text-center text-xs pb-0.5 min-h-[20px]">
              {settings.received_by_name || ''}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
