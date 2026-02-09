import Phaser from 'phaser';

interface Card {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  value: number; // 2-14 (14=Ace)
}

interface WarState {
  phase: string;
  myCardCount: number;
  opponentCardCount: number;
  flippedCards: {
    P1: Card | null;
    P2: Card | null;
  };
  mySymbol: 'P1' | 'P2';
  iHaveFlipped: boolean;
  opponentHasFlipped: boolean;
  inWar: boolean;
  warCardCount: number;
  roundWinner: string | null;
  gameOver: boolean;
  winner: string | null;
}

export class WarScene extends Phaser.Scene {
  private cardWidth = 80;
  private cardHeight = 112;
  private mySymbol: 'P1' | 'P2' = 'P1';
  private gameOver = false;

  // Visual elements
  private myDeckSprite: Phaser.GameObjects.Sprite | null = null;
  private opponentDeckSprite: Phaser.GameObjects.Sprite | null = null;
  private myFlippedCard: Phaser.GameObjects.Sprite | null = null;
  private opponentFlippedCard: Phaser.GameObjects.Sprite | null = null;
  private myCardBorder: Phaser.GameObjects.Graphics | null = null;
  private opponentCardBorder: Phaser.GameObjects.Graphics | null = null;
  private warCardsContainer: Phaser.GameObjects.Container | null = null;

  // Text displays
  private myCardCountText!: Phaser.GameObjects.Text;
  private opponentCardCountText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private warText!: Phaser.GameObjects.Text;

  // Flip button
  private flipButton!: Phaser.GameObjects.Container;
  private flipButtonEnabled = false;

  // Callbacks
  public onFlip: (() => void) | null = null;
  public onReady: (() => void) | null = null;

  constructor() {
    super({ key: 'WarScene' });
  }

