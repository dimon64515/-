import React, { useEffect, useState } from 'react';
import { Check, Download, HardDrive, KeyRound } from 'lucide-react';
import { api } from '../api';
import type { AppSettings, BackupFileInfo, NumberingMode } from '../types';

interface SettingsViewProps {
  settings: AppSettings;
  onSettingsUpdated: (next: AppSettings) => void;
  onPasswordChanged: () => void;
}

export function SettingsView({ settings, onSettingsUpdated, onPasswordChanged }: SettingsViewProps) {
  const [form, setForm] = useState<AppSettings>(settings);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const [backups, setBackups] = useState<BackupFileInfo[]>([]);
  const [creatingBackup, setCreatingBackup] = useState(false);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  useEffect(() => {
    api.getBackups().then(setBackups).catch(() => setBackups([]));
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsError('');
    setSettingsSaved(false);
    setSavingSettings(true);
    try {
      const updated = await api.updateSettings(form);
      onSettingsUpdated(updated);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Не удалось сохранить настройки');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSaved(false);
    if (newPassword.trim().length < 4) {
      setPasswordError('Новый пароль должен содержать минимум 4 символа');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Новый пароль и повтор не совпадают');
      return;
    }

    setSavingPassword(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSaved(true);
      onPasswordChanged();
      setTimeout(() => setPasswordSaved(false), 3000);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Ошибка смены пароля');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    try {
      await api.createBackup();
      const list = await api.getBackups();
      setBackups(list);
    } finally {
      setCreatingBackup(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Organization & Signatories */}
      <form onSubmit={handleSaveSettings} className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
        <div>
          <h2 className="text-base font-bold text-slate-900">Организация и подписи для печати</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Эти данные автоматически подставляются в накладные и ежедневный материальный отчёт.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label htmlFor="set-org" className="block text-sm font-medium text-slate-700 mb-1.5">
              Наименование организации (отправитель/получатель по умолчанию)
            </label>
            <input
              id="set-org"
              type="text"
              value={form.organization_name}
              onChange={(e) => setForm({ ...form, organization_name: e.target.value })}
              className="w-full h-11 px-3.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
          </div>

          <div>
            <label htmlFor="set-director" className="block text-sm font-medium text-slate-700 mb-1.5">
              Директор (ФИО)
            </label>
            <input
              id="set-director"
              type="text"
              value={form.director_name}
              onChange={(e) => setForm({ ...form, director_name: e.target.value })}
              placeholder="Иванов И.И."
              className="w-full h-11 px-3.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
          </div>

          <div>
            <label htmlFor="set-acc" className="block text-sm font-medium text-slate-700 mb-1.5">
              Гл. бухгалтер (ФИО)
            </label>
            <input
              id="set-acc"
              type="text"
              value={form.accountant_name}
              onChange={(e) => setForm({ ...form, accountant_name: e.target.value })}
              placeholder="Петрова А.С."
              className="w-full h-11 px-3.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
          </div>

          <div>
            <label htmlFor="set-mgr" className="block text-sm font-medium text-slate-700 mb-1.5">
              Зав. складом (ФИО)
            </label>
            <input
              id="set-mgr"
              type="text"
              value={form.warehouse_manager_name}
              onChange={(e) => setForm({ ...form, warehouse_manager_name: e.target.value })}
              placeholder="Сидоров И.П."
              className="w-full h-11 px-3.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
          </div>

          <div>
            <label htmlFor="set-issued" className="block text-sm font-medium text-slate-700 mb-1.5">
              Отпустил (ФИО)
            </label>
            <input
              id="set-issued"
              type="text"
              value={form.issued_by_name}
              onChange={(e) => setForm({ ...form, issued_by_name: e.target.value })}
              className="w-full h-11 px-3.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
          </div>

          <div>
            <label htmlFor="set-received" className="block text-sm font-medium text-slate-700 mb-1.5">
              Принял (ФИО)
            </label>
            <input
              id="set-received"
              type="text"
              value={form.received_by_name}
              onChange={(e) => setForm({ ...form, received_by_name: e.target.value })}
              className="w-full h-11 px-3.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
          </div>

          <div>
            <label htmlFor="set-num" className="block text-sm font-medium text-slate-700 mb-1.5">
              Нумерация накладных
            </label>
            <select
              id="set-num"
              value={form.numbering_mode}
              onChange={(e) => setForm({ ...form, numbering_mode: e.target.value as NumberingMode })}
              className="w-full h-11 px-3 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
            >
              <option value="continuous">Сквозная (П-000001, Р-000001)</option>
              <option value="yearly">Со сбросом по годам (П-000001/26)</option>
            </select>
          </div>
        </div>

        {settingsError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {settingsError}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={savingSettings}
            className="h-11 px-5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg cursor-pointer"
          >
            {savingSettings ? 'Сохранение...' : 'Сохранить настройки'}
          </button>
          {settingsSaved && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
              <Check className="w-4 h-4" />
              <span>Сохранено</span>
            </span>
          )}
        </div>
      </form>

      {/* Password change */}
      <form onSubmit={handleChangePassword} className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <KeyRound className="w-5 h-5 text-slate-600" />
          <h2 className="text-base font-bold text-slate-900">Смена пароля входа</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="pwd-cur" className="block text-sm font-medium text-slate-700 mb-1.5">
              Текущий пароль
            </label>
            <input
              id="pwd-cur"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full h-11 px-3.5 text-sm bg-white border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="pwd-new" className="block text-sm font-medium text-slate-700 mb-1.5">
              Новый пароль
            </label>
            <input
              id="pwd-new"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full h-11 px-3.5 text-sm bg-white border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="pwd-conf" className="block text-sm font-medium text-slate-700 mb-1.5">
              Повторите новый
            </label>
            <input
              id="pwd-conf"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full h-11 px-3.5 text-sm bg-white border border-slate-300 rounded-lg"
            />
          </div>
        </div>

        {passwordError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {passwordError}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={savingPassword}
            className="h-11 px-5 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg cursor-pointer"
          >
            {savingPassword ? 'Обновление...' : 'Сменить пароль'}
          </button>
          {passwordSaved && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
              <Check className="w-4 h-4" />
              <span>Пароль обновлён</span>
            </span>
          )}
        </div>
      </form>

      {/* Backups */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-slate-600" />
              <h2 className="text-base font-bold text-slate-900">Резервные копии базы данных</h2>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Создаются автоматически каждый день, хранятся последние 30 копий SQLite.
            </p>
          </div>
          <button
            type="button"
            disabled={creatingBackup}
            onClick={handleCreateBackup}
            className="h-10 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-medium rounded-lg shrink-0 cursor-pointer"
          >
            {creatingBackup ? 'Создание...' : 'Создать копию сейчас'}
          </button>
        </div>

        {backups.length === 0 ? (
          <p className="text-sm text-slate-500">Копий пока нет.</p>
        ) : (
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-60 overflow-y-auto">
            {backups.map((b) => (
              <div key={b.filename} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="font-mono text-slate-800 truncate">{b.filename}</div>
                  <div className="text-xs text-slate-500">
                    {new Date(b.created_at).toLocaleString('ru-RU')} · {Math.round(b.size_bytes / 1024)} КБ
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => api.downloadBackup(b.filename)}
                  className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded-lg shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Скачать</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
