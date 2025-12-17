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

### 1. Power-ups System
- **Status:** Config exists in `game_config.json` but feature is disabled and not implemented
- **Design (from GDD Section 5.4):**
  - Speed Boots - Temporary movement speed boost
  - Animal Magnet - Animals within range automatically follow
  - Flood Freeze - Temporarily stops flood from rising
- **Config location:** `src/data/game_config.json` lines 40-44
- **Work needed:** Create PowerUp entity, spawning logic, UI display, effect implementation

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

### Debug Commands (Consider removing for production)

| Command | Location | Purpose |
|---------|----------|---------|
| `/spawnanimal` | `index.ts:109` | Debug spawn test animals |
| `/testflood` | `index.ts:125` | Test flood visual |
| `/floodheight` | `index.ts:151` | Cycle flood heights |
| `/rocket` | `index.ts:118` | Easter egg (launch player) |

### Unused Configuration Options

| Option | Location | Purpose |
|--------|----------|---------|
| `debug.god_mode` | `game_config.json:51` | Invincibility (not implemented) |
| `debug.show_spawn_markers` | `game_config.json:52` | Visual spawn zone markers |
| `debug.show_flood_debug` | `game_config.json:53` | Flood debug visualization |
| `player.base_move_speed` | `game_config.json:9` | Player speed (uses SDK default) |
| `player.sprint_multiplier` | `game_config.json:10` | Sprint speed (uses SDK default) |

### Console.log Cleanup

- **Map generation files:** ~200+ console.log statements (acceptable for build scripts)
- **Runtime code to clean:**
  - `src/game/managers/FloodVisual.ts` lines 87, 99, 135, 140
  - `index.ts` line 34

### Duplicate Files

- `generate-mount-ararat.ts` and `generate-mount-ararat.js` are identical
- Can remove the `.js` version

---

## Potential Bug

### Animal Spawn Zone Logic

**File:** `src/game/managers/AnimalManager.ts` line 117

```typescript
// Current (uses OR - too permissive)
return hasMatchingTag || isPreferredTier;

// Should be (uses AND - stricter matching)
return hasMatchingTag && isPreferredTier;
```

**Impact:** Animals might spawn in wrong biomes (e.g., grassland animals in rocky tier 3 areas)

---

## Implementation Priority Recommendations

### Quick Wins (< 30 min each)
1. Fix spawn zone logic bug (OR → AND)
2. Remove or comment out debug commands for production
3. Clean up console.log statements in runtime code

### Medium Effort (1-2 hours each)
1. Add unique sound effects (if audio files available)
2. Implement pair breakdown in UI
3. Add Ark horn sound effect

### Larger Features (4+ hours each)
1. Implement power-ups system
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
