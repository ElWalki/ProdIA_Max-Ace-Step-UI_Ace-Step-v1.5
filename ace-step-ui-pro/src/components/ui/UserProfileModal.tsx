import React, { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Camera, User as UserIcon, LogOut, Users, Check } from 'lucide-react';
import { useAuth, type Profile } from '../../context/AuthContext';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UserProfileModal({ isOpen, onClose }: UserProfileModalProps) {
  const { t } = useTranslation();
  const { user, token, profiles, logout, loginUser, refreshProfiles } = useAuth();
  const [tab, setTab] = useState<'profile' | 'profiles'>('profile');
  const [editName, setEditName] = useState(user?.username || '');
  const [editBio, setEditBio] = useState(user?.bio || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSave = useCallback(async () => {
    if (!token || !editName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ username: editName.trim(), bio: editBio.trim() }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        // Refresh to pick up changes
        await refreshProfiles();
      }
    } catch { /* ignore */ }
    setSaving(false);
  }, [token, editName, editBio, refreshProfiles]);

  const handleAvatarChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    // Show preview immediately
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
    // Upload
    const fd = new FormData();
    fd.append('avatar', file);
    try {
      await fetch('/api/users/me/avatar', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: fd,
      });
      await refreshProfiles();
    } catch { /* ignore */ }
  }, [token, refreshProfiles]);

  const handleSwitchProfile = useCallback(async (profile: Profile) => {
    try {
      await loginUser(profile.username);
      onClose();
    } catch { /* ignore */ }
  }, [loginUser, onClose]);

  if (!isOpen || !user) return null;

  const avatarUrl = avatarPreview || user.avatar_url;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in" onClick={onClose}>
      <div
        className="w-full max-w-md mx-4 rounded-2xl bg-surface-50 border border-surface-300 shadow-2xl overflow-hidden animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <h2 className="text-base font-semibold text-surface-900">{t('profile.title', 'Profile')}</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-surface-400 hover:text-surface-800 hover:bg-surface-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-surface-200">
          <button
            onClick={() => setTab('profile')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === 'profile' ? 'text-accent-400 border-b-2 border-accent-500' : 'text-surface-500 hover:text-surface-800'
            }`}
          >
            <UserIcon className="w-3.5 h-3.5 inline mr-1.5" />
            {t('profile.myProfile', 'My Profile')}
          </button>
          <button
            onClick={() => { setTab('profiles'); refreshProfiles(); }}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === 'profiles' ? 'text-accent-400 border-b-2 border-accent-500' : 'text-surface-500 hover:text-surface-800'
            }`}
          >
            <Users className="w-3.5 h-3.5 inline mr-1.5" />
            {t('profile.switchProfile', 'Profiles')}
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          {tab === 'profile' ? (
            <div className="space-y-5">
              {/* Avatar */}
              <div className="flex justify-center">
                <div className="relative group cursor-pointer" onClick={() => fileRef.current?.click()}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="w-20 h-20 rounded-full object-cover border-2 border-surface-300" />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-accent-500/15 flex items-center justify-center border-2 border-surface-300">
                      <UserIcon className="w-8 h-8 text-accent-400" />
                    </div>
                  )}
                  <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="w-5 h-5 text-white" />
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                </div>
              </div>

              {/* Username */}
              <div>
                <label className="block text-xs font-medium text-surface-500 mb-1.5">{t('profile.username', 'Username')}</label>
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-surface-100 border border-surface-300 text-surface-900"
                  placeholder="Your name"
                />
              </div>

              {/* Bio */}
              <div>
                <label className="block text-xs font-medium text-surface-500 mb-1.5">{t('profile.bio', 'Bio')}</label>
                <textarea
                  value={editBio}
                  onChange={e => setEditBio(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-surface-100 border border-surface-300 text-surface-900 resize-none"
                  placeholder={t('profile.bioPlaceholder', 'Tell us about yourself...')}
                />
              </div>

              {/* Save */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving || !editName.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-accent-500 text-white hover:bg-accent-600 disabled:opacity-50 transition-colors"
                >
                  {saved ? <Check className="w-4 h-4" /> : null}
                  {saving ? t('common.saving', 'Saving...') : saved ? t('common.saved', 'Saved') : t('common.save', 'Save')}
                </button>
                <button
                  onClick={logout}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-red-400 hover:bg-red-400/10 transition-colors ml-auto"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  {t('common.logout', 'Logout')}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {profiles.length === 0 ? (
                <p className="text-sm text-surface-500 text-center py-6">{t('profile.noProfiles', 'No other profiles found')}</p>
              ) : (
                profiles.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleSwitchProfile(p)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-left ${
                      p.id === user.id ? 'bg-accent-500/10 border border-accent-500/30' : 'hover:bg-surface-100 border border-transparent'
                    }`}
                  >
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-accent-500/15 flex items-center justify-center">
                        <UserIcon className="w-5 h-5 text-accent-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-surface-900 truncate">{p.username}</p>
                      <p className="text-xs text-surface-500">{p.bio || t('profile.noBio', 'No bio')}</p>
                    </div>
                    {p.id === user.id && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-500/20 text-accent-400 font-medium">
                        {t('profile.current', 'Current')}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
