/**
 * Farkle — Server-side game logic for multiplayer.
 * Supports 2-4 players. Server generates dice values and validates all moves.
 */

function getCounts(values) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const v of values) counts[v]++;
  return counts;
}

/** Score a set of kept dice values. Returns 0 if invalid. */
function scoreSelection(values) {
  if (values.length === 0) return 0;

  const counts = getCounts(values);
  const len = values.length;

  // Straight
  if (len === 6 && counts[1] === 1 && counts[2] === 1 && counts[3] === 1 &&
      counts[4] === 1 && counts[5] === 1 && counts[6] === 1) {
    return 1500;
  }

  // Three pairs
  if (len === 6) {
    const pairCount = counts.filter(c => c === 2).length;
    if (pairCount === 3) return 1500;
    if (counts.some(c => c === 4) && counts.some(c => c === 2)) return 1500;
  }

  let score = 0;
  const usedCounts = [0, 0, 0, 0, 0, 0, 0];

  for (let face = 1; face <= 6; face++) {
    const c = counts[face];
    if (c >= 3) {
      const tripleBase = face === 1 ? 1000 : face * 100;
      if (c === 3) score += tripleBase;
      else if (c === 4) score += tripleBase * 2;
      else if (c === 5) score += tripleBase * 4;
      else if (c === 6) score += tripleBase * 8;
      usedCounts[face] = c;
    }
  }

  const leftover1s = counts[1] - (usedCounts[1] > 0 ? usedCounts[1] : 0);
  const leftover5s = counts[5] - (usedCounts[5] > 0 ? usedCounts[5] : 0);

  if (leftover1s > 0) score += leftover1s * 100;
  if (leftover5s > 0) score += leftover5s * 50;

  // Validate: no dead dice
  for (let face = 1; face <= 6; face++) {
    const used = usedCounts[face] + (face === 1 ? leftover1s : 0) + (face === 5 ? leftover5s : 0);
    if (counts[face] > 0 && used === 0) return 0;
  }

  return score;
}

function hasScoringDice(values) {
  if (values.length === 0) return false;
  const counts = getCounts(values);
  if (counts[1] > 0 || counts[5] > 0) return true;
  for (let face = 2; face <= 6; face++) {
    if (counts[face] >= 3) return true;
  }
  if (values.length === 6) {
    if (counts[1] === 1 && counts[2] === 1 && counts[3] === 1 &&
        counts[4] === 1 && counts[5] === 1 && counts[6] === 1) return true;
    const pairs = counts.filter(c => c === 2).length;
    if (pairs === 3) return true;
    if (counts.some(c => c === 4) && counts.some(c => c === 2)) return true;
  }
  return false;
}

/** Return local indices of dice that participate in scoring combos. */
function findScoringDiceIndices(values) {
  if (values.length === 0) return [];
  const counts = getCounts(values);

  // 6-dice specials (straight, three pairs, 4+2)
  if (values.length === 6) {
    if (counts[1] === 1 && counts[2] === 1 && counts[3] === 1 &&
        counts[4] === 1 && counts[5] === 1 && counts[6] === 1) {
      return [0, 1, 2, 3, 4, 5];
    }
    const pairs = counts.filter(c => c === 2).length;
    if (pairs === 3) return [0, 1, 2, 3, 4, 5];
    if (counts.some(c => c === 4) && counts.some(c => c === 2)) return [0, 1, 2, 3, 4, 5];
  }

  const indices = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === 1 || v === 5) { indices.push(i); continue; }
    if (counts[v] >= 3) { indices.push(i); continue; }
  }
  return indices;
}

function rollDie() {
  return Math.floor(Math.random() * 6) + 1;
}

