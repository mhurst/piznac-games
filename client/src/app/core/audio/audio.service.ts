import { Injectable } from '@angular/core';
import { Howl } from 'howler';
import { StorageService } from '../storage.service';
import {
  SOUNDS_BASE_PATH,
  UI_SOUNDS,
  GAME_SOUNDS,
  GAME_SPECIFIC_SOUNDS,
  SoundConfig
} from './audio.config';

interface AudioSettings {
  muted: boolean;
  volume: number;  // 0-1 master volume
}

const DEFAULT_SETTINGS: AudioSettings = {
  muted: false,
  volume: 1
};

const STORAGE_KEY = 'audio_settings';

@Injectable({
  providedIn: 'root'
})
export class AudioService {
  private sounds: Map<string, Howl> = new Map();
  private settings: AudioSettings;
  private initialized = false;

  constructor(private storage: StorageService) {
    this.settings = this.storage.get<AudioSettings>(STORAGE_KEY, DEFAULT_SETTINGS);
  }

  /**
   * Initialize and preload all sounds.
   * Call this after user interaction (required by browsers).
   */
  init(): void {
    if (this.initialized) return;

    // Load UI sounds
    this.loadSoundGroup(UI_SOUNDS, 'ui');

    // Load shared game sounds
    this.loadSoundGroup(GAME_SOUNDS, 'game');

    // Load game-specific sounds
    for (const [gameId, sounds] of Object.entries(GAME_SPECIFIC_SOUNDS)) {
      this.loadSoundGroup(sounds, `game:${gameId}`);
    }

    this.initialized = true;
    console.log('AudioService: initialized with', this.sounds.size, 'sounds');
  }

  private loadSoundGroup(sounds: Record<string, SoundConfig>, prefix: string): void {
    for (const [id, config] of Object.entries(sounds)) {
      const key = `${prefix}:${id}`;
      const howl = new Howl({
        src: [`${SOUNDS_BASE_PATH}/${config.src}`],
        volume: (config.volume ?? 1) * this.settings.volume,
        preload: true,
        onloaderror: (_, error) => {
          console.warn(`AudioService: failed to load ${key}`, error);
        }
      });
      this.sounds.set(key, howl);
    }
  }

  // ===== Playback =====

  /**
   * Play a UI sound (click, challenge, etc.)
   */
  playUI(id: string): void {
    this.playSound(`ui:${id}`);
  }

  /**
   * Play a shared game sound (win, lose, your-turn, etc.)
   */
  play(id: string): void {
    this.playSound(`game:${id}`);
  }

  /**
   * Play a game-specific sound
   */
  playGame(gameId: string, soundId: string): void {
    this.playSound(`game:${gameId}:${soundId}`);
  }

  private playSound(key: string): void {
    if (this.settings.muted) return;

    const sound = this.sounds.get(key);
    if (sound) {
      sound.play();
    } else {
      console.warn(`AudioService: sound not found: ${key}`);
    }
  }

  // ===== Settings =====

  get muted(): boolean {
    return this.settings.muted;
  }

  get volume(): number {
    return this.settings.volume;
  }

  toggleMute(): void {
    this.settings.muted = !this.settings.muted;
    this.saveSettings();
  }

  setMuted(muted: boolean): void {
    this.settings.muted = muted;
    this.saveSettings();
  }

  setVolume(volume: number): void {
    this.settings.volume = Math.max(0, Math.min(1, volume));
    this.updateAllVolumes();
    this.saveSettings();
  }

  private updateAllVolumes(): void {
    // Update volume on all loaded sounds
    for (const [key, sound] of this.sounds) {
      // Get original config volume
      const config = this.getConfigForKey(key);
      const baseVolume = config?.volume ?? 1;
      sound.volume(baseVolume * this.settings.volume);
    }
  }

  private getConfigForKey(key: string): SoundConfig | undefined {
    const parts = key.split(':');
    if (parts[0] === 'ui') {
      return UI_SOUNDS[parts[1]];
    } else if (parts[0] === 'game' && parts.length === 2) {
      return GAME_SOUNDS[parts[1]];
    } else if (parts[0] === 'game' && parts.length === 3) {
      return GAME_SPECIFIC_SOUNDS[parts[1]]?.[parts[2]];
    }
    return undefined;
  }

  private saveSettings(): void {
    this.storage.set(STORAGE_KEY, this.settings);
  }

  // ===== Game Sound Registration (for future dynamic games) =====

  /**
   * Register sounds for a new game at runtime.
   * Useful for dynamically loaded games.
   */
  registerGameSounds(gameId: string, sounds: Record<string, SoundConfig>): void {
    for (const [id, config] of Object.entries(sounds)) {
      const key = `game:${gameId}:${id}`;
      if (this.sounds.has(key)) continue;

      const howl = new Howl({
        src: [`${SOUNDS_BASE_PATH}/${config.src}`],
        volume: (config.volume ?? 1) * this.settings.volume,
        preload: true
      });
      this.sounds.set(key, howl);
    }
  }
}
