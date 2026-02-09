# Board Game Assets

Assets from boardgamePack_v2 for use in games.

## Sounds (`assets/sounds/board-game/`)

| File | Use Case |
|------|----------|
| `chipsCollide1.ogg`, `chipsCollide2.ogg`, `chipsCollide3.ogg` | Piece placement (Connect Four, Checkers) |
| `cardPlace1.ogg`, `cardPlace2.ogg`, `cardPlace3.ogg` | Tic-Tac-Toe moves, general placement |
| `cardSlide1.ogg`, `cardSlide2.ogg`, `cardSlide3.ogg` | Piece movement (Checkers) |
| `dieThrow1.ogg`, `dieThrow2.ogg` | Dice games (future) |
| `dieShuffle1.ogg` | Dice shake/roll (future) |

## Sprites

### Chips (`assets/sprites/board-game/chips/`)
Poker-style chips, great for Connect Four.

**Colors available:** Black, Blue, Green, Red, White

**Variants per color:**
- `chip{Color}.png` - Main chip view (top-down)
- `chip{Color}_border.png` - With border/outline
- `chip{Color}_side.png` - Side view
- `chip{Color}_sideBorder.png` - Side view with border

**Suggested use:**
- Connect Four: `chipRedWhite.png` vs `chipBlue.png` (or `chipBlackWhite.png`)

### Pieces (`assets/sprites/board-game/pieces/{red,black,yellow}/`)
Pawn-shaped game pieces.

**Each color has:**
- `piece{Color}_single00-18.png` - Single pawn (various poses/angles)
- `piece{Color}_multi00-18.png` - Stacked pawns
- `piece{Color}_border00-18.png` - With border/outline

**Suggested use:**
- Future board games (Ludo, Sorry, etc.)

### Dice (`assets/sprites/board-game/dice/`)
Six-sided dice images.

**Available:**
- `diceWhite1-6.png` - White dice faces
- `diceRed1-6.png` - Red dice faces
- Bordered versions available

### Cards (`assets/sprites/board-game/cards/`)
Full 52-card deck + card backs.

**Card faces:** `card{Suit}{Value}.png`
- Suits: Clubs, Diamonds, Hearts, Spades
- Values: 2-10, J, Q, K, A

**Card backs:** Various colors and patterns
- `cardBack_blue1-5.png`
- `cardBack_green1-5.png`
- `cardBack_red1-5.png`

### Spritesheets (`assets/sprites/board-game/spritesheets/`)
Combined sprite sheets with XML metadata for efficient loading.

**Available:**
- `chips.png` + `chips.xml`
- `piecesRed.png`, `piecesBlack.png`, etc.
- `playingCards.png` + `playingCards.xml`
- `diceWhite.png`, `diceRed.png` + XML files

## Usage in Phaser

```typescript
// Load individual sprite
this.load.image('chip-red', 'assets/sprites/board-game/chips/chipRedWhite.png');

// Load spritesheet with XML atlas
this.load.atlasXML('chips',
  'assets/sprites/board-game/spritesheets/chips.png',
  'assets/sprites/board-game/spritesheets/chips.xml'
);

// Load sound
this.load.audio('chip-place', 'assets/sounds/board-game/chipsCollide1.ogg');
```

## Usage in Audio Service

```typescript
// In AudioService
this.sounds.set('piece-place', new Howl({
  src: ['assets/sounds/board-game/chipsCollide1.ogg']
}));
```
