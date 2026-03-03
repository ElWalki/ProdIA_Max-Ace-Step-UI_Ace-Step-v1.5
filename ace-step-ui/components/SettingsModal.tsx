import React, { useState, useRef, useEffect } from 'react';
import { X, User as UserIcon, Palette, Info, Edit3, ExternalLink, Globe, ChevronDown, Github, RotateCcw, Loader2, AlertTriangle, Cpu } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { EditProfileModal } from './EditProfileModal';
import { generateApi, vramApi, authApi } from '../services/api';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    theme: 'light' | 'dark';
    onToggleTheme: () => void;
    onNavigateToProfile?: (username: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, theme, onToggleTheme, onNavigateToProfile }) => {
    const { user, token } = useAuth();
    const { t, language, setLanguage } = useI18n();
    const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
    const [showLangInfo, setShowLangInfo] = useState(false);
    const langInfoRef = useRef<HTMLDivElement>(null);
    const [isReinitializing, setIsReinitializing] = useState(false);
    const [reinitResult, setReinitResult] = useState<string | null>(null);
    const [isPurging, setIsPurging] = useState(false);
    const [purgeResult, setPurgeResult] = useState<string | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [diagnosticReport, setDiagnosticReport] = useState<any>(null);
    const [isForceCleanup, setIsForceCleanup] = useState(false);
    const [cleanupResult, setCleanupResult] = useState<string | null>(null);
    const [isResettingUser, setIsResettingUser] = useState(false);
    const [resetUserResult, setResetUserResult] = useState<string | null>(null);
    const [showResetConfirm, setShowResetConfirm] = useState(false);

    const handleResetUser = async () => {
        if (!token || isResettingUser) return;
        setIsResettingUser(true);
        setResetUserResult(null);
        try {
            const result = await authApi.resetUser(token);
            setResetUserResult(`✅ ${result.message}`);
            setShowResetConfirm(false);
            // Reload page after 2s so the app detects no user and shows setup
            setTimeout(() => window.location.reload(), 2000);
        } catch {
            setResetUserResult('❌ Failed to reset user data');
        } finally {
            setIsResettingUser(false);
            setTimeout(() => setResetUserResult(null), 6000);
        }
    };

    const handleScanVram = async () => {
        if (!token || isScanning) return;
        setIsScanning(true);
        setDiagnosticReport(null);
        try {
            const result = await generateApi.vramDiagnostic(token);
            setDiagnosticReport(result?.data || result);
        } catch (err) {
            setDiagnosticReport({ error: 'Failed to scan VRAM' });
        } finally {
            setIsScanning(false);
        }
    };

    const handleForceCleanup = async () => {
        if (!token || isForceCleanup) return;
        setIsForceCleanup(true);
        setCleanupResult(null);
        try {
            const result = await generateApi.vramForceCleanup(token);
            const actions = result?.data?.actions || result?.actions || [];
            setCleanupResult(`✅ Cleanup done: ${actions.length} actions`);
            // Auto-rescan after cleanup
            setTimeout(() => handleScanVram(), 1000);
        } catch (err) {
            setCleanupResult('❌ Force cleanup failed');
        } finally {
            setIsForceCleanup(false);
            setTimeout(() => setCleanupResult(null), 8000);
        }
    };

    const handleReinitialize = async () => {
        if (!token || isReinitializing) return;
        setIsReinitializing(true);
        setReinitResult(null);
        try {
            const result = await generateApi.reinitialize(token);
            setReinitResult(`✅ ${result.message}${result.cancelledJobs > 0 ? ` (${result.cancelledJobs} jobs cancelled)` : ''}`);
        } catch (err) {
            setReinitResult('❌ Failed to reinitialize server');
        } finally {
            setIsReinitializing(false);
            setTimeout(() => setReinitResult(null), 5000);
        }
    };

    const handlePurgeVram = async () => {
        if (isPurging) return;
        setIsPurging(true);
        setPurgeResult(null);
        try {
            const result = await vramApi.purge();
            const freed = result.nvidia_freed_mb || 0;
            setPurgeResult(freed > 0 ? `✅ Freed ${freed} MB VRAM` : '✅ Cache cleared');
        } catch (err) {
            setPurgeResult('❌ Failed to purge VRAM');
        } finally {
            setIsPurging(false);
            setTimeout(() => setPurgeResult(null), 5000);
        }
    };

    useEffect(() => {
        if (!showLangInfo) return;
        const handleClick = (e: MouseEvent) => {
            if (langInfoRef.current && !langInfoRef.current.contains(e.target as Node)) {
                setShowLangInfo(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [showLangInfo]);

    if (!isOpen || !user) {
        if (isEditProfileOpen && user) {
            return (
                <EditProfileModal
                    isOpen={isEditProfileOpen}
                    onClose={() => setIsEditProfileOpen(false)}
                    onSaved={() => setIsEditProfileOpen(false)}
                />
            );
        }
        return null;
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-white/5">
                    <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">{t('settings')}</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-full transition-colors"
                    >
                        <X size={20} className="text-zinc-500" />
                    </button>
                </div>

                <div className="p-6 space-y-8">
                    {/* User Profile Section */}
                    <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-6">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-2xl font-bold text-white shadow-lg overflow-hidden">
                                {user.avatar_url ? (
                                    <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
                                ) : (
                                    user.username[0].toUpperCase()
                                )}
                            </div>
                            <div className="flex-1">
                                <h3 className="text-xl font-bold text-zinc-900 dark:text-white">@{user.username}</h3>
                                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                                    {t('memberSince')} {new Date(user.createdAt).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { month: 'long', year: 'numeric' })}
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        onClose();
                                        setIsEditProfileOpen(true);
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                                >
                                    <Edit3 size={16} />
                                    {t('editProfile')}
                                </button>
                                <button
                                    onClick={() => {
                                        onClose();
                                        onNavigateToProfile?.(user.username);
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white rounded-lg text-sm font-medium hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
                                >
                                    <ExternalLink size={16} />
                                    {t('viewProfile')}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Account Section */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-zinc-900 dark:text-white">
                            <UserIcon size={20} />
                            <h3 className="font-semibold">{t('account')}</h3>
                        </div>
                        <div className="pl-7 space-y-3">
                            <div>
                                <label className="text-sm text-zinc-500 dark:text-zinc-400">{t('username')}</label>
                                <p className="text-zinc-900 dark:text-white font-medium">@{user.username}</p>
                            </div>
                        </div>
                    </div>

                    {/* Danger Zone */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-red-600 dark:text-red-500">
                            <AlertTriangle size={20} />
                            <h3 className="font-semibold">Danger Zone</h3>
                        </div>
                        <div className="pl-7 space-y-3">
                            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-xl p-4">
                                <p className="text-sm font-medium text-red-700 dark:text-red-400 mb-1">Reset all user data</p>
                                <p className="text-xs text-red-500 dark:text-red-500/80 mb-3">
                                    Deletes your account, all songs, playlists and generated audio. Cannot be undone.
                                </p>
                                {!showResetConfirm ? (
                                    <button
                                        onClick={() => setShowResetConfirm(true)}
                                        className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                                    >
                                        <AlertTriangle size={14} />
                                        Reset user data
                                    </button>
                                ) : (
                                    <div className="space-y-2">
                                        <p className="text-xs font-semibold text-red-700 dark:text-red-400">Are you sure? This cannot be undone.</p>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleResetUser}
                                                disabled={isResettingUser}
                                                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                                            >
                                                {isResettingUser ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
                                                {isResettingUser ? 'Resetting...' : 'Yes, reset everything'}
                                            </button>
                                            <button
                                                onClick={() => setShowResetConfirm(false)}
                                                className="px-4 py-2 bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white rounded-lg text-sm font-medium hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {resetUserResult && (
                                    <p className={`text-xs mt-2 font-medium ${resetUserResult.startsWith('✅') ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                                        {resetUserResult}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Language Section */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-zinc-900 dark:text-white">
                            <Globe size={20} />
                            <h3 className="font-semibold">{t('language')}</h3>
                            <div className="relative" ref={langInfoRef}>
                                <button
                                    onClick={() => setShowLangInfo(!showLangInfo)}
                                    className="p-1 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
                                >
                                    <Info size={14} />
                                </button>
                                {showLangInfo && (
                                    <div className="absolute left-0 top-8 z-10 w-64 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl p-3">
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">{t('localizedBy')}</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            <a
                                                href="https://x.com/bdsqlsz"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-black dark:bg-white text-white dark:text-black rounded-lg text-xs font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                                            >
                                                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                                </svg>
                                                @bdsqlsz
                                            </a>
                                            <a
                                                href="https://space.bilibili.com/219296"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-[#00A1D6] text-white rounded-lg text-xs font-medium hover:bg-[#0090C0] transition-colors"
                                            >
                                                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                                                    <path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373Z"/>
                                                </svg>
                                                青龙圣者
                                            </a>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="pl-7 space-y-3">
                            <div className="relative">
                                <select
                                    value={language}
                                    onChange={(e) => setLanguage(e.target.value as 'en' | 'zh' | 'ja' | 'ko')}
                                    className="w-full appearance-none py-3 px-4 pr-10 rounded-lg border-2 border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium transition-colors hover:border-zinc-400 dark:hover:border-zinc-600 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-500 cursor-pointer"
                                >
                                    <option value="en">{t('english')}</option>
                                    <option value="zh">{t('chinese')}</option>
                                    <option value="ja">{t('japaneseLanguage')}</option>
                                    <option value="ko">{t('koreanLanguage')}</option>
                                </select>
                                <ChevronDown
                                    size={20}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Theme Section */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-zinc-900 dark:text-white">
                            <Palette size={20} />
                            <h3 className="font-semibold">{t('appearance')}</h3>
                        </div>
                        <div className="pl-7 space-y-3">
                            <div className="flex gap-3">
                                <button
                                    onClick={theme === 'dark' ? onToggleTheme : undefined}
                                    className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-colors ${theme === 'light'
                                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                                            : 'border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600'
                                        }`}
                                >
                                    {t('light')}
                                </button>
                                <button
                                    onClick={theme === 'light' ? onToggleTheme : undefined}
                                    className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-colors ${theme === 'dark'
                                            ? 'border-indigo-500 bg-indigo-950 text-indigo-300'
                                            : 'border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600'
                                        }`}
                                >
                                    {t('dark')}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Server Management Section */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-zinc-900 dark:text-white">
                            <Cpu size={20} />
                            <h3 className="font-semibold">Server Management</h3>
                        </div>
                        <div className="pl-7 space-y-3">
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                Emergency tools for when the server becomes unresponsive or VRAM fills up.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={handleReinitialize}
                                    disabled={isReinitializing}
                                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg border-2 border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 font-medium transition-colors hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50"
                                >
                                    {isReinitializing ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                                    {isReinitializing ? 'Reinitializing...' : 'Reinitialize Server'}
                                </button>
                                <button
                                    onClick={handlePurgeVram}
                                    disabled={isPurging}
                                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg border-2 border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 font-medium transition-colors hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-50"
                                >
                                    {isPurging ? <Loader2 size={16} className="animate-spin" /> : <AlertTriangle size={16} />}
                                    {isPurging ? 'Purging...' : 'Purge VRAM'}
                                </button>
                            </div>
                            {reinitResult && (
                                <p className={`text-xs font-medium ${reinitResult.startsWith('✅') ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                    {reinitResult}
                                </p>
                            )}
                            {purgeResult && (
                                <p className={`text-xs font-medium ${purgeResult.startsWith('✅') ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                    {purgeResult}
                                </p>
                            )}
                            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
                                <strong>Reinitialize</strong> cancels all jobs, resets the AI engine connection, and clears GPU memory. Use when generation hangs or crashes.<br/>
                                <strong>Purge VRAM</strong> runs gc.collect() + torch.cuda.empty_cache() to free cached GPU memory without resetting the server.
                            </p>

                            {/* VRAM Diagnostic */}
                            <div className="border-t border-zinc-200 dark:border-zinc-700/50 pt-3 mt-3 space-y-2">
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleScanVram}
                                        disabled={isScanning}
                                        className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-medium transition-colors hover:bg-blue-100 dark:hover:bg-blue-900/40 disabled:opacity-50"
                                    >
                                        {isScanning ? <Loader2 size={14} className="animate-spin" /> : <Cpu size={14} />}
                                        {isScanning ? 'Scanning...' : 'Scan VRAM'}
                                    </button>
                                    <button
                                        onClick={handleForceCleanup}
                                        disabled={isForceCleanup}
                                        className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 text-xs font-medium transition-colors hover:bg-rose-100 dark:hover:bg-rose-900/40 disabled:opacity-50"
                                    >
                                        {isForceCleanup ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
                                        {isForceCleanup ? 'Cleaning...' : 'Force LoRA Cleanup'}
                                    </button>
                                </div>
                                {cleanupResult && (
                                    <p className={`text-xs font-medium ${cleanupResult.startsWith('✅') ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                        {cleanupResult}
                                    </p>
                                )}
                                {diagnosticReport && !diagnosticReport.error && (
                                    <div className="bg-zinc-900 dark:bg-black rounded-lg p-3 text-[10px] font-mono text-green-400 space-y-1.5 max-h-64 overflow-y-auto">
                                        <div className="text-zinc-500">── VRAM Diagnostic Report ──</div>
                                        {diagnosticReport.summary && (
                                            <>
                                                <div>GPU: <span className="text-yellow-300">{diagnosticReport.summary.nvidia_used_mb || '?'} MB</span> / {diagnosticReport.summary.nvidia_total_mb || '?'} MB used</div>
                                                <div>PyTorch allocated: <span className="text-cyan-300">{diagnosticReport.summary.allocated_mb || 0} MB</span> | Reserved: {diagnosticReport.summary.reserved_mb || 0} MB</div>
                                                <div>GC CUDA tensors: {diagnosticReport.summary.gc_cuda_tensors || 0} ({diagnosticReport.summary.gc_cuda_mb || 0} MB)</div>
                                            </>
                                        )}
                                        <div className="text-zinc-500 pt-1">── Components on GPU ──</div>
                                        {(diagnosticReport.components || []).map((c: any, i: number) => (
                                            <div key={i}>
                                                <span className="text-white">{c.name}</span>: <span className="text-yellow-300">{c.gpu_mb || 0} MB</span> GPU
                                                {c.cpu_mb ? <span className="text-blue-300"> | {c.cpu_mb} MB CPU</span> : null}
                                                {c.type ? <span className="text-zinc-500"> [{c.type}]</span> : null}
                                                {c.lora_layers_count > 0 && <span className="text-orange-400"> LoRA: {c.lora_layers_count} layers</span>}
                                                {c.peft_wrappers > 1 && <span className="text-red-500 font-bold"> STACKING! ({c.peft_wrappers} wrappers)</span>}
                                            </div>
                                        ))}
                                        {diagnosticReport.lora_state && diagnosticReport.lora_state.lora_loaded_flag && (
                                            <>
                                                <div className="text-zinc-500 pt-1">── LoRA State ──</div>
                                                <div>Loaded: {diagnosticReport.lora_state.lora_loaded_flag ? '✅' : '❌'} | Active: {diagnosticReport.lora_state.use_lora_flag ? '✅' : '❌'} | Scale: {diagnosticReport.lora_state.lora_scale}</div>
                                                {diagnosticReport.lora_state.active_lora_layers && <div>Active LoRA layers: {diagnosticReport.lora_state.active_lora_layers} ({diagnosticReport.lora_state.lora_gpu_mb || 0} MB)</div>}
                                                <div>Base decoder backup: {diagnosticReport.lora_state.has_base_decoder_backup ? 'Yes (CPU)' : 'None'}</div>
                                            </>
                                        )}
                                        {(diagnosticReport.warnings || []).length > 0 && (
                                            <>
                                                <div className="text-zinc-500 pt-1">── Warnings ──</div>
                                                {diagnosticReport.warnings.map((w: string, i: number) => (
                                                    <div key={i} className={w.includes('CRITICAL') || w.includes('Excessive') || w.includes('GPU') ? 'text-red-400 font-bold' : w.includes('No issues') ? 'text-green-400' : 'text-yellow-400'}>
                                                        {w}
                                                    </div>
                                                ))}
                                            </>
                                        )}
                                    </div>
                                )}
                                {diagnosticReport?.error && (
                                    <p className="text-xs text-red-500 font-medium">{diagnosticReport.error}</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* About Section */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-zinc-900 dark:text-white">
                            <Info size={20} />
                            <h3 className="font-semibold">{t('about')}</h3>
                        </div>
                        <div className="pl-7 space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
                            <p>{t('version')} 2.0.0</p>
                            <p>ACE-Step UI - {t('localAIMusicGenerator')}</p>
                            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">
                                {t('poweredBy')}
                            </p>
                            <div className="pt-3 border-t border-zinc-200 dark:border-zinc-700/50 mt-4 space-y-4">
                                <div>
                                    <p className="text-zinc-900 dark:text-white font-medium mb-2">{t('createdBy')}</p>
                                    <div className="flex flex-wrap gap-2">
                                        <a
                                            href="https://x.com/AmbsdOP"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-2 px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                                        >
                                            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                                                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                            </svg>
                                            {t('follow')} @AmbsdOP
                                        </a>
                                        <a
                                            href="https://github.com/fspecii/ace-step-ui"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 dark:bg-zinc-700 text-white rounded-lg text-sm font-medium hover:bg-zinc-700 dark:hover:bg-zinc-600 transition-colors"
                                        >
                                            <Github size={16} />
                                            GitHub Repo
                                        </a>
                                    </div>
                                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">
                                        Report issues or request features on GitHub
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="border-t border-zinc-200 dark:border-white/5 p-6 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-zinc-900 dark:bg-white text-white dark:text-black font-semibold rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                    >
                        {t('done')}
                    </button>
                </div>
            </div>

            <EditProfileModal
                isOpen={isEditProfileOpen}
                onClose={() => setIsEditProfileOpen(false)}
                onSaved={() => setIsEditProfileOpen(false)}
            />
        </div>
    );
};
