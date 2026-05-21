import { Game } from './game/Game.js';
import { EngineAudio } from './game/EngineAudio.js';
import { loadF1Model } from './game/CarModelLoader.js';
import { Lobby } from './lobby/Lobby.js';

const canvas = document.getElementById('game-canvas');
const hud = document.getElementById('hud');
const lobbyStatus = document.getElementById('lobby-status');

lobbyStatus.textContent = 'Loading F1 models…';

const engineAudio = new EngineAudio();

loadF1Model()
  .then(() => {
    lobbyStatus.textContent = '';
    const game = new Game(canvas, { preview: true, engineAudio });
    const lobby = new Lobby({
      engineAudio,
      onStart: (config) => {
        hud.classList.remove('hidden');
        game.startSession(config);
      },
    });
    lobby.show();
  })
  .catch((err) => {
    lobbyStatus.textContent = 'Failed to load car models. Refresh to retry.';
    lobbyStatus.classList.add('error');
    console.error(err);
  });
