import { Platform } from 'react-native';

export const colors = {
  bg: '#F3F6F6',
  surface: '#FFFFFF',
  border: '#DFE6E6',
  text: '#15282A',
  muted: '#5F7173',
  primary: '#0F766E',
  primarySoft: '#E3F2F0',
  danger: '#C4320A',
  dangerSoft: '#FDECEA',
  success: '#12805C',
  successSoft: '#E5F5EE',
  warning: '#B54708',
  warningSoft: '#FEF3E2',
  info: '#2E5AAC',
  infoSoft: '#E8EEFB',
  codeBg: '#0F172A',
  codeText: '#E2E8F0',
};

export const monoFont = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

export const radius = 10;