class Farkle {
  constructor(playerIds) {
    // playerIds is an array of 2-4 socket IDs
    this.playerIds = [...playerIds];
    this.playerCount = playerIds.length;

    // Scores
    this.scores = {};
    for (const id of playerIds) {
      this.scores[id] = 0;
    }

    // Turn state
    this.currentPlayerIndex = 0;
    this.dice = [0, 0, 0, 0, 0, 0];
    this.keptIndices = [];    // Indices already locked this turn
    this.turnScore = 0;
    this.hasRolled = false;

    this.gameOver = false;
    this.winner = null;
  }

  get currentPlayerId() {
    return this.playerIds[this.currentPlayerIndex];
  }

  getActiveDiceIndices() {
    const indices = [];
    for (let i = 0; i < 6; i++) {
      if (!this.keptIndices.includes(i)) indices.push(i);
    }
    return indices;
  }

  makeMove(playerId, move) {
    if (this.gameOver) return { valid: false, message: 'Game is over' };
    if (playerId !== this.currentPlayerId) return { valid: false, message: 'Not your turn' };

    switch (move.type) {
      case 'roll': return this.handleRoll(playerId);
      case 'keep': return this.handleKeep(playerId, move.indices);
      case 'bank': return this.handleBank(playerId);
      case 'keep-and-roll': return this.handleKeepAndRoll(playerId, move.indices);
      case 'keep-and-bank': return this.handleKeepAndBank(playerId, move.indices);
      default: return { valid: false, message: 'Unknown move type' };
    }
  }

  handleRoll(playerId) {
    if (this.hasRolled && this.keptIndices.length === 0) {
      return { valid: false, message: 'Must keep scoring dice before rolling again' };
    }

    const rollingIndices = this.getActiveDiceIndices();
    if (rollingIndices.length === 0) return { valid: false, message: 'No dice to roll' };

    // Generate dice values server-side
    for (const i of rollingIndices) {
      this.dice[i] = rollDie();
    }
    this.hasRolled = true;

    // Check for farkle
    const activeValues = rollingIndices.map(i => this.dice[i]);
    if (!hasScoringDice(activeValues)) {
      const farkleDice = [...this.dice];
      const lostScore = this.turnScore;
      this.turnScore = 0;
      this.advanceTurn();
      return {
        valid: true,
        farkle: true,
        dice: farkleDice,
        rollingIndices,
        lostScore,
        nextPlayer: this.currentPlayerId,
        gameOver: this.gameOver,
        winner: this.winner
      };
    }

    // Check if ALL active dice score → auto-keep for Hot Dice
    const allScore = scoreSelection(activeValues);
    if (allScore > 0) {
      this.turnScore += allScore;
      this.keptIndices.push(...rollingIndices);
      if (this.keptIndices.length === 6) {
        const hotDice = [...this.dice];
        this.keptIndices = [];
        this.hasRolled = false;
        this.dice = [0, 0, 0, 0, 0, 0];
        return {
          valid: true,
          hotDice: true,
          dice: hotDice,
          rollingIndices,
          turnScore: this.turnScore
        };
      }
    }

    return {
      valid: true,
      dice: [...this.dice],
      rollingIndices
    };
  }

  handleKeep(playerId, indices) {
    if (!this.hasRolled) return { valid: false, message: 'Must roll first' };
    if (!indices || indices.length === 0) return { valid: false, message: 'Must select at least one die' };

    // Validate indices are active (not already kept)
    for (const idx of indices) {
      if (idx < 0 || idx >= 6) return { valid: false, message: 'Invalid die index' };
      if (this.keptIndices.includes(idx)) return { valid: false, message: 'Die already kept' };
    }

    // Validate selection scores
    const values = indices.map(i => this.dice[i]);
    const score = scoreSelection(values);
    if (score === 0) return { valid: false, message: 'Invalid scoring combination' };

    this.turnScore += score;
    this.keptIndices.push(...indices);

    // Check for hot dice
    if (this.keptIndices.length === 6) {
      this.keptIndices = [];
      this.hasRolled = false;
      this.dice = [0, 0, 0, 0, 0, 0];
      return {
        valid: true,
        hotDice: true,
        score,
        turnScore: this.turnScore,
        keptIndices: []
      };
    }

    return {
      valid: true,
      score,
      turnScore: this.turnScore,
      keptIndices: [...this.keptIndices]
    };
  }

