import {
  Axe, Backpack, Beef, BookOpen, Box, Cherry, CircleDot, Cross, Dog, Droplet, Droplets,
  Drumstick, Flag, Flame, FlaskConical, Gem, Hammer, HardHat, Heart, Home, Key, Lamp,
  Leaf, ListChecks, Map, Moon, Mountain, Move, Package, Pause, Pickaxe, Rocket,
  Save, Settings, Shield, Shirt, Ship, Snowflake, Soup, Sparkles, Squirrel, Sun, Sword,
  Thermometer, Trash2, TreePine, TriangleAlert, Wind, Wrench, Zap, CheckCircle2, X,
  Award, ClipboardList,
  HelpCircle, RotateCcw, LogOut, Play, Castle, Microscope, Crosshair, Compass,
  Users, UserPlus, RadioTower, BedDouble,
  type LucideIcon,
} from "lucide-react";

export const ICONS: Record<string, LucideIcon> = {
  // materials
  wood: TreePine, stone: Mountain, ice: Snowflake, berry: Cherry, herb: Leaf,
  frostleaf: Leaf, scrap: Wrench, crystal: Gem, chitin: Shield, pelt: Squirrel,
  // consumables
  rawmeat: Drumstick, meat: Beef, cookedmeat: Beef, water: Droplets, meltwater: Droplets,
  stew: Soup, fungus: Sparkles, glowcap: Sparkles, salve: Cross, medkit: Cross,
  // key items
  keycard: Key, sigil: CircleDot, core: FlaskConical,
  // gear
  axe: Axe, pick: Pickaxe, spear: Sword, blade: Sword, parka: Shirt, coat: Shirt,
  suit: HardHat, lantern: Lamp, heatcore: Flame, crowbar: Wrench, backpack: Backpack,
  // world / ui
  fire: Flame, warn: TriangleAlert, save: Save, trash: Trash2, bolt: Zap,
  temp: Thermometer, hunger: Drumstick, thirst: Droplet, done: CheckCircle2,
  flag: Flag, wolf: Dog, bear: Dog, crawler: Crosshair, journal: BookOpen, pod: Rocket,
  crate: Package, box: Box, hammer: Hammer, move: Move, shelter: Home, heart: Heart,
  settings: Settings, moon: Moon, sun: Sun, pause: Pause, quests: ListChecks,
  map: Map, ship: Ship, research: Microscope, fortress: Castle, banner: Flag,
  spikes: TriangleAlert, snow: Snowflake, wind: Wind, aurora: Sparkles,
  compass: Compass, x: X, help: HelpCircle, reset: RotateCcw, exit: LogOut, play: Play,
  progress: Award, prep: ClipboardList,
  // settlement (Phase 6.2)
  residents: Users, recruit: UserPlus, beacon: RadioTower, bunks: BedDouble,
};

export function ItemIcon({ icon, className, color }: { icon: string; className?: string; color?: string }) {
  const C = ICONS[icon] ?? Flag;
  return <C className={className ?? "h-4 w-4"} style={color ? { color } : undefined} strokeWidth={2.2} />;
}
