'use client';

import { useState, useEffect } from 'react';
import { Settings, Shield, Users, DollarSign, Clock, Upload, Bell, Save, Loader2, Plus, X } from 'lucide-react';
import AppLayout from '../components/AppLayout';
import type { SettingsConfig } from '@/utils/settingsConfig';
import { API_REGISTRY, getAllAPIKeys } from '@/utils/apiRegistry';

type TabType = 'scrape-control' | 'profiles' | 'api-controls' | 'scheduling' | 'output' | 'notifications';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('scrape-control');
  const [settings, setSettings] = useState<SettingsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [usageStats, setUsageStats] = useState<any>(null);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
    loadUsageStats();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/settings');
      const data = await response.json();
      if (data.success) {
        setSettings(data.settings);
      } else {
        setError('Failed to load settings');
      }
    } catch (err) {
      setError('Failed to load settings');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadUsageStats = async () => {
    try {
      const response = await fetch('/api/settings/usage');
      const data = await response.json();
      if (data.success) {
        setUsageStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to load usage stats:', err);
    }
  };

  const saveSettings = async () => {
    if (!settings) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });

      const data = await response.json();
      if (data.success) {
        setSuccess('Settings saved successfully');
        setSettings(data.settings);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || 'Failed to save settings');
        if (data.errors) {
          setError(data.errors.join(', '));
        }
      }
    } catch (err) {
      setError('Failed to save settings');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const updateSettings = (updates: Partial<SettingsConfig>) => {
    if (!settings) return;
    setSettings({ ...settings, ...updates });
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="w-full px-4 sm:px-6 lg:px-8 py-8 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        </div>
      </AppLayout>
    );
  }

  if (!settings) {
    return (
      <AppLayout>
        <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 text-red-400">
            Failed to load settings. Please refresh the page.
          </div>
        </div>
      </AppLayout>
    );
  }

  const tabs = [
    { id: 'scrape-control' as TabType, label: 'Scrape Control', icon: Shield },
    { id: 'profiles' as TabType, label: 'Platform Profiles', icon: Users },
    { id: 'api-controls' as TabType, label: 'API Controls', icon: DollarSign },
    { id: 'scheduling' as TabType, label: 'Scheduling', icon: Clock },
    { id: 'output' as TabType, label: 'Output & Routing', icon: Upload },
    { id: 'notifications' as TabType, label: 'Notifications', icon: Bell },
  ];

  return (
    <AppLayout>
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Settings className="w-8 h-8 text-blue-400" />
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent tracking-tight drop-shadow-lg">
                Settings
              </h1>
            </div>
            <button
              onClick={saveSettings}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 btn-active text-white rounded-lg state-transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Settings
                </>
              )}
            </button>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 text-red-400 animate-fade-in">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-4 text-green-400 animate-fade-in">
            {success}
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-700/50 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-3 border-b-2 transition-all whitespace-nowrap
                  ${
                    isActive
                      ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                <span className="font-medium text-sm">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="panel-inactive rounded-lg p-6 animate-fade-in">
          {activeTab === 'scrape-control' && (
            <ScrapeControlTab settings={settings} updateSettings={updateSettings} usageStats={usageStats} />
          )}
          {activeTab === 'profiles' && (
            <ProfilesTab settings={settings} updateSettings={updateSettings} />
          )}
          {activeTab === 'api-controls' && (
            <APIControlsTab settings={settings} updateSettings={updateSettings} />
          )}
          {activeTab === 'scheduling' && (
            <SchedulingTab settings={settings} updateSettings={updateSettings} />
          )}
          {activeTab === 'output' && (
            <OutputTab settings={settings} updateSettings={updateSettings} />
          )}
          {activeTab === 'notifications' && (
            <NotificationsTab settings={settings} updateSettings={updateSettings} />
          )}
        </div>

      </div>
    </AppLayout>
  );
}

