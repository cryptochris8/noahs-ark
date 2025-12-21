/**
 * Noah's Ark Rush - A Hytopia Mini-Game
 *
 * Race against a rising flood to collect pairs of animals
 * and bring them to the safety of Noah's Ark!
 *
 * Based on the design documents in docs/GDD_Noahs_Ark_Hytopia.md
 */

import {
  startServer,
  Audio,
  PlayerEvent,
} from 'hytopia';

// Map selection via environment variable (default: mount-ararat)
// Available maps: 'plains-of-shinar', 'mount-ararat'
const MAP_NAME = process.env.MAP_NAME || 'mount-ararat';

// Debug mode - set to true to enable debug commands (/spawnanimal, /testflood, /floodheight, /testrain)
const DEBUG_MODE = process.env.DEBUG_MODE === 'true';

// Dynamic map loading
function loadMap(mapName: string) {
  switch (mapName) {
    case 'mount-ararat':
      return require('./assets/mount-ararat.json');
    case 'plains-of-shinar':
      return require('./assets/plains-of-shinar.json');
    default:
      return require('./assets/map.json');
  }
}

const worldMap = loadMap(MAP_NAME);

import GameManager from './src/game/GameManager';
import GamePlayerEntity from './src/game/entities/GamePlayerEntity';

/**
 * Start the game server
 */