  preload(): void {
    const basePath = 'assets/sprites/board-game/cards/';

    // Load card backs
    this.load.image('cardBack_blue', basePath + 'cardBack_blue1.png');
    this.load.image('cardBack_red', basePath + 'cardBack_red1.png');

    // Load all card faces
    const suits = ['Clubs', 'Diamonds', 'Hearts', 'Spades'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

    for (const suit of suits) {
      for (const value of values) {
        const key = `card${suit}${value}`;
        this.load.image(key, basePath + `card${suit}${value}.png`);
      }
    }
  }

  create(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    const centerX = width / 2;

    // Layout positions (for 400x500 canvas):
    const statusY = 25;
    const oppLabelY = 55;
    const oppDeckY = 120;
    const centerY = height / 2;  // 250 - where flipped cards go
    const myDeckY = height - 120;  // 380
    const myLabelY = height - 55;  // 445
    const flipButtonY = height - 25;  // 475

    // Status text at top
    this.statusText = this.add.text(centerX, statusY, 'Click FLIP to play!', {
      fontSize: '20px',
      color: '#ffffff',
      fontFamily: 'Arial'
    }).setOrigin(0.5);

    // Opponent label
    this.add.text(centerX, oppLabelY, 'Opponent', {
      fontSize: '14px',
      color: '#e94560',
      fontFamily: 'Arial'
    }).setOrigin(0.5);

    // Opponent's deck
    this.opponentDeckSprite = this.add.sprite(centerX, oppDeckY, 'cardBack_red');
    this.opponentDeckSprite.setDisplaySize(this.cardWidth, this.cardHeight);

    this.opponentCardCountText = this.add.text(centerX + 55, oppDeckY, '26', {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'Arial'
    }).setOrigin(0, 0.5);

    // War announcement text (hidden by default) - in center
    this.warText = this.add.text(centerX, centerY, 'WAR!', {
      fontSize: '36px',
      color: '#e94560',
      fontFamily: 'Arial',
      fontStyle: 'bold'
    }).setOrigin(0.5).setVisible(false).setDepth(100);

    // War cards container (centered, cards will be positioned left/right)
    this.warCardsContainer = this.add.container(centerX, centerY);

    // My deck
    this.myDeckSprite = this.add.sprite(centerX, myDeckY, 'cardBack_blue');
    this.myDeckSprite.setDisplaySize(this.cardWidth, this.cardHeight);

    this.myCardCountText = this.add.text(centerX + 55, myDeckY, '26', {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'Arial'
    }).setOrigin(0, 0.5);

    // My label
    this.add.text(centerX, myLabelY, 'You', {
      fontSize: '14px',
      color: '#4a90d9',
      fontFamily: 'Arial'
    }).setOrigin(0.5);

    // Create flip button
    this.createFlipButton(centerX, flipButtonY);

    if (this.onReady) this.onReady();
  }

  private createFlipButton(x: number, y: number): void {
    const buttonWidth = 100;
    const buttonHeight = 36;

    const bg = this.add.graphics();
    bg.fillStyle(0xe94560);
    bg.fillRoundedRect(-buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight, 6);

    const text = this.add.text(0, 0, 'FLIP', {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'Arial',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.flipButton = this.add.container(x, y, [bg, text]);
    this.flipButton.setSize(buttonWidth, buttonHeight);
    this.flipButton.setInteractive({ useHandCursor: true });

    this.flipButton.on('pointerdown', () => {
      if (this.flipButtonEnabled && !this.gameOver && this.onFlip) {
        this.onFlip();
      }
    });

    this.flipButton.on('pointerover', () => {
      if (this.flipButtonEnabled) {
        bg.clear();
        bg.fillStyle(0xff6b8a);
        bg.fillRoundedRect(-buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight, 6);
      }
    });

    this.flipButton.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(this.flipButtonEnabled ? 0xe94560 : 0x555555);
      bg.fillRoundedRect(-buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight, 6);
    });
  }

  public setFlipEnabled(enabled: boolean): void {
    this.flipButtonEnabled = enabled;
    const bg = this.flipButton.getAt(0) as Phaser.GameObjects.Graphics;
    bg.clear();
    bg.fillStyle(enabled ? 0xe94560 : 0x555555);
    bg.fillRoundedRect(-50, -18, 100, 36, 6);

    this.flipButton.setAlpha(enabled ? 1 : 0.5);
  }

  public setSymbol(symbol: 'P1' | 'P2'): void {
    this.mySymbol = symbol;
  }

  private getCardKey(card: Card): string {
    const suitMap: { [key: string]: string } = {
      hearts: 'Hearts',
      diamonds: 'Diamonds',
      clubs: 'Clubs',
      spades: 'Spades'
    };
    const valueMap: { [key: number]: string } = {
      11: 'J',
      12: 'Q',
      13: 'K',
      14: 'A'
    };
    const suitName = suitMap[card.suit];
    const valueName = valueMap[card.value] || card.value.toString();
    return `card${suitName}${valueName}`;
  }

  public updateState(state: WarState): void {
    // Update card counts
    this.myCardCountText.setText(state.myCardCount.toString());
    this.opponentCardCountText.setText(state.opponentCardCount.toString());

    // Update deck visibility based on card count
    if (this.myDeckSprite) {
      this.myDeckSprite.setAlpha(state.myCardCount > 0 ? 1 : 0.3);
    }
    if (this.opponentDeckSprite) {
      this.opponentDeckSprite.setAlpha(state.opponentCardCount > 0 ? 1 : 0.3);
    }

    // Update flip button state
    const canFlip = !state.iHaveFlipped && !state.gameOver;
    this.setFlipEnabled(canFlip);

    // Update status text
    if (state.gameOver) {
      this.gameOver = true;
    } else if (state.iHaveFlipped && !state.opponentHasFlipped) {
      this.statusText.setText('Waiting for opponent...');
    } else if (!state.iHaveFlipped) {
      this.statusText.setText('Click FLIP to play!');
    }

    // Show/hide war text
    if (!state.inWar) {
      this.warText.setVisible(false);
    }
  }

  public showFlippedCards(myCard: Card | null, opponentCard: Card | null): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const cardGap = 8;
    const borderWidth = 3;

    // Clear previous flipped cards and borders
    if (this.myFlippedCard) {
      this.myFlippedCard.destroy();
      this.myFlippedCard = null;
    }
    if (this.opponentFlippedCard) {
      this.opponentFlippedCard.destroy();
      this.opponentFlippedCard = null;
    }
    if (this.myCardBorder) {
      this.myCardBorder.destroy();
      this.myCardBorder = null;
    }
    if (this.opponentCardBorder) {
      this.opponentCardBorder.destroy();
      this.opponentCardBorder = null;
    }

    // Cards side by side: [Opponent Card] [My Card]
    const leftCardX = centerX - this.cardWidth / 2 - cardGap;
    const rightCardX = centerX + this.cardWidth / 2 + cardGap;

    // Show opponent's flipped card (left) with red border
    if (opponentCard) {
      // Draw red border first (behind card)
      this.opponentCardBorder = this.add.graphics();
      this.opponentCardBorder.lineStyle(borderWidth, 0xe94560);
      this.opponentCardBorder.strokeRoundedRect(
        leftCardX - this.cardWidth / 2 - borderWidth / 2,
        centerY - this.cardHeight / 2 - borderWidth / 2,
        this.cardWidth + borderWidth,
        this.cardHeight + borderWidth,
        4
      );

      const opponentCardKey = this.getCardKey(opponentCard);
      this.opponentFlippedCard = this.add.sprite(leftCardX, centerY, opponentCardKey);
      this.opponentFlippedCard.setDisplaySize(this.cardWidth, this.cardHeight);

      this.tweens.add({
        targets: this.opponentFlippedCard,
        scaleX: { from: 0, to: this.cardWidth / (this.opponentFlippedCard.width || 1) },
        duration: 200,
        ease: 'Back.easeOut'
      });
    }

    // Show my flipped card (right) with blue border
    if (myCard) {
      // Draw blue border first (behind card)
      this.myCardBorder = this.add.graphics();
      this.myCardBorder.lineStyle(borderWidth, 0x4a90d9);
      this.myCardBorder.strokeRoundedRect(
        rightCardX - this.cardWidth / 2 - borderWidth / 2,
        centerY - this.cardHeight / 2 - borderWidth / 2,
        this.cardWidth + borderWidth,
        this.cardHeight + borderWidth,
        4
      );

      const myCardKey = this.getCardKey(myCard);
      this.myFlippedCard = this.add.sprite(rightCardX, centerY, myCardKey);
      this.myFlippedCard.setDisplaySize(this.cardWidth, this.cardHeight);

      this.tweens.add({
        targets: this.myFlippedCard,
        scaleX: { from: 0, to: this.cardWidth / (this.myFlippedCard.width || 1) },
        duration: 200,
        ease: 'Back.easeOut'
      });
    }
  }

