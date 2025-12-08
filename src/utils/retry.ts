
import { debugService } from '../services/debugService';

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function withRetry<T>(operation: () => Promise<T>, signal?: AbortSignal, apiName: string = 'Unknown API'): Promise<T> {
  debugService.trackApiCall(apiName);
  let retries = 0;
  const maxRetries = 10;
  
  while (true) {
    if (signal?.aborted) throw new Error('Operation cancelled');
    
    try {
      return await operation();
    } catch (error: any) {
      // Check for rate limit error
      const isRateLimit = error.message?.includes('rate limit') || 
                          error.message?.includes('429') ||
                          error.code === 429;
                          
      if (isRateLimit) {
          debugService.trackApiCall(apiName, true, false);
          if (retries < maxRetries) {
            retries++;
            // Exponential backoff with jitter
            const delay = (1000 * Math.pow(2, retries)) + (Math.random() * 1000);
            console.warn(`Rate limit hit. Retrying in ${Math.round(delay)}ms... (Attempt ${retries}/${maxRetries})`);
            await sleep(delay);
            continue;
          }
      } else {
          debugService.trackApiCall(apiName, false, true);
      }
      throw error;
    }
  }
}
