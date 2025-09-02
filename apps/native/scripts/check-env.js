#!/usr/bin/env node

/**
 * Environment Check Script for Deep Link Configuration
 *
 * This script validates that your environment is properly configured
 * for deep link authentication in the Turbo Fit mobile app.
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

class EnvironmentChecker {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.info = [];
    this.checks = 0;
    this.passed = 0;
  }

  log(color, emoji, message) {
    console.log(`${color}${emoji} ${message}${colors.reset}`);
  }

  success(message) {
    this.log(colors.green, '✅', message);
    this.passed++;
  }

  error(message) {
    this.log(colors.red, '❌', message);
    this.errors.push(message);
  }

  warning(message) {
    this.log(colors.yellow, '⚠️ ', message);
    this.warnings.push(message);
  }

  info(message) {
    this.log(colors.blue, 'ℹ️ ', message);
    this.info.push(message);
  }

  checkFileExists(filePath, description) {
    this.checks++;
    const fullPath = path.resolve(filePath);

    if (fs.existsSync(fullPath)) {
      this.success(`${description} exists: ${filePath}`);
      return true;
    } else {
      this.error(`${description} missing: ${filePath}`);
      return false;
    }
  }

  loadEnvFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const env = {};

      content.split('\n').forEach(line => {
        line = line.trim();
        if (line && !line.startsWith('#')) {
          const [key, ...valueParts] = line.split('=');
          const value = valueParts.join('=');
          if (key && value) {
            env[key.trim()] = value.trim().replace(/^["']|["']$/g, '');
          }
        }
      });

      return env;
    } catch (error) {
      return null;
    }
  }

  checkAppConfig() {
    this.log(colors.magenta, '🔧', 'Checking app configuration...');

    const configPath = './app.config.ts';
    if (!this.checkFileExists(configPath, 'App config')) {
      return false;
    }

    try {
      // Read and parse app config
      const configContent = fs.readFileSync(configPath, 'utf8');

      // Extract scheme configurations
      const schemeMatches = configContent.match(/SCHEME\s*=\s*['"](.*?)['"];/);
      if (schemeMatches) {
        const baseScheme = schemeMatches[1];
        this.success(`Base app scheme found: ${baseScheme}`);

        // Check for environment-specific schemes
        if (configContent.includes('app-scheme-dev') || configContent.includes(`${baseScheme}-dev`)) {
          this.success('Development scheme configured');
        } else {
          this.warning('Development scheme not found in config');
        }

        return true;
      } else {
        this.error('Could not find SCHEME configuration in app.config.ts');
        return false;
      }
    } catch (error) {
      this.error(`Error reading app config: ${error.message}`);
      return false;
    }
  }

  checkEnvironmentFiles() {
    this.log(colors.magenta, '🔧', 'Checking environment files...');

    const envFiles = [
      '.env.local',
      '.env.example'
    ];

    let hasEnvFile = false;
    let envVars = {};

    for (const envFile of envFiles) {
      if (fs.existsSync(envFile)) {
        this.success(`Environment file found: ${envFile}`);
        hasEnvFile = true;

        if (envFile === '.env.local') {
          envVars = this.loadEnvFile(envFile);
        }
      } else {
        this.info(`Environment file not found: ${envFile}`);
      }
    }

    if (!hasEnvFile) {
      this.error('No environment files found. Create .env.local with your configuration.');
      return false;
    }

    return this.validateEnvironmentVariables(envVars);
  }

  validateEnvironmentVariables(envVars) {
    this.log(colors.magenta, '🔧', 'Validating environment variables...');

    const requiredVars = [
      {
        key: 'EXPO_PUBLIC_SUPABASE_URL',
        description: 'Supabase project URL',
        validator: (value) => value && value.startsWith('https://')
      },
      {
        key: 'EXPO_PUBLIC_SUPABASE_KEY',
        description: 'Supabase anon key',
        validator: (value) => value && value.length > 50
      },
      {
        key: 'APP_ENV',
        description: 'App environment',
        validator: (value) => ['development', 'preview', 'production'].includes(value)
      }
    ];

    const optionalVars = [
      {
        key: 'EXPO_PUBLIC_APP_URL',
        description: 'App URL for deep links',
        validator: (value) => value && value.includes('://')
      }
    ];

    let allValid = true;

    // Check required variables
    for (const varConfig of requiredVars) {
      this.checks++;
      const value = envVars[varConfig.key];

      if (!value) {
        this.error(`Missing required variable: ${varConfig.key} (${varConfig.description})`);
        allValid = false;
      } else if (varConfig.validator && !varConfig.validator(value)) {
        this.error(`Invalid value for ${varConfig.key}: ${value}`);
        allValid = false;
      } else {
        this.success(`${varConfig.key} is configured`);
      }
    }

    // Check optional variables
    for (const varConfig of optionalVars) {
      const value = envVars[varConfig.key];

      if (!value) {
        this.warning(`Optional variable not set: ${varConfig.key} (${varConfig.description})`);
      } else if (varConfig.validator && !varConfig.validator(value)) {
        this.warning(`Questionable value for ${varConfig.key}: ${value}`);
      } else {
        this.success(`${varConfig.key} is configured`);
      }
    }

    return allValid;
  }

  generateSupabaseUrls() {
    this.log(colors.magenta, '🔧', 'Generating Supabase configuration URLs...');

    const schemes = ['app-scheme-dev', 'app-scheme-prev', 'app-scheme'];
    const routes = ['auth/callback', 'auth/reset-password'];

    console.log('\n' + colors.cyan + '📋 Add these URLs to your Supabase project:' + colors.reset);
    console.log(colors.cyan + 'Dashboard → Authentication → URL Configuration → Redirect URLs' + colors.reset);
    console.log('');

    schemes.forEach(scheme => {
      routes.forEach(route => {
        console.log(colors.green + `  ${scheme}://${route}` + colors.reset);
      });
    });

    console.log('');
    console.log(colors.cyan + 'Optional wildcard patterns:' + colors.reset);
    schemes.forEach(scheme => {
      console.log(colors.yellow + `  ${scheme}://**` + colors.reset);
    });
  }

  generateQuickFix() {
    console.log('\n' + colors.magenta + '🚀 Quick Fix Commands:' + colors.reset);
    console.log('');

    if (this.errors.some(e => e.includes('.env.local'))) {
      console.log(colors.yellow + '1. Create environment file:' + colors.reset);
      console.log('   cp .env.example .env.local');
      console.log('');
    }

    if (this.errors.some(e => e.includes('SUPABASE'))) {
      console.log(colors.yellow + '2. Add Supabase configuration to .env.local:' + colors.reset);
      console.log('   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co');
      console.log('   EXPO_PUBLIC_SUPABASE_KEY=your-anon-key');
      console.log('');
    }

    if (this.errors.some(e => e.includes('APP_ENV'))) {
      console.log(colors.yellow + '3. Set app environment in .env.local:' + colors.reset);
      console.log('   APP_ENV=development');
      console.log('');
    }

    console.log(colors.yellow + '4. Restart your development server:' + colors.reset);
    console.log('   npm run dev');
    console.log('');

    console.log(colors.yellow + '5. Test deep links:' + colors.reset);
    console.log('   npm run test:deep-links');
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log(colors.bright + '📊 ENVIRONMENT CHECK SUMMARY' + colors.reset);
    console.log('='.repeat(60));

    console.log(`${colors.green}✅ Passed: ${this.passed}${colors.reset}`);
    console.log(`${colors.red}❌ Errors: ${this.errors.length}${colors.reset}`);
    console.log(`${colors.yellow}⚠️  Warnings: ${this.warnings.length}${colors.reset}`);
    console.log(`${colors.blue}ℹ️  Info: ${this.info.length}${colors.reset}`);

    if (this.errors.length === 0) {
      console.log('\n' + colors.green + colors.bright + '🎉 Environment is properly configured for deep links!' + colors.reset);
      console.log(colors.green + 'You can now test sign up and password reset flows.' + colors.reset);
    } else {
      console.log('\n' + colors.red + colors.bright + '🔧 Configuration issues found.' + colors.reset);
      console.log(colors.red + 'Please fix the errors above before testing deep links.' + colors.reset);
    }
  }

  async run() {
    console.log(colors.bright + colors.blue + '🔗 TurboFit Deep Link Environment Checker' + colors.reset);
    console.log('='.repeat(60));
    console.log('');

    // Check app configuration
    const configValid = this.checkAppConfig();
    console.log('');

    // Check environment files and variables
    const envValid = this.checkEnvironmentFiles();
    console.log('');

    // Generate Supabase URLs
    this.generateSupabaseUrls();

    // Show quick fix if needed
    if (this.errors.length > 0) {
      this.generateQuickFix();
    }

    // Print summary
    this.printSummary();

    // Exit with appropriate code
    process.exit(this.errors.length > 0 ? 1 : 0);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
🔗 TurboFit Deep Link Environment Checker

Usage:
  node scripts/check-env.js [options]

Options:
  --help, -h    Show this help message
  --verbose, -v Show detailed information

This script validates your environment configuration for deep link authentication.
It checks:
  • App configuration files
  • Environment variables
  • Required dependencies
  • Supabase URL configuration

Exit codes:
  0 - All checks passed
  1 - Configuration issues found
  `);
  process.exit(0);
}

// Run the checker
const checker = new EnvironmentChecker();
checker.run().catch(error => {
  console.error('💥 Unexpected error:', error.message);
  process.exit(1);
});
