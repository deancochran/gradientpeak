#!/usr/bin/env node

/**
 * Deep Link Testing Script
 *
 * This script helps test and validate deep link configuration for the Turbo Fit mobile app.
 * It can open deep links in simulators/emulators and validate URL configurations.
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// App configuration from app.config.ts
const APP_SCHEMES = {
  development: 'app-scheme-dev',
  preview: 'app-scheme-prev',
  production: 'app-scheme'
};

const BUNDLE_IDS = {
  development: 'com.company.turbofit.dev',
  preview: 'com.company.turbofit.preview',
  production: 'com.company.turbofit'
};

// Test URLs for different auth flows
const TEST_URLS = {
  emailVerification: (scheme) => `${scheme}://auth/callback?access_token=mock_access_token&refresh_token=mock_refresh_token`,
  passwordReset: (scheme) => `${scheme}://auth/reset-password?access_token=mock_access_token&refresh_token=mock_refresh_token`,
  emailVerificationError: (scheme) => `${scheme}://auth/callback?error=access_denied&error_description=User%20denied%20access`,
};

class DeepLinkTester {
  constructor() {
    this.environment = process.env.NODE_ENV || 'development';
    this.scheme = APP_SCHEMES[this.environment];
    this.bundleId = BUNDLE_IDS[this.environment];
  }

  log(emoji, message) {
    console.log(`${emoji} ${message}`);
  }

  async checkiOSSimulator() {
    try {
      const { stdout } = await execAsync('xcrun simctl list devices | grep Booted');
      if (stdout.trim()) {
        this.log('📱', 'iOS Simulator is running');
        return true;
      }
    } catch (error) {
      this.log('❌', 'iOS Simulator not found or not running');
      return false;
    }
    return false;
  }

  async checkAndroidEmulator() {
    try {
      const { stdout } = await execAsync('adb devices');
      const devices = stdout.split('\n').filter(line => line.includes('device') && !line.includes('List'));
      if (devices.length > 0) {
        this.log('🤖', 'Android emulator is running');
        return true;
      }
    } catch (error) {
      this.log('❌', 'Android emulator not found or adb not available');
      return false;
    }
    return false;
  }

  async testiOSDeepLink(testName, url) {
    try {
      this.log('🧪', `Testing iOS: ${testName}`);
      this.log('🔗', `URL: ${url}`);

      await execAsync(`xcrun simctl openurl booted "${url}"`);
      this.log('✅', 'iOS deep link opened successfully');
      return true;
    } catch (error) {
      this.log('❌', `iOS test failed: ${error.message}`);
      return false;
    }
  }

  async testAndroidDeepLink(testName, url) {
    try {
      this.log('🧪', `Testing Android: ${testName}`);
      this.log('🔗', `URL: ${url}`);

      const command = `adb shell am start -W -a android.intent.action.VIEW -d "${url}" ${this.bundleId}`;
      await execAsync(command);
      this.log('✅', 'Android deep link opened successfully');
      return true;
    } catch (error) {
      this.log('❌', `Android test failed: ${error.message}`);
      return false;
    }
  }

  async testDeepLink(platform, testName, url) {
    if (platform === 'ios') {
      return await this.testiOSDeepLink(testName, url);
    } else if (platform === 'android') {
      return await this.testAndroidDeepLink(testName, url);
    }
    return false;
  }

  async runAllTests(platform) {
    this.log('🚀', `Starting deep link tests for ${platform}`);
    this.log('🔧', `Environment: ${this.environment}`);
    this.log('📋', `Scheme: ${this.scheme}`);
    this.log('📦', `Bundle ID: ${this.bundleId}`);
    console.log('');

    const results = [];

    // Test email verification
    const emailVerificationUrl = TEST_URLS.emailVerification(this.scheme);
    const emailResult = await this.testDeepLink(platform, 'Email Verification', emailVerificationUrl);
    results.push({ test: 'Email Verification', passed: emailResult });

    console.log('');

    // Test password reset
    const passwordResetUrl = TEST_URLS.passwordReset(this.scheme);
    const passwordResult = await this.testDeepLink(platform, 'Password Reset', passwordResetUrl);
    results.push({ test: 'Password Reset', passed: passwordResult });

    console.log('');

    // Test error handling
    const errorUrl = TEST_URLS.emailVerificationError(this.scheme);
    const errorResult = await this.testDeepLink(platform, 'Error Handling', errorUrl);
    results.push({ test: 'Error Handling', passed: errorResult });

    console.log('');
    this.printResults(results);
  }

  printResults(results) {
    this.log('📊', 'Test Results:');
    console.log('─'.repeat(40));

    results.forEach(result => {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`${status} ${result.test}`);
    });

    console.log('─'.repeat(40));
    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    console.log(`${passed}/${total} tests passed`);

    if (passed === total) {
      this.log('🎉', 'All tests passed! Deep links are working correctly.');
    } else {
      this.log('⚠️', 'Some tests failed. Check your configuration.');
    }
  }

  printUsage() {
    console.log(`
🔗 Deep Link Tester for Turbo Fit

Usage:
  node scripts/test-deep-links.js [platform] [environment]

Platforms:
  ios       - Test on iOS Simulator
  android   - Test on Android Emulator
  both      - Test on both platforms (default)

Environments:
  development  - Use development scheme (default)
  preview      - Use preview scheme
  production   - Use production scheme

Examples:
  node scripts/test-deep-links.js ios development
  node scripts/test-deep-links.js android preview
  node scripts/test-deep-links.js both production

Environment Variables:
  NODE_ENV - Override environment (development, preview, production)

Prerequisites:
  iOS: Xcode Command Line Tools, iOS Simulator running
  Android: Android SDK, emulator running with adb available
    `);
  }

  validateSupabaseUrls() {
    this.log('🔍', 'Supabase URL Configuration Check:');
    console.log('');

    const schemes = Object.values(APP_SCHEMES);

    console.log('Add these URLs to your Supabase project:');
    console.log('Authentication > URL Configuration > Redirect URLs');
    console.log('');

    schemes.forEach(scheme => {
      console.log(`${scheme}://auth/callback`);
      console.log(`${scheme}://auth/reset-password`);
    });

    console.log('');
    console.log('Optional wildcard patterns:');
    schemes.forEach(scheme => {
      console.log(`${scheme}://**`);
    });
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const platform = args[0] || 'both';
  const environment = args[1] || process.env.NODE_ENV || 'development';

  // Set environment for tester
  process.env.NODE_ENV = environment;

  const tester = new DeepLinkTester();

  // Handle special commands
  if (platform === 'help' || platform === '--help' || platform === '-h') {
    tester.printUsage();
    return;
  }

  if (platform === 'urls' || platform === 'config') {
    tester.validateSupabaseUrls();
    return;
  }

  // Check platform availability
  const iosAvailable = await tester.checkiOSSimulator();
  const androidAvailable = await tester.checkAndroidEmulator();

  if (platform === 'ios' && !iosAvailable) {
    tester.log('❌', 'iOS Simulator is not running. Please start it first.');
    return;
  }

  if (platform === 'android' && !androidAvailable) {
    tester.log('❌', 'Android emulator is not running. Please start it first.');
    return;
  }

  // Run tests
  if (platform === 'ios' && iosAvailable) {
    await tester.runAllTests('ios');
  } else if (platform === 'android' && androidAvailable) {
    await tester.runAllTests('android');
  } else if (platform === 'both') {
    if (iosAvailable) {
      await tester.runAllTests('ios');
      console.log('\n' + '='.repeat(50) + '\n');
    }

    if (androidAvailable) {
      await tester.runAllTests('android');
    }

    if (!iosAvailable && !androidAvailable) {
      tester.log('❌', 'No simulators/emulators are running.');
      tester.log('💡', 'Start an iOS Simulator or Android emulator and try again.');
    }
  } else {
    tester.log('❌', `Invalid platform: ${platform}`);
    tester.printUsage();
  }
}

// Error handling
process.on('unhandledRejection', (error) => {
  console.error('💥 Unhandled error:', error.message);
  process.exit(1);
});

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { DeepLinkTester, TEST_URLS, APP_SCHEMES };
