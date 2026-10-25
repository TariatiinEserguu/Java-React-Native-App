import { Platform } from 'react-native';

export const colors = {
  bg: '#F4F6FA',
  surface: '#FFFFFF',
  border: '#E2E6EE',
  text: '#1B2333',
  muted: '#667085',
  primary: '#3559E0',
  primarySoft: '#E8EDFD',
  danger: '#C4320A',
  dangerSoft: '#FDECEA',
  success: '#12805C',
  successSoft: '#E5F5EE',
  warning: '#B54708',
  warningSoft: '#FEF3E2',
  codeBg: '#0F172A',
  codeText: '#E2E8F0',
};

export const monoFont = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

export const radius = 10;
