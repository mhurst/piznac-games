import { Card, Suit, WildCardOption } from './poker-types';

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export function createDeck(wilds: WildCardOption[] = []): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ suit, value });
    }
  }
  // Add jokers if selected
  if (wilds.includes('jokers')) {
    deck.push({ suit: 'joker', value: 'Joker' });
    deck.push({ suit: 'joker', value: 'Joker' });
  }
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function createShuffledDeck(wilds: WildCardOption[] = []): Card[] {
  return shuffleDeck(createDeck(wilds));
}

export function drawCards(deck: Card[], count: number): Card[] {
  return deck.splice(deck.length - count, count);
}