  public showWarCards(count: number): void {
    if (!this.warCardsContainer) return;

    this.warCardsContainer.removeAll(true);

    const smallCardW = this.cardWidth * 0.85;
    const smallCardH = this.cardHeight * 0.85;

    // Position war cards to the far left and right of flipped cards
    // Flipped cards are at ~±48 from center, so war cards need to be outside that
    const leftStackX = -150;  // Far left for opponent
    const rightStackX = 150;  // Far right for player

    for (let i = 0; i < count; i++) {
      // Opponent's war cards (far left, stacked going left)
      const oppWarCard = this.add.sprite(leftStackX - i * 8, i * 5, 'cardBack_red');
      oppWarCard.setDisplaySize(smallCardW, smallCardH);
      oppWarCard.setAngle(-3 + Math.random() * 6);
      this.warCardsContainer.add(oppWarCard);

      // My war cards (far right, stacked going right)
      const myWarCard = this.add.sprite(rightStackX + i * 8, i * 5, 'cardBack_blue');
      myWarCard.setDisplaySize(smallCardW, smallCardH);
      myWarCard.setAngle(-3 + Math.random() * 6);
      this.warCardsContainer.add(myWarCard);
    }

    this.warText.setVisible(true);
    this.warText.setScale(1);
    this.tweens.add({
      targets: this.warText,
      scale: { from: 0.5, to: 1.1 },
      duration: 400,
      yoyo: true,
      ease: 'Bounce.easeOut'
    });
  }

  public showWarDecidingCards(myCard: Card, opponentCard: Card): void {
    if (!this.warCardsContainer) return;

    const smallCardW = this.cardWidth * 0.9;  // Slightly larger than the face-down cards
    const smallCardH = this.cardHeight * 0.9;
    const borderWidth = 2;

    // Match positions from showWarCards - deciding cards on top of each stack
    const leftStackX = -150;   // Same as showWarCards
    const rightStackX = 150;   // Same as showWarCards

    // Position on top of the stacks (last card at i=2 is at ±16 offset, y=10)
    const oppX = leftStackX - 16;  // On top of opponent stack
    const myX = rightStackX + 16;  // On top of player stack
    const topY = 15;               // Slightly below last stacked card

    // Opponent's deciding card (left) with red border
    const oppBorder = this.add.graphics();
    oppBorder.lineStyle(borderWidth, 0xe94560);
    oppBorder.strokeRoundedRect(
      oppX - smallCardW / 2 - borderWidth / 2,
      topY - smallCardH / 2 - borderWidth / 2,
      smallCardW + borderWidth,
      smallCardH + borderWidth,
      3
    );
    this.warCardsContainer.add(oppBorder);

    const oppCardKey = this.getCardKey(opponentCard);
    const oppDecidingCard = this.add.sprite(oppX, topY, oppCardKey);
    oppDecidingCard.setDisplaySize(smallCardW, smallCardH);
    this.warCardsContainer.add(oppDecidingCard);

    // Player's deciding card (right) with blue border
    const myBorder = this.add.graphics();
    myBorder.lineStyle(borderWidth, 0x4a90d9);
    myBorder.strokeRoundedRect(
      myX - smallCardW / 2 - borderWidth / 2,
      topY - smallCardH / 2 - borderWidth / 2,
      smallCardW + borderWidth,
      smallCardH + borderWidth,
      3
    );
    this.warCardsContainer.add(myBorder);

    const myCardKey = this.getCardKey(myCard);
    const myDecidingCard = this.add.sprite(myX, topY, myCardKey);
    myDecidingCard.setDisplaySize(smallCardW, smallCardH);
    this.warCardsContainer.add(myDecidingCard);

    // Animate the cards flipping in
    this.tweens.add({
      targets: [oppDecidingCard, myDecidingCard],
      scaleX: { from: 0, to: smallCardW / (oppDecidingCard.width || 1) },
      duration: 200,
      ease: 'Back.easeOut'
    });
  }

