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

import worldMap from './assets/map.json';
import GameManager from './src/game/GameManager';
import GamePlayerEntity from './src/game/entities/GamePlayerEntity';

/**
 * Start the game server
 */
startServer(world => {
  // Load the world map
  world.loadMap(worldMap);

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

  // Set difficulty
  world.chatManager.registerCommand('/easy', player => {
    world.chatManager.sendPlayerMessage(player, 'Difficulty commands coming soon!', 'AAAAAA');
  });

  world.chatManager.registerCommand('/normal', player => {
    world.chatManager.sendPlayerMessage(player, 'Difficulty commands coming soon!', 'AAAAAA');
  });

  world.chatManager.registerCommand('/hard', player => {
    world.chatManager.sendPlayerMessage(player, 'Difficulty commands coming soon!', 'AAAAAA');
  });

  // Debug: Spawn test animal
  world.chatManager.registerCommand('/spawnanimal', player => {
    const animalManager = GameManager.instance.animalManager;
    if (animalManager) {
      world.chatManager.sendPlayerMessage(player, 'Spawning test animals...', '00FF00');
      animalManager.spawnInitialAnimals();
    }
  });

  // Fun easter egg from original boilerplate
  world.chatManager.registerCommand('/rocket', player => {
    world.entityManager.getPlayerEntitiesByPlayer(player).forEach(entity => {
      entity.applyImpulse({ x: 0, y: 20, z: 0 });
    });
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
    world.chatManager.sendPlayerMessage(player, 'Commands: /restart, /help, /testflood, /floodheight', 'AAAAAA');
  });
});
