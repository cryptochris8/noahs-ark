# Noah's Ark Rush - Game Status & Todo List

> Last Updated: December 17, 2025

## Current State: Solid MVP

The core gameplay loop is complete and functional:
- Players can collect animals and have them follow
- Animals can be delivered to the Ark to complete pairs
- Flood rises over time creating urgency
- Swimming/stamina system with drowning mechanics
- Weather system with rain and sky darkening
- Mini-map showing player, animals, and Ark positions
- Match arrows pointing to matching animals when player has 1 following
- Multiple difficulty levels (easy, normal, hard)
- Two maps (mount-ararat, plains-of-shinar)

---

## High Priority - Missing Features from GDD

### 1. Power-ups System - IMPLEMENTED ✅ (Fixed Dec 18, 2025)
- **Status:** Fully implemented and enabled
- **Power-ups available:**
  - Speed Boots - 1.8x movement speed for 15 seconds
  - Animal Magnet - Auto-attracts animals within 15 blocks for 12 seconds
  - Flood Freeze - Stops flood rising for 10 seconds
- **Spawning:** Every 30 seconds, max 5 active in world
- **Bug fixed:** Collider positioning was incorrect, causing pickup issues

### 2. Co-op/Competitive Modes
- **Status:** Not implemented - only solo mode works
- **Design (from GDD Section 3):**
  - Co-op: Players work together, shared animal pool
  - Competitive: Players race to collect pairs, individual scores
- **Work needed:** Player scoring, team logic, multiplayer game state

### 3. Pair Breakdown UI
- **Status:** Config flag exists (`show_pair_breakdown`) but not used
- **Current:** UI shows "Pairs: 3 / 12" (total only)
- **Should show:** Which specific animal types have been saved
- **Config location:** `src/data/game_config.json` line 48

---

## Medium Priority - Placeholder Content

### Sound Effects (All Using Placeholders)

| Sound | Current File | Ideal Replacement |
|-------|--------------|-------------------|
| Victory | `audio/sfx/collect.mp3` | Unique victory fanfare |
| Defeat | `audio/sfx/error.mp3` | Dramatic defeat sound |
| Flood warning | `audio/sfx/error.mp3` | Alarm/siren sound |
| Countdown beeps | `audio/sfx/collect.mp3` | Tick/beep sounds |
| Game start | `audio/sfx/collect.mp3` | Start horn/chime |
| Animal pickup | `audio/sfx/collect.mp3` | Soft animal sound |
| Animal release | `audio/sfx/collect.mp3` | Release sound |
| Pair delivered | `audio/sfx/collect.mp3` | Ark horn (TODO in code) |
| Pair failed | `audio/sfx/error.mp3` | Error buzz |

**TODO in code:** `src/game/entities/ArkGoalZone.ts` line 64 - "Replace with custom ark horn sound"

### File locations for sound changes:
- `src/game/GameManager.ts` lines 104-138 (main game sounds)
- `src/game/entities/ArkGoalZone.ts` lines 58-68 (pair delivery sounds)
- `src/game/managers/WeatherManager.ts` line 165 (rain loop)

---

## Low Priority - Debug/Cleanup

### Debug Commands - HANDLED (Dec 18, 2025)

Debug commands are now behind a `DEBUG_MODE` flag. Set `DEBUG_MODE=true` environment variable to enable them.

| Command | Purpose | Status |
|---------|---------|--------|
| `/spawnanimal` | Debug spawn test animals | Disabled by default |
| `/testflood` | Test flood visual | Disabled by default |
| `/floodheight` | Cycle flood heights | Disabled by default |
| `/testrain` | Test rain effects | Disabled by default |
| `/rocket` | Easter egg (launch player) | Always enabled |

### Unused Configuration Options

| Option | Location | Purpose |
|--------|----------|---------|
| `debug.god_mode` | `game_config.json:51` | Invincibility (not implemented) |
| `debug.show_spawn_markers` | `game_config.json:52` | Visual spawn zone markers |
| `debug.show_flood_debug` | `game_config.json:53` | Flood debug visualization |
| `player.base_move_speed` | `game_config.json:9` | Player speed (uses SDK default) |
| `player.sprint_multiplier` | `game_config.json:10` | Sprint speed (uses SDK default) |

### Console.log Cleanup - DONE (Dec 18, 2025)

- **Map generation files:** ~200+ console.log statements (acceptable for build scripts)
- **Runtime code:** ✅ Cleaned
  - Removed console.log from `src/game/managers/FloodVisual.ts`
  - Removed console.log from `index.ts`

