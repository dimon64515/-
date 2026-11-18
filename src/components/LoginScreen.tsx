import React, { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { api } from '../api';

interface LoginScreenProps {
  isDefaultPassword: boolean;
  onLoginSuccess: (isDefault: boolean) => void;
}

export function LoginScreen({ isDefaultPassword, onLoginSuccess }: LoginScreenProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login(password);
      onLoginSuccess(res.isDefaultPassword);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-sm">
        <div className="mb-6">
          <div className="w-11 h-11 rounded-lg bg-blue-700 text-white flex items-center justify-center mb-4">
            <Lock className="w-5 h-5" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Склад</h1>
          <p className="text-sm text-slate-600 mt-1">
            Вход в программу складского учёта
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-password" className="block text-sm font-medium text-slate-700 mb-1.5">
              Пароль
            </label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                placeholder="Введите пароль"
                className="w-full h-12 pl-4 pr-12 text-base bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-slate-500 hover:text-slate-800 rounded-md"
                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-base font-semibold rounded-lg transition-colors cursor-pointer"
          >
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>

        {isDefaultPassword && (
          <p className="mt-5 pt-4 border-t border-slate-100 text-xs text-slate-500 leading-relaxed">
            Первый запуск: пароль по умолчанию — <span className="font-mono font-semibold text-slate-800">1234</span>.
            Смените его в разделе «Настройки».
          </p>
        )}
      </div>
    </div>
  );
}
