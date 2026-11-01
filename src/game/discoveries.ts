// ── ICEBOUND Phase 4.1: exploration discoveries ────────────────────────────
// Hand-placed points of interest. Each one is found by physically walking to
// it, gives a one-time reward, and is permanently recorded on the map.

import type { Discovery, DiscoveryKind, ItemId, RegionId } from "./types";

interface DiscoveryDef {
  id: string;
  name: string;
  kind: DiscoveryKind;
  x: number;
  y: number;
  note: string;
  loot?: { item: ItemId; n: number }[];
}

/** Hand-authored, collision-safe positions clear of structures and dens. */
const DATA: Record<RegionId, DiscoveryDef[]> = {
  forest: [
    {
      id: "d_trapper", name: "Trapper's Cache", kind: "cache", x: -1020, y: 430,
      note: "A fur trapper's stash, lashed under a deadfall. Whoever left it never came back for it.",
      loot: [{ item: "pelt", n: 2 }, { item: "bearhide", n: 1 }, { item: "berry", n: 3 }, { item: "salve", n: 1 }],
    },
    {
      id: "d_mast", name: "Weather Mast 3", kind: "equipment", x: 900, y: -540,
      note: "A toppled weather mast. The anemometer froze mid-reading: wind at 140 km/h, the night the station died.",
      loot: [{ item: "scrap", n: 3 }, { item: "wood", n: 2 }],
    },
    {
      id: "d_ranger", name: "Collapsed Ranger Hut", kind: "shelter", x: -1260, y: -320,
      note: "A patrol hut crushed by snow load. A boot print leads north and simply stops.",
      loot: [{ item: "wood", n: 4 }, { item: "frostleaf", n: 2 }, { item: "cookedmeat", n: 1 }],
    },
    {
      id: "d_warren", name: "Hare Warren", kind: "landmark", x: 560, y: 900,
      note: "Packed runs in the snow where arctic hares shelter. Reliable hunting ground.",
      loot: [{ item: "rawmeat", n: 2 }, { item: "berry", n: 2 }],
    },
    {
      id: "d_icefall", name: "Meltwater Seep", kind: "vein", x: -620, y: -780,
      note: "A spring that refreezes nightly, leaving unusually clean ice slabs along the bank.",
      loot: [{ item: "ice", n: 4 }],
    },
  ],
  ship: [
    {
      id: "d_davit", name: "Lifeboat Davit", kind: "equipment", x: -430, y: 650,
      note: "The davit swung out and empty. The lifeboat was launched — into solid pack ice.",
      loot: [{ item: "scrap", n: 3 }, { item: "pelt", n: 1 }],
    },
    {
      id: "d_navlocker", name: "Navigator's Locker", kind: "notes", x: 770, y: -610,
      note: "Charts annotated in grease pencil: a route change ordered three days before the freeze, to a bearing with nothing on it.",
      loot: [{ item: "scrap", n: 2 }, { item: "medkit", n: 1 }],
    },
    {
      id: "d_container", name: "Crushed Container", kind: "cache", x: 150, y: 760,
      note: "A shipping container folded like paper by the ice. Research crates spilled across the floe.",
      loot: [{ item: "scrap", n: 4 }, { item: "frostleaf", n: 2 }],
    },
  ],
  cave: [
    {
      id: "d_hollow", name: "Glowcap Hollow", kind: "vein", x: -770, y: 430,
      note: "A warm pocket where glowcaps grow thick enough to read by.",
      loot: [{ item: "glowcap", n: 3 }, { item: "chitin", n: 1 }],
    },
    {
      id: "d_surveycamp", name: "Survey Camp Remains", kind: "notes", x: 820, y: -600,
      note: "Three bedrolls, two packs. Someone scratched a tally into the wall and stopped at eleven days.",
      loot: [{ item: "crystal", n: 1 }, { item: "medkit", n: 1 }, { item: "glowcap", n: 2 }],
    },
    {
      id: "d_deepvein", name: "Deep Vein Pocket", kind: "vein", x: -250, y: -690,
      note: "An untouched lattice seam. It hums faintly when you come close, and goes quiet when you step back.",
      loot: [{ item: "crystal", n: 2 }],
    },
  ],
  station: [
    {
      id: "d_balloon", name: "Weather Balloon Wreck", kind: "equipment", x: -890, y: -630,
      note: "A sounding balloon still tangled in its payload. The telemetry tape stops at the same hour as everything else.",
      loot: [{ item: "scrap", n: 3 }, { item: "frostleaf", n: 2 }],
    },
    {
      id: "d_medannex", name: "Medical Annex", kind: "cache", x: 570, y: -670,
      note: "A triage room, beds made, cabinets emptied in a hurry. They expected casualties they never treated.",
      loot: [{ item: "medkit", n: 2 }, { item: "frostleaf", n: 3 }],
    },
    {
      id: "d_relay", name: "Comms Relay", kind: "beacon", x: 980, y: 250,
      note: "The relay's last outgoing message is still queued, unsent: 'DO NOT SEND A RELIEF TEAM.'",
      loot: [{ item: "scrap", n: 4 }, { item: "crystal", n: 1 }],
    },
  ],
  fortress: [
    {
      id: "d_siege", name: "Siege Cache", kind: "cache", x: -900, y: 700,
      note: "A containment team's last supply drop, never opened. They were building to hold, not to leave.",
      loot: [{ item: "medkit", n: 1 }, { item: "crystal", n: 2 }, { item: "chitin", n: 1 }, { item: "bearhide", n: 1 }],
    },
    {
      id: "d_sentinel", name: "Frozen Sentinel", kind: "landmark", x: 880, y: -290,
      note: "A second Guardian frame, iced solid and inert. The lattice in its chest is dark. Only one of them woke.",
      loot: [{ item: "crystal", n: 3 }, { item: "scrap", n: 2 }],
    },
  ],
};

/** Distance at which a discovery is registered. */
export const DISCOVERY_RADIUS = 95;
/** Distance at which an undiscovered site starts to shimmer as a hint. */
export const DISCOVERY_HINT_RADIUS = 300;

export function buildDiscoveries(region: RegionId): Discovery[] {
  return (DATA[region] ?? []).map(d => ({
    id: d.id,
    region,
    kind: d.kind,
    x: d.x,
    y: d.y,
    name: d.name,
    note: d.note,
    loot: d.loot ?? [],
    found: false,
  }));
}

export const totalDiscoveries = (region: RegionId) => (DATA[region] ?? []).length;

export const ALL_DISCOVERY_COUNT = Object.values(DATA).reduce((n, list) => n + list.length, 0);

export const DISCOVERY_ICON: Record<DiscoveryKind, string> = {
  cache: "crate",
  equipment: "scrap",
  beacon: "bolt",
  shelter: "shelter",
  landmark: "compass",
  notes: "journal",
  vein: "crystal",
};
