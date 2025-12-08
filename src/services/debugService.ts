
export interface ApiCallStat {
  count: number;
  rateLimitHits: number;
  errors: number;
}

export interface OperationStats {
  [apiMethod: string]: ApiCallStat;
}

export interface DetailedStats {
  [operation: string]: OperationStats;
}

class DebugService {
  private stats: DetailedStats = {};
  private currentOperation: string = 'Background/Idle';
  private logs: string[] = [];
  private maxLogs = 100;

  startOperation(name: string) {
    this.currentOperation = name;
    this.log(`Started operation: ${name}`);
  }

  endOperation() {
    this.log(`Ended operation: ${this.currentOperation}`);
    this.currentOperation = 'Background/Idle';
  }

  trackApiCall(apiMethod: string, isRateLimit: boolean = false, isError: boolean = false) {
    if (!this.stats[this.currentOperation]) {
      this.stats[this.currentOperation] = {};
    }
    if (!this.stats[this.currentOperation][apiMethod]) {
      this.stats[this.currentOperation][apiMethod] = { count: 0, rateLimitHits: 0, errors: 0 };
    }
    
    const stat = this.stats[this.currentOperation][apiMethod];
    stat.count++;
    if (isRateLimit) stat.rateLimitHits++;
    if (isError) stat.errors++;
  }

  // Legacy support
  increment(key: string) {
    this.trackApiCall(key);
  }

  log(message: string) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    this.logs.unshift(`[${timestamp}] ${message}`);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }
  }

  getStats(): DetailedStats {
    return JSON.parse(JSON.stringify(this.stats));
  }

  getLogs(): string[] {
    return [...this.logs];
  }

  reset() {
    this.stats = {};
    this.logs = [];
    this.currentOperation = 'Background/Idle';
  }
}

export const debugService = new DebugService();
