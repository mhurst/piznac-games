import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map, distinctUntilChanged } from 'rxjs/operators';
import { StorageService } from './storage.service';

const WALLET_KEY = 'wallet';
const DEFAULT_CHIPS = 1000;

@Injectable({
  providedIn: 'root'
})
export class PlayerWalletService {
  private balances$ = new BehaviorSubject<Record<string, number>>({});

  constructor(private storage: StorageService) {
    const saved = this.storage.get<Record<string, number>>(WALLET_KEY, {});
    // Auto-initialize chips if not present
    if (saved['chips'] === undefined) {
      saved['chips'] = DEFAULT_CHIPS;
    }
    this.balances$.next(saved);
    this.persist();
  }

  getBalance(resource: string): number {
    return this.balances$.value[resource] ?? 0;
  }

  balance$(resource: string): Observable<number> {
    return this.balances$.pipe(
      map(b => b[resource] ?? 0),
      distinctUntilChanged()
    );
  }

  canAfford(resource: string, amount: number): boolean {
    return this.getBalance(resource) >= amount;
  }

  deduct(resource: string, amount: number): boolean {
    const current = this.getBalance(resource);
    if (current < amount) return false;
    this.setBalance(resource, current - amount);
    return true;
  }

  credit(resource: string, amount: number): void {
    this.setBalance(resource, this.getBalance(resource) + amount);
  }

  setBalance(resource: string, amount: number): void {
    const balances = { ...this.balances$.value, [resource]: amount };
    this.balances$.next(balances);
    this.persist();
  }

  replenish(resource: string, maxAmount: number): void {
    if (this.getBalance(resource) < maxAmount) {
      this.setBalance(resource, maxAmount);
    }
  }

  private persist(): void {
    this.storage.set(WALLET_KEY, this.balances$.value);
  }
}
