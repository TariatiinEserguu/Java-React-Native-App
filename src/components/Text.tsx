import { createContext, useContext } from 'react';
import { StyleSheet, Text as NativeText, type TextProps } from 'react-native';

import { fontForWeight } from '../theme';

const NestedText = createContext(false);

/**
 * Text in the app typeface. Custom fonts pick their weight by font file, so the `fontWeight` in the
 * style is turned into the matching IBM Plex Sans file. Nested text without its own weight inherits
 * the parent's font, like plain React Native text. Styles that name a fontFamily (code) keep it.
 */
export function Text({ style, children, ...rest }: TextProps) {
  const nested = useContext(NestedText);
  const flat = StyleSheet.flatten(style);
  const ownFont = flat?.fontFamily !== undefined || (nested && flat?.fontWeight === undefined);
  return (
    <NativeText {...rest} style={ownFont ? style : [style, { fontFamily: fontForWeight(flat?.fontWeight), fontWeight: 'normal' }]}>
      {nested ? children : <NestedText.Provider value>{children}</NestedText.Provider>}
    </NativeText>
  );
}
