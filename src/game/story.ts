// ── ICEBOUND Phase 5.1: chapter structure + radio transmissions ────────────
// The chapter list is presentation metadata over the EXISTING quest ids, so a
// save written before this phase keeps every completed objective.

export type ChapterId = 1 | 2 | 3 | 4 | 5 | 6;

export interface ChapterDef {
  id: ChapterId;
  title: string;
  subtitle: string;
  /** One-line framing shown in the Expedition Log. */
  premise: string;
}

export const CHAPTERS: Record<ChapterId, ChapterDef> = {
  1: {
    id: 1, title: "The Last Survivor", subtitle: "Chapter I",
    premise: "You walked away from the crash. Now stay alive long enough to matter.",
  },
  2: {
    id: 2, title: "Signal in the Snow", subtitle: "Chapter II",
    premise: "The outpost is yours. Something out on the floe is still transmitting.",
  },
  3: {
    id: 3, title: "Beneath the Ice", subtitle: "Chapter III",
    premise: "The survey team went under the glacier for a reason. Find out what they cut into.",
  },
  4: {
    id: 4, title: "The Silent Station", subtitle: "Chapter IV",
    premise: "KVESTA-9 still has power in its bones. The lab holds the order that killed it.",
  },
  5: {
    id: 5, title: "The Frost Fortress", subtitle: "Chapter V",
    premise: "They sealed the yard and left the thing inside it walking.",
  },
  6: {
    id: 6, title: "The Last Transmission", subtitle: "Chapter VI",
    premise: "The Core is cold. Someone has to tell the world what happened here.",
  },
};

export const CHAPTER_ORDER: ChapterId[] = [1, 2, 3, 4, 5, 6];

// ── radio transmissions ────────────────────────────────────────────────────
// Recovered fragments from the station's dead comms net. They arrive as story
// milestones are reached, so the mystery resolves through play rather than a
// single exposition dump. Delivery reuses the existing research-log journal.

export interface Transmission {
  id: string;
  /** Story flag or quest id that releases this fragment. */
  afterQuest: string;
  title: string;
  where: string;
  text: string;
}

export const TRANSMISSIONS: Transmission[] = [
  {
    id: "tx_distress", afterQuest: "q_ship",
    title: "Automated Distress — Loop 4", where: "Recovered signal",
    text: "…KVESTA-9 to any station. Reactor yard is cold. Repeat, the yard is COLD and it is still moving. Do not approach from the south gate…",
  },
  {
    id: "tx_survey", afterQuest: "q_cave",
    title: "Survey Channel — Nilsen", where: "Recovered signal",
    text: "Hoffmann, the lattice is not a battery. It is a lung. It breathes when the aurora does. If you scale this to the reactor you are not powering a grid, you are feeding something. I am logging my objection formally.",
  },
  {
    id: "tx_evac", afterQuest: "q_lab",
    title: "Evacuation Net — final minutes", where: "Recovered signal",
    text: "Mess hall is gone. Bergmann took nine people to the helipad and the rotors were already iced. Hoffmann sealed the yard from inside. He said the frame would hold it. He said that twice.",
  },
  {
    id: "tx_frame", afterQuest: "q_boss",
    title: "Containment Yard — Hoffmann", where: "Recovered signal",
    text: "It is wearing the frame. Whatever the lattice woke, it put on our machine like a coat. We are freezing the yard with everything we have. If you are hearing this, the sigils are in the lab and the cache. Kill the core. The armour is just armour.",
  },
];

/** Journal-shaped view of a transmission, so one reader renders both kinds. */
export const transmissionEntries = () =>
  Object.fromEntries(TRANSMISSIONS.map(t => [t.id, { title: t.title, where: t.where, text: t.text }]));

export const isTransmission = (id: string) => TRANSMISSIONS.some(t => t.id === id);

/** Transmissions released by the quests the player has already completed. */
export function availableTransmissions(questsDone: string[]): Transmission[] {
  return TRANSMISSIONS.filter(t => questsDone.includes(t.afterQuest));
}
