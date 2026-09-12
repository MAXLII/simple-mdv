// Keep desktop initialization and operating-system APIs out of shared renderers.
import { events, filesystem, init, os, window } from '@neutralinojs/lib';

export function initializeDesktop() { init(); }
export { events, filesystem, os, window as nativeWindow };
