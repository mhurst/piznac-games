import { Injectable } from '@angular/core';

/**
 * Abstraction layer for storage.
 * Currently uses localStorage, but can be swapped for
 * IndexedDB, cloud storage, etc. in the future.
 */
@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private prefix = 'piznac_';

  get<T>(key: string, defaultValue: T): T {
    try {
      const item = localStorage.getItem(this.prefix + key);
      if (item === null) return defaultValue;
      return JSON.parse(item) as T;
    } catch {
      return defaultValue;
    }
  }

  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(value));
    } catch (e) {
      console.warn('StorageService: failed to save', key, e);
    }
  }

  remove(key: string): void {
    localStorage.removeItem(this.prefix + key);
  }

  clear(): void {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(this.prefix));
    keys.forEach(k => localStorage.removeItem(k));
  }
}