  handleKeepAndRoll(playerId, indices) {
    if (!this.hasRolled) return { valid: false, message: 'Must roll first' };
    if (!indices || indices.length === 0) {
      return this.handleRoll(playerId);
    }

    // Validate indices
    for (const idx of indices) {
      if (idx < 0 || idx >= 6) return { valid: false, message: 'Invalid die index' };
      if (this.keptIndices.includes(idx)) return { valid: false, message: 'Die already kept' };
    }

    // Validate selection scores
    const values = indices.map(i => this.dice[i]);
    const keepScore = scoreSelection(values);
    if (keepScore === 0) return { valid: false, message: 'Invalid scoring combination' };

    this.turnScore += keepScore;
    this.keptIndices.push(...indices);

    // Check for hot dice (all 6 explicitly kept)
    if (this.keptIndices.length === 6) {
      this.keptIndices = [];
      this.hasRolled = false;
      this.dice = [0, 0, 0, 0, 0, 0];
      return {
        valid: true,
        hotDice: true,
        score: keepScore,
        turnScore: this.turnScore,
        keptIndices: []
      };
    }

    // Auto-keep remaining if they ALL score together
    const remainingIndices = this.getActiveDiceIndices();
    const remainingValues = remainingIndices.map(i => this.dice[i]);
    const remainingScore = scoreSelection(remainingValues);
    if (remainingScore > 0) {
      this.turnScore += remainingScore;
      this.keptIndices.push(...remainingIndices);
      if (this.keptIndices.length === 6) {
        this.keptIndices = [];
        this.hasRolled = false;
        this.dice = [0, 0, 0, 0, 0, 0];
        return {
          valid: true,
          hotDice: true,
          score: keepScore,
          turnScore: this.turnScore,
          keptIndices: []
        };
      }
    }

    // Roll remaining dice
    const rollingIndices = this.getActiveDiceIndices();
    if (rollingIndices.length === 0) return { valid: false, message: 'No dice to roll' };

    for (const i of rollingIndices) {
      this.dice[i] = rollDie();
    }

    // Check for farkle on new roll
    const activeValues = rollingIndices.map(i => this.dice[i]);
    if (!hasScoringDice(activeValues)) {
      const farkleDice = [...this.dice];
      const lostScore = this.turnScore;
      this.turnScore = 0;
      this.advanceTurn();
      return {
        valid: true,
        farkle: true,
        dice: farkleDice,
        rollingIndices,
        lostScore,
        score: keepScore,
        nextPlayer: this.currentPlayerId,
        gameOver: this.gameOver,
        winner: this.winner
      };
    }

    // Check if ALL rolled dice score → auto-keep for hot dice
    const allRolledScore = scoreSelection(activeValues);
    if (allRolledScore > 0) {
      this.turnScore += allRolledScore;
      this.keptIndices.push(...rollingIndices);
      if (this.keptIndices.length === 6) {
        const hotDice = [...this.dice];
        this.keptIndices = [];
        this.hasRolled = false;
        this.dice = [0, 0, 0, 0, 0, 0];
        return {
          valid: true,
          hotDice: true,
          dice: hotDice,
          rollingIndices,
          score: keepScore,
          turnScore: this.turnScore,
          keptIndices: []
        };
      }
    }

    return {
      valid: true,
      dice: [...this.dice],
      rollingIndices,
      score: keepScore
    };
  }

