/**
 * API Configuration for Hybrid Architecture
 * Manages endpoints and settings for Next.js backend integration
 */

export interface ApiConfig {
  baseUrl: string;
  webUrl: string;
  timeout: number;
  enableLogging: boolean;
  retryAttempts: number;
  retryDelay: number;
}

class ApiConfigManager {
  private config: ApiConfig;

  constructor() {
    this.config = this.loadConfig();
    this.validateConfig();
  }

  private loadConfig(): ApiConfig {
    const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
    const webUrl = process.env.EXPO_PUBLIC_WEB_URL || baseUrl;

    return {
      baseUrl: baseUrl.replace(/\/+$/, ''), // Remove trailing slashes
      webUrl: webUrl.replace(/\/+$/, ''),
      timeout: parseInt(process.env.EXPO_PUBLIC_API_TIMEOUT || '30000'),
      enableLogging: process.env.EXPO_PUBLIC_ENABLE_API_LOGGING === 'true',
      retryAttempts: 3,
      retryDelay: 1000, // 1 second
    };
  }

  private validateConfig(): void {
    if (!this.config.baseUrl) {
      throw new Error('EXPO_PUBLIC_API_URL is required but not set');
    }

    try {
      new URL(this.config.baseUrl);
    } catch (error) {
      throw new Error(`Invalid EXPO_PUBLIC_API_URL: ${this.config.baseUrl}`);
    }

    if (this.config.timeout < 1000 || this.config.timeout > 120000) {
      console.warn('API timeout should be between 1-120 seconds, using default 30s');
      this.config.timeout = 30000;
    }

    console.log('🔧 API Configuration loaded:', {
      baseUrl: this.config.baseUrl,
      webUrl: this.config.webUrl,
      timeout: this.config.timeout,
      enableLogging: this.config.enableLogging,
    });
  }

  get(): ApiConfig {
    return { ...this.config };
  }

  getEndpoint(path: string): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.config.baseUrl}/api/mobile${cleanPath}`;
  }

  getWebUrl(path?: string): string {
    if (!path) return this.config.webUrl;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.config.webUrl}${cleanPath}`;
  }

  isLocalDevelopment(): boolean {
    return this.config.baseUrl.includes('localhost') ||
           this.config.baseUrl.includes('127.0.0.1') ||
           this.config.baseUrl.includes('192.168.');
  }

  isProduction(): boolean {
    return !this.isLocalDevelopment();
  }

  shouldLog(): boolean {
    return this.config.enableLogging;
  }

  getTimeout(): number {
    return this.config.timeout;
  }

  getRetryConfig(): { attempts: number; delay: number } {
    return {
      attempts: this.config.retryAttempts,
      delay: this.config.retryDelay,
    };
  }
}

// Singleton instance
export const apiConfig = new ApiConfigManager();

// Export configuration values for direct access
export const API_BASE_URL = apiConfig.get().baseUrl;
export const WEB_BASE_URL = apiConfig.get().webUrl;
export const API_TIMEOUT = apiConfig.get().timeout;
export const ENABLE_API_LOGGING = apiConfig.get().enableLogging;

export default apiConfig;
