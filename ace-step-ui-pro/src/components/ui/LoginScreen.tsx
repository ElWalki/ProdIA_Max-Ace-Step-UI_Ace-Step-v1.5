import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Music, Plus, Lock, User, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth, type Profile } from '../../context/AuthContext';

// Deterministic avatar color
function avatarColor(name: string) {
  const colors = ['#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777', '#4f46e5', '#0d9488'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

export default function LoginScreen() {
  const { t } = useTranslation();
  const { profiles, setupUser, loginUser } = useAuth();

  const [mode, setMode] = useState<'select' | 'create'>('select');
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (profile: Profile) => {
    if (profile.hasPassword && !password) {
      setSelectedProfile(profile);
      return;
    }
    setLoading(true);
    setError('');
    try {
      await loginUser(profile.username, password || undefined);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    setError('');
    try {
      await setupUser(newName.trim(), newPassword || undefined);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-surface-950 flex items-center justify-center z-[200]">
      <div className="w-full max-w-md px-6">

        {/* Logo / Title */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-500 to-brand-500 flex items-center justify-center mx-auto mb-4 shadow-xl shadow-accent-500/20">
            <Music className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">ProdIA Max</h1>
          <p className="text-surface-400 text-sm mt-1">{t('login.subtitle', 'AI Music Production Studio')}</p>
        </div>

        {/* Password prompt for selected profile */}
        {selectedProfile && (
          <div className="bg-surface-100/5 border border-surface-300/20 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white"
                style={{ backgroundColor: avatarColor(selectedProfile.username) }}
              >
                {selectedProfile.username.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-white font-semibold text-lg">{selectedProfile.username}</p>
                <p className="text-surface-400 text-xs">{t('login.enterPassword', 'Enter your password')}</p>
              </div>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleLogin(selectedProfile)}
                placeholder={t('login.password', 'Password')}
                className="w-full pl-10 pr-10 py-3 rounded-xl bg-surface-100/10 border border-surface-300/30
                  text-sm text-white placeholder:text-surface-500 focus:outline-none focus:border-accent-500/60 transition-colors"
                autoFocus
              />
              <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => { setSelectedProfile(null); setPassword(''); setError(''); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-surface-400 hover:text-white bg-surface-100/10 hover:bg-surface-100/20 transition-colors"
              >
                {t('common.back', 'Back')}
              </button>
              <button
                onClick={() => handleLogin(selectedProfile)}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-accent-600 hover:bg-accent-500 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('login.login', 'Login')}
              </button>
            </div>
          </div>
        )}

        {/* Profile selection */}
        {!selectedProfile && mode === 'select' && (
          <div className="space-y-3">
            {profiles.length > 0 && (
              <>
                <p className="text-surface-400 text-xs font-medium uppercase tracking-wider mb-2">{t('login.selectProfile', 'Select Profile')}</p>
                <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                  {profiles.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handleLogin(p)}
                      disabled={loading}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-100/5 border border-surface-300/15
                        hover:bg-surface-100/10 hover:border-accent-500/30 transition-all group"
                    >
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                        style={{ backgroundColor: avatarColor(p.username) }}
                      >
                        {p.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-white font-medium text-sm truncate">{p.username}</p>
                        <p className="text-surface-500 text-[10px]">
                          {p.bio || t('login.artist', 'Artist')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {p.hasPassword && <Lock className="w-3 h-3 text-surface-500" />}
                        <span className="text-xs text-surface-500 group-hover:text-accent-400 transition-colors">→</span>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="h-px bg-surface-300/10 my-3" />
              </>
            )}
            <button
              onClick={() => setMode('create')}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium
                text-accent-400 bg-accent-500/10 border border-accent-500/20 hover:bg-accent-500/20 transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t('login.createProfile', 'Create New Profile')}
            </button>
          </div>
        )}

        {/* Create new profile */}
        {!selectedProfile && mode === 'create' && (
          <div className="bg-surface-100/5 border border-surface-300/20 rounded-2xl p-6 space-y-4">
            <h2 className="text-white font-semibold text-lg">{t('login.newProfile', 'New Artist Profile')}</h2>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
              <input
                type="text"
                value={newName}
                onChange={e => { setNewName(e.target.value); setError(''); }}
                placeholder={t('login.artistName', 'Artist name')}
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-surface-100/10 border border-surface-300/30
                  text-sm text-white placeholder:text-surface-500 focus:outline-none focus:border-accent-500/60 transition-colors"
                autoFocus
                maxLength={50}
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder={t('login.passwordOptional', 'Password (optional)')}
                className="w-full pl-10 pr-10 py-3 rounded-xl bg-surface-100/10 border border-surface-300/30
                  text-sm text-white placeholder:text-surface-500 focus:outline-none focus:border-accent-500/60 transition-colors"
              />
              <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-surface-500 text-[10px]">{t('login.passwordHint', 'Password is optional for local use. Add one if you share this computer.')}</p>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="flex gap-2">
              {profiles.length > 0 && (
                <button
                  onClick={() => { setMode('select'); setError(''); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-surface-400 hover:text-white bg-surface-100/10 hover:bg-surface-100/20 transition-colors"
                >
                  {t('common.back', 'Back')}
                </button>
              )}
              <button
                onClick={handleCreate}
                disabled={loading || newName.trim().length < 2}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-accent-600 hover:bg-accent-500 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('login.create', 'Create Profile')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
