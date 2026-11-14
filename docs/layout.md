# Base layout

The numbers live in `src/data/layout.ts` (one source of truth) and are used by the building models, the crew routines and the interaction targets. `npm run validate-layout` checks them and runs as part of `npm run build`.

## Station (radius 7 m), zones around a clear walkway
| Zone | Contains |
|---|---|
| Airlock (front, by the door) | striped floor, suit lockers |
| Control room (back left) | comms desk, space weather console, window |
| Engineering (back right) | engineering console (upgrades), tool rack, spare-parts shelf (one crate per spare part) |
| Life support (left) | oxygen unit with tank rack and gauge, water recovery tank with gauge |
| Galley (front left) | table, food storage lockers with a food gauge |
| Medical and exercise (right) | medical bed and scanner, exercise machine, bunks |

Floor pipes: water (blue) between the life support gear, power (yellow) between the consoles.

## Outside (world coordinates, station at 0,0)
Landing pad (lander), solar field with a cleaning path along its south side, power building (battery with a charge gauge), life support, water tank (with a level gauge), greenhouse, rock-sample area, the radiation shelter in the rocks, two storage containers. Amber path markers lead from the station door to the pad, the shelter and the solar field. Yellow (power) and blue (water) conduits run from the station wall to each machine.

## Rules the validator checks
- Every prop stays inside its building and nothing overlaps.
- The door is never blocked.
- Every spot where a person stands is reachable along a corridor about 1.5 m wide (agent radius 0.75 m).
- Crew relax spots are never inside a prop and are at least 1 m from the player's spots.
- Outdoor objects are at least 1.5 m apart and reachable from the station door.
- Nothing is outside the build radius.
