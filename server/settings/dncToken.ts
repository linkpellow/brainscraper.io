import { loadSettings, saveSettings, invalidateSettingsCache } from '@/utils/settingsConfig';

export const maskToken = (token: string): string => {
  if (!token) return '********';
  const trimmed = token.trim();
  if (trimmed.length <= 4) return '*'.repeat(trimmed.length);
  return `${'*'.repeat(Math.max(8, trimmed.length - 4))}${trimmed.slice(-4)}`;
};

export const getDncToken = async (): Promise<string | null> => {
  const settings = loadSettings();
  const token = settings.dncToken?.trim();
  return token ? token : null;
};

export const setDncToken = async (token: string): Promise<void> => {
  const trimmed = token.trim();
  const settings = loadSettings();
  const nextSettings = {
    ...settings,
    dncToken: trimmed.length > 0 ? trimmed : null,
  };
  await saveSettings(nextSettings);
  invalidateSettingsCache();
};
