import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** True when the user asked the OS to reduce motion; sheets then appear without sliding or fading. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => active && setReduced(v), () => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      active = false;
      sub.remove();
    };
  }, []);
  return reduced;
}
