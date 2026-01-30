import { loadSettings, saveSettings, invalidateSettingsCache } from './settingsConfig';

export type DncTokenMeta = {
  configured: boolean;
  masked: string | null;
};

export const maskToken = (token: string): string => {
  if (!token) return '********';
  const trimmed = token.trim();
  if (trimmed.length <= 4) return '*'.repeat(trimmed.length);
  return `${'*'.repeat(Math.max(8, trimmed.length - 4))}${trimmed.slice(-4)}`;
};

export const getDncToken = (): string | null => {
  const settings = loadSettings();
  const token = settings.dncToken?.trim();
  return token ? token : null;
};

export const getDncTokenMeta = (): DncTokenMeta => {
  const token = getDncToken();
  return {
    configured: Boolean(token),
    masked: token ? maskToken(token) : null,
  };
};

export const setDncToken = async (token: string): Promise<DncTokenMeta> => {
  const trimmed = token.trim();
  const settings = loadSettings();
  const nextSettings = {
    ...settings,
    dncToken: trimmed.length > 0 ? trimmed : null,
  };
  await saveSettings(nextSettings);
  invalidateSettingsCache();
  return getDncTokenMeta();
};
