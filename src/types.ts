export type DocumentType = 'income' | 'expense' | 'adjustment';

export type DocumentStatus = 'active' | 'cancelled';

export type NumberingMode = 'continuous' | 'yearly';

export interface Material {
  id: number;
  name: string;
  base_unit: string;
  specific_weight: number | null;
  rod_length: number | null;
  min_stock: number | null;
  is_active: boolean;
  current_stock: number;
  has_movements: boolean;
  created_at: string;
}

export interface DocumentLineInput {
  material_id: number;
  input_qty: number;
  input_unit: string;
}

export interface DocumentLine {
  id: number;
  document_id: number;
  material_id: number;
  material_name: string;
  base_unit: string;
  input_qty: number;
  input_unit: string;
  base_qty: number;
  specific_weight_snapshot: number | null;
  rod_length_snapshot: number | null;
}

export interface WarehouseDocument {
  id: number;
  doc_number: string;
  doc_type: DocumentType;
  doc_date: string;
  counterparty: string;
  through_whom: string;
  basis: string;
  note: string;
  status: DocumentStatus;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  lines: DocumentLine[];
}

export interface AppSettings {
  organization_name: string;
  director_name: string;
  accountant_name: string;
  warehouse_manager_name: string;
  issued_by_name: string;
  received_by_name: string;
  numbering_mode: NumberingMode;
}

export interface DailyReportRow {
  doc_number: string;
  counterparty: string;
  material_name: string;
  base_qty: number;
  base_unit: string;
  input_qty: number;
  input_unit: string;
}

export interface DailyReportData {
  date: string;
  income: DailyReportRow[];
  expense: DailyReportRow[];
}

export interface PeriodMaterialRow {
  material_id: number;
  material_name: string;
  base_unit: string;
  opening_stock: number;
  income_qty: number;
  expense_qty: number;
  adjustment_qty: number;
  closing_stock: number;
}

export interface PeriodCounterpartyRow {
  counterparty: string;
  doc_type: 'income' | 'expense';
  material_name: string;
  base_unit: string;
  total_qty: number;
  doc_count: number;
}

export interface PeriodReportData {
  dateFrom: string;
  dateTo: string;
  materials: PeriodMaterialRow[];
  counterparties: PeriodCounterpartyRow[];
}

export interface BackupFileInfo {
  filename: string;
  size_bytes: number;
  created_at: string;
}

export function roundQty(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

export function formatQty(value: number): string {
  const rounded = roundQty(value);
  return rounded.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

export function getAvailableInputUnits(material: Pick<Material, 'base_unit' | 'specific_weight' | 'rod_length'>): string[] {
  const units: string[] = [material.base_unit];
  const hasWeight = material.specific_weight !== null && material.specific_weight > 0;
  const hasLength = material.rod_length !== null && material.rod_length > 0;

  if (material.base_unit === 'кг') {
    if (hasWeight) {
      units.push('м');
      if (hasLength) {
        units.push('хлыст');
      }
    }
  } else if (material.base_unit === 'м') {
    if (hasWeight) {
      units.push('кг');
    }
    if (hasLength) {
      units.push('хлыст');
    }
  }

  return units;
}

export function convertToBaseUnit(
  inputQty: number,
  inputUnit: string,
  material: Pick<Material, 'base_unit' | 'specific_weight' | 'rod_length'>
): number | null {
  if (!Number.isFinite(inputQty)) {
    return null;
  }
  if (inputUnit === material.base_unit) {
    return roundQty(inputQty);
  }

  const w = material.specific_weight;
  const l = material.rod_length;

  if (material.base_unit === 'кг') {
    if (inputUnit === 'м' && w && w > 0) {
      return roundQty(inputQty * w);
    }
    if (inputUnit === 'хлыст' && w && w > 0 && l && l > 0) {
      return roundQty(inputQty * l * w);
    }
  } else if (material.base_unit === 'м') {
    if (inputUnit === 'кг' && w && w > 0) {
      return roundQty(inputQty / w);
    }
    if (inputUnit === 'хлыст' && l && l > 0) {
      return roundQty(inputQty * l);
    }
  }

  return null;
}

export function formatDateRuLong(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const year = Number(parts[0]);
  const monthIdx = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  const months = [
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'сентября',
    'октября',
    'ноября',
    'декабря',
  ];
  if (monthIdx < 0 || monthIdx > 11 || Number.isNaN(day) || Number.isNaN(year)) {
    return isoDate;
  }
  return `${day} ${months[monthIdx]} ${year} г.`;
}

export function formatDateRuShort(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

export function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