  public clearWarCards(): void {
    if (this.warCardsContainer) {
      this.warCardsContainer.removeAll(true);
    }
    this.warText.setVisible(false);
  }

  public showRoundResult(winnerSymbol: string, isMe: boolean): void {
    const resultText = isMe ? 'You win!' : 'Opponent wins!';
    this.statusText.setText(resultText);
    this.statusText.setColor(isMe ? '#00ff00' : '#e94560');

    const height = this.cameras.main.height;
    const centerX = this.cameras.main.width / 2;
    const targetY = isMe ? height - 120 : 120;

    if (this.myFlippedCard) {
      this.tweens.add({
        targets: this.myFlippedCard,
        x: centerX,
        y: targetY,
        alpha: 0,
        scale: 0.3,
        duration: 400,
        delay: 500,
        ease: 'Power2'
      });
    }
    if (this.opponentFlippedCard) {
      this.tweens.add({
        targets: this.opponentFlippedCard,
        x: centerX,
        y: targetY,
        alpha: 0,
        scale: 0.3,
        duration: 400,
        delay: 500,
        ease: 'Power2'
      });
    }

    // Fade out borders
    if (this.myCardBorder) {
      this.tweens.add({
        targets: this.myCardBorder,
        alpha: 0,
        duration: 400,
        delay: 500,
        ease: 'Power2'
      });
    }
    if (this.opponentCardBorder) {
      this.tweens.add({
        targets: this.opponentCardBorder,
        alpha: 0,
        duration: 400,
        delay: 500,
        ease: 'Power2'
      });
    }

    // Hide war text immediately
    this.warText.setVisible(false);

    this.time.delayedCall(1100, () => {
      this.clearCenter();
      this.statusText.setColor('#ffffff');
    });
  }

  public clearCenter(): void {
    if (this.myFlippedCard) {
      this.myFlippedCard.destroy();
      this.myFlippedCard = null;
    }
    if (this.opponentFlippedCard) {
      this.opponentFlippedCard.destroy();
      this.opponentFlippedCard = null;
    }
    if (this.myCardBorder) {
      this.myCardBorder.destroy();
      this.myCardBorder = null;
    }
    if (this.opponentCardBorder) {
      this.opponentCardBorder.destroy();
      this.opponentCardBorder = null;
    }
    if (this.warCardsContainer) {
      this.warCardsContainer.removeAll(true);
      this.warCardsContainer.setAlpha(1);
      this.warCardsContainer.setY(this.cameras.main.height / 2);
    }
    this.warText.setVisible(false);
  }

  public showGameOver(winner: string | null, myId: string, myCount: number, oppCount: number): void {
    this.gameOver = true;
    this.setFlipEnabled(false);

    let message: string;
    let color: string;

    if (winner === myId) {
      message = 'YOU WIN!';
      color = '#00ff00';
    } else if (winner === null) {
      message = "IT'S A TIE!";
      color = '#ffff00';
    } else {
      message = 'YOU LOSE!';
      color = '#e94560';
    }

    this.statusText.setText(message);
    this.statusText.setColor(color);
    this.statusText.setFontSize(28);

    const width = this.cameras.main.width;
    const centerY = this.cameras.main.height / 2;

    this.add.text(width / 2, centerY, `Final: ${myCount} - ${oppCount}`, {
      fontSize: '18px',
      color: '#aaaaaa',
      fontFamily: 'Arial'
    }).setOrigin(0.5).setName('finalScore');
  }

  public resetGame(): void {
    this.gameOver = false;
    this.clearCenter();
    this.statusText.setText('Click FLIP to play!');
    this.statusText.setColor('#ffffff');
    this.statusText.setFontSize(20);
    this.setFlipEnabled(true);

    if (this.myDeckSprite) this.myDeckSprite.setAlpha(1);
    if (this.opponentDeckSprite) this.opponentDeckSprite.setAlpha(1);

    const finalScore = this.children.getByName('finalScore');
    if (finalScore) finalScore.destroy();
  }
}