  handleKeepAndBank(playerId, indices) {
    if (!this.hasRolled) return { valid: false, message: 'Must roll first' };

    if (indices && indices.length > 0) {
      for (const idx of indices) {
        if (idx < 0 || idx >= 6) return { valid: false, message: 'Invalid die index' };
        if (this.keptIndices.includes(idx)) return { valid: false, message: 'Die already kept' };
      }
      const values = indices.map(i => this.dice[i]);
      const score = scoreSelection(values);
      if (score === 0) return { valid: false, message: 'Invalid scoring combination' };
      this.turnScore += score;
      this.keptIndices.push(...indices);
    }

    // Auto-score any remaining scoring dice the player didn't explicitly select
    this.autoScoreRemaining();

    if (this.turnScore <= 0) return { valid: false, message: 'No points to bank' };

    this.scores[playerId] += this.turnScore;
    const bankedScore = this.turnScore;

    if (this.scores[playerId] >= 10000) {
      this.gameOver = true;
      this.winner = playerId;
      return {
        valid: true,
        banked: bankedScore,
        playerScore: this.scores[playerId],
        gameOver: true,
        winner: playerId
      };
    }

    this.advanceTurn();
    return {
      valid: true,
      banked: bankedScore,
      playerScore: this.scores[playerId],
      nextPlayer: this.currentPlayerId,
      gameOver: false,
      winner: null
    };
  }

  handleBank(playerId) {
    if (!this.hasRolled) return { valid: false, message: 'Must roll first' };

    // Auto-score any remaining scoring dice the player didn't explicitly select
    this.autoScoreRemaining();

    if (this.turnScore <= 0) return { valid: false, message: 'No points to bank' };

    this.scores[playerId] += this.turnScore;
    const bankedScore = this.turnScore;

    // Hit 10,000 — game over immediately
    if (this.scores[playerId] >= 10000) {
      this.gameOver = true;
      this.winner = playerId;
      return {
        valid: true,
        banked: bankedScore,
        playerScore: this.scores[playerId],
        gameOver: true,
        winner: playerId
      };
    }

    this.advanceTurn();

    return {
      valid: true,
      banked: bankedScore,
      playerScore: this.scores[playerId],
      nextPlayer: this.currentPlayerId,
      gameOver: false,
      winner: null
    };
  }

  /** Auto-score any remaining active scoring dice (called before banking). */
  autoScoreRemaining() {
    const activeIndices = this.getActiveDiceIndices();
    if (activeIndices.length === 0) return;
    const activeValues = activeIndices.map(i => this.dice[i]);
    const scoringLocal = findScoringDiceIndices(activeValues);
    if (scoringLocal.length === 0) return;
    const scoringGlobal = scoringLocal.map(li => activeIndices[li]);
    const scoringValues = scoringGlobal.map(i => this.dice[i]);
    const score = scoreSelection(scoringValues);
    if (score > 0) {
      this.turnScore += score;
      this.keptIndices.push(...scoringGlobal);
    }
  }

  advanceTurn() {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.playerCount;
    this.dice = [0, 0, 0, 0, 0, 0];
    this.keptIndices = [];
    this.turnScore = 0;
    this.hasRolled = false;
  }

  removePlayer(playerId) {
    const idx = this.playerIds.indexOf(playerId);
    if (idx === -1) return;

    this.playerIds.splice(idx, 1);
    delete this.scores[playerId];
    this.playerCount = this.playerIds.length;

    // Adjust current player index
    if (this.currentPlayerIndex >= this.playerCount) {
      this.currentPlayerIndex = 0;
    }

    // If only 1 player left, they win
    if (this.playerCount <= 1) {
      this.gameOver = true;
      this.winner = this.playerIds[0] || null;
    }
  }

  getState(forPlayerId = null) {
    const playerList = this.playerIds.map(id => ({
      id,
      score: this.scores[id]
    }));

    return {
      players: playerList,
      currentPlayerId: this.currentPlayerId,
      currentPlayerIndex: this.currentPlayerIndex,
      dice: [...this.dice],
      keptIndices: [...this.keptIndices],
      turnScore: this.turnScore,
      hasRolled: this.hasRolled,
      gameOver: this.gameOver,
      winner: this.winner,
      scores: { ...this.scores }
    };
  }
}

module.exports = Farkle;
