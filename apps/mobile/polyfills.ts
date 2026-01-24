/**
 * Polyfills for React Native environment
 *
 * Sets up global objects needed by third-party libraries
 * that expect Node.js-like environments.
 */

import { Buffer } from "buffer";

// Make Buffer available globally for @garmin/fitsdk and other libraries
if (typeof global.Buffer === "undefined") {
  global.Buffer = Buffer;
}