startServer(world => {
  // Load the world map
  world.loadMap(worldMap);

  // Set the stormy skybox for the flood atmosphere
  world.setSkyboxUri('skyboxes/stormy');

  // Initialize the game manager
  GameManager.instance.setup(world, 'normal');

  /**
   * Handle player joining the game
   */
  world.on(PlayerEvent.JOINED_WORLD, ({ player }) => {
    // Create the player entity
    const spawnPosition = GameManager.instance.getPlayerSpawnPosition();
    const playerEntity = new GamePlayerEntity(player);
    playerEntity.spawn(world, spawnPosition);

    // Make player face the ark (north) instead of the flood
    // Small delay to ensure camera is attached to entity
    setTimeout(() => {
      player.camera.lookAtPosition({ x: 0, y: 34, z: 50 }); // Look toward ark
    }, 100);

    // Notify the game manager
    GameManager.instance.onPlayerJoin(player, playerEntity);
  });

  /**
   * Handle player leaving the game
   */
  world.on(PlayerEvent.LEFT_WORLD, ({ player }) => {
    // Notify the game manager
    GameManager.instance.onPlayerLeave(player);

    // Despawn all player entities for this player
    world.entityManager.getPlayerEntitiesByPlayer(player).forEach(entity => {
      entity.despawn();
    });
  });

  /**
   * Register chat commands
   */

  // Restart the game
  world.chatManager.registerCommand('/restart', player => {
    GameManager.instance.reset();
    GameManager.instance.startCountdown();
    world.chatManager.sendBroadcastMessage('Game restarting...', 'FFFF00');
  });

  // Set difficulty commands
  world.chatManager.registerCommand('/easy', player => {
    GameManager.instance.setDifficulty('easy');
    world.chatManager.sendBroadcastMessage('Difficulty set to EASY (10 pairs, slow flood)', '00FF00');
    world.chatManager.sendBroadcastMessage('Type /restart to begin!', 'FFFF00');
  });

  world.chatManager.registerCommand('/normal', player => {
    GameManager.instance.setDifficulty('normal');
    world.chatManager.sendBroadcastMessage('Difficulty set to NORMAL (23 pairs)', 'FFAA00');
    world.chatManager.sendBroadcastMessage('Type /restart to begin!', 'FFFF00');
  });

  world.chatManager.registerCommand('/hard', player => {
    GameManager.instance.setDifficulty('hard');
    world.chatManager.sendBroadcastMessage('Difficulty set to HARD (23 pairs, fast flood)', 'FF5500');
    world.chatManager.sendBroadcastMessage('Type /restart to begin!', 'FFFF00');
  });

  // Fun easter egg from original boilerplate
  world.chatManager.registerCommand('/rocket', player => {
    world.entityManager.getPlayerEntitiesByPlayer(player).forEach(entity => {
      entity.applyImpulse({ x: 0, y: 20, z: 0 });
    });
  });

  // Debug commands - only registered when DEBUG_MODE=true
  if (DEBUG_MODE) {
    // Debug: Spawn test animal
    world.chatManager.registerCommand('/spawnanimal', player => {
      const animalManager = GameManager.instance.animalManager;
      if (animalManager) {
        world.chatManager.sendPlayerMessage(player, 'Spawning test animals...', '00FF00');
        animalManager.spawnInitialAnimals();
      }
    });

    // Test command: Spawn flood visual to test the water effect
    world.chatManager.registerCommand('/testflood', player => {
      const floodManager = GameManager.instance.floodManager;
      if (!floodManager) {
        world.chatManager.sendPlayerMessage(player, 'FloodManager not initialized!', 'FF0000');
        return;
      }

      const floodVisual = floodManager.floodVisual;
      if (!floodVisual) {
        world.chatManager.sendPlayerMessage(player, 'FloodVisual not initialized!', 'FF0000');
        return;
      }

      if (floodVisual.isSpawned) {
        // Despawn if already visible
        floodVisual.despawn();
        world.chatManager.sendPlayerMessage(player, 'Flood visual DESPAWNED', 'FFAA00');
      } else {
        // Spawn and start test rise
        floodVisual.spawn();
        floodVisual.startTestRise(25); // Rise to Y=25
        world.chatManager.sendPlayerMessage(player, 'Flood visual SPAWNED - rising to Y=25', '00FFFF');
      }
    });

    // Test command: Set flood visual to specific height
    world.chatManager.registerCommand('/floodheight', player => {
      const floodManager = GameManager.instance.floodManager;
      if (!floodManager || !floodManager.floodVisual) {
        world.chatManager.sendPlayerMessage(player, 'FloodVisual not available!', 'FF0000');
        return;
      }

      const floodVisual = floodManager.floodVisual;
      if (!floodVisual.isSpawned) {
        floodVisual.spawn();
      }

      // Cycle through heights: 5 -> 15 -> 25 -> 5
      const currentHeight = floodVisual.height;
      let newHeight = 5;
      if (currentHeight < 10) newHeight = 15;
      else if (currentHeight < 20) newHeight = 25;

      floodVisual.setHeight(newHeight);
      world.chatManager.sendPlayerMessage(player, `Flood height set to Y=${newHeight}`, '00FFFF');
    });

    // Test rain command
    world.chatManager.registerCommand('/testrain', player => {
      const weatherManager = GameManager.instance.weatherManager;
      if (!weatherManager) {
        world.chatManager.sendPlayerMessage(player, 'WeatherManager not initialized!', 'FF0000');
        return;
      }

      if (weatherManager.isActive) {
        weatherManager.stop();
        world.chatManager.sendPlayerMessage(player, 'Rain STOPPED', 'FFAA00');
      } else {
        weatherManager.setFloodProgress(0.5); // Set to 50% for visible rain
        weatherManager.start();
        world.chatManager.sendPlayerMessage(player, 'Rain STARTED at 50% intensity', '00FFFF');
      }
    });

  }

  // Help command
  world.chatManager.registerCommand('/help', player => {
    world.chatManager.sendPlayerMessage(player, '=== Noah\'s Ark Rush ===', 'FFD700');
    world.chatManager.sendPlayerMessage(player, 'Collect pairs of animals and bring them to the Ark!', 'FFFFFF');
    world.chatManager.sendPlayerMessage(player, 'Controls:', 'AAAAAA');
    world.chatManager.sendPlayerMessage(player, '  WASD - Move', 'AAAAAA');
    world.chatManager.sendPlayerMessage(player, '  Space - Jump', 'AAAAAA');
    world.chatManager.sendPlayerMessage(player, '  Shift - Sprint', 'AAAAAA');
    world.chatManager.sendPlayerMessage(player, '  E - Interact with animals', 'AAAAAA');
    world.chatManager.sendPlayerMessage(player, '  F - Deliver animals at the Ark', 'AAAAAA');
    world.chatManager.sendPlayerMessage(player, 'Commands: /restart, /easy, /normal, /hard, /help', 'AAAAAA');
  });
});
