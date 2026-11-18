import React from 'react';
import { Printer, X } from 'lucide-react';
import { formatDateRuLong, formatQty, type AppSettings, type DailyReportData } from '../types';

interface PrintDailyReportProps {
  firstReport: DailyReportData;
  secondReport: DailyReportData;
  settings: AppSettings;
  onClose: () => void;
}

function HalfSheet({ report, settings }: { report: DailyReportData; settings: AppSettings }) {
  return (
    <div className="print-half-a4 flex flex-col justify-between text-black">
      <div>
        <div className="flex items-baseline justify-between border-b border-black pb-1 mb-2">
          <h3 className="text-sm font-bold tracking-wide">
            МАТЕРИАЛЬНЫЙ ОТЧЁТ за {formatDateRuLong(report.date)}
          </h3>
          {settings.organization_name && (
            <span className="text-xs">{settings.organization_name}</span>
          )}
        </div>

        {/* Поступление на склад */}
        <div className="mb-3">
          <div className="text-xs font-bold mb-1">Поступление на склад</div>
          <table className="w-full border-collapse border border-black text-[11px] leading-tight">
            <thead>
              <tr>
                <th className="border border-black px-1.5 py-1 text-left font-semibold w-1/4">От кого</th>
                <th className="border border-black px-1.5 py-1 text-left font-semibold w-24">№ накл.</th>
                <th className="border border-black px-1.5 py-1 text-left font-semibold">Наименование</th>
                <th className="border border-black px-1.5 py-1 text-right font-semibold w-28">Количество</th>
              </tr>
            </thead>
            <tbody>
              {report.income.length === 0 ? (
                <tr>
                  <td colSpan={4} className="border border-black px-1.5 py-1 text-center text-slate-500 print:text-black">
                    Поступлений нет
                  </td>
                </tr>
              ) : (
                report.income.map((row, i) => (
                  <tr key={i}>
                    <td className="border border-black px-1.5 py-0.5">{row.counterparty}</td>
                    <td className="border border-black px-1.5 py-0.5 font-mono">{row.doc_number}</td>
                    <td className="border border-black px-1.5 py-0.5">{row.material_name}</td>
                    <td className="border border-black px-1.5 py-0.5 text-right font-mono tabular-nums">
                      {formatQty(row.base_qty)} {row.base_unit}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Отпуск со склада */}
        <div>
          <div className="text-xs font-bold mb-1">Отпуск со склада</div>
          <table className="w-full border-collapse border border-black text-[11px] leading-tight">
            <thead>
              <tr>
                <th className="border border-black px-1.5 py-1 text-left font-semibold w-1/4">Кому</th>
                <th className="border border-black px-1.5 py-1 text-left font-semibold w-24">№ накл.</th>
                <th className="border border-black px-1.5 py-1 text-left font-semibold">Наименование</th>
                <th className="border border-black px-1.5 py-1 text-right font-semibold w-28">Количество</th>
              </tr>
            </thead>
            <tbody>
              {report.expense.length === 0 ? (
                <tr>
                  <td colSpan={4} className="border border-black px-1.5 py-1 text-center text-slate-500 print:text-black">
                    Отпуска нет
                  </td>
                </tr>
              ) : (
                report.expense.map((row, i) => (
                  <tr key={i}>
                    <td className="border border-black px-1.5 py-0.5">{row.counterparty}</td>
                    <td className="border border-black px-1.5 py-0.5 font-mono">{row.doc_number}</td>
                    <td className="border border-black px-1.5 py-0.5">{row.material_name}</td>
                    <td className="border border-black px-1.5 py-0.5 text-right font-mono tabular-nums">
                      {formatQty(row.base_qty)} {row.base_unit}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Signature */}
      <div className="pt-3 flex items-end gap-2 text-xs">
        <span className="font-semibold whitespace-nowrap">Зав. складом</span>
        <span className="w-44 border-b border-black inline-block" />
        <span className="text-xs">{settings.warehouse_manager_name || ''}</span>
      </div>
    </div>
  );
}

export function PrintDailyReport({
  firstReport,
  secondReport,
  settings,
  onClose,
}: PrintDailyReportProps) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 overflow-y-auto flex flex-col items-center p-2 sm:p-6 print:static print:inset-auto print:bg-white print:p-0 print:block">
      <div className="no-print w-full max-w-[210mm] bg-white border border-slate-200 rounded-t-xl px-4 py-3 flex items-center justify-between gap-4 shadow-sm">
        <div className="text-sm font-medium text-slate-700 truncate">
          Предпросмотр печати: Материальный отчёт (2 экземпляра на листе А4)
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Печать А4</span>
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

      <div className="print-sheet w-full max-w-[210mm] bg-white border border-t-0 border-slate-200 rounded-b-xl p-6 sm:p-8 text-black shadow-sm">
        <HalfSheet report={firstReport} settings={settings} />
        <div className="print-cut-line border-t border-dashed border-slate-400 my-5" />
        <HalfSheet report={secondReport} settings={settings} />
      </div>
    </div>
  );
}
