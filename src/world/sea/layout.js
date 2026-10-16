// Data for other modules (people, minimap): where the sand, the water and the pier deck are.
// sandY(x, z): sand or seabed height for z past the promenade (straight slope from CITY.beach.z0 at
// y 0 to the waterline CITY.shoreZ at the water level, then the seabed with two sandbars).
// deckY(x, z): pier deck height (ramps up from the plaza to PIER.deckY), or null off the pier.
// PIER: x, z0 (plaza edge), z1 (walkway end), width (walkway), deckY, rampZ, head {x0,x1,z0,z1} (x relative to PIER.x).
import { COAST, PIER, deckHeight, seabedY } from "./coast.js";

const SEA = { waterY: COAST.waterY, shoreZ: COAST.shoreZ, sandZ: COAST.sandZ, pier: PIER };

export { PIER, SEA, deckHeight as deckY, seabedY as sandY };
