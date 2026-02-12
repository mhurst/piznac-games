import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { MpGameSelectComponent } from './multiplayer/mp-game-select/mp-game-select.component';
import { LobbyComponent } from './multiplayer/lobby/lobby.component';
import { TicTacToeComponent } from './multiplayer/games/tic-tac-toe/tic-tac-toe.component';
import { ConnectFourComponent } from './multiplayer/games/connect-four/connect-four.component';
import { BattleshipComponent } from './multiplayer/games/battleship/battleship.component';
import { SpGameSelectComponent } from './singleplayer/sp-game-select/sp-game-select.component';
import { SpTicTacToeComponent } from './singleplayer/games/tic-tac-toe/sp-tic-tac-toe.component';
import { SpConnectFourComponent } from './singleplayer/games/connect-four/sp-connect-four.component';
import { SpBattleshipComponent } from './singleplayer/games/battleship/sp-battleship.component';
import { CheckersComponent } from './multiplayer/games/checkers/checkers.component';
import { SpCheckersComponent } from './singleplayer/games/checkers/sp-checkers.component';
import { WarComponent } from './multiplayer/games/war/war.component';
import { SpWarComponent } from './singleplayer/games/war/sp-war.component';
import { SpSolitaireComponent } from './singleplayer/games/solitaire/sp-solitaire.component';
import { SpYahtzeeComponent } from './singleplayer/games/yahtzee/sp-yahtzee.component';
import { SpFarkleComponent } from './singleplayer/games/farkle/sp-farkle.component';
import { FarkleComponent } from './multiplayer/games/farkle/farkle.component';
import { SpBlackjackComponent } from './singleplayer/games/blackjack/sp-blackjack.component';
import { BlackjackMpComponent } from './multiplayer/games/blackjack/blackjack.component';
import { SpMancalaComponent } from './singleplayer/games/mancala/sp-mancala.component';
import { MancalaMpComponent } from './multiplayer/games/mancala/mancala.component';
import { YahtzeeMpComponent } from './multiplayer/games/yahtzee/yahtzee.component';
import { SpDartsComponent } from './singleplayer/games/darts/sp-darts.component';
import { SpPokerComponent } from './singleplayer/games/poker/sp-poker.component';
import { PokerMpComponent } from './multiplayer/games/poker/poker.component';
import { SpGoFishComponent } from './singleplayer/games/go-fish/sp-go-fish.component';
import { GoFishMpComponent } from './multiplayer/games/go-fish/go-fish.component';

export const routes: Routes = [
  // Home with tabs
  { path: '', component: HomeComponent },

  // Multiplayer routes
  { path: 'multiplayer', component: MpGameSelectComponent },
  { path: 'multiplayer/lobby/:gameType', component: LobbyComponent },
  { path: 'multiplayer/game/tic-tac-toe/:roomId', component: TicTacToeComponent },
  { path: 'multiplayer/game/connect-four/:roomId', component: ConnectFourComponent },
  { path: 'multiplayer/game/battleship/:roomId', component: BattleshipComponent },
  { path: 'multiplayer/game/checkers/:roomId', component: CheckersComponent },
  { path: 'multiplayer/game/war/:roomId', component: WarComponent },
  { path: 'multiplayer/game/farkle/:roomId', component: FarkleComponent },
  { path: 'multiplayer/game/blackjack/:roomId', component: BlackjackMpComponent },
  { path: 'multiplayer/game/mancala/:roomId', component: MancalaMpComponent },
  { path: 'multiplayer/game/yahtzee/:roomId', component: YahtzeeMpComponent },
  { path: 'multiplayer/game/poker/:roomId', component: PokerMpComponent },
  { path: 'multiplayer/game/go-fish/:roomId', component: GoFishMpComponent },

  // Single player routes
  { path: 'singleplayer', component: SpGameSelectComponent },
  { path: 'singleplayer/game/tic-tac-toe', component: SpTicTacToeComponent },
  { path: 'singleplayer/game/connect-four', component: SpConnectFourComponent },
  { path: 'singleplayer/game/battleship', component: SpBattleshipComponent },
  { path: 'singleplayer/game/checkers', component: SpCheckersComponent },
  { path: 'singleplayer/game/war', component: SpWarComponent },
  { path: 'singleplayer/game/solitaire', component: SpSolitaireComponent },
  { path: 'singleplayer/game/yahtzee', component: SpYahtzeeComponent },
  { path: 'singleplayer/game/farkle', component: SpFarkleComponent },
  { path: 'singleplayer/game/blackjack', component: SpBlackjackComponent },
  { path: 'singleplayer/game/mancala', component: SpMancalaComponent },
  { path: 'singleplayer/game/darts', component: SpDartsComponent },
  { path: 'singleplayer/game/poker', component: SpPokerComponent },
  { path: 'singleplayer/game/go-fish', component: SpGoFishComponent },

  // Catch-all redirect
  { path: '**', redirectTo: '' }
];