// Tab Components
function ScrapeControlTab({ settings, updateSettings, usageStats }: any) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-200">Scrape Control & Safety</h2>
      
      {/* Daily/Monthly Limits */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-300">Daily / Monthly Scrape Caps</h3>
        
        {/* LinkedIn Limits */}
        <div className="panel-inactive rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-slate-300 font-medium">
            <span>LinkedIn</span>
            {usageStats?.linkedin && (
              <span className="text-xs text-slate-500">
                (Used: {usageStats.linkedin.daily} / {usageStats.linkedin.dailyLimit === Infinity ? '∞' : usageStats.linkedin.dailyLimit} today)
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Daily Limit</label>
              <input
                type="number"
                value={settings.scrapeLimits.linkedin.daily === Infinity || settings.scrapeLimits.linkedin.daily == null ? '' : settings.scrapeLimits.linkedin.daily}
                onChange={(e) => {
                  const value = e.target.value === '' ? Infinity : parseInt(e.target.value, 10);
                  updateSettings({
                    scrapeLimits: {
                      ...settings.scrapeLimits,
                      linkedin: { ...settings.scrapeLimits.linkedin, daily: value },
                    },
                  });
                }}
                placeholder="Unlimited"
                className="w-full px-3 py-2 field-inactive rounded-lg text-slate-200 focus:field-focused"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Monthly Limit</label>
              <input
                type="number"
                value={settings.scrapeLimits.linkedin.monthly === Infinity || settings.scrapeLimits.linkedin.monthly == null ? '' : settings.scrapeLimits.linkedin.monthly}
                onChange={(e) => {
                  const value = e.target.value === '' ? Infinity : parseInt(e.target.value, 10);
                  updateSettings({
                    scrapeLimits: {
                      ...settings.scrapeLimits,
                      linkedin: { ...settings.scrapeLimits.linkedin, monthly: value },
                    },
                  });
                }}
                placeholder="Unlimited"
                className="w-full px-3 py-2 field-inactive rounded-lg text-slate-200 focus:field-focused"
              />
            </div>
          </div>
        </div>

        {/* Facebook Limits - Hidden */}
        {/* <div className="panel-inactive rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-slate-300 font-medium">
            <span>Facebook</span>
            {usageStats?.facebook && (
              <span className="text-xs text-slate-500">
                (Used: {usageStats.facebook.daily} / {usageStats.facebook.dailyLimit === Infinity ? '∞' : usageStats.facebook.dailyLimit} today)
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Daily Limit</label>
              <input
                type="number"
                value={settings.scrapeLimits.facebook.daily === Infinity || settings.scrapeLimits.facebook.daily == null ? '' : settings.scrapeLimits.facebook.daily}
                onChange={(e) => {
                  const value = e.target.value === '' ? Infinity : parseInt(e.target.value, 10);
                  updateSettings({
                    scrapeLimits: {
                      ...settings.scrapeLimits,
                      facebook: { ...settings.scrapeLimits.facebook, daily: value },
                    },
                  });
                }}
                placeholder="Unlimited"
                className="w-full px-3 py-2 field-inactive rounded-lg text-slate-200 focus:field-focused"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Monthly Limit</label>
              <input
                type="number"
                value={settings.scrapeLimits.facebook.monthly === Infinity || settings.scrapeLimits.facebook.monthly == null ? '' : settings.scrapeLimits.facebook.monthly}
                onChange={(e) => {
                  const value = e.target.value === '' ? Infinity : parseInt(e.target.value, 10);
                  updateSettings({
                    scrapeLimits: {
                      ...settings.scrapeLimits,
                      facebook: { ...settings.scrapeLimits.facebook, monthly: value },
                    },
                  });
                }}
                placeholder="Unlimited"
                className="w-full px-3 py-2 field-inactive rounded-lg text-slate-200 focus:field-focused"
              />
            </div>
          </div>
        </div> */}
      </div>

      {/* Rate Throttle */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-300">Rate-Limit Throttle</h3>
        <div className="panel-inactive rounded-lg p-4">
          <label className="block text-sm text-slate-400 mb-3">Speed Setting</label>
          <div className="flex gap-4">
            {(['safe', 'normal', 'aggressive'] as const).map((speed) => (
              <label key={speed} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="rateThrottle"
                  value={speed}
                  checked={settings.rateThrottle === speed}
                  onChange={() => updateSettings({ rateThrottle: speed })}
                  className="w-4 h-4 text-blue-500"
                />
                <span className="text-slate-300 capitalize">{speed}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Safe: 3s delay | Normal: 2s delay | Aggressive: 1s delay
          </p>
        </div>
      </div>

      {/* Cooldown Windows */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-300">Cooldown Windows</h3>
        <div className="panel-inactive rounded-lg p-4 space-y-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.cooldownWindows.enabled}
              onChange={(e) =>
                updateSettings({
                  cooldownWindows: { ...settings.cooldownWindows, enabled: e.target.checked },
                })
              }
              className="w-4 h-4 text-blue-500"
            />
            <span className="text-slate-300">Auto-pause scraping if errors spike</span>
          </label>
          {settings.cooldownWindows.enabled && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Error Threshold (per minute)</label>
                <input
                  type="number"
                  value={settings.cooldownWindows.errorThreshold ?? ''}
                  onChange={(e) =>
                    updateSettings({
                      cooldownWindows: {
                        ...settings.cooldownWindows,
                        errorThreshold: parseInt(e.target.value, 10),
                      },
                    })
                  }
                  className="w-full px-3 py-2 field-inactive rounded-lg text-slate-200 focus:field-focused"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Pause Duration (seconds)</label>
                <input
                  type="number"
                  value={settings.cooldownWindows.pauseDuration ?? ''}
                  onChange={(e) =>
                    updateSettings({
                      cooldownWindows: {
                        ...settings.cooldownWindows,
                        pauseDuration: parseInt(e.target.value, 10),
                      },
                    })
                  }
                  className="w-full px-3 py-2 field-inactive rounded-lg text-slate-200 focus:field-focused"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Retry Logic */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-300">Retry Logic</h3>
        <div className="panel-inactive rounded-lg p-4 space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Max Retries per Job</label>
            <input
              type="number"
              min="0"
              max="10"
              value={settings.retryLogic.maxRetries ?? ''}
              onChange={(e) =>
                updateSettings({
                  retryLogic: { ...settings.retryLogic, maxRetries: parseInt(e.target.value, 10) },
                })
              }
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-3">Backoff Strategy</label>
            <div className="flex gap-4">
              {(['exponential', 'linear', 'fixed'] as const).map((strategy) => (
                <label key={strategy} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="backoffStrategy"
                    value={strategy}
                    checked={settings.retryLogic.backoffStrategy === strategy}
                    onChange={() =>
                      updateSettings({
                        retryLogic: { ...settings.retryLogic, backoffStrategy: strategy },
                      })
                    }
                    className="w-4 h-4 text-blue-500"
                  />
                  <span className="text-slate-300 capitalize">{strategy}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfilesTab({ settings, updateSettings }: any) {
  const [editingProfile, setEditingProfile] = useState<string | null>(null);
  const [newProfile, setNewProfile] = useState<Partial<any>>({
    name: '',
    platform: 'linkedin',
    filters: {},
  });

  const handleCreateProfile = () => {
    if (!newProfile.name) return;

    const profile = {
      id: `profile-${Date.now()}`,
      name: newProfile.name,
      platform: newProfile.platform || 'linkedin',
      filters: newProfile.filters || {},
      schedule: newProfile.schedule,
      enrichmentRules: newProfile.enrichmentRules,
    };

    updateSettings({
      scrapeProfiles: [...settings.scrapeProfiles, profile],
    });

    setNewProfile({ name: '', platform: 'linkedin', filters: {} });
  };

  const handleDeleteProfile = (id: string) => {
    updateSettings({
      scrapeProfiles: settings.scrapeProfiles.filter((p: any) => p.id !== id),
    });
  };

  const handleUpdateProfile = (id: string, updates: Partial<{ name: string; platform: 'linkedin'; filters: Record<string, unknown> }>) => {
    updateSettings({
      scrapeProfiles: settings.scrapeProfiles.map((p: any) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    });
    setEditingProfile(null);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-200">Platform-Specific Profiles</h2>
      <p className="text-slate-400">
        Create reusable scrape profiles with platform-specific filters and schedules.
      </p>

      {/* Create New Profile */}
        <div className="panel-inactive rounded-lg p-4 space-y-4">
        <h3 className="text-lg font-semibold text-slate-300">Create New Profile</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Profile Name</label>
            <input
              type="text"
              value={newProfile.name || ''}
              onChange={(e) => setNewProfile({ ...newProfile, name: e.target.value })}
              placeholder="e.g., LinkedIn - US SMB"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Platform</label>
            <select
              value={newProfile.platform || 'linkedin'}
              onChange={(e) => setNewProfile({ ...newProfile, platform: e.target.value })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none"
            >
              <option value="linkedin">LinkedIn</option>
              {/* <option value="facebook">Facebook</option> */}
            </select>
          </div>
        </div>
        <button
          onClick={handleCreateProfile}
          disabled={!newProfile.name}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Create Profile
        </button>
      </div>

      {/* Existing Profiles */}
      {settings.scrapeProfiles.length === 0 ? (
        <div className="panel-inactive rounded-lg p-8 text-center text-slate-400">
          No profiles created yet. Create your first profile above.
        </div>
      ) : (
        <div className="space-y-4">
          {settings.scrapeProfiles.map((profile: any) => (
            <div key={profile.id} className="panel-inactive rounded-lg p-4">
              {editingProfile === profile.id ? (
                <EditProfileForm
                  profile={profile}
                  onSave={(updates) => handleUpdateProfile(profile.id, updates)}
                  onCancel={() => setEditingProfile(null)}
                />
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-slate-200 font-medium">{profile.name}</h3>
                    <p className="text-sm text-slate-400 capitalize">{profile.platform}</p>
                    {profile.filters && Object.keys(profile.filters).length > 0 && (
                      <p className="text-xs text-slate-500 mt-1">
                        Filters: {Object.keys(profile.filters).join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingProfile(profile.id)}
                      className="px-3 py-1 text-sm bg-slate-700 text-slate-200 rounded hover:bg-slate-600"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteProfile(profile.id)}
                      className="px-3 py-1 text-sm bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EditProfileForm({ profile, onSave, onCancel }: { profile: any; onSave: (updates: Partial<{ name: string; platform: 'linkedin'; filters: Record<string, unknown> }>) => void; onCancel: () => void }) {
  const [name, setName] = useState(profile.name);
  const [platform, setPlatform] = useState(profile.platform);
  const [filters, setFilters] = useState(profile.filters || {});

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm text-slate-400 mb-1">Profile Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-sm text-slate-400 mb-1">Platform</label>
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none"
        >
          <option value="linkedin">LinkedIn</option>
          {/* <option value="facebook">Facebook</option> */}
        </select>
      </div>
      {platform === 'linkedin' && (
        <div className="space-y-2">
          <label className="block text-sm text-slate-400">LinkedIn Filters</label>
          <input
            type="text"
            placeholder="Job Title"
            value={filters.jobTitle || ''}
            onChange={(e) => setFilters({ ...filters, jobTitle: e.target.value })}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none"
          />
          <input
            type="text"
            placeholder="Location"
            value={filters.location || ''}
            onChange={(e) => setFilters({ ...filters, location: e.target.value })}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none"
          />
        </div>
      )}
      {/* Facebook Filters - Hidden */}
      {/* {platform === 'facebook' && (
        <div className="space-y-2">
          <label className="block text-sm text-slate-400">Facebook Filters</label>
          <input
            type="text"
            placeholder="Group ID"
            value={filters.groupId || ''}
            onChange={(e) => setFilters({ ...filters, groupId: e.target.value })}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none"
          />
          <input
            type="text"
            placeholder="Keywords (comma-separated)"
            value={Array.isArray(filters.keywords) ? filters.keywords.join(', ') : (filters.keywords || '')}
            onChange={(e) => setFilters({ ...filters, keywords: e.target.value.split(',').map(k => k.trim()) })}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none"
          />
        </div>
      )} */}
      <div className="flex gap-2">
        <button
          onClick={() => onSave({ name, platform, filters })}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function APIControlsTab({ settings, updateSettings }: any) {
  const toggleAPI = (apiKey: string, enabled: boolean) => {
    const metadata = API_REGISTRY[apiKey];
    if (!metadata) return;

    // CRITICAL: Locked APIs cannot be disabled - always return early
    if (metadata.locked) {
      return; // Locked APIs cannot be toggled
    }

    const newToggles = { ...settings.apiToggles };
    newToggles[apiKey] = {
      enabled: enabled, // Only non-locked APIs can be toggled
      costPer1000: metadata.costPer1000,
      dependencies: metadata.dependencies,
    };

    // Auto-disable dependent APIs
    if (!enabled && metadata.dependencies) {
      for (const dep of metadata.dependencies) {
        if (newToggles[dep]) {
          newToggles[dep].enabled = false;
        }
      }
    }

    updateSettings({ apiToggles: newToggles });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-200">API Controls</h2>
      <p className="text-slate-400">
        Toggle APIs on/off. Disabled APIs are skipped, not removed.
      </p>

      <div className="space-y-2">
        {getAllAPIKeys()
          .filter((apiKey) => !apiKey.includes('facebook')) // Hide Facebook APIs
          .map((apiKey) => {
          const metadata = API_REGISTRY[apiKey];
          const toggle = settings.apiToggles[apiKey];
          // CRITICAL: Locked APIs are ALWAYS enabled, regardless of toggle state
          const enabled = metadata.locked ? true : (toggle?.enabled ?? true);
          const isLocked = metadata.locked === true;

          return (
            <div
              key={apiKey}
              className={`
                flex items-center justify-between p-4 rounded-lg border
                ${enabled ? 'panel-active' : 'panel-inactive opacity-60'}
              `}
            >
              <div className="flex items-center gap-4 flex-1">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => toggleAPI(apiKey, e.target.checked)}
                  disabled={isLocked}
                  className="w-5 h-5 text-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-200 font-medium">{metadata.name}</span>
                    {isLocked && (
                      <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">Locked</span>
                    )}
                    {toggle?.dependencies && toggle.dependencies.length > 0 && (
                      <span className="text-xs text-slate-500">
                        (Depends on: {toggle.dependencies.map((d: string) => API_REGISTRY[d]?.name).join(', ')})
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-slate-400 mt-1">
                    {metadata.category}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SchedulingTab({ settings, updateSettings }: any) {
  const [newRule, setNewRule] = useState({ name: '', condition: '', action: 'wait' as 'wait' | 'skip' | 'pause' });
  const [editingRule, setEditingRule] = useState<string | null>(null);

  const handleAddRule = () => {
    if (!newRule.name || !newRule.condition) return;

    const rule = {
      id: `rule-${Date.now()}`,
      name: newRule.name,
      condition: newRule.condition,
      action: newRule.action,
    };

    updateSettings({
      scheduling: {
        ...settings.scheduling,
        conditionalRules: [...settings.scheduling.conditionalRules, rule],
      },
    });

    setNewRule({ name: '', condition: '', action: 'wait' });
  };

  const handleDeleteRule = (id: string) => {
    updateSettings({
      scheduling: {
        ...settings.scheduling,
        conditionalRules: settings.scheduling.conditionalRules.filter((r: any) => r.id !== id),
      },
    });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-200">Scheduling Intelligence</h2>
      
      <div className="space-y-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.scheduling.businessHoursOnly}
            onChange={(e) =>
              updateSettings({
                scheduling: { ...settings.scheduling, businessHoursOnly: e.target.checked },
              })
            }
            className="w-4 h-4 text-blue-500"
          />
          <span className="text-slate-300">Scrape only during business hours</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.scheduling.avoidWeekends}
            onChange={(e) =>
              updateSettings({
                scheduling: { ...settings.scheduling, avoidWeekends: e.target.checked },
              })
            }
            className="w-4 h-4 text-blue-500"
          />
          <span className="text-slate-300">Avoid weekends</span>
        </label>

        <div>
          <label className="block text-sm text-slate-400 mb-1">Timezone</label>
          <input
            type="text"
            value={settings.scheduling.timezone}
            onChange={(e) =>
              updateSettings({
                scheduling: { ...settings.scheduling, timezone: e.target.value },
              })
            }
            placeholder="UTC"
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.scheduling.loadBalancing}
            onChange={(e) =>
              updateSettings({
                scheduling: { ...settings.scheduling, loadBalancing: e.target.checked },
              })
            }
            className="w-4 h-4 text-blue-500"
          />
          <span className="text-slate-300">Load balancing (spread jobs across the day)</span>
        </label>
      </div>

      {/* Conditional Rules */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-300">Conditional Rules</h3>
        <p className="text-sm text-slate-400">
          Define rules that control when jobs can execute (e.g., "only if LinkedIn completed")
        </p>

        {/* Add New Rule */}
        <div className="panel-inactive rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Rule Name</label>
              <input
                type="text"
                value={newRule.name}
                onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                placeholder="e.g., Wait for LinkedIn"
                className="w-full px-3 py-2 field-inactive rounded-lg text-slate-200 focus:field-focused"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Condition</label>
              <input
                type="text"
                value={newRule.condition}
                onChange={(e) => setNewRule({ ...newRule, condition: e.target.value })}
                placeholder="e.g., linkedin-completed"
                className="w-full px-3 py-2 field-inactive rounded-lg text-slate-200 focus:field-focused"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Action</label>
              <select
                value={newRule.action}
                onChange={(e) => setNewRule({ ...newRule, action: e.target.value as any })}
                className="w-full px-3 py-2 field-inactive rounded-lg text-slate-200 focus:field-focused"
              >
                <option value="wait">Wait</option>
                <option value="skip">Skip</option>
                <option value="pause">Pause</option>
              </select>
            </div>
          </div>
          <button
            onClick={handleAddRule}
            disabled={!newRule.name || !newRule.condition}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            Add Rule
          </button>
        </div>

        {/* Existing Rules */}
        {settings.scheduling.conditionalRules.length === 0 ? (
          <div className="panel-inactive rounded-lg p-4 text-center text-slate-400 text-sm">
            No conditional rules defined
          </div>
        ) : (
          <div className="space-y-2">
            {settings.scheduling.conditionalRules.map((rule: any) => (
              <div key={rule.id} className="panel-inactive rounded-lg p-3 flex items-center justify-between">
                <div>
                  <div className="text-slate-200 font-medium">{rule.name}</div>
                  <div className="text-sm text-slate-400">
                    Condition: {rule.condition} • Action: {rule.action}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteRule(rule.id)}
                  className="p-1 text-red-400 hover:text-red-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OutputTab({ settings, updateSettings }: any) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-200">Output & Routing Settings</h2>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Default Destination</label>
          <select
            value={settings.output.defaultDestination}
            onChange={(e) =>
              updateSettings({
                output: { ...settings.output, defaultDestination: e.target.value as any },
              })
            }
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none"
          >
            <option value="csv">CSV</option>
            <option value="webhook">Webhook</option>
            <option value="crm">CRM</option>
            <option value="dashboard">Dashboard Only</option>
          </select>
        </div>

        {settings.output.defaultDestination === 'webhook' && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Webhook URL</label>
              <input
                type="url"
                value={settings.output.webhookUrl || ''}
                onChange={(e) =>
                  updateSettings({
                    output: { ...settings.output, webhookUrl: e.target.value },
                  })
                }
                placeholder="https://example.com/webhook"
                className="w-full px-3 py-2 field-inactive rounded-lg text-slate-200 focus:field-focused"
              />
            </div>
            <div className="panel-inactive rounded-lg p-3">
              <label className="block text-sm text-slate-400 mb-2">Webhook Retry Rules</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Max Retries</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={settings.output.webhookRetryRules.maxRetries ?? ''}
                    onChange={(e) =>
                      updateSettings({
                        output: {
                          ...settings.output,
                          webhookRetryRules: {
                            ...settings.output.webhookRetryRules,
                            maxRetries: parseInt(e.target.value, 10),
                          },
                        },
                      })
                    }
                    className="w-full px-3 py-2 field-inactive rounded-lg text-slate-200 focus:field-focused"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Initial Delay (ms)</label>
                  <input
                    type="number"
                    value={settings.output.webhookRetryRules.initialDelayMs ?? ''}
                    onChange={(e) =>
                      updateSettings({
                        output: {
                          ...settings.output,
                          webhookRetryRules: {
                            ...settings.output.webhookRetryRules,
                            initialDelayMs: parseInt(e.target.value, 10),
                          },
                        },
                      })
                    }
                    className="w-full px-3 py-2 field-inactive rounded-lg text-slate-200 focus:field-focused"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Max Delay (ms)</label>
                  <input
                    type="number"
                    value={settings.output.webhookRetryRules.maxDelayMs ?? ''}
                    onChange={(e) =>
                      updateSettings({
                        output: {
                          ...settings.output,
                          webhookRetryRules: {
                            ...settings.output.webhookRetryRules,
                            maxDelayMs: parseInt(e.target.value, 10),
                          },
                        },
                      })
                    }
                    className="w-full px-3 py-2 field-inactive rounded-lg text-slate-200 focus:field-focused"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Backoff Multiplier</label>
                  <input
                    type="number"
                    step="0.1"
                    value={settings.output.webhookRetryRules.backoffMultiplier ?? ''}
                    onChange={(e) =>
                      updateSettings({
                        output: {
                          ...settings.output,
                          webhookRetryRules: {
                            ...settings.output.webhookRetryRules,
                            backoffMultiplier: parseFloat(e.target.value),
                          },
                        },
                      })
                    }
                    className="w-full px-3 py-2 field-inactive rounded-lg text-slate-200 focus:field-focused"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NotificationsTab({ settings, updateSettings }: any) {
  const toggleChannel = (channel: 'email' | 'webhook') => {
    const channels = settings.notifications.channels || [];
    const newChannels = channels.includes(channel)
      ? channels.filter((c: string) => c !== channel)
      : [...channels, channel];
    
    updateSettings({
      notifications: { ...settings.notifications, channels: newChannels },
    });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-200">Notifications & Alerts</h2>
      
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-300 mb-3">Event Types</h3>
          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.notifications.scrapeStarted}
                onChange={(e) =>
                  updateSettings({
                    notifications: { ...settings.notifications, scrapeStarted: e.target.checked },
                  })
                }
                className="w-4 h-4 text-blue-500"
              />
              <span className="text-slate-300">Scrape started</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.notifications.scrapeCompleted}
                onChange={(e) =>
                  updateSettings({
                    notifications: { ...settings.notifications, scrapeCompleted: e.target.checked },
                  })
                }
                className="w-4 h-4 text-blue-500"
              />
              <span className="text-slate-300">Scrape completed</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.notifications.errorsDetected}
                onChange={(e) =>
                  updateSettings({
                    notifications: { ...settings.notifications, errorsDetected: e.target.checked },
                  })
                }
                className="w-4 h-4 text-blue-500"
              />
              <span className="text-slate-300">Errors or bans detected</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.notifications.quotaApproaching}
                onChange={(e) =>
                  updateSettings({
                    notifications: { ...settings.notifications, quotaApproaching: e.target.checked },
                  })
                }
                className="w-4 h-4 text-blue-500"
              />
              <span className="text-slate-300">API quota approaching limit</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.notifications.jobAutoPaused}
                onChange={(e) =>
                  updateSettings({
                    notifications: { ...settings.notifications, jobAutoPaused: e.target.checked },
                  })
                }
                className="w-4 h-4 text-blue-500"
              />
              <span className="text-slate-300">Job auto-paused</span>
            </label>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-slate-300 mb-3">Notification Channels</h3>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.notifications.channels?.includes('webhook') || false}
                onChange={() => toggleChannel('webhook')}
                className="w-4 h-4 text-blue-500"
              />
              <span className="text-slate-300">Webhook</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.notifications.channels?.includes('email') || false}
                onChange={() => toggleChannel('email')}
                className="w-4 h-4 text-blue-500"
              />
              <span className="text-slate-300">Email</span>
            </label>
            <p className="text-xs text-slate-500 mt-2">
              In-app notifications are always enabled when events are turned on
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

