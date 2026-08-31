/**
 * Abstract Cloud Transcoder Module
 * Proxies requests through custom Backend API server (with Telegram Auth & Credits validation).
 */

const DEFAULT_PROXY_URL = 'https://transcoding.ss.3w.com.ua';

class BaseCloudProvider {
  async startJob(params) {
    throw new Error('startJob method must be implemented');
  }

  async cancelJob(jobId) {
    throw new Error('cancelJob method must be implemented');
  }

  async getJobStatus(jobId) {
    throw new Error('getJobStatus method must be implemented');
  }
}

/**
 * Backend Proxy Provider
 * Proxies requests through custom backend API server
 */
class BackendProxyProvider extends BaseCloudProvider {
  constructor(proxyUrl, authToken) {
    super();
    this.proxyUrl = (proxyUrl || DEFAULT_PROXY_URL).trim().replace(/\/+$/, '');
    this.authToken = (authToken || '').trim();
  }

  async checkBalance(payload) {
    if (!this.proxyUrl || !this.authToken) return { allowed: true };

    try {
      const response = await fetch(`${this.proxyUrl}/api/user/me?_t=${Date.now()}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.authToken}`
        }
      });

      if (response.ok) {
        const user = await response.json();
        const balance = user.balanceUsd !== undefined ? user.balanceUsd : (user.balance_usd !== undefined ? user.balance_usd : 0);
        if (balance <= 0) {
          throw new Error(`Недостатньо коштів на хмарному балансі ($${balance.toFixed(2)}). Будь ласка, поповніть баланс через Telegram-бота.`);
        }
        return { allowed: true, balance };
      }
    } catch (err) {
      if (err.message && err.message.includes('Недостатньо коштів')) {
        throw err;
      }
    }

    return { allowed: true };
  }

  async startJob(payload) {
    if (!this.proxyUrl) {
      throw new Error('Помилка конфігурації проксі-сервера!');
    }
    if (!this.authToken) {
      throw new Error('Авторизуйтесь через Telegram у налаштуваннях для використання хмарного GPU!');
    }

    const response = await fetch(`${this.proxyUrl}/api/transcode/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.authToken}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      let msg = errText;
      try {
        const jsonErr = JSON.parse(errText);
        msg = jsonErr.error || errText;
      } catch (e) {}
      throw new Error(`Помилка Хмарного Проксі (${response.status}): ${msg}`);
    }

    const data = await response.json();
    return data.jobId;
  }

  async getJobStatus(jobId) {
    const response = await fetch(`${this.proxyUrl}/api/transcode/status/${jobId}`, {
      headers: {
        'Authorization': `Bearer ${this.authToken}`
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Помилка отримання статусу (${response.status}): ${errText}`);
    }

    return await response.json();
  }

  async cancelJob(jobId) {
    if (!this.proxyUrl || !jobId) return;
    try {
      await fetch(`${this.proxyUrl}/api/transcode/cancel/${jobId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.authToken}`
        }
      });
    } catch (e) {
      console.warn('Failed to cancel proxy job:', e);
    }
  }
}

/**
 * Provider Factory
 */
function createCloudProvider({ proxyUrl, authToken }) {
  return new BackendProxyProvider(proxyUrl || DEFAULT_PROXY_URL, authToken);
}

module.exports = {
  DEFAULT_PROXY_URL,
  BaseCloudProvider,
  BackendProxyProvider,
  createCloudProvider
};
