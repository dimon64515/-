import type {
  AppSettings,
  BackupFileInfo,
  DailyReportData,
  DocumentLineInput,
  DocumentType,
  Material,
  PeriodReportData,
  WarehouseDocument,
} from './types';

const TOKEN_KEY = 'sklad_auth_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // ignore storage failures
  }
}

export class UnauthorizedError extends Error {
  constructor() {
    super('Сессия истекла. Войдите снова.');
  }
}

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (res.status === 401) {
    setStoredToken(null);
    throw new UnauthorizedError();
  }

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    const msg = data && typeof data.error === 'string' ? data.error : `Ошибка сервера (${res.status})`;
    throw new Error(msg);
  }

  return data as T;
}

export const api = {
  authStatus(): Promise<{ authenticated: boolean; isDefaultPassword: boolean }> {
    return apiFetch('/api/auth/status');
  },

  async login(password: string): Promise<{ ok: boolean; token: string; isDefaultPassword: boolean }> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || 'Неверный пароль');
    }
    if (data.token) {
      setStoredToken(data.token);
    }
    return data;
  },

  async logout(): Promise<void> {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setStoredToken(null);
    }
  },

  changePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean }> {
    return apiFetch('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  getMaterials(activeOnly = false): Promise<Material[]> {
    return apiFetch(`/api/materials${activeOnly ? '?activeOnly=1' : ''}`);
  },

  createMaterial(payload: {
    name: string;
    base_unit: string;
    specific_weight: number | null;
    rod_length: number | null;
    min_stock: number | null;
  }): Promise<Material> {
    return apiFetch('/api/materials', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateMaterial(
    id: number,
    payload: {
      name: string;
      base_unit: string;
      specific_weight: number | null;
      rod_length: number | null;
      min_stock: number | null;
      is_active: boolean;
    }
  ): Promise<Material> {
    return apiFetch(`/api/materials/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  deleteMaterial(id: number): Promise<{ ok: boolean }> {
    return apiFetch(`/api/materials/${id}`, { method: 'DELETE' });
  },

  getCounterparties(type?: 'income' | 'expense'): Promise<string[]> {
    return apiFetch(`/api/counterparties${type ? `?type=${type}` : ''}`);
  },

  getDocuments(filters?: {
    type?: string;
    dateFrom?: string;
    dateTo?: string;
    materialId?: number | '';
    counterparty?: string;
    docNumber?: string;
    includeCancelled?: boolean;
  }): Promise<WarehouseDocument[]> {
    const params = new URLSearchParams();
    if (filters?.type) params.set('type', filters.type);
    if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters?.dateTo) params.set('dateTo', filters.dateTo);
    if (filters?.materialId) params.set('materialId', String(filters.materialId));
    if (filters?.counterparty) params.set('counterparty', filters.counterparty);
    if (filters?.docNumber) params.set('docNumber', filters.docNumber);
    if (filters?.includeCancelled === false) params.set('includeCancelled', '0');
    const qs = params.toString();
    return apiFetch(`/api/documents${qs ? `?${qs}` : ''}`);
  },

  createDocument(payload: {
    doc_type: DocumentType;
    doc_date: string;
    counterparty?: string;
    through_whom?: string;
    basis?: string;
    note?: string;
    lines?: DocumentLineInput[];
    material_id?: number;
    actual_qty?: number;
  }): Promise<WarehouseDocument> {
    return apiFetch('/api/documents', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  cancelDocument(id: number, reason?: string): Promise<WarehouseDocument> {
    return apiFetch(`/api/documents/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  getDailyReport(date: string): Promise<DailyReportData> {
    return apiFetch(`/api/reports/daily?date=${encodeURIComponent(date)}`);
  },

  getPeriodReport(dateFrom: string, dateTo: string, materialId?: number | ''): Promise<PeriodReportData> {
    const params = new URLSearchParams({ dateFrom, dateTo });
    if (materialId) params.set('materialId', String(materialId));
    return apiFetch(`/api/reports/period?${params.toString()}`);
  },

  getSettings(): Promise<AppSettings> {
    return apiFetch('/api/settings');
  },

  updateSettings(payload: Partial<AppSettings>): Promise<AppSettings> {
    return apiFetch('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  getBackups(): Promise<BackupFileInfo[]> {
    return apiFetch('/api/backups');
  },

  createBackup(): Promise<BackupFileInfo> {
    return apiFetch('/api/backups', { method: 'POST' });
  },

  async downloadBackup(filename: string): Promise<void> {
    const token = getStoredToken();
    const headers = new Headers();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const res = await fetch(`/api/backups/${encodeURIComponent(filename)}`, {
      headers,
      credentials: 'include',
    });
    if (!res.ok) {
      throw new Error('Не удалось скачать резервную копию');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
