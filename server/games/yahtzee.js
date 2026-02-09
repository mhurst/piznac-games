/**
 * Yahtzee — Server-side game logic for multiplayer.
 * Supports 2-4 players. Turn-based: roll dice, hold dice, pick scoring category.
 * Options: { allowMultipleYahtzees: false } — designed for future config expansion.
 */

const ALL_CATEGORIES = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
  'threeOfAKind', 'fourOfAKind', 'fullHouse',
  'smallStraight', 'largeStraight', 'chance', 'yahtzee'
];

const TOP_CATEGORIES = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];

function rollDie() {
  return Math.floor(Math.random() * 6) + 1;
}

function getCounts(dice) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) counts[d]++;
  return counts;
}

function hasConsecutive(dice, needed) {
  const unique = new Set(dice);
  const sequences = needed === 4
    ? [[1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6]]
    : [[1, 2, 3, 4, 5], [2, 3, 4, 5, 6]];
  return sequences.some(seq => seq.every(n => unique.has(n)));
}

function calculateScore(category, dice) {
  const counts = getCounts(dice);
  const sum = dice.reduce((a, b) => a + b, 0);
  const maxCount = Math.max(...counts.slice(1));

  switch (category) {
    case 'ones': return counts[1] * 1;
    case 'twos': return counts[2] * 2;
    case 'threes': return counts[3] * 3;
    case 'fours': return counts[4] * 4;
    case 'fives': return counts[5] * 5;
    case 'sixes': return counts[6] * 6;
    case 'threeOfAKind': return maxCount >= 3 ? sum : 0;
    case 'fourOfAKind': return maxCount >= 4 ? sum : 0;
    case 'fullHouse': {
      const has3 = counts.slice(1).some(c => c === 3);
      const has2 = counts.slice(1).some(c => c === 2);
      return has3 && has2 ? 25 : 0;
    }
    case 'smallStraight': return hasConsecutive(dice, 4) ? 30 : 0;
    case 'largeStraight': return hasConsecutive(dice, 5) ? 40 : 0;
    case 'chance': return sum;
    case 'yahtzee': return maxCount === 5 ? 50 : 0;
    default: return 0;
  }
}

function getTopTotal(lockedScores) {
  let total = 0;
  for (const cat of TOP_CATEGORIES) {
    if (lockedScores[cat] !== null) total += lockedScores[cat];
  }
  return total;
}

function getTotalScore(lockedScores) {
  let total = 0;
  for (const cat of ALL_CATEGORIES) {
    if (lockedScores[cat] !== null) total += lockedScores[cat];
  }
  if (getTopTotal(lockedScores) >= 63) total += 35;
  return total;
}

class Yahtzee {
  constructor(playerIds, options = {}) {
    this.playerIds = [...playerIds];
    this.playerCount = playerIds.length;
    this.options = {
      allowMultipleYahtzees: false,
      ...options
    };

    // Per-player state
    this.players = {};
    for (const id of playerIds) {
      const lockedScores = {};
      for (const cat of ALL_CATEGORIES) {
        lockedScores[cat] = null;
      }
      this.players[id] = { lockedScores };
    }

    // Turn state
    this.currentPlayerIndex = 0;
    this.dice = [0, 0, 0, 0, 0];
    this.held = [false, false, false, false, false];
    this.rollsLeft = 3;
    this.round = 1;

    this.gameOver = false;
    this.winner = null;
  }

  get currentPlayerId() {
    return this.playerIds[this.currentPlayerIndex];
  }

  makeMove(playerId, move) {
    if (this.gameOver) return { valid: false, message: 'Game is over' };
    if (playerId !== this.currentPlayerId) return { valid: false, message: 'Not your turn' };

    switch (move.type) {
      case 'roll': return this.handleRoll();
      case 'hold': return this.handleHold(move.held);
      case 'score': return this.handleScore(playerId, move.category);
      default: return { valid: false, message: 'Unknown move type' };
    }
  }

  handleRoll() {
    if (this.rollsLeft <= 0) return { valid: false, message: 'No rolls left' };

    this.rollsLeft--;
    const rollingIndices = [];
    for (let i = 0; i < 5; i++) {
      if (!this.held[i]) {
        this.dice[i] = rollDie();
        rollingIndices.push(i);
      }
    }

    return {
      valid: true,
      dice: [...this.dice],
      rollingIndices,
      rollsLeft: this.rollsLeft
    };
  }

  handleHold(held) {
    if (!Array.isArray(held) || held.length !== 5) {
      return { valid: false, message: 'Invalid hold array' };
    }
    if (this.rollsLeft >= 3) return { valid: false, message: 'Must roll before holding' };
    if (this.rollsLeft <= 0) return { valid: false, message: 'No rolls left — pick a score' };

    this.held = held.map(h => !!h);
    return { valid: true, held: [...this.held] };
  }

  handleScore(playerId, category) {
    if (!ALL_CATEGORIES.includes(category)) {
      return { valid: false, message: 'Invalid category' };
    }
    if (this.rollsLeft >= 3) return { valid: false, message: 'Must roll at least once' };

    const player = this.players[playerId];
    if (player.lockedScores[category] !== null) {
      return { valid: false, message: 'Category already scored' };
    }

    const score = calculateScore(category, this.dice);
    player.lockedScores[category] = score;

    // Advance to next player
    this.advanceTurn();

    return {
      valid: true,
      category,
      score,
      totalScore: getTotalScore(player.lockedScores),
      gameOver: this.gameOver,
      winner: this.winner
    };
  }

  advanceTurn() {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.playerCount;

    if (this.currentPlayerIndex === 0) {
      this.round++;
    }

    // Reset turn state
    this.dice = [0, 0, 0, 0, 0];
    this.held = [false, false, false, false, false];
    this.rollsLeft = 3;

    // Check if game is over (all players have filled all categories)
    const allDone = this.playerIds.every(id =>
      ALL_CATEGORIES.every(cat => this.players[id].lockedScores[cat] !== null)
    );

    if (allDone) {
      this.gameOver = true;
      let bestScore = -1;
      let bestId = null;
      for (const id of this.playerIds) {
        const total = getTotalScore(this.players[id].lockedScores);
        if (total > bestScore) {
          bestScore = total;
          bestId = id;
        }
      }
      this.winner = bestId;
    }
  }

  removePlayer(playerId) {
    const idx = this.playerIds.indexOf(playerId);
    if (idx === -1) return;

    this.playerIds.splice(idx, 1);
    delete this.players[playerId];
    this.playerCount = this.playerIds.length;

    if (this.currentPlayerIndex >= this.playerCount) {
      this.currentPlayerIndex = 0;
    }

    if (this.playerCount <= 1) {
      this.gameOver = true;
      this.winner = this.playerIds[0] || null;
    }
  }

  getState(forPlayerId = null) {
    const playerList = this.playerIds.map(id => {
      const p = this.players[id];
      const topTotal = getTopTotal(p.lockedScores);
      return {
        id,
        lockedScores: { ...p.lockedScores },
        topTotal,
        topBonus: topTotal >= 63,
        totalScore: getTotalScore(p.lockedScores)
      };
    });

    return {
      players: playerList,
      currentPlayerId: this.currentPlayerId,
      currentPlayerIndex: this.currentPlayerIndex,
      dice: [...this.dice],
      held: [...this.held],
      rollsLeft: this.rollsLeft,
      round: this.round,
      gameOver: this.gameOver,
      winner: this.winner
    };
  }
}

module.exports = Yahtzee;