### Duplicate Files

- `generate-mount-ararat.ts` and `generate-mount-ararat.js` are identical
- Can remove the `.js` version

---

## Fixed Bugs

### Animal Spawn Zone Logic - FIXED (Dec 18, 2025)

**File:** `src/game/managers/AnimalManager.ts` line 117

Changed from OR (`||`) to AND (`&&`) for stricter biome/tier matching. Animals now spawn only in zones that match BOTH their biome tags AND preferred tiers.

### Power-Up Collider Bug - FIXED (Dec 18, 2025)

**File:** `src/game/entities/PowerUpEntity.ts`

The `_updateColliderPosition()` method was incorrectly setting the collider's relative position to world coordinates instead of keeping it at (0,0,0) relative to the entity. This caused the pickup collider to be far offset from the visual power-up, making them impossible to collect. Removed the incorrect method call since colliders attached to rigid bodies move automatically.

### Power-Up Spawn Location Bug - FIXED (Dec 18, 2025)

**File:** `src/game/managers/PowerUpManager.ts`

Power-ups were spawning mostly at high elevations (Tier 3 zones near the ark) because the weighting was inverted. Changed from `weight = zone.tier` to `weight = 4 - zone.tier` so power-ups now spawn more frequently in lower tiers where players spend most of their time.

### Animal Spawn Zone Mismatch - FIXED (Dec 18, 2025)

**File:** `src/data/animals.json`

Some animals had biome+tier combinations that didn't exist in the spawn zones, causing them to fall back to random spawns across the entire map:
- **beaver**: forest + tier [1] → Changed to tier [2] (no tier 1 forest zones exist)
- **lizard**: rocky + tier [1, 2] → Changed to tier [3] (only tier 3 has rocky zones)

This was causing animals to spawn in unreachable or unexpected locations.

### Animals Escaping Map Boundaries - FIXED (Dec 18, 2025)

**File:** `src/game/entities/AnimalEntity.ts`

Animals had no boundary enforcement and could wander or flee off the map. Added:
- Map boundary constants (mount-ararat: ±60 X/Z, plains-of-shinar: ±75 X/Z)
- `_clampToBounds()` helper to constrain positions
- Boundary clamping on wander targets and flee targets
- Periodic boundary check in `_onTick()` that teleports escaped animals back to valid positions

---

## Implementation Priority Recommendations

### Quick Wins (< 30 min each)
1. ~~Fix spawn zone logic bug (OR → AND)~~ ✅ DONE
2. ~~Remove or comment out debug commands for production~~ ✅ DONE
3. ~~Clean up console.log statements in runtime code~~ ✅ DONE

### Medium Effort (1-2 hours each)
1. Add unique sound effects (if audio files available)
2. Implement pair breakdown in UI
3. Add Ark horn sound effect

### Larger Features (4+ hours each)
1. ~~Implement power-ups system~~ ✅ DONE (was already implemented, fixed collider bug)
2. Add competitive multiplayer mode
3. Add co-op multiplayer mode

---

## File Reference

### Core Game Files
- `index.ts` - Server entry point, chat commands
- `src/game/GameManager.ts` - Main game orchestration
- `src/game/GameConfig.ts` - Configuration loader

### Entity Files
- `src/game/entities/AnimalEntity.ts` - Animal behavior
- `src/game/entities/ArkGoalZone.ts` - Delivery zone
- `src/game/entities/GamePlayerEntity.ts` - Player entity

### Manager Files
- `src/game/managers/AnimalManager.ts` - Animal spawning/tracking
- `src/game/managers/FloodManager.ts` - Flood/swimming system
- `src/game/managers/FloodVisual.ts` - Water visual effect
- `src/game/managers/WeatherManager.ts` - Rain/sky effects

### Configuration Files
- `src/data/game_config.json` - Main game settings
- `src/data/animals.json` - Animal type definitions
- `src/data/waves.json` - Difficulty settings
- `assets/mount-ararat-spawn-zones.json` - Spawn locations
- `assets/plains-of-shinar-spawn-zones.json` - Spawn locations

### UI Files
- `assets/ui/index.html` - All UI (HUD, mini-map, notifications)

---

## Notes

- The game uses the Hytopia SDK and follows their entity/manager patterns
- Maps are procedurally generated using scripts in project root
- Custom skybox (stormy) generated from partly-cloudy base
- Rain particle texture generated programmatically
