/**
 * HTTP 클라이언트 유틸리티
 */

import * as https from 'https';
import * as http from 'http';

/**
 * GET 요청
 */
export function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    const request = protocol.get(url, {
      timeout: 30000,
      headers: {
        'User-Agent': 'RealEstateTaxCalculator/1.0',
        'Accept': 'application/xml, text/xml, application/json'
      }
    }, (response) => {
      // 리다이렉트 처리
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        httpGet(response.headers.location)
          .then(resolve)
          .catch(reject);
        return;
      }
      
      if (response.statusCode && response.statusCode >= 400) {
        reject(new Error(`HTTP Error: ${response.statusCode}`));
        return;
      }
      
      let data = '';
      
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      response.on('end', () => {
        resolve(data);
      });
      
      response.on('error', (error) => {
        reject(error);
      });
    });
    
    request.on('error', (error) => {
      reject(error);
    });
    
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * POST 요청
 */
export function httpPost(url: string, body: string, contentType: string = 'application/json'): Promise<string> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      timeout: 30000,
      headers: {
        'Content-Type': contentType,
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'RealEstateTaxCalculator/1.0'
      }
    };
    
    const request = protocol.request(options, (response) => {
      if (response.statusCode && response.statusCode >= 400) {
        reject(new Error(`HTTP Error: ${response.statusCode}`));
        return;
      }
      
      let data = '';
      
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      response.on('end', () => {
        resolve(data);
      });
      
      response.on('error', (error) => {
        reject(error);
      });
    });
    
    request.on('error', (error) => {
      reject(error);
    });
    
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
    
    request.write(body);
    request.end();
  });
}

/**
 * 지연 유틸리티
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * IP 익명화
 */
export function anonymizeIp(ip: string): string {
  if (!ip) return '';
  
  // IPv4
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.xxx.xxx`;
    }
  }
  
  // IPv6
  if (ip.includes(':')) {
    const parts = ip.split(':');
    if (parts.length >= 4) {
      return `${parts[0]}:${parts[1]}:xxxx:xxxx`;
    }
  }
  
  return 'xxx.xxx.xxx.xxx';
}
