import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { formatQty, type Material } from '../types';

interface MaterialSelectProps {
  materials: Material[];
  value: number | null;
  onChange: (material: Material) => void;
  showStock?: boolean;
  placeholder?: string;
}

export function MaterialSelect({
  materials,
  value,
  onChange,
  showStock = true,
  placeholder = 'Выберите материал...',
}: MaterialSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => materials.find((m) => m.id === value) || null,
    [materials, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter((m) => m.name.toLowerCase().includes(q));
  }, [materials, query]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 20);
    } else {
      setQuery('');
    }
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full min-h-[46px] px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-left flex items-center justify-between gap-2 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700 cursor-pointer"
      >
        <div className="min-w-0 flex-1">
          {selected ? (
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-slate-900 truncate">{selected.name}</span>
              {showStock && (
                <span className="text-xs font-mono tabular-nums text-slate-500 shrink-0">
                  ост: {formatQty(selected.current_stock)} {selected.base_unit}
                </span>
              )}
            </div>
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
        </div>
        <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-40 bg-white border border-slate-300 rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-200 bg-slate-50">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск материала..."
                className="w-full h-10 pl-9 pr-3 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <div className="px-4 py-4 text-sm text-slate-500 text-center">
                Ничего не найдено
              </div>
            ) : (
              filtered.map((mat) => {
                const isSelected = mat.id === value;
                return (
                  <button
                    key={mat.id}
                    type="button"
                    onClick={() => {
                      onChange(mat);
                      setOpen(false);
                    }}
                    className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between gap-3 hover:bg-blue-50 transition-colors cursor-pointer ${
                      isSelected ? 'bg-blue-50/70' : ''
                    }`}
                  >
                    <span className="text-sm font-medium text-slate-900">{mat.name}</span>
                    <span
                      className={`text-xs font-mono tabular-nums shrink-0 ${
                        mat.current_stock <= 0 ? 'text-slate-400' : 'text-slate-600'
                      }`}
                    >
                      {formatQty(mat.current_stock)} {mat.base_unit}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
