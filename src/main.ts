import Phaser from 'phaser';
import { io, Socket } from 'socket.io-client';
import './styles.css';

const PRIVACY_MODE_CLASS = 'privacy-mode';

function installPrivacyModeToggle() {
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.code !== 'KeyX' || event.repeat || event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }

      document.documentElement.classList.toggle(PRIVACY_MODE_CLASS);
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    { capture: true },
  );
}

const GAME_WIDTH = 1280;
const GAME_HEIGHT = 720;
const WORLD_WIDTH = 8000;
const WORLD_HEIGHT = 5600;

type TerrainKey = 'plain' | 'desert' | 'forest' | 'swamp' | 'water' | 'road';
interface TerrainRegion {
  key: TerrainKey;
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
  alpha: number;
  speedMod: number;
  label: string;
}
const TERRAIN_SPECS: Record<TerrainKey, { color: number; alpha: number; speedMod: number; label: string }> = {
  plain:   { color: 0x141e24, alpha: 0,    speedMod: 1,    label: '' },
  desert:  { color: 0x8a6630, alpha: 0.58, speedMod: 1,    label: '荒漠' },
  forest:  { color: 0x17683a, alpha: 0.62, speedMod: 0.82, label: '森林' },
  swamp:   { color: 0x43511e, alpha: 0.66, speedMod: 0.6,  label: '沼泽' },
  water:   { color: 0x125da2, alpha: 0.76, speedMod: 0,    label: '水域' },
  road:    { color: 0x555b60, alpha: 0.62, speedMod: 1.18, label: '道路' },
};

const TERRAIN_ACCENT: Record<TerrainKey, { stroke: number; pattern: number; text: string }> = {
  plain: { stroke: 0x27363d, pattern: 0x27363d, text: '#a9c7c1' },
  desert: { stroke: 0xd2a04c, pattern: 0xf0c66f, text: '#ffd98f' },
  forest: { stroke: 0x3ed07a, pattern: 0x8bea82, text: '#9fffc2' },
  swamp: { stroke: 0xa0b35a, pattern: 0xd0d66f, text: '#d6e57d' },
  water: { stroke: 0x61c7ff, pattern: 0xa8e8ff, text: '#9edfff' },
  road: { stroke: 0xd2d6d8, pattern: 0xf1f3f4, text: '#e8f0f2' },
};

const VEHICLE_TERRAIN: Partial<Record<VehicleKey, Partial<Record<TerrainKey, number>>>> = {
  fighter:    { water: 0.9, swamp: 1 },
  hovercraft: { water: 0.85, swamp: 1 },
  motorcycle: { forest: 1, swamp: 0.7 },
  buggy:      { forest: 0.95, swamp: 0.7 },
  tank:       { forest: 0.6, swamp: 0.4 },
  artillery:  { forest: 0.6, swamp: 0.4 },
  railgun:    { forest: 0.65, swamp: 0.45 },
  walker:     { forest: 0.7, swamp: 0.5 },
  laserVan:   { forest: 0.65, swamp: 0.45 },
  flameRig:   { desert: 1.15, forest: 0.55, swamp: 0.4 },
};

const TERRAIN_REGIONS: TerrainRegion[] = [
  // --- Deserts (top-left and top-right near bases) ---
  { key: 'desert', x: 100,  y: 100,  w: 1600, h: 1400, ...TERRAIN_SPECS.desert },
  { key: 'desert', x: 6300, y: 100,  w: 1600, h: 1400, ...TERRAIN_SPECS.desert },
  // --- Forest (bottom-center, near C base) ---
  { key: 'forest', x: 2200, y: 3200, w: 3600, h: 2000, ...TERRAIN_SPECS.forest },
  { key: 'forest', x: 1000, y: 2000, w: 1200, h: 1200, ...TERRAIN_SPECS.forest },
  { key: 'forest', x: 5800, y: 2000, w: 1200, h: 1200, ...TERRAIN_SPECS.forest },
  // --- Swamps (mid-left and mid-right, natural barriers) ---
  { key: 'swamp', x: 1000, y: 1600, w: 1000, h: 800, ...TERRAIN_SPECS.swamp },
  { key: 'swamp', x: 6000, y: 1600, w: 1000, h: 800, ...TERRAIN_SPECS.swamp },
  { key: 'swamp', x: 3200, y: 2400, w: 800, h: 600, ...TERRAIN_SPECS.swamp },
  // --- Water bodies ---
  { key: 'water', x: 3400, y: 1800, w: 1200, h: 500, ...TERRAIN_SPECS.water },
  { key: 'water', x: 200,  y: 3400, w: 800, h: 600, ...TERRAIN_SPECS.water },
  { key: 'water', x: 7000, y: 3400, w: 800, h: 600, ...TERRAIN_SPECS.water },
  { key: 'water', x: 1400, y: 100,  w: 500, h: 400, ...TERRAIN_SPECS.water },
  { key: 'water', x: 6100, y: 100,  w: 500, h: 400, ...TERRAIN_SPECS.water },
  // Plain is the default — everything not covered above
];

type VehicleKey =
  | 'mech'
  | 'motorcycle'
  | 'tank'
  | 'fighter'
  | 'hovercraft'
  | 'railgun'
  | 'walker'
  | 'artillery'
  | 'buggy'
  | 'laserVan'
  | 'flameRig';
type EnemyKind =
  | 'drone'
  | 'stalker'
  | 'hopper'
  | 'leaper'
  | 'warden'
  | 'crusher'
  | 'mender'
  | 'sniper'
  | 'bomber'
  | 'turret'
  | 'raider'
  | 'mortar'
  | 'shielder'
  | 'spark'
  | 'boss';
type EnemyTier = 'white' | 'green' | 'blue' | 'purple' | 'red';
type TeamKey = 'A' | 'B' | 'C';
type UpgradeKey = 'damage' | 'rate' | 'speed' | 'armor' | 'magnet';
type BuffKey = 'overclock' | 'rapid' | 'barrier' | 'regen' | 'magnet';
type WeatherKey = 'sunny' | 'wind' | 'snow' | 'fog' | 'storm' | 'heat' | 'meteor';
type WeaponKey =
  | 'attackDrone'
  | 'healDrone'
  | 'rocketLauncher'
  | 'grenadeLauncher'
  | 'teslaEmitter'
  | 'beamCannon'
  | 'orbitalBeacon'
  | 'sawLauncher'
  | 'cryoMine'
  | 'nanoSwarm'
  | 'gravityWell'
  | 'ionLance';
type ArcadeOverlapObject =
  | Phaser.Types.Physics.Arcade.GameObjectWithBody
  | Phaser.Physics.Arcade.Body
  | Phaser.Physics.Arcade.StaticBody
  | Phaser.Tilemaps.Tile;

interface VehicleSpec {
  name: string;
  texture: string;
  speed: number;
  fireDelay: number;
  damage: number;
  projectileSpeed: number;
  range: number;
  shots: number;
  spread: number;
  noise: number;
  noiseRadius: number;
  damageTaken: number;
  shield: number;
  bodyWidth: number;
  bodyHeight: number;
  projectileTexture: string;
  projectileScale: number;
  aoe: number;
}

interface EnemySpec {
  name: string;
  texture: string;
  hp: number;
  speed: number;
  damage: number;
  xp: number;
  noticeRadius: number;
  chaseThreshold: number;
  attackRange: number;
  attackDelay: number;
  proximityGain: number;
  noiseMultiplier: number;
  decay: number;
  patrolRadius: number;
  tint: number;
  guardRadius?: number;
}

interface EnemyTierSpec {
  name: string;
  color: number;
  hpMultiplier: number;
  speedMultiplier: number;
  damageMultiplier: number;
  xpMultiplier: number;
}

interface BuffSpec {
  name: string;
  detail: string;
  color: number;
}

interface WeaponSpec {
  name: string;
  detail: string;
  texture: string;
  color: number;
}

interface UpgradeSpec {
  key: string;
  title: string;
  detail: string;
  apply: (scene: MainScene) => void;
}

interface WeatherSpec {
  name: string;
  announce: string;
}

interface PendingWeather {
  key: Exclude<WeatherKey, 'sunny'>;
  startsAt: number;
  durationMs: number;
}

interface LightningStrike {
  x: number;
  y: number;
  radius: number;
}

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

interface MoveKeys {
  W: Phaser.Input.Keyboard.Key;
  A: Phaser.Input.Keyboard.Key;
  S: Phaser.Input.Keyboard.Key;
  D: Phaser.Input.Keyboard.Key;
}

interface RangeKeys {
  Q: Phaser.Input.Keyboard.Key;
  E: Phaser.Input.Keyboard.Key;
}

interface PublicRoom {
  id: string;
  name: string;
  mode?: 'normal' | 'battleRoyale';
  modeName?: string;
  round: number;
  players: number;
  maxPlayers: number;
  unlimitedPlayers?: boolean;
  teamCounts: Record<string, number>;
  remainingMs: number;
  nextInvasionMs: number;
  nextRampageMs?: number;
  battleRoyaleZone?: BattleRoyaleZone;
  scores: Record<string, number>;
  joinLocked?: boolean;
  ended: boolean;
}

interface BattleRoyaleZone {
  centerX: number;
  centerY: number;
  radius: number;
  initialRadius: number;
  minRadius: number;
  shrinkStartsAtMs: number;
  shrinkDurationMs: number;
  outsideIsLethal: boolean;
}

interface NetworkPlayer {
  socketId: string;
  userId: string;
  name: string;
  teamKey: string;
  teamName: string;
  color: string;
  crown?: number;
  teamLeader?: boolean;
  joinedAt?: number;
  aliveSince?: number;
  hp?: number;
  maxHp?: number;
  x: number;
  y: number;
  angle: number;
  alive: boolean;
}

interface RoomState {
  room: PublicRoom;
  players: NetworkPlayer[];
  scores: Record<string, number>;
  remainingMs: number;
  nextInvasionMs: number;
  nextRampageMs?: number;
  teamSummonRemainingMs?: Record<string, number>;
}

interface ServerRewardDrop {
  type: 'chest' | 'buff' | 'vehicle' | 'bossVehicle' | 'heal';
  vehicle?: VehicleKey;
  buff?: BuffKey;
  amount?: number;
}

interface ServerKillReward {
  xp?: number;
  score?: number;
  drops?: ServerRewardDrop[];
}

interface TeamInfo {
  key: TeamKey;
  name: string;
  color: string;
  spawnX: number;
  spawnY: number;
}

interface BossTarget {
  id: string;
  x: number;
  y: number;
  isLocal: boolean;
}

type BossVariantKey = 'annihilator' | 'stormLord' | 'siegeCore';

interface RemotePlayerView {
  sprite: Phaser.Physics.Arcade.Sprite;
  label: Phaser.GameObjects.Text;
  crown: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
  targetAngle: number;
}

interface RemotePlayerTarget {
  targetType: 'remotePlayer';
  socketId: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
}

type CombatTarget =
  | Phaser.Physics.Arcade.Sprite
  | Phaser.Physics.Arcade.Image
  | RemotePlayerTarget;

const VEHICLES: Record<VehicleKey, VehicleSpec> = {
  mech: {
    name: '机械士兵',
    texture: 'unit-mech',
    speed: 235,
    fireDelay: 260,
    damage: 18,
    projectileSpeed: 620,
    range: 610,
    shots: 1,
    spread: 0,
    noise: 15,
    noiseRadius: 430,
    damageTaken: 1,
    shield: 0,
    bodyWidth: 34,
    bodyHeight: 34,
    projectileTexture: 'shot-pulse',
    projectileScale: 1,
    aoe: 0,
  },
  motorcycle: {
    name: '疾电摩托',
    texture: 'unit-bike',
    speed: 390,
    fireDelay: 118,
    damage: 11,
    projectileSpeed: 760,
    range: 560,
    shots: 2,
    spread: 0.16,
    noise: 24,
    noiseRadius: 520,
    damageTaken: 1.12,
    shield: 95,
    bodyWidth: 46,
    bodyHeight: 24,
    projectileTexture: 'shot-pulse',
    projectileScale: 0.85,
    aoe: 0,
  },
  tank: {
    name: '重装坦克',
    texture: 'unit-tank',
    speed: 150,
    fireDelay: 700,
    damage: 72,
    projectileSpeed: 500,
    range: 760,
    shots: 1,
    spread: 0,
    noise: 48,
    noiseRadius: 700,
    damageTaken: 0.55,
    shield: 210,
    bodyWidth: 54,
    bodyHeight: 42,
    projectileTexture: 'shot-shell',
    projectileScale: 1.15,
    aoe: 86,
  },
  fighter: {
    name: '掠空战机',
    texture: 'unit-fighter',
    speed: 430,
    fireDelay: 360,
    damage: 34,
    projectileSpeed: 820,
    range: 820,
    shots: 3,
    spread: 0.2,
    noise: 40,
    noiseRadius: 640,
    damageTaken: 0.82,
    shield: 135,
    bodyWidth: 48,
    bodyHeight: 36,
    projectileTexture: 'shot-missile',
    projectileScale: 1,
    aoe: 42,
  },
  hovercraft: {
    name: '磁悬浮艇',
    texture: 'unit-hover',
    speed: 330,
    fireDelay: 210,
    damage: 22,
    projectileSpeed: 700,
    range: 690,
    shots: 2,
    spread: 0.12,
    noise: 28,
    noiseRadius: 560,
    damageTaken: 0.92,
    shield: 120,
    bodyWidth: 50,
    bodyHeight: 30,
    projectileTexture: 'shot-pulse',
    projectileScale: 0.95,
    aoe: 22,
  },
  railgun: {
    name: '轨道炮车',
    texture: 'unit-railgun',
    speed: 205,
    fireDelay: 560,
    damage: 96,
    projectileSpeed: 940,
    range: 930,
    shots: 1,
    spread: 0,
    noise: 46,
    noiseRadius: 680,
    damageTaken: 0.78,
    shield: 150,
    bodyWidth: 56,
    bodyHeight: 34,
    projectileTexture: 'shot-rail',
    projectileScale: 1.05,
    aoe: 38,
  },
  walker: {
    name: '四足机甲',
    texture: 'unit-walker',
    speed: 245,
    fireDelay: 340,
    damage: 28,
    projectileSpeed: 650,
    range: 650,
    shots: 4,
    spread: 0.24,
    noise: 34,
    noiseRadius: 580,
    damageTaken: 0.72,
    shield: 170,
    bodyWidth: 48,
    bodyHeight: 44,
    projectileTexture: 'shot-pulse',
    projectileScale: 0.9,
    aoe: 0,
  },
  artillery: {
    name: '火箭炮车',
    texture: 'unit-artillery',
    speed: 175,
    fireDelay: 820,
    damage: 66,
    projectileSpeed: 450,
    range: 840,
    shots: 3,
    spread: 0.18,
    noise: 56,
    noiseRadius: 760,
    damageTaken: 0.64,
    shield: 185,
    bodyWidth: 58,
    bodyHeight: 38,
    projectileTexture: 'shot-missile',
    projectileScale: 1.08,
    aoe: 76,
  },
  buggy: {
    name: '突击越野车',
    texture: 'unit-buggy',
    speed: 365,
    fireDelay: 185,
    damage: 16,
    projectileSpeed: 780,
    range: 640,
    shots: 3,
    spread: 0.22,
    noise: 30,
    noiseRadius: 570,
    damageTaken: 0.98,
    shield: 105,
    bodyWidth: 52,
    bodyHeight: 30,
    projectileTexture: 'shot-pulse',
    projectileScale: 0.86,
    aoe: 0,
  },
  laserVan: {
    name: '棱镜装甲车',
    texture: 'unit-laser-van',
    speed: 220,
    fireDelay: 430,
    damage: 54,
    projectileSpeed: 980,
    range: 900,
    shots: 2,
    spread: 0.06,
    noise: 38,
    noiseRadius: 650,
    damageTaken: 0.7,
    shield: 155,
    bodyWidth: 56,
    bodyHeight: 36,
    projectileTexture: 'shot-rail',
    projectileScale: 0.98,
    aoe: 30,
  },
  flameRig: {
    name: '焚烧工程车',
    texture: 'unit-flame-rig',
    speed: 190,
    fireDelay: 155,
    damage: 21,
    projectileSpeed: 430,
    range: 430,
    shots: 5,
    spread: 0.48,
    noise: 58,
    noiseRadius: 720,
    damageTaken: 0.62,
    shield: 190,
    bodyWidth: 60,
    bodyHeight: 40,
    projectileTexture: 'shot-flame',
    projectileScale: 1,
    aoe: 34,
  },
};

const ENEMIES: Record<EnemyKind, EnemySpec> = {
  drone: {
    name: '巡逻无人机',
    texture: 'enemy-drone',
    hp: 38,
    speed: 78,
    damage: 7,
    xp: 5,
    noticeRadius: 240,
    chaseThreshold: 62,
    attackRange: 34,
    attackDelay: 760,
    proximityGain: 14,
    noiseMultiplier: 0.55,
    decay: 12,
    patrolRadius: 260,
    tint: 0x9ec8ff,
  },
  stalker: {
    name: '追猎机械犬',
    texture: 'enemy-stalker',
    hp: 70,
    speed: 124,
    damage: 12,
    xp: 9,
    noticeRadius: 360,
    chaseThreshold: 44,
    attackRange: 38,
    attackDelay: 620,
    proximityGain: 24,
    noiseMultiplier: 0.82,
    decay: 7,
    patrolRadius: 340,
    tint: 0xf5c542,
  },
  hopper: {
    name: '跳跃侦察兵',
    texture: 'enemy-hopper',
    hp: 58,
    speed: 112,
    damage: 11,
    xp: 10,
    noticeRadius: 410,
    chaseThreshold: 34,
    attackRange: 42,
    attackDelay: 760,
    proximityGain: 23,
    noiseMultiplier: 0.8,
    decay: 6,
    patrolRadius: 330,
    tint: 0x9ec8ff,
  },
  leaper: {
    name: '重跃破甲机',
    texture: 'enemy-leaper',
    hp: 128,
    speed: 88,
    damage: 21,
    xp: 20,
    noticeRadius: 470,
    chaseThreshold: 38,
    attackRange: 56,
    attackDelay: 980,
    proximityGain: 25,
    noiseMultiplier: 0.9,
    decay: 5,
    patrolRadius: 270,
    tint: 0xb285ff,
  },
  warden: {
    name: '区域守卫者',
    texture: 'enemy-warden',
    hp: 118,
    speed: 92,
    damage: 16,
    xp: 14,
    noticeRadius: 430,
    chaseThreshold: 52,
    attackRange: 44,
    attackDelay: 820,
    proximityGain: 18,
    noiseMultiplier: 0.72,
    decay: 5,
    patrolRadius: 210,
    tint: 0xa7e65d,
    guardRadius: 470,
  },
  crusher: {
    name: '破城重机',
    texture: 'enemy-crusher',
    hp: 190,
    speed: 74,
    damage: 24,
    xp: 24,
    noticeRadius: 330,
    chaseThreshold: 36,
    attackRange: 50,
    attackDelay: 980,
    proximityGain: 30,
    noiseMultiplier: 1,
    decay: 4,
    patrolRadius: 190,
    tint: 0xff5d6f,
  },
  mender: {
    name: '修复蜂群',
    texture: 'enemy-mender',
    hp: 92,
    speed: 88,
    damage: 8,
    xp: 13,
    noticeRadius: 390,
    chaseThreshold: 48,
    attackRange: 36,
    attackDelay: 880,
    proximityGain: 14,
    noiseMultiplier: 0.62,
    decay: 6,
    patrolRadius: 300,
    tint: 0xa7e65d,
  },
  sniper: {
    name: '长距狙击塔',
    texture: 'enemy-sniper',
    hp: 82,
    speed: 64,
    damage: 20,
    xp: 16,
    noticeRadius: 560,
    chaseThreshold: 40,
    attackRange: 64,
    attackDelay: 1050,
    proximityGain: 16,
    noiseMultiplier: 0.76,
    decay: 5,
    patrolRadius: 240,
    tint: 0x4d8eff,
  },
  bomber: {
    name: '爆破机雷',
    texture: 'enemy-bomber',
    hp: 110,
    speed: 106,
    damage: 26,
    xp: 18,
    noticeRadius: 420,
    chaseThreshold: 42,
    attackRange: 58,
    attackDelay: 1120,
    proximityGain: 24,
    noiseMultiplier: 0.9,
    decay: 5,
    patrolRadius: 280,
    tint: 0xf5c542,
  },
  turret: {
    name: '哨戒炮台',
    texture: 'enemy-turret',
    hp: 150,
    speed: 0,
    damage: 14,
    xp: 20,
    noticeRadius: 620,
    chaseThreshold: 18,
    attackRange: 580,
    attackDelay: 1850,
    proximityGain: 18,
    noiseMultiplier: 0.7,
    decay: 4,
    patrolRadius: 0,
    tint: 0x9ec8ff,
  },
  raider: {
    name: '狂暴突击兵',
    texture: 'enemy-raider',
    hp: 64,
    speed: 164,
    damage: 13,
    xp: 11,
    noticeRadius: 430,
    chaseThreshold: 30,
    attackRange: 36,
    attackDelay: 520,
    proximityGain: 30,
    noiseMultiplier: 0.92,
    decay: 6,
    patrolRadius: 330,
    tint: 0xff5d6f,
  },
  mortar: {
    name: '迫击炮机',
    texture: 'enemy-mortar',
    hp: 132,
    speed: 54,
    damage: 18,
    xp: 22,
    noticeRadius: 620,
    chaseThreshold: 26,
    attackRange: 560,
    attackDelay: 1650,
    proximityGain: 16,
    noiseMultiplier: 0.8,
    decay: 4,
    patrolRadius: 260,
    tint: 0xf5c542,
  },
  shielder: {
    name: '护盾步兵',
    texture: 'enemy-shielder',
    hp: 168,
    speed: 82,
    damage: 15,
    xp: 21,
    noticeRadius: 390,
    chaseThreshold: 42,
    attackRange: 46,
    attackDelay: 820,
    proximityGain: 18,
    noiseMultiplier: 0.68,
    decay: 5,
    patrolRadius: 250,
    tint: 0x9ec8ff,
  },
  spark: {
    name: '电磁浮雷',
    texture: 'enemy-spark',
    hp: 76,
    speed: 118,
    damage: 17,
    xp: 15,
    noticeRadius: 470,
    chaseThreshold: 34,
    attackRange: 72,
    attackDelay: 1180,
    proximityGain: 24,
    noiseMultiplier: 0.86,
    decay: 5,
    patrolRadius: 300,
    tint: 0xb285ff,
  },
  boss: {
    name: '橙色歼灭者',
    texture: 'enemy-boss',
    hp: 1450,
    speed: 116,
    damage: 34,
    xp: 190,
    noticeRadius: 1550,
    chaseThreshold: 1,
    attackRange: 72,
    attackDelay: 620,
    proximityGain: 0,
    noiseMultiplier: 1,
    decay: 0,
    patrolRadius: 520,
    tint: 0xff9f1c,
  },
};

const ENEMY_TIERS: Record<EnemyTier, EnemyTierSpec> = {
  white: {
    name: '白',
    color: 0xe8f7f4,
    hpMultiplier: 1,
    speedMultiplier: 1,
    damageMultiplier: 1,
    xpMultiplier: 1,
  },
  green: {
    name: '绿',
    color: 0xa7e65d,
    hpMultiplier: 1.35,
    speedMultiplier: 1.04,
    damageMultiplier: 1.15,
    xpMultiplier: 1.45,
  },
  blue: {
    name: '蓝',
    color: 0x4d8eff,
    hpMultiplier: 1.85,
    speedMultiplier: 1.08,
    damageMultiplier: 1.3,
    xpMultiplier: 2.1,
  },
  purple: {
    name: '紫',
    color: 0xb285ff,
    hpMultiplier: 2.65,
    speedMultiplier: 1.12,
    damageMultiplier: 1.55,
    xpMultiplier: 3.2,
  },
  red: {
    name: '红',
    color: 0xff4d4d,
    hpMultiplier: 3.75,
    speedMultiplier: 1.16,
    damageMultiplier: 2,
    xpMultiplier: 5,
  },
};

const BUFFS: Record<BuffKey, BuffSpec> = {
  overclock: {
    name: '超频火控',
    detail: '伤害提升',
    color: 0xf5c542,
  },
  rapid: {
    name: '急速冷却',
    detail: '开火更快',
    color: 0x4d8eff,
  },
  barrier: {
    name: '偏转护盾',
    detail: '减伤提升',
    color: 0x4d8eff,
  },
  regen: {
    name: '修复纳米云',
    detail: '持续回血',
    color: 0xa7e65d,
  },
  magnet: {
    name: '吸铁石',
    detail: '短时间吸附远处经验球和掉落物',
    color: 0x9ec8ff,
  },
};

const WEAPONS: Record<WeaponKey, WeaponSpec> = {
  attackDrone: {
    name: '攻击无人机',
    detail: '环绕玩家，自动射击索敌目标',
    texture: 'weapon-attack-drone',
    color: 0x4d8eff,
  },
  healDrone: {
    name: '治疗无人机',
    detail: '周期修复生命，高等级附带护盾恢复',
    texture: 'weapon-heal-drone',
    color: 0xa7e65d,
  },
  rocketLauncher: {
    name: '火箭筒',
    detail: '发射高伤害火箭，命中后范围爆炸',
    texture: 'shot-missile',
    color: 0xff5d6f,
  },
  grenadeLauncher: {
    name: '手榴弹模块',
    detail: '抛射延时爆弹，适合清理密集目标',
    texture: 'shot-grenade',
    color: 0xf5c542,
  },
  teslaEmitter: {
    name: '电弧发生器',
    detail: '瞬发电弧连锁打击近距离目标',
    texture: 'buff-core',
    color: 0xb285ff,
  },
  beamCannon: {
    name: '聚束光炮',
    detail: '周期发射穿透光束，远距离打击直线目标',
    texture: 'shot-rail',
    color: 0x4d8eff,
  },
  orbitalBeacon: {
    name: '轨道信标',
    detail: '锁定目标区域后落下范围打击',
    texture: 'buff-core',
    color: 0xff9f1c,
  },
  sawLauncher: {
    name: '回旋锯盘',
    detail: '发射会穿行切割的旋转锯盘',
    texture: 'shot-saw',
    color: 0xc9ff6a,
  },
  cryoMine: {
    name: '霜冻地雷',
    detail: '在附近目标脚下布置延时冰爆',
    texture: 'shot-cryo',
    color: 0x9ec8ff,
  },
  nanoSwarm: {
    name: '纳米蜂群',
    detail: '持续撕咬近距离多个目标',
    texture: 'weapon-swarm',
    color: 0xb285ff,
  },
  gravityWell: {
    name: '重力井',
    detail: '生成牵引区域并压碎范围内敌人',
    texture: 'buff-core',
    color: 0x8f7cff,
  },
  ionLance: {
    name: '离子长枪',
    detail: '蓄能后发射高速贯穿长枪',
    texture: 'shot-ion',
    color: 0x9ec8ff,
  },
};

const VEHICLE_ORDER: VehicleKey[] = [
  'motorcycle',
  'tank',
  'fighter',
  'hovercraft',
  'railgun',
  'walker',
  'artillery',
  'buggy',
  'laserVan',
  'flameRig',
];
const BUFF_ORDER: BuffKey[] = ['overclock', 'rapid', 'barrier', 'regen', 'magnet'];
const WEAPON_ORDER: WeaponKey[] = [
  'attackDrone',
  'healDrone',
  'rocketLauncher',
  'grenadeLauncher',
  'teslaEmitter',
  'beamCannon',
  'orbitalBeacon',
  'sawLauncher',
  'cryoMine',
  'nanoSwarm',
  'gravityWell',
  'ionLance',
];
const TEAM_OPTIONS: TeamInfo[] = [
  { key: 'A', name: 'A 阵营', color: '#36f0d2', spawnX: 900, spawnY: 800 },
  { key: 'B', name: 'B 阵营', color: '#ff6961', spawnX: 7100, spawnY: 800 },
  { key: 'C', name: 'C 阵营', color: '#ffd166', spawnX: 4000, spawnY: 4400 },
];
const MAX_WEAPON_SLOTS = 5;
const PERFECT_WEAPON_LEVEL = 6;
const PERFECT_VEHICLE_RANK = 6;
const TARGET_RANGE_MIN = 220;
const TARGET_RANGE_MAX = 1400;
const TARGET_RANGE_STEP = 80;
const TARGET_RANGE_DEFAULT = 760;
const BOSS_MINIMAP_COLOR = 0xff9f1c;
const MIN_BOSS_COUNT = 5;
const BOSS_START_MS = 5 * 60 * 1000;
const BOSS_FIXATION_MS = 13000;
const BOSS_FLEE_MS = 4200;
const BOSS_HEAL_RATE = 0.055;
const BOSS_HEAL_COOLDOWN_MS = 3600;
const BOSS_VARIANTS: Record<BossVariantKey, { name: string; color: number; hp: number; speed: number; damage: number; skillDelay: [number, number] }> = {
  annihilator: { name: '橙色歼灭者', color: 0xff9f1c, hp: 1, speed: 1, damage: 1, skillDelay: [2400, 3600] },
  stormLord: { name: '雷暴统御者', color: 0x9ec8ff, hp: 0.86, speed: 1.18, damage: 0.92, skillDelay: [1900, 3000] },
  siegeCore: { name: '堡垒母核', color: 0xff5d6f, hp: 1.25, speed: 0.78, damage: 1.14, skillDelay: [3100, 4600] },
};
const BOSS_VARIANT_ORDER: BossVariantKey[] = ['annihilator', 'stormLord', 'siegeCore'];

type SkillKey = 'sprint' | 'airstrike';
interface SkillSpec {
  key: SkillKey;
  name: string;
  icon: string;
  cooldownMs: number;
  durationMs: number;
  color: number;
}
const SKILLS: Record<SkillKey, SkillSpec> = {
  sprint:    { key: 'sprint',    name: '急速冲刺', icon: '冲', cooldownMs: 12000, durationMs: 1600, color: 0x4d8eff },
  airstrike: { key: 'airstrike', name: '空袭信标', icon: '炸', cooldownMs: 32000, durationMs: 2400, color: 0xf5c542 },
};
const SKILL_ORDER: SkillKey[] = ['sprint', 'airstrike'];
const SPRINT_SPEED_BONUS = 200;
const AIRSTRIKE_DELAY_MS = 1400;
const AIRSTRIKE_STRIKE_INTERVAL = 320;
const AIRSTRIKE_STRIKE_COUNT = 3;
const AIRSTRIKE_RADIUS = 140;
const AIRSTRIKE_DAMAGE = 95;
const AIRSTRIKE_RANGE = 520;
const BOSS_SPAWNS = [
  { x: 900, y: 700 },
  { x: WORLD_WIDTH - 900, y: 700 },
  { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 },
  { x: 1100, y: WORLD_HEIGHT - 900 },
  { x: WORLD_WIDTH - 1100, y: WORLD_HEIGHT - 900 },
];
const WEATHER_SPECS: Record<WeatherKey, WeatherSpec> = {
  sunny: {
    name: '晴朗',
    announce: '天气转晴',
  },
  wind: {
    name: '大风',
    announce: '大风将至，移动速度下降',
  },
  snow: {
    name: '雪天',
    announce: '雪天将至，停止移动会继续滑行',
  },
  fog: {
    name: '大雾',
    announce: '大雾将至，能见度和敌意都会下降',
  },
  storm: {
    name: '雷雨',
    announce: '雷雨将至，注意躲避落雷',
  },
  heat: {
    name: '高温',
    announce: '高温将至，武器冷却变慢但火力提升',
  },
  meteor: {
    name: '流星雨',
    announce: '流星雨将至，注意地面冲击预警',
  },
};
const WEATHER_KEYS: Exclude<WeatherKey, 'sunny'>[] = ['wind', 'snow', 'fog', 'storm', 'heat', 'meteor'];
const WEATHER_NOTICE_MS = 10000;
const WEATHER_MAX_DURATION_MS = 60000;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

class MainScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private enemies!: Phaser.Physics.Arcade.Group;
  private projectiles!: Phaser.Physics.Arcade.Group;
  private enemyProjectiles!: Phaser.Physics.Arcade.Group;
  private chests!: Phaser.Physics.Arcade.Group;
  private xpOrbs!: Phaser.Physics.Arcade.Group;
  private vehiclePods!: Phaser.Physics.Arcade.Group;
  private buffPickups!: Phaser.Physics.Arcade.Group;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: MoveKeys;
  private rangeKeys!: RangeKeys;
  private skillKeys!: { SHIFT: Phaser.Input.Keyboard.Key; F: Phaser.Input.Keyboard.Key };
  private upgradeHotkeys: Phaser.Input.Keyboard.Key[] = [];
  private hud!: Phaser.GameObjects.Graphics;
  private shadowLayer!: Phaser.GameObjects.Graphics;
  private weatherOverlay!: Phaser.GameObjects.Graphics;
  private battleZoneGraphics!: Phaser.GameObjects.Graphics;
  private targetRing!: Phaser.GameObjects.Graphics;
  private enemyHud!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private skillHudTexts: Partial<Record<SkillKey, Phaser.GameObjects.Text>> = {};
  private modal?: Phaser.GameObjects.Container;
  private gameOverLayer?: Phaser.GameObjects.Container;
  private currentUpgradeChoices: UpgradeSpec[] = [];
  private upgradePanel?: HTMLDivElement;
  private socket?: Socket;
  private lobbyOverlay?: HTMLDivElement;
  private lobbyRoomsEl?: HTMLDivElement;
  private lobbyStatusEl?: HTMLDivElement;
  private playerNameInput?: HTMLInputElement;
  private latestRooms: PublicRoom[] = [];
  private currentRoom?: PublicRoom;
  private localUserId = '';
  private localSocketId = '';
  private isInMultiplayerRoom = false;
  private joinedRoomId = '';
  private localTeamKey = '';
  private localTeamName = '';
  private localTeamColorCss = '#36f0d2';
  private localTeamTint = 0x4d8eff;
  private selectedTeamKey: TeamKey = 'A';
  private latestRoomState?: RoomState;
  private roomStateSyncedAt = 0;
  private remotePlayers = new Map<string, RemotePlayerView>();
  private nextEntityId = 1;
  private lastNetworkSendAt = 0;
  private invasionMessageUntil = 0;
  private invasionMessage = '';
  private announcementClose?: Phaser.GameObjects.Text;
  private localCrown = 0;
  private isTeamLeader = false;
  private summonReadyAt = 0;
  private summonButton?: HTMLButtonElement;
  private onlineButton?: HTMLButtonElement;
  private exitButton?: HTMLButtonElement;
  private mobileControls?: HTMLDivElement;
  private portraitHint?: HTMLDivElement;
  private joystick?: HTMLDivElement;
  private joystickKnob?: HTMLDivElement;
  private joystickPointerId?: number;
  private joystickVector = new Phaser.Math.Vector2(0, 0);
  private mobileSkillPanel?: HTMLDivElement;
  private mobileSkillButtons: Partial<Record<SkillKey, HTMLButtonElement>> = {};
  private onlinePanel?: HTMLDivElement;
  private gameOverPanel?: HTMLDivElement;
  private lockedBossVehicle?: VehicleKey;
  private moveTarget?: Phaser.Math.Vector2;
  private serverCorrectionUntil = 0;
  private lastDefeatedBy = '未知单位';
  private weaponSlots: WeaponKey[] = [];
  private weaponLevels: Record<WeaponKey, number> = {
    attackDrone: 0,
    healDrone: 0,
    rocketLauncher: 0,
    grenadeLauncher: 0,
    teslaEmitter: 0,
    beamCannon: 0,
    orbitalBeacon: 0,
    sawLauncher: 0,
    cryoMine: 0,
    nanoSwarm: 0,
    gravityWell: 0,
    ionLance: 0,
  };
  private weaponCooldowns: Record<WeaponKey, number> = {
    attackDrone: 0,
    healDrone: 0,
    rocketLauncher: 0,
    grenadeLauncher: 0,
    teslaEmitter: 0,
    beamCannon: 0,
    orbitalBeacon: 0,
    sawLauncher: 0,
    cryoMine: 0,
    nanoSwarm: 0,
    gravityWell: 0,
    ionLance: 0,
  };
  private weaponVisuals: Partial<Record<WeaponKey, Phaser.GameObjects.Image>> = {};
  private healDroneBusyUntil = 0;

  public damageMultiplier = 1;
  public fireRateMultiplier = 1;
  public speedBonus = 0;
  public magnetRadius = 0;

  private hp = 120;
  private maxHp = 120;
  private displayHp = 120;
  private xp = 0;
  private level = 1;
  private xpToNext = 32;
  private kills = 0;
  private elapsedMs = 0;
  private nextShotAt = 0;
  private nextEnemySpawnAt = 0;
  private nextChestAt = 0;
  private currentVehicle: VehicleKey = 'mech';
  private vehicleRanks: Record<VehicleKey, number> = {
    mech: 1,
    motorcycle: 0,
    tank: 0,
    fighter: 0,
    hovercraft: 0,
    railgun: 0,
    walker: 0,
    artillery: 0,
    buggy: 0,
    laserVan: 0,
    flameRig: 0,
  };
  private permanentVehicleRanks: Record<VehicleKey, number> = {
    mech: 1,
    motorcycle: 0,
    tank: 0,
    fighter: 0,
    hovercraft: 0,
    railgun: 0,
    walker: 0,
    artillery: 0,
    buggy: 0,
    laserVan: 0,
    flameRig: 0,
  };
  private activeBuffs: Record<BuffKey, number> = {
    overclock: 0,
    rapid: 0,
    barrier: 0,
    regen: 0,
    magnet: 0,
  };
  private vehicleExpiresAt = 0;
  private vehicleShield = 0;
  private maxVehicleShield = 0;
  private targetRange = TARGET_RANGE_DEFAULT;
  private areaAlert = 0;
  private isChoosingUpgrade = false;
  private isGameOver = false;
  private skillReadyAt: Record<SkillKey, number> = { sprint: 0, airstrike: 0 };
  private skillActiveUntil: Record<SkillKey, number> = { sprint: 0, airstrike: 0 };
  private nextSprintTrailAt = 0;
  private lastAimAngle = 0;
  private nextEngineTrailAt = 0;
  private upgradeChoiceExpiresAt = 0;
  private upgradeCountdownEl?: HTMLDivElement;
  private currentWeather: WeatherKey = 'sunny';
  private pendingWeather?: PendingWeather;
  private weatherActiveUntil = 0;
  private nextWeatherDecisionAt = 0;
  private nextLightningAt = 0;
  private nextMeteorAt = 0;
  private lightningStrikes: LightningStrike[] = [];
  private snowSlideX = 0;
  private snowSlideY = 0;
  private lastBattleZoneWarningAt = -10000;
  private nextDamageSfxAt = 0;
  private nextProjectileSfxAt = 0;
  private nextKillCueAt = 0;
  private nextCritCueAt = 0;
  private audioContext?: AudioContext;
  private nextUiSyncAt = 0;

  constructor() {
    super('main');
  }

  create() {
    this.resetRunState();
    this.createTextures();

    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBackgroundColor('#080b10');

    this.addMap();

    this.enemies = this.physics.add.group({ allowGravity: false });
    this.projectiles = this.physics.add.group({ allowGravity: false, maxSize: 260 });
    this.enemyProjectiles = this.physics.add.group({ allowGravity: false, maxSize: 120 });
    this.chests = this.physics.add.group({ allowGravity: false });
    this.xpOrbs = this.physics.add.group({ allowGravity: false, maxSize: 420 });
    this.vehiclePods = this.physics.add.group({ allowGravity: false });
    this.buffPickups = this.physics.add.group({ allowGravity: false });

    this.player = this.physics.add.sprite(
      WORLD_WIDTH / 2,
      WORLD_HEIGHT / 2,
      VEHICLES.mech.texture,
    );
    this.player.setDepth(20);
    this.player.setCollideWorldBounds(true);
    this.applyVehicle('mech', false);

    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D') as MoveKeys;
    this.rangeKeys = this.input.keyboard!.addKeys('Q,E') as RangeKeys;
    this.skillKeys = this.input.keyboard!.addKeys('SHIFT,F') as { SHIFT: Phaser.Input.Keyboard.Key; F: Phaser.Input.Keyboard.Key };
    this.upgradeHotkeys = [
      Phaser.Input.Keyboard.KeyCodes.ONE,
      Phaser.Input.Keyboard.KeyCodes.TWO,
      Phaser.Input.Keyboard.KeyCodes.THREE,
      Phaser.Input.Keyboard.KeyCodes.NUMPAD_ONE,
      Phaser.Input.Keyboard.KeyCodes.NUMPAD_TWO,
      Phaser.Input.Keyboard.KeyCodes.NUMPAD_THREE,
    ].map((keyCode) => this.input.keyboard!.addKey(keyCode));

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.ensureAudioContext();
      if (this.isChoosingUpgrade || this.isGameOver || !this.isInMultiplayerRoom) {
        return;
      }
      this.moveTarget = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown || this.isChoosingUpgrade || this.isGameOver || !this.isInMultiplayerRoom) {
        return;
      }
      this.moveTarget = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY);
    });

    this.physics.add.overlap(
      this.projectiles,
      this.enemies,
      this.handleProjectileHit,
      undefined,
      this,
    );
    this.physics.add.overlap(
      this.projectiles,
      this.chests,
      this.handleChestHit,
      undefined,
      this,
    );
    this.physics.add.overlap(this.player, this.enemyProjectiles, this.handleEnemyProjectileHit, undefined, this);
    this.physics.add.overlap(this.player, this.xpOrbs, this.handleXpOrbPickup, undefined, this);
    this.physics.add.overlap(this.player, this.vehiclePods, this.handleVehiclePodPickup, undefined, this);
    this.physics.add.overlap(this.player, this.buffPickups, this.handleBuffPickup, undefined, this);

    this.weatherOverlay = this.add.graphics().setScrollFactor(0).setDepth(850);
    this.hud = this.add.graphics().setScrollFactor(0).setDepth(900);
    this.shadowLayer = this.add.graphics().setDepth(15);
    this.battleZoneGraphics = this.add.graphics().setDepth(6);
    this.targetRing = this.add.graphics().setDepth(7);
    this.enemyHud = this.add.graphics().setDepth(60);
    this.hudText = this.add
      .text(24, 24, '', {
        fontFamily: 'Inter, "Segoe UI", sans-serif',
        fontSize: '15px',
        color: '#e8f7f4',
        lineSpacing: 7,
      })
      .setScrollFactor(0)
      .setDepth(901);

    this.physics.pause();
    this.setupOrientationHandling();
    this.connectLobby();
    this.showLobbyOverlay();
  }

  private setupOrientationHandling() {
    const refresh = () => {
      this.scale.refresh();
      this.updatePortraitHint();
    };
    window.addEventListener('resize', refresh);
    screen.orientation?.addEventListener?.('change', refresh);

    this.updatePortraitHint();
  }

  private updatePortraitHint() {
    const isMobileLike = matchMedia('(pointer: coarse)').matches;
    if (!isMobileLike) {
      this.portraitHint?.remove();
      this.portraitHint = undefined;
      return;
    }

    const isPortrait = window.innerWidth < window.innerHeight;
    if (!isPortrait || !this.isInMultiplayerRoom || this.isGameOver) {
      this.portraitHint?.remove();
      this.portraitHint = undefined;
      return;
    }

    if (this.portraitHint) {
      return;
    }

    const hint = document.createElement('div');
    hint.className = 'portrait-hint';
    hint.innerHTML = '<div class="portrait-hint-icon">&#x1F4F2;</div><div>横拿手机获得最佳体验</div>';
    document.body.appendChild(hint);
    this.portraitHint = hint;

    hint.addEventListener('click', () => {
      hint.remove();
      this.portraitHint = undefined;
    });
  }

  private resetRunState(preservePermanentVehicles = false) {
    const savedPermanentVehicleRanks = preservePermanentVehicles
      ? { ...this.permanentVehicleRanks }
      : undefined;
    const savedLockedBossVehicle = preservePermanentVehicles ? this.lockedBossVehicle : undefined;
    this.damageMultiplier = 1;
    this.fireRateMultiplier = 1;
    this.speedBonus = 0;
    this.magnetRadius = 0;
    this.hp = 120;
    this.displayHp = 120;
    this.maxHp = 120;
    this.xp = 0;
    this.level = 1;
    this.xpToNext = this.getXpRequirementForLevel(1);
    this.kills = 0;
    this.elapsedMs = 0;
    this.nextShotAt = 0;
    this.nextEnemySpawnAt = 0;
    this.nextChestAt = 0;
    this.currentVehicle = 'mech';
    this.vehicleRanks = {
      mech: 1,
      motorcycle: 0,
      tank: 0,
      fighter: 0,
      hovercraft: 0,
      railgun: 0,
      walker: 0,
      artillery: 0,
      buggy: 0,
      laserVan: 0,
      flameRig: 0,
    };
    if (savedPermanentVehicleRanks) {
      this.permanentVehicleRanks = savedPermanentVehicleRanks;
      VEHICLE_ORDER.forEach((vehicle) => {
        this.vehicleRanks[vehicle] = Math.max(this.vehicleRanks[vehicle], this.permanentVehicleRanks[vehicle]);
      });
    } else {
      this.permanentVehicleRanks = {
        mech: 1,
        motorcycle: 0,
        tank: 0,
        fighter: 0,
        hovercraft: 0,
        railgun: 0,
        walker: 0,
        artillery: 0,
        buggy: 0,
        laserVan: 0,
        flameRig: 0,
      };
    }
    this.activeBuffs = {
      overclock: 0,
      rapid: 0,
      barrier: 0,
      regen: 0,
      magnet: 0,
    };
    this.vehicleExpiresAt = 0;
    this.vehicleShield = 0;
    this.maxVehicleShield = 0;
    this.lockedBossVehicle = savedLockedBossVehicle;
    this.targetRange = TARGET_RANGE_DEFAULT;
    this.areaAlert = 0;
    this.isChoosingUpgrade = false;
    this.isGameOver = false;
    this.skillReadyAt = { sprint: 0, airstrike: 0 };
    this.skillActiveUntil = { sprint: 0, airstrike: 0 };
    this.nextSprintTrailAt = 0;
    this.lastAimAngle = 0;
    this.nextEngineTrailAt = 0;
    this.upgradeChoiceExpiresAt = 0;
    this.upgradeCountdownEl = undefined;
    this.currentWeather = 'sunny';
    this.pendingWeather = undefined;
    this.weatherActiveUntil = 0;
    this.nextWeatherDecisionAt = Phaser.Math.Between(18000, 42000);
    this.nextLightningAt = 0;
    this.nextMeteorAt = 0;
    this.lightningStrikes = [];
    this.snowSlideX = 0;
    this.snowSlideY = 0;
    this.lastBattleZoneWarningAt = -10000;
    this.nextDamageSfxAt = 0;
    this.nextProjectileSfxAt = 0;
    this.nextKillCueAt = 0;
    this.nextCritCueAt = 0;
    this.nextEntityId = 1;
    this.moveTarget = undefined;
    this.joystickVector.set(0, 0);
    this.lastDefeatedBy = '未知单位';
    this.currentUpgradeChoices = [];
    this.upgradePanel?.remove();
    this.upgradePanel = undefined;
    this.gameOverPanel?.remove();
    this.gameOverPanel = undefined;
    this.hideAnnouncement();
    this.weaponSlots = [];
    this.weaponLevels = {
      attackDrone: 0,
      healDrone: 0,
      rocketLauncher: 0,
      grenadeLauncher: 0,
      teslaEmitter: 0,
      beamCannon: 0,
      orbitalBeacon: 0,
      sawLauncher: 0,
      cryoMine: 0,
      nanoSwarm: 0,
      gravityWell: 0,
      ionLance: 0,
    };
    this.weaponCooldowns = {
      attackDrone: 0,
      healDrone: 0,
      rocketLauncher: 0,
      grenadeLauncher: 0,
      teslaEmitter: 0,
      beamCannon: 0,
      orbitalBeacon: 0,
      sawLauncher: 0,
      cryoMine: 0,
      nanoSwarm: 0,
      gravityWell: 0,
      ionLance: 0,
    };
    this.weaponVisuals = {};
    this.healDroneBusyUntil = 0;
  }

  private connectLobby() {
    if (this.socket) {
      return;
    }

    this.localUserId = window.localStorage.getItem('mech-harvest-user-id') || '';
    if (!this.localUserId) {
      this.localUserId = crypto.randomUUID();
      window.localStorage.setItem('mech-harvest-user-id', this.localUserId);
    }

    const socketBasePath = import.meta.env.BASE_URL.replace(/\/$/, '');
    this.socket = io({
      path: `${socketBasePath}/socket.io`,
    });
    this.socket.on('connect', () => {
      this.localSocketId = this.socket?.id ?? '';
      this.setLobbyStatus('已连接房间服务器');
      this.socket?.emit('rooms:list');
    });
    this.socket.on('connect_error', () => {
      this.setLobbyStatus('房间服务器连接失败：请用 npm start 或 Docker 运行多人服务');
    });
    this.socket.on('rooms:list', (rooms: PublicRoom[]) => {
      this.latestRooms = rooms;
      this.renderRoomList(rooms);
    });
    this.socket.on('room:state', (state: RoomState) => {
      if (this.currentRoom && state.room.id !== this.currentRoom.id) {
        return;
      }
      this.latestRoomState = state;
      this.currentRoom = state.room;
      this.roomStateSyncedAt = this.elapsedMs;
      this.syncRemotePlayers(state.players);
      const localPlayer = state.players.find((player) => player.socketId === this.localSocketId);
      if (localPlayer) {
        this.localCrown = localPlayer.crown ?? 0;
        this.isTeamLeader = Boolean(localPlayer.teamLeader);
        this.reconcileLocalPlayerFromServer(localPlayer);
        const summonRemainingMs = state.teamSummonRemainingMs?.[localPlayer.teamKey] ?? 0;
        this.summonReadyAt = this.elapsedMs + summonRemainingMs;
        this.syncSummonButton();
      }
      this.syncOnlineButton();
      this.syncExitButton();
      if (this.onlinePanel) {
        this.renderOnlinePanel();
      }
    });
    this.socket.on('room:invasion', (payload: { wave: number }) => {
      this.handleInvasionWave(payload.wave);
    });
    this.socket.on('room:rampage', (payload: { wave: number }) => {
      this.handleRampageWave(payload.wave);
    });
    this.socket.on('room:player-joined', (payload: { message?: string; player?: NetworkPlayer }) => {
      this.showJoinMessage(payload);
    });
    this.socket.on('room:player-defeated', (payload: { message?: string; defeatedBy?: string }) => {
      this.showAnnouncement(payload.message || `有玩家被 ${payload.defeatedBy || '中立单位'} 击败`, 4200);
    });
    this.socket.on(
      'team:summon',
      (payload: { teamKey: string; leaderSocketId: string; leaderName: string; x: number; y: number; cooldownMs: number; message?: string }) => {
        this.handleTeamSummon(payload);
      },
    );
    this.socket.on('team:heal-applied', (payload: { amount: number; healerName?: string }) => {
      this.applyTeamHeal(payload.amount, payload.healerName);
    });
    this.socket.on('player:damage-applied', (payload: { amount: number; attackerName?: string }) => {
      this.applyRemotePlayerDamage(payload.amount, payload.attackerName);
    });
    this.socket.on('battle:zone-kill', (payload: { defeatedBy?: string }) => {
      this.executeLocalPlayer(payload.defeatedBy || '缩圈闪电');
    });
    this.socket.on(
      'room:end',
      (payload: { winner: { key: string; name: string; color: string; score: number }; scores: Record<string, number> }) => {
        this.handleRoomEnd(payload);
      },
    );
  }

  private showLobbyOverlay() {
    if (this.lobbyOverlay) {
      this.lobbyOverlay.style.display = 'flex';
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'lobby-overlay';
    overlay.innerHTML = `
      <div class="lobby-panel">
        <div class="lobby-head">
          <div>
            <div class="lobby-title">机械战区</div>
            <div class="lobby-subtitle">固定 3 个战区。1、2 房是普通模式，3 房是大逃杀缩圈模式。选择 A / B / C 阵营，15 分钟结算后自动开新局。</div>
          </div>
          <div class="lobby-actions">
            <button class="lobby-guide-toggle" type="button">攻略</button>
            <button class="lobby-refresh" type="button">刷新</button>
          </div>
        </div>
        <div class="lobby-guide" hidden>
          <div class="guide-head">
            <div class="guide-title">简易攻略</div>
            <button class="guide-close" type="button">关闭</button>
          </div>
          <div class="guide-grid">
            <section>
              <h3>武器</h3>
              <p>武器槽最多 5 个。武器 6 级封顶并变成完全体。</p>
              <ul>
                <li>攻击无人机：环绕射击，完全体多发高速弹并带范围爆破。</li>
                <li>治疗无人机：修复自己或队友，完全体治疗更快并有更大治疗脉冲。</li>
                <li>火箭筒：高伤害范围爆炸，完全体齐射更多火箭。</li>
                <li>手榴弹模块：延时爆弹清群，完全体三连抛射且范围更大。</li>
                <li>电弧发生器：近距离连锁电击，完全体连锁目标更多。</li>
                <li>聚束光炮：直线穿透，完全体射程和宽度提升。</li>
                <li>轨道信标：锁定区域打击，完全体多段轨道落点。</li>
                <li>回旋锯盘：穿行切割，完全体多锯盘高速扫场。</li>
                <li>霜冻地雷：延时冰爆并减速，完全体范围和控制更强。</li>
                <li>纳米蜂群：近距离多目标撕咬，完全体附带少量自修复。</li>
                <li>重力井：牵引并压碎范围目标，完全体持续时间和范围提升。</li>
                <li>离子长枪：高速贯穿打击，完全体双发并带小范围冲击。</li>
              </ul>
            </section>
            <section>
              <h3>载具</h3>
              <p>载具存在时不能被其他普通载具替换；相同载具可升级/续时。Boss 载具直接变成 6 级永久完全体。</p>
              <ul>
                <li>疾电摩托、突击越野车：高速机动，适合拉扯。</li>
                <li>重装坦克、火箭炮车、焚烧工程车：慢但硬，范围火力强。</li>
                <li>掠空战机、磁悬浮艇：速度和火力均衡。</li>
                <li>轨道炮车、棱镜装甲车：远距离高伤害直线打击。</li>
                <li>四足机甲：多弹道持续输出。</li>
              </ul>
            </section>
            <section>
              <h3>地形</h3>
              <p>地图上的地形不是装饰，会影响路线和载具选择。不同地形用轮廓、纹理和小地图颜色区分。</p>
              <ul>
                <li>水域：蓝色波纹。普通地面载具会明显变慢，载具到期时停在水里会直接坠毁；战机和磁悬浮艇可通行。</li>
                <li>森林：绿色树形纹理。多数重型载具速度下降，摩托和越野车更适合穿林。</li>
                <li>沼泽：黄绿泥泡。强减速，重型载具更吃亏，载具到期时可能沉没扣血。</li>
                <li>荒漠：金色沙纹。焚烧工程车在荒漠有速度优势。</li>
              </ul>
            </section>
            <section>
              <h3>天气</h3>
              <p>大多数时间是晴朗。异常天气会提前 10 秒播报，最长持续 1 分钟。</p>
              <ul>
                <li>大风：玩家移动速度下降。</li>
                <li>雪天：停止移动后会继续向前滑一小段。</li>
                <li>大雾：地图能见度下降，小地图变灰，敌对单位敌意下降。</li>
                <li>雷雨：玩家附近会出现落雷预警圈，需要及时躲开。</li>
              </ul>
            </section>
            <section>
              <h3>升级和播报</h3>
              <p>升级时战斗不会暂停。你有 3 秒选择升级，点击卡片或按 1 / 2 / 3，超时默认选 1。</p>
              <ul>
                <li>短播报用于召集、击败、载具结束、完全体等事件，会自动关闭。</li>
                <li>天气和狂暴小兵倒计时会作为系统播报常驻刷新。</li>
                <li>哨戒炮台是固定敌人，不会追击，但会缓慢发射子弹。</li>
                <li>最后 2 分钟不能复活；其他时间可以复活，但等级和武器会初始化。</li>
              </ul>
            </section>
          </div>
        </div>
        <div class="lobby-team" aria-label="选择阵营">
          <button class="lobby-team-option" type="button" data-team="A">A 阵营</button>
          <button class="lobby-team-option" type="button" data-team="B">B 阵营</button>
          <button class="lobby-team-option" type="button" data-team="C">C 阵营</button>
        </div>
        <div class="lobby-row">
          <input class="lobby-name" maxlength="18" />
          <button class="lobby-quick" type="button">马上开战</button>
        </div>
        <div class="lobby-status">连接中...</div>
        <div class="lobby-rooms"></div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.lobbyOverlay = overlay;
    this.lobbyRoomsEl = overlay.querySelector('.lobby-rooms') as HTMLDivElement;
    this.lobbyStatusEl = overlay.querySelector('.lobby-status') as HTMLDivElement;
    this.playerNameInput = overlay.querySelector('.lobby-name') as HTMLInputElement;
    const savedName = window.localStorage.getItem('mech-harvest-player-name') || '';
    const savedTeam = window.localStorage.getItem('mech-harvest-team-key');
    this.selectedTeamKey = this.normalizeTeamKey(savedTeam);
    this.playerNameInput.placeholder = '输入昵称';
    this.playerNameInput.value = savedName || `机兵${this.localUserId.slice(0, 4)}`;

    overlay.querySelectorAll<HTMLButtonElement>('.lobby-team-option').forEach((button) => {
      button.addEventListener('click', () => {
        this.selectedTeamKey = this.normalizeTeamKey(button.dataset.team);
        window.localStorage.setItem('mech-harvest-team-key', this.selectedTeamKey);
        this.syncTeamButtons();
      });
    });
    this.syncTeamButtons();

    overlay.querySelector('.lobby-refresh')?.addEventListener('click', () => {
      this.socket?.emit('rooms:list');
    });
    const guide = overlay.querySelector<HTMLDivElement>('.lobby-guide');
    overlay.querySelector('.lobby-guide-toggle')?.addEventListener('click', () => {
      if (guide) {
        guide.hidden = !guide.hidden;
      }
    });
    overlay.querySelector('.guide-close')?.addEventListener('click', () => {
      if (guide) {
        guide.hidden = true;
      }
    });
    overlay.querySelector('.lobby-quick')?.addEventListener('click', () => {
      this.quickJoinRoom();
    });
    this.playerNameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        this.quickJoinRoom();
      }
    });
  }

  private setLobbyStatus(text: string) {
    if (this.lobbyStatusEl) {
      this.lobbyStatusEl.textContent = text;
    }
  }

  private syncTeamButtons() {
    this.lobbyOverlay?.querySelectorAll<HTMLButtonElement>('.lobby-team-option').forEach((button) => {
      const selected = button.dataset.team === this.selectedTeamKey;
      button.classList.toggle('is-active', selected);
      const team = TEAM_OPTIONS.find((entry) => entry.key === button.dataset.team);
      if (team) {
        button.style.setProperty('--team-color', team.color);
      }
    });
  }

  private renderRoomList(rooms: PublicRoom[]) {
    if (!this.lobbyRoomsEl) {
      return;
    }

    this.lobbyRoomsEl.replaceChildren();
    if (rooms.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'lobby-empty';
      empty.textContent = '暂无房间，创建一个战区开始。';
      this.lobbyRoomsEl.appendChild(empty);
      return;
    }

    rooms.forEach((room) => {
      const item = document.createElement('div');
      item.className = 'lobby-room';

      const info = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'lobby-room-title';
      title.textContent = `${room.name} · ${room.modeName || '普通模式'}`;
      const meta = document.createElement('div');
      meta.className = 'lobby-room-meta';
      const scores = TEAM_OPTIONS.map((team) => `${team.key}:${room.scores[team.key] ?? 0}`).join('  ');
      const teams = TEAM_OPTIONS.map((team) => `${team.key}${room.teamCounts?.[team.key] ?? 0}`).join(' / ');
      const capacityText = room.unlimitedPlayers ? `${room.players}/不限` : `${room.players}/${room.maxPlayers}`;
      const zoneText = room.battleRoyaleZone ? `   安全圈 ${Math.round(room.battleRoyaleZone.radius)}m` : '';
      const rampageText = room.nextRampageMs !== undefined ? `   狂暴 ${this.formatClock(room.nextRampageMs)}` : '';
      meta.textContent = `第 ${room.round} 局   真人 ${capacityText}   剩余 ${this.formatClock(
        room.remainingMs,
      )}   入侵 ${this.formatClock(room.nextInvasionMs)}${rampageText}${zoneText}   ${teams}   ${scores}`;
      info.append(title, meta);

      const join = document.createElement('button');
      join.type = 'button';
      join.textContent = room.joinLocked ? '已锁定' : '进入';
      join.disabled = Boolean(room.joinLocked);
      join.addEventListener('click', () => this.joinRoom(room.id));
      if (!room.joinLocked) {
        item.addEventListener('click', () => this.joinRoom(room.id));
        join.addEventListener('click', (event) => event.stopPropagation());
      }

      item.append(info, join);
      this.lobbyRoomsEl?.appendChild(item);
    });
  }

  private quickJoinRoom() {
    if (!this.socket?.connected) {
      this.setLobbyStatus('还没有连接到服务器');
      return;
    }

    const name = this.getPlayerName();
    window.localStorage.setItem('mech-harvest-player-name', name);
    const targetRoom = this.pickMostPopulatedRoom();
    if (targetRoom) {
      this.setLobbyStatus(`正在进入真人最多的房间：${targetRoom.name}`);
      this.joinRoom(targetRoom.id);
      return;
    }

    this.setLobbyStatus('正在匹配战区...');
    this.socket.emit(
      'room:quick-join',
      {
        userId: this.localUserId,
        name,
        teamKey: this.selectedTeamKey,
      },
      (response: any) => {
        if (!response?.ok) {
          this.setLobbyStatus(response?.error || '匹配失败');
          return;
        }

        this.beginRoom(response.room, response.player);
      },
    );
  }

  private pickMostPopulatedRoom() {
    return [...this.latestRooms]
      .filter((room) => !room.joinLocked)
      .sort((a, b) => b.players - a.players || b.remainingMs - a.remainingMs || a.id.localeCompare(b.id))[0];
  }

  private joinRoom(roomId: string) {
    if (!this.socket?.connected) {
      this.setLobbyStatus('还没有连接到房间服务器');
      return;
    }

    const name = this.getPlayerName();
    window.localStorage.setItem('mech-harvest-player-name', name);
    this.setLobbyStatus('正在进入房间...');
    this.socket.emit(
      'room:join',
      {
        roomId,
        userId: this.localUserId,
        name,
        teamKey: this.selectedTeamKey,
      },
      (response: any) => {
        if (!response?.ok) {
          this.setLobbyStatus(response?.error || '进入房间失败');
          return;
        }

        this.beginRoom(response.room, response.player);
      },
    );
  }

  private getPlayerName() {
    return (this.playerNameInput?.value || `机兵${this.localUserId.slice(0, 4)}`).trim().slice(0, 18);
  }

  private normalizeTeamKey(value: string | null | undefined): TeamKey {
    return value === 'B' || value === 'C' ? value : 'A';
  }

  private beginRoom(room: PublicRoom, player: NetworkPlayer) {
    this.clearRunObjects();
    this.resetRunState();

    this.isInMultiplayerRoom = true;
    this.joinedRoomId = room.id;
    this.currentRoom = room;
    this.localSocketId = player.socketId;
    this.localTeamKey = player.teamKey;
    this.localTeamName = player.teamName;
    this.localTeamColorCss = player.color;
    this.localTeamTint = this.cssColorToNumber(player.color);
    this.localCrown = player.crown ?? 0;
    this.isTeamLeader = Boolean(player.teamLeader);
    this.summonReadyAt = 0;
    this.selectedTeamKey = this.normalizeTeamKey(player.teamKey);
    window.localStorage.setItem('mech-harvest-team-key', this.selectedTeamKey);
    this.latestRoomState = undefined;

    this.player.setPosition(player.x, player.y);
    this.applyVehicle('mech', false);
    this.player.setTint(this.localTeamTint);

    this.spawnInitialWorld();
    this.lobbyOverlay?.remove();
    this.lobbyOverlay = undefined;
    this.syncSummonButton();
    this.syncOnlineButton();
    this.syncExitButton();
    this.physics.resume();
  }

  private clearRunObjects() {
    this.xpOrbs?.getChildren().forEach((rawOrb) => {
      const orb = rawOrb as Phaser.Physics.Arcade.Image;
      (orb.getData('halo') as Phaser.GameObjects.Arc | undefined)?.destroy();
      (orb.getData('label') as Phaser.GameObjects.Text | undefined)?.destroy();
    });
    [this.enemies, this.projectiles, this.enemyProjectiles, this.chests, this.xpOrbs, this.vehiclePods, this.buffPickups].forEach((group) => {
      group?.clear(true, true);
    });
    Object.values(this.weaponVisuals).forEach((visual) => visual?.destroy());
    this.onlinePanel?.remove();
    this.onlinePanel = undefined;
    this.remotePlayers.forEach((view) => {
      view.sprite.destroy();
      view.label.destroy();
      view.crown.destroy();
    });
    this.remotePlayers.clear();
    this.enemyHud?.clear();
    this.targetRing?.clear();
    this.battleZoneGraphics?.clear();
    this.weatherOverlay?.clear();
  }

  private spawnInitialWorld() {
    for (let i = 0; i < 18; i += 1) {
      const starter: EnemyKind[] = ['drone', 'stalker', 'sniper', 'mender', 'bomber', 'warden'];
      this.spawnEnemy(starter[i % starter.length]);
    }

    for (let i = 0; i < 6; i += 1) {
      this.spawnChestNearPlayer(360 + i * 130);
    }

    this.ensureBossCount();
    this.nextEnemySpawnAt = 900;
    this.nextChestAt = 10500;
  }

  private cssColorToNumber(color: string) {
    return Number.parseInt(color.replace('#', ''), 16);
  }

  private getTeamSpawnPosition(teamKey = this.localTeamKey || this.selectedTeamKey) {
    const team = TEAM_OPTIONS.find((entry) => entry.key === this.normalizeTeamKey(teamKey)) ?? TEAM_OPTIONS[0];
    return {
      x: clamp(team.spawnX + Phaser.Math.Between(-160, 160), 80, WORLD_WIDTH - 80),
      y: clamp(team.spawnY + Phaser.Math.Between(-160, 160), 80, WORLD_HEIGHT - 80),
    };
  }

  private formatClock(ms: number) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  private getRoomRemainingMs() {
    if (!this.latestRoomState) {
      return undefined;
    }

    return Math.max(0, this.latestRoomState.remainingMs - (this.elapsedMs - this.roomStateSyncedAt));
  }

  private getNextRampageMs() {
    if (this.latestRoomState?.nextRampageMs === undefined) {
      return undefined;
    }

    return Math.max(0, this.latestRoomState.nextRampageMs - (this.elapsedMs - this.roomStateSyncedAt));
  }

  private getBattleRoyaleZone() {
    return this.latestRoomState?.room.battleRoyaleZone ?? this.currentRoom?.battleRoyaleZone;
  }

  private isBattleRoyaleRoom() {
    return (this.latestRoomState?.room.mode ?? this.currentRoom?.mode) === 'battleRoyale';
  }

  private getBattleRoyaleZoneStatus() {
    if (!this.isBattleRoyaleRoom()) {
      return '';
    }

    const zone = this.getBattleRoyaleZone();
    if (!zone) {
      return '';
    }

    const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, zone.centerX, zone.centerY);
    const margin = Math.round(zone.radius - distance);
    return margin >= 0 ? `安全圈 ${Math.round(zone.radius)} 余 ${margin}` : `圈外 ${Math.abs(margin)}`;
  }

  private getSystemAnnouncementText() {
    if (this.pendingWeather) {
      const remaining = Math.max(0, Math.ceil((this.pendingWeather.startsAt - this.elapsedMs) / 1000));
      return `天气 ${WEATHER_SPECS[this.pendingWeather.key].name}预警 ${remaining}s`;
    }

    if (this.currentWeather !== 'sunny') {
      const remaining = Math.max(0, Math.ceil((this.weatherActiveUntil - this.elapsedMs) / 1000));
      return `天气 ${WEATHER_SPECS[this.currentWeather].name} ${remaining}s`;
    }

    const nextRampageMs = this.getNextRampageMs();
    if (nextRampageMs !== undefined && nextRampageMs <= 5 * 60 * 1000) {
      return `狂暴小兵倒计时 ${this.formatClock(nextRampageMs)}`;
    }

    return '';
  }

  private updateBattleRoyaleZone() {
    if (!this.isBattleRoyaleRoom()) {
      return;
    }
    const zone = this.getBattleRoyaleZone();
    if (!zone || !zone.outsideIsLethal || this.isGameOver) {
      return;
    }

    const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, zone.centerX, zone.centerY);
    const margin = zone.radius - distance;
    if (margin <= 0) {
      this.executeLocalPlayer('缩圈闪电');
      return;
    }

    if (margin < 220 && this.elapsedMs - this.lastBattleZoneWarningAt > 3500) {
      this.lastBattleZoneWarningAt = this.elapsedMs;
      this.showAnnouncement(`安全圈边缘 ${Math.round(margin)}m，圈外会被闪电击败`, 2600);
    }
  }

  private reconcileLocalPlayerFromServer(player: NetworkPlayer) {
    if (!this.isInMultiplayerRoom || !this.player?.active) {
      return;
    }

    if (!player.alive) {
      this.executeLocalPlayer('服务端判定');
      return;
    }

    const dx = player.x - this.player.x;
    const dy = player.y - this.player.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 1800) {
      this.player.setPosition(player.x, player.y);
      this.moveTarget = undefined;
      this.serverCorrectionUntil = this.elapsedMs + 220;
    } else if (distance > 36) {
      const pull = distance > 520 ? 0.22 : 0.08;
      this.player.setPosition(this.player.x + dx * pull, this.player.y + dy * pull);
      this.serverCorrectionUntil = this.elapsedMs + 180;
    }

    const serverMaxHp = clamp(player.maxHp ?? this.maxHp, 1, 900);
    if (serverMaxHp > this.maxHp || this.maxHp - serverMaxHp > 80) {
      this.maxHp = serverMaxHp;
    }

    const serverHp = clamp(player.hp ?? this.hp, 0, this.maxHp);
    if (serverHp <= 0) {
      this.executeLocalPlayer('服务端判定');
    } else if (serverHp < this.hp || Math.abs(serverHp - this.hp) > 35) {
      this.hp = serverHp;
    }
  }

  private sendNetworkState() {
    if (!this.socket?.connected || !this.isInMultiplayerRoom) {
      return;
    }

    if (this.elapsedMs - this.lastNetworkSendAt < 80) {
      return;
    }

    this.lastNetworkSendAt = this.elapsedMs;
    this.socket.emit('player:state', {
      x: this.player.x,
      y: this.player.y,
      angle: this.player.rotation,
      alive: !this.isGameOver,
      hp: this.hp,
      maxHp: this.maxHp,
    });
  }

  private makeLocalEntityId(prefix: string) {
    const socketPart = this.localSocketId || this.socket?.id || 'local';
    const id = `${prefix}:${socketPart}:${this.elapsedMs.toFixed(0)}:${this.nextEntityId}`;
    this.nextEntityId += 1;
    return id;
  }

  private registerPveEntity(enemy: Phaser.Physics.Arcade.Sprite) {
    const id = enemy.getData('entityId') as string | undefined;
    if (!id || !this.socket?.connected || !this.isInMultiplayerRoom) {
      return;
    }

    this.socket.emit('pve:entity-spawned', {
      id,
      kind: enemy.getData('kind'),
      tier: enemy.getData('tier'),
      x: enemy.x,
      y: enemy.y,
    });
  }

  private registerChestEntity(chest: Phaser.Physics.Arcade.Image) {
    const id = chest.getData('entityId') as string | undefined;
    if (!id || !this.socket?.connected || !this.isInMultiplayerRoom) {
      return;
    }

    this.socket.emit('loot:chest-spawned', {
      id,
      x: chest.x,
      y: chest.y,
    });
  }

  private requestEnemyKillReward(
    enemy: Phaser.Physics.Arcade.Sprite,
    onReward: (reward: ServerKillReward) => void,
    onFailure?: () => void,
  ) {
    if (!this.socket?.connected || !this.isInMultiplayerRoom) {
      onFailure?.();
      return;
    }

    this.requestEnemyKillRewardById({
      id: enemy.getData('entityId'),
      kind: enemy.getData('kind'),
      tier: enemy.getData('tier'),
      x: enemy.x,
      y: enemy.y,
    }, onReward, onFailure);
  }

  private requestEnemyKillRewardById(
    snapshot: { id: unknown; kind: unknown; tier: unknown; x: number; y: number },
    onReward: (reward: ServerKillReward) => void,
    onFailure?: () => void,
  ) {
    if (!this.socket?.connected || !this.isInMultiplayerRoom) {
      onFailure?.();
      return;
    }

    this.socket.emit(
      'pve:enemy-killed',
      snapshot,
      (response: { ok?: boolean; error?: string; reward?: ServerKillReward }) => {
        if (!response?.ok || !response.reward) {
          if (response?.error) {
            this.showAnnouncement(response.error, 1800);
          }
          onFailure?.();
          return;
        }

        onReward(response.reward);
      },
    );
  }

  private requestChestReward(chest: Phaser.Physics.Arcade.Image, onReward: (reward: ServerKillReward) => void, onFailure?: () => void) {
    if (!this.socket?.connected || !this.isInMultiplayerRoom) {
      onFailure?.();
      return;
    }

    const x = chest.x;
    const y = chest.y;
    this.socket.emit(
      'loot:chest-opened',
      { id: chest.getData('entityId'), x, y },
      (response: { ok?: boolean; error?: string; reward?: ServerKillReward }) => {
        if (!response?.ok || !response.reward) {
          if (response?.error) {
            this.showAnnouncement(response.error, 1800);
          }
          onFailure?.();
          return;
        }

        onReward(response.reward);
      },
    );
  }

  private applyServerReward(reward: ServerKillReward, x: number, y: number, options?: { skipXp?: boolean }) {
    if (!options?.skipXp) {
      const xp = clamp(reward.xp ?? 0, 0, 2000);
      if (xp > 0) {
        this.spawnXpOrb(x, y, xp);
      }
    }

    reward.drops?.forEach((drop) => {
      if (drop.type === 'chest') {
        this.spawnChestAt(x, y);
      } else if (drop.type === 'buff' && drop.buff) {
        this.spawnBuffAt(x, y, drop.buff);
      } else if (drop.type === 'vehicle' && drop.vehicle) {
        this.spawnVehiclePod(x, y, drop.vehicle);
      } else if (drop.type === 'bossVehicle' && drop.vehicle) {
        this.grantPermanentVehicle(x, y, drop.vehicle);
      } else if (drop.type === 'heal') {
        const amount = clamp(drop.amount ?? 0, 0, this.maxHp);
        this.hp = clamp(this.hp + amount, 0, this.maxHp);
        this.healPulse(x, y, 46);
      }
    });
  }

  private handleInvasionWave(wave: number) {
    if (!this.isInMultiplayerRoom || this.isGameOver) {
      return;
    }

    this.showAnnouncement(`第 ${wave} 波高仇恨入侵`, 5200);
    this.playCue('rampage');

    const count = clamp(8 + wave * 3, 8, 26);
    for (let i = 0; i < count; i += 1) {
      const kind: EnemyKind = i % 4 === 0 ? 'crusher' : i % 3 === 0 ? 'warden' : 'stalker';
      const tier: EnemyTier = wave >= 3 && i % 5 === 0 ? 'red' : 'purple';
      const enemy = this.spawnEnemy(kind, tier);
      enemy.setData('aggro', 100);
      enemy.setData('anchorX', this.player.x);
      enemy.setData('anchorY', this.player.y);
    }

    this.addThreatNoise(this.player.x, this.player.y, 90, 1000);
  }

  private handleRampageWave(wave: number) {
    if (!this.isInMultiplayerRoom || this.isGameOver) {
      return;
    }

    this.showAnnouncement(`狂暴小兵来袭 ${wave}`, 5200);
    this.playCue('rampage');

    const count = clamp(10 + wave * 2, 10, 32);
    const kinds: EnemyKind[] = ['raider', 'spark', 'stalker', 'mortar', 'shielder'];
    for (let i = 0; i < count; i += 1) {
      const kind = kinds[i % kinds.length];
      const tier: EnemyTier = wave >= 6 && i % 6 === 0 ? 'red' : wave >= 3 && i % 4 === 0 ? 'purple' : 'blue';
      const enemy = this.spawnEnemy(kind, tier);
      enemy.setData('aggro', 100);
      enemy.setData('anchorX', this.player.x);
      enemy.setData('anchorY', this.player.y);
      enemy.setData('rampage', true);
    }

    this.addThreatNoise(this.player.x, this.player.y, 110, 1180);
  }

  private showJoinMessage(payload: { message?: string; player?: NetworkPlayer; name?: string; teamKey?: string; teamName?: string }) {
    if (!this.isInMultiplayerRoom) {
      return;
    }

    const name = payload.player?.name || payload.name?.trim() || '真人玩家';
    const teamName = payload.player?.teamName || payload.teamName || `${payload.player?.teamKey || payload.teamKey || ''} 阵营`;
    this.showAnnouncement(payload.message || `真人加入：${name} 加入 ${teamName}`, 3500);
  }

  private showAnnouncement(message: string, durationMs = 3500) {
    this.invasionMessage = message;
    this.invasionMessageUntil = this.elapsedMs + Math.max(900, durationMs);
  }

  private hideAnnouncement() {
    this.invasionMessage = '';
    this.invasionMessageUntil = 0;
    this.announcementClose?.destroy();
    this.announcementClose = undefined;
    const readout = this.children.getByName('invasion-readout') as Phaser.GameObjects.Text | null;
    readout?.setVisible(false);
  }

  private updateWeather(deltaSeconds: number) {
    if (this.pendingWeather && this.elapsedMs >= this.pendingWeather.startsAt) {
      this.startWeather(this.pendingWeather);
      this.pendingWeather = undefined;
    }

    if (this.currentWeather !== 'sunny' && this.elapsedMs >= this.weatherActiveUntil) {
      this.endWeather();
    }

    if (this.currentWeather === 'sunny' && !this.pendingWeather && this.elapsedMs >= this.nextWeatherDecisionAt) {
      if (Math.random() < 0.68) {
        this.nextWeatherDecisionAt = this.elapsedMs + Phaser.Math.Between(18000, 42000);
      } else {
        const key = Phaser.Utils.Array.GetRandom(WEATHER_KEYS);
        const durationMs = Math.min(WEATHER_MAX_DURATION_MS, Phaser.Math.Between(25000, 60000));
        this.pendingWeather = {
          key,
          startsAt: this.elapsedMs + WEATHER_NOTICE_MS,
          durationMs,
        };
        this.nextWeatherDecisionAt = this.pendingWeather.startsAt + durationMs;
        this.showAnnouncement(`${WEATHER_SPECS[key].announce}，10 秒后生效`, 4200);
      }
    }

    if (this.currentWeather === 'storm') {
      this.updateStorm(deltaSeconds);
    }
    if (this.currentWeather === 'meteor') {
      this.updateMeteor();
    }

    this.drawWeatherEffects();
  }

  private startWeather(weather: PendingWeather) {
    this.currentWeather = weather.key;
    this.weatherActiveUntil = this.elapsedMs + weather.durationMs;
    this.showAnnouncement(`${WEATHER_SPECS[weather.key].name}开始，持续 ${Math.ceil(weather.durationMs / 1000)} 秒`, 3600);
    if (weather.key === 'storm') {
      this.nextLightningAt = this.elapsedMs + Phaser.Math.Between(1200, 2600);
    }
    if (weather.key === 'meteor') {
      this.nextMeteorAt = this.elapsedMs + Phaser.Math.Between(1600, 3200);
    }
    this.playCue('weather');
  }

  private endWeather() {
    this.currentWeather = 'sunny';
    this.weatherActiveUntil = 0;
    this.nextWeatherDecisionAt = this.elapsedMs + Phaser.Math.Between(22000, 52000);
    this.nextLightningAt = 0;
    this.nextMeteorAt = 0;
    this.snowSlideX = 0;
    this.snowSlideY = 0;
    this.showAnnouncement(WEATHER_SPECS.sunny.announce, 2200);
  }

  private updateStorm(_deltaSeconds: number) {
    if (this.elapsedMs < this.nextLightningAt) {
      return;
    }

    this.nextLightningAt = this.elapsedMs + Phaser.Math.Between(2200, 4200);
    this.createLightningStrike();
  }

  private updateMeteor() {
    if (this.elapsedMs < this.nextMeteorAt) {
      return;
    }

    this.nextMeteorAt = this.elapsedMs + Phaser.Math.Between(2600, 5200);
    this.createMeteorStrike();
  }

  private createMeteorStrike() {
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const distance = Phaser.Math.Between(120, 360);
    const x = clamp(this.player.x + Math.cos(angle) * distance, 70, WORLD_WIDTH - 70);
    const y = clamp(this.player.y + Math.sin(angle) * distance, 70, WORLD_HEIGHT - 70);
    const radius = Phaser.Math.Between(84, 118);
    const strike: LightningStrike = { x, y, radius };

    const warning = this.add
      .circle(x, y, radius, 0xff5d6f, 0.1)
      .setStrokeStyle(3, 0xff5d6f, 0.82)
      .setDepth(64);
    this.tweens.add({
      targets: warning,
      scale: 0.42,
      alpha: 0.76,
      yoyo: true,
      repeat: 2,
      duration: 190,
      ease: 'Sine.easeInOut',
      onComplete: () => warning.destroy(),
    });
    this.time.delayedCall(1150, () => this.resolveMeteorStrike(strike));
  }

  private resolveMeteorStrike(strike: LightningStrike) {
    if (!this.isInMultiplayerRoom || this.isGameOver) {
      return;
    }

    const meteor = this.add.circle(strike.x - 80, strike.y - 280, 14, 0xf5c542, 0.92).setDepth(83);
    this.tweens.add({
      targets: meteor,
      x: strike.x,
      y: strike.y,
      duration: 140,
      ease: 'Cubic.easeIn',
      onComplete: () => meteor.destroy(),
    });
    this.shockwave(strike.x, strike.y, strike.radius, 0xff5d6f);
    this.flashAt(strike.x, strike.y, 0xf5c542, 18);
    this.splashDamage(strike.x, strike.y, strike.radius, 46);
    this.splashDamageChests(strike.x, strike.y, strike.radius, 28);

    const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, strike.x, strike.y);
    if (distance <= strike.radius) {
      this.damagePlayer(42, '流星冲击');
    }
  }

  private createLightningStrike() {
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const distance = Phaser.Math.Between(80, 260);
    const x = clamp(this.player.x + Math.cos(angle) * distance, 50, WORLD_WIDTH - 50);
    const y = clamp(this.player.y + Math.sin(angle) * distance, 50, WORLD_HEIGHT - 50);
    const radius = Phaser.Math.Between(62, 86);
    const strike: LightningStrike = { x, y, radius };
    this.lightningStrikes.push(strike);

    const warning = this.add
      .circle(x, y, radius, 0xf5c542, 0.12)
      .setStrokeStyle(3, 0xf5c542, 0.88)
      .setDepth(64);
    this.tweens.add({
      targets: warning,
      scale: 0.36,
      alpha: 0.72,
      yoyo: true,
      repeat: 2,
      duration: 150,
      ease: 'Sine.easeInOut',
      onComplete: () => warning.destroy(),
    });
    this.time.delayedCall(950, () => this.resolveLightningStrike(strike));
  }

  private resolveLightningStrike(strike: LightningStrike) {
    this.lightningStrikes = this.lightningStrikes.filter((entry) => entry !== strike);
    if (!this.isInMultiplayerRoom || this.isGameOver) {
      return;
    }

    const bolt = this.add
      .line(0, 0, strike.x - 24, strike.y - 780, strike.x, strike.y, 0xbfefff, 0.95)
      .setOrigin(0)
      .setLineWidth(5)
      .setDepth(82);
    const core = this.add.circle(strike.x, strike.y, 16, 0xe8f7f4, 0.95).setDepth(83);
    this.shockwave(strike.x, strike.y, strike.radius, 0x4d8eff);
    this.flashAt(strike.x, strike.y, 0xbfefff, 15);
    this.tweens.add({
      targets: [bolt, core],
      alpha: 0,
      duration: 180,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        bolt.destroy();
        core.destroy();
      },
    });

    const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, strike.x, strike.y);
    if (distance <= strike.radius) {
      this.damagePlayer(32, '雷击');
    }
  }

  private drawWeatherEffects() {
    if (!this.weatherOverlay) {
      return;
    }

    this.weatherOverlay.clear();
    if (!this.isInMultiplayerRoom || this.currentWeather === 'sunny') {
      return;
    }

    const width = this.scale.width;
    const height = this.scale.height;
    const t = this.elapsedMs;

    if (this.currentWeather === 'wind') {
      this.weatherOverlay.lineStyle(2, 0xbfefff, 0.24);
      for (let i = 0; i < 38; i += 1) {
        const x = ((i * 79 + t * 0.42) % (width + 220)) - 120;
        const y = ((i * 43 + t * 0.08) % (height + 80)) - 40;
        this.weatherOverlay.lineBetween(x, y, x + 92, y - 18);
      }
      return;
    }

    if (this.currentWeather === 'snow') {
      this.weatherOverlay.fillStyle(0xdfefff, 0.08);
      this.weatherOverlay.fillRect(0, 0, width, height);
      this.weatherOverlay.fillStyle(0xffffff, 0.72);
      for (let i = 0; i < 72; i += 1) {
        const x = (i * 53 + Math.sin(t / 900 + i) * 36) % (width + 12);
        const y = (i * 97 + t * 0.055) % (height + 18);
        this.weatherOverlay.fillCircle(x, y, 1.5 + (i % 3) * 0.65);
      }
      return;
    }

    if (this.currentWeather === 'fog') {
      this.weatherOverlay.fillStyle(0xa9b4b8, 0.34);
      this.weatherOverlay.fillRect(0, 0, width, height);
      for (let i = 0; i < 8; i += 1) {
        const y = ((i * 91 + t * 0.018) % (height + 120)) - 80;
        this.weatherOverlay.fillStyle(0xd9e2e0, 0.11);
        this.weatherOverlay.fillRoundedRect(-40, y, width + 80, 42, 8);
      }
      this.weatherOverlay.lineStyle(34, 0x050709, 0.16);
      this.weatherOverlay.strokeRect(8, 8, width - 16, height - 16);
      return;
    }

    if (this.currentWeather === 'storm') {
      this.weatherOverlay.fillStyle(0x06101a, 0.24);
      this.weatherOverlay.fillRect(0, 0, width, height);
      this.weatherOverlay.lineStyle(2, 0x9ec8ff, 0.34);
      for (let i = 0; i < 84; i += 1) {
        const x = ((i * 47 + t * 0.3) % (width + 80)) - 40;
        const y = ((i * 67 + t * 0.62) % (height + 90)) - 60;
        this.weatherOverlay.lineBetween(x, y, x + 14, y + 54);
      }
      if (this.lightningStrikes.length > 0 || Math.floor(t / 120) % 37 === 0) {
        this.weatherOverlay.fillStyle(0xcfefff, 0.11);
        this.weatherOverlay.fillRect(0, 0, width, height);
      }
      return;
    }

    if (this.currentWeather === 'heat') {
      this.weatherOverlay.fillStyle(0x3a1608, 0.14);
      this.weatherOverlay.fillRect(0, 0, width, height);
      this.weatherOverlay.lineStyle(2, 0xf5c542, 0.16);
      for (let i = 0; i < 18; i += 1) {
        const y = ((i * 41 + t * 0.026) % (height + 60)) - 30;
        this.weatherOverlay.lineBetween(0, y + Math.sin(t / 450 + i) * 4, width, y + Math.sin(t / 530 + i) * 4);
      }
      return;
    }

    if (this.currentWeather === 'meteor') {
      this.weatherOverlay.fillStyle(0x180b10, 0.16);
      this.weatherOverlay.fillRect(0, 0, width, height);
      this.weatherOverlay.lineStyle(2, 0xf5c542, 0.22);
      for (let i = 0; i < 18; i += 1) {
        const x = ((i * 113 + t * 0.42) % (width + 160)) - 80;
        const y = ((i * 71 + t * 0.22) % (height + 160)) - 80;
        this.weatherOverlay.lineBetween(x, y, x - 46, y - 82);
      }
    }
  }

  private syncRemotePlayers(players: NetworkPlayer[]) {
    if (!this.isInMultiplayerRoom) {
      return;
    }

    const seen = new Set<string>();
    players.forEach((player) => {
      if (player.socketId === this.localSocketId) {
        return;
      }

      seen.add(player.socketId);
      let view = this.remotePlayers.get(player.socketId);
      if (!view) {
        const sprite = this.physics.add.sprite(player.x, player.y, VEHICLES.mech.texture);
        sprite.setDepth(19);
        sprite.setCollideWorldBounds(false);
        const body = sprite.body as Phaser.Physics.Arcade.Body;
        body.setAllowGravity(false);
        body.enable = false;

        const label = this.add
          .text(player.x, player.y - 42, player.name, {
            fontFamily: 'Inter, "Segoe UI", sans-serif',
            fontSize: '13px',
            color: '#e8f7f4',
            backgroundColor: 'rgba(5,7,9,0.58)',
            padding: { x: 5, y: 2 },
          })
          .setOrigin(0.5)
          .setDepth(22);
        const crown = this.add
          .text(player.x, player.y - 62, '', {
            fontFamily: '"Segoe UI Emoji", "Apple Color Emoji", Inter, "Segoe UI", sans-serif',
            fontSize: '12px',
            color: '#ffd166',
          })
          .setOrigin(0.5)
          .setDepth(23);

        view = { sprite, label, crown, targetX: player.x, targetY: player.y, targetAngle: player.angle };
        this.remotePlayers.set(player.socketId, view);
      }

      view.targetX = player.x;
      view.targetY = player.y;
      view.targetAngle = player.angle;
      const tint = player.teamKey === this.localTeamKey ? this.localTeamTint : this.cssColorToNumber(player.color);
      view.sprite.setTint(tint);
      view.sprite.setAlpha(player.alive ? 0.86 : 0.18);
      view.sprite.setVisible(player.alive);
      view.label.setText(player.name);
      view.label.setColor(player.teamKey === this.localTeamKey ? '#9fffe0' : '#ffb4ae');
      view.label.setVisible(player.alive);
      view.crown.setText(player.crown ? `\u{1F451}${Math.min(9, player.crown)}` : '');
      view.crown.setVisible(player.alive && Boolean(player.crown));
    });

    this.remotePlayers.forEach((view, socketId) => {
      if (seen.has(socketId)) {
        return;
      }

      view.sprite.destroy();
      view.label.destroy();
      view.crown.destroy();
      this.remotePlayers.delete(socketId);
    });
  }

  private updateRemotePlayerViews(deltaSeconds = 1 / 60) {
    if (!this.latestRoomState) {
      return;
    }

    this.syncRemotePlayers(this.latestRoomState.players);

    const lerpFactor = 0.14;
    this.remotePlayers.forEach((view) => {
      const prevLean = (view.sprite.getData('lean') as number | undefined) ?? 0;
      // strip last frame's lean offset so rotation lerps cleanly toward aim
      view.sprite.rotation -= prevLean;

      const prevX = view.sprite.x;
      const prevY = view.sprite.y;
      const dx = view.targetX - view.sprite.x;
      const dy = view.targetY - view.sprite.y;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        const nx = view.sprite.x + dx * lerpFactor;
        const ny = view.sprite.y + dy * lerpFactor;
        view.sprite.setPosition(nx, ny);
        view.label.setPosition(nx, ny - 42);
        view.crown.setPosition(nx, ny - 62);
      }
      view.sprite.setRotation(Phaser.Math.Angle.RotateTo(view.sprite.rotation, view.targetAngle, 0.18));

      const safeDelta = Math.max(0.001, deltaSeconds);
      const vx = (view.sprite.x - prevX) / safeDelta;
      const vy = (view.sprite.y - prevY) / safeDelta;
      this.updateVehicleBodyAnim(view.sprite, vx, vy, deltaSeconds);
    });
  }

  private updateLocalCrownView() {
    const existing = this.children.getByName('local-crown-readout') as Phaser.GameObjects.Text | null;
    const nameExisting = this.children.getByName('local-name-readout') as Phaser.GameObjects.Text | null;
    const showName = this.isInMultiplayerRoom && this.player?.active;

    if (nameExisting) {
      if (showName) {
        nameExisting.setText(this.getPlayerName());
        nameExisting.setPosition(this.player.x, this.player.y - 42);
        nameExisting.setVisible(true);
      } else {
        nameExisting.setVisible(false);
      }
    } else if (showName) {
      this.add
        .text(this.player.x, this.player.y - 42, this.getPlayerName(), {
          fontFamily: 'Inter, "Segoe UI", sans-serif',
          fontSize: '13px',
          color: '#e8f7f4',
          backgroundColor: 'rgba(5,7,9,0.58)',
          padding: { x: 5, y: 2 },
        })
        .setName('local-name-readout')
        .setOrigin(0.5)
        .setDepth(67);
    }

    if (this.localCrown <= 0 || !this.player?.active || !this.isInMultiplayerRoom) {
      existing?.setVisible(false);
      return;
    }

    const text = `👑${Math.min(9, this.localCrown)}`;
    if (existing) {
      existing.setText(text);
      existing.setPosition(this.player.x, this.player.y - 62);
      existing.setVisible(true);
      return;
    }

    this.add
      .text(this.player.x, this.player.y - 62, text, {
        fontFamily: '"Segoe UI Emoji", "Apple Color Emoji", Inter, "Segoe UI", sans-serif',
        fontSize: '14px',
        color: '#ffda8a',
        stroke: '#050709',
        strokeThickness: 2,
      })
      .setName('local-crown-readout')
      .setOrigin(0.5)
      .setDepth(68);
  }

  private syncSummonButton() {
    if (!this.isInMultiplayerRoom || !this.isTeamLeader) {
      this.summonButton?.remove();
      this.summonButton = undefined;
      return;
    }

    if (!this.summonButton) {
      const button = document.createElement('button');
      button.className = 'summon-button';
      button.type = 'button';
      button.addEventListener('click', () => {
        if (!this.socket?.connected || this.elapsedMs < this.summonReadyAt) {
          return;
        }

        this.socket.emit('team:summon', {}, (response: { ok?: boolean; error?: string; cooldownMs?: number }) => {
          if (!response?.ok) {
            this.showAnnouncement(response?.error || '召集失败', 3000);
            return;
          }

          this.summonReadyAt = this.elapsedMs + (response.cooldownMs ?? 0);
          this.syncSummonButton();
        });
      });
      document.body.appendChild(button);
      this.summonButton = button;
    }

    const remaining = Math.max(0, Math.ceil((this.summonReadyAt - this.elapsedMs) / 1000));
    this.summonButton.disabled = remaining > 0;
    this.summonButton.textContent = remaining > 0 ? `召集 ${remaining}s` : '召集队友';
  }

  private syncOnlineButton() {
    if (!this.isInMultiplayerRoom) {
      this.onlineButton?.remove();
      this.onlineButton = undefined;
      this.onlinePanel?.remove();
      this.onlinePanel = undefined;
      return;
    }

    if (this.onlineButton) {
      return;
    }

    const button = document.createElement('button');
    button.className = 'online-button';
    button.type = 'button';
    button.textContent = '在线用户';
    button.addEventListener('click', () => this.toggleOnlinePanel());
    document.body.appendChild(button);
    this.onlineButton = button;
  }

  private syncExitButton() {
    if (!this.isInMultiplayerRoom) {
      this.exitButton?.remove();
      this.exitButton = undefined;
      return;
    }

    if (this.exitButton) {
      return;
    }

    const button = document.createElement('button');
    button.className = 'exit-button';
    button.type = 'button';
    button.textContent = '退出房间';
    button.addEventListener('click', () => this.leaveRoomToLobby());
    document.body.appendChild(button);
    this.exitButton = button;
  }

  private syncMobileControls() {
    if (!this.isInMultiplayerRoom) {
      this.mobileControls?.remove();
      this.mobileControls = undefined;
      this.removeJoystick();
      this.removeMobileSkillPanel();
      return;
    }

    if (!this.mobileControls) {
      const panel = document.createElement('div');
      panel.className = 'mobile-controls';

      const landscape = document.createElement('button');
      landscape.type = 'button';
      landscape.textContent = '横屏全屏';
      landscape.addEventListener('click', () => this.requestLandscapeMode());

      const decrease = document.createElement('button');
      decrease.type = 'button';
      decrease.textContent = '-索敌';
      decrease.addEventListener('click', () => this.adjustTargetRange(-TARGET_RANGE_STEP));

      const increase = document.createElement('button');
      increase.type = 'button';
      increase.textContent = '+索敌';
      increase.addEventListener('click', () => this.adjustTargetRange(TARGET_RANGE_STEP));

      panel.append(landscape, decrease, increase);
      document.body.appendChild(panel);
      this.mobileControls = panel;
    }
    this.syncJoystick();
    this.syncMobileSkillPanel();
  }

  private syncMobileSkillPanel() {
    if (!this.isInMultiplayerRoom || this.isGameOver) {
      this.removeMobileSkillPanel();
      return;
    }
    if (this.mobileSkillPanel) {
      this.refreshMobileSkillButtons();
      return;
    }
    const panel = document.createElement('div');
    panel.className = 'mobile-skills';
    SKILL_ORDER.forEach((key) => {
      const spec = SKILLS[key];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `mobile-skill mobile-skill-${key}`;
      button.dataset.skill = key;
      button.innerHTML = `<span class="mobile-skill-icon">${spec.icon}</span><span class="mobile-skill-label">就绪</span>`;
      const activate = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        this.activateSkill(key);
      };
      button.addEventListener('pointerdown', activate);
      panel.appendChild(button);
      this.mobileSkillButtons[key] = button;
    });
    document.body.appendChild(panel);
    this.mobileSkillPanel = panel;
    this.refreshMobileSkillButtons();
  }

  private refreshMobileSkillButtons() {
    SKILL_ORDER.forEach((key) => {
      const button = this.mobileSkillButtons[key];
      if (!button) {
        return;
      }
      const ready = this.elapsedMs >= this.skillReadyAt[key];
      const active = this.isSkillActive(key);
      const cooldownMs = Math.max(0, this.skillReadyAt[key] - this.elapsedMs);
      const labelEl = button.querySelector<HTMLSpanElement>('.mobile-skill-label');
      if (labelEl) {
        if (active) {
          labelEl.textContent = '进行';
        } else if (ready) {
          labelEl.textContent = '就绪';
        } else {
          labelEl.textContent = `${(cooldownMs / 1000).toFixed(1)}s`;
        }
      }
      button.classList.toggle('is-ready', ready && !active);
      button.classList.toggle('is-active', active);
      button.classList.toggle('is-cooldown', !ready && !active);
    });
  }

  private removeMobileSkillPanel() {
    this.mobileSkillPanel?.remove();
    this.mobileSkillPanel = undefined;
    this.mobileSkillButtons = {};
  }

  private syncJoystick() {
    if (!this.isInMultiplayerRoom || this.isGameOver) {
      this.removeJoystick();
      return;
    }

    if (this.joystick) {
      return;
    }

    const joystick = document.createElement('div');
    joystick.className = 'virtual-joystick';
    const base = document.createElement('div');
    base.className = 'virtual-joystick-base';
    const knob = document.createElement('div');
    knob.className = 'virtual-joystick-knob';
    joystick.append(base, knob);

    const updateJoystick = (event: PointerEvent) => {
      const rect = joystick.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const maxDistance = rect.width * 0.34;
      const rawX = event.clientX - centerX;
      const rawY = event.clientY - centerY;
      const distance = Math.hypot(rawX, rawY);
      const scale = distance > maxDistance ? maxDistance / distance : 1;
      const x = rawX * scale;
      const y = rawY * scale;
      const normX = x / maxDistance;
      const normY = y / maxDistance;
      const normLen = Math.hypot(normX, normY);
      const deadzone = 0.18;
      if (normLen < deadzone) {
        this.joystickVector.set(0, 0);
      } else {
        const eased = (normLen - deadzone) / (1 - deadzone);
        const scaled = Math.min(1, eased);
        this.joystickVector.set((normX / normLen) * scaled, (normY / normLen) * scaled);
      }
      knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
    };

    const resetJoystick = () => {
      this.joystickPointerId = undefined;
      this.joystickVector.set(0, 0);
      knob.style.transform = 'translate(-50%, -50%)';
    };

    joystick.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.ensureAudioContext();
      this.joystickPointerId = event.pointerId;
      joystick.setPointerCapture(event.pointerId);
      updateJoystick(event);
    });
    joystick.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.joystickPointerId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      updateJoystick(event);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((eventName) => {
      joystick.addEventListener(eventName, (event) => {
        const pointerEvent = event as PointerEvent;
        if (pointerEvent.pointerId !== undefined && pointerEvent.pointerId !== this.joystickPointerId) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        resetJoystick();
      });
    });

    document.body.appendChild(joystick);
    this.joystick = joystick;
    this.joystickKnob = knob;
  }

  private removeJoystick() {
    this.joystick?.remove();
    this.joystick = undefined;
    this.joystickKnob = undefined;
    this.joystickPointerId = undefined;
    this.joystickVector.set(0, 0);
  }

  private requestLandscapeMode() {
    this.ensureAudioContext();

    const tryLockOrientation = async () => {
      this.scale.refresh();
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (orientation: string) => Promise<void>;
      };
      if (!orientation?.lock) {
        this.showAnnouncement('已进入全屏，请手动旋转手机到横屏', 3000);
        return;
      }

      try {
        await orientation.lock('landscape-primary').catch(() => orientation.lock?.('landscape'));
        window.setTimeout(() => this.scale.refresh(), 280);
        this.showAnnouncement('已进入横屏全屏', 1800);
      } catch {
        this.scale.refresh();
        this.showAnnouncement('请打开系统自动旋转后横拿手机', 3600);
      }
    };

    if (document.fullscreenElement) {
      void tryLockOrientation();
      return;
    }

    const onFullscreenChange = () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.setTimeout(() => void tryLockOrientation(), 120);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);

    const target = document.documentElement as FullscreenElement;

    const requestFullscreen =
      target.requestFullscreen?.bind(target) ??
      (target as FullscreenElement & { webkitRequestFullscreen?: typeof target.requestFullscreen }).webkitRequestFullscreen?.bind(target);

    if (!requestFullscreen) {
      void tryLockOrientation();
      return;
    }

    Promise.resolve(requestFullscreen({ navigationUI: 'hide' } as FullscreenOptions)).catch(() => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      this.showAnnouncement('全屏请求被浏览器拦截，请手动旋转手机', 3000);
    });
  }

  private isLowFxMode() {
    return this.scale.width <= 960 || this.scale.height <= 540 || (navigator.hardwareConcurrency ?? 8) <= 4;
  }

  private ensureAudioContext() {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      return undefined;
    }

    if (!this.audioContext) {
      this.audioContext = new AudioContextCtor();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => undefined);
    }
    return this.audioContext;
  }

  private playTone(frequency: number, durationMs: number, gain = 0.035, type: OscillatorType = 'sine') {
    const context = this.ensureAudioContext();
    if (!context) {
      return;
    }

    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    envelope.gain.setValueAtTime(0.0001, context.currentTime);
    envelope.gain.exponentialRampToValueAtTime(gain, context.currentTime + 0.015);
    envelope.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + durationMs / 1000);
    oscillator.connect(envelope);
    envelope.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + durationMs / 1000 + 0.03);
  }

  // --- Advanced procedural sound engine (jsfxr-style synthesis) ---
  private sfxNoise(duration: number, gain: number, hpFreq?: number, lpFreq?: number) {
    const ctx = this.ensureAudioContext();
    if (!ctx) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    let node: AudioNode = src;
    if (hpFreq) {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = hpFreq;
      node.connect(hp);
      node = hp;
    }
    if (lpFreq) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = lpFreq;
      node.connect(lp);
      node = lp;
    }
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, ctx.currentTime);
    env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    node.connect(env);
    env.connect(ctx.destination);
    src.start();
    src.stop(ctx.currentTime + duration + 0.02);
  }

  private sfxSweep(startFreq: number, endFreq: number, duration: number, gain: number, type: OscillatorType = 'sine') {
    const ctx = this.ensureAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), ctx.currentTime + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, ctx.currentTime);
    env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(env);
    env.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  }

  private sfxNoiseSweep(hpStart: number, hpEnd: number, lpStart: number, lpEnd: number, duration: number, gain: number) {
    const ctx = this.ensureAudioContext();
    if (!ctx) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(hpStart, ctx.currentTime);
    hp.frequency.exponentialRampToValueAtTime(Math.max(20, hpEnd), ctx.currentTime + duration);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(lpStart, ctx.currentTime);
    lp.frequency.exponentialRampToValueAtTime(Math.max(20, lpEnd), ctx.currentTime + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, ctx.currentTime);
    env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    src.connect(hp);
    hp.connect(lp);
    lp.connect(env);
    env.connect(ctx.destination);
    src.start();
    src.stop(ctx.currentTime + duration + 0.02);
  }

  private sfxLaserShot() {
    this.sfxSweep(1200, 150, 0.12, 0.09, 'sawtooth');
    this.sfxNoise(0.06, 0.04, 2000);
  }

  private sfxRocketShot() {
    this.sfxNoiseSweep(800, 200, 4000, 600, 0.2, 0.07);
    this.sfxSweep(180, 80, 0.25, 0.05, 'sawtooth');
  }

  private sfxExplosion() {
    // sub-bass rumble
    this.sfxSweep(140, 28, 0.55, 0.1, 'sawtooth');
    this.sfxSweep(90, 32, 0.6, 0.08, 'triangle');
    // body of the blast
    this.sfxNoise(0.4, 0.13, 60, 3800);
    // delayed boom resonance
    this.time.delayedCall(70, () => this.sfxSweep(180, 60, 0.32, 0.07, 'sawtooth'));
    this.time.delayedCall(160, () => this.sfxNoise(0.22, 0.06, 40, 1400));
  }

  private sfxHit() {
    // sharp transient
    this.sfxNoise(0.04, 0.08, 1400, 6500);
    this.sfxSweep(820, 240, 0.06, 0.045, 'square');
    // metallic ping body
    this.sfxSweep(1400, 1600, 0.05, 0.025, 'sine');
  }

  private sfxDamage() {
    // body
    this.sfxNoise(0.12, 0.09, 360, 2800);
    // low impact thump
    this.sfxSweep(320, 90, 0.18, 0.065, 'sawtooth');
    this.sfxSweep(140, 50, 0.22, 0.05, 'triangle');
  }

  private sfxHeal() {
    this.sfxSweep(440, 880, 0.18, 0.05, 'sine');
    this.time.delayedCall(70, () => this.sfxSweep(660, 1320, 0.18, 0.04, 'sine'));
    this.time.delayedCall(140, () => this.sfxSweep(880, 1760, 0.16, 0.03, 'triangle'));
  }

  private sfxPickup() {
    this.sfxSweep(520, 980, 0.08, 0.045, 'triangle');
    this.time.delayedCall(50, () => this.sfxSweep(780, 1320, 0.1, 0.04, 'sine'));
    this.time.delayedCall(100, () => this.sfxNoise(0.04, 0.02, 2400, 7200));
  }

  private sfxShoot(texture: string) {
    switch (texture) {
      case 'shot-missile':
      case 'shot-shell':
        this.sfxRocketShot();
        break;
      case 'shot-grenade':
        this.sfxRocketShot();
        break;
      case 'shot-saw':
        this.sfxNoiseSweep(300, 1500, 2000, 6000, 0.12, 0.05);
        this.sfxSweep(200, 400, 0.1, 0.03, 'sawtooth');
        break;
      case 'shot-cryo':
        this.sfxNoiseSweep(3000, 6000, 6000, 12000, 0.1, 0.04);
        this.sfxSweep(1200, 2400, 0.1, 0.03, 'sine');
        break;
      case 'shot-tesla':
        this.sfxNoise(0.08, 0.06, 1500, 5000);
        this.sfxSweep(200, 800, 0.08, 0.04, 'square');
        break;
      case 'shot-beam':
        this.sfxSweep(300, 1800, 0.15, 0.05, 'sine');
        this.sfxNoise(0.1, 0.03, 3000);
        break;
      case 'shot-orbital':
        this.sfxExplosion();
        break;
      case 'shot-ion':
        this.sfxSweep(400, 2200, 0.2, 0.06, 'sawtooth');
        this.sfxNoise(0.06, 0.05, 2000);
        break;
      case 'shot-flame':
        this.sfxNoiseSweep(300, 900, 3600, 1400, 0.09, 0.045);
        break;
      default:
        this.sfxLaserShot();
        break;
    }
  }

  private playCue(kind: 'upgrade' | 'chest' | 'boss' | 'death' | 'weather' | 'rampage' | 'vehicle' | 'levelup' | 'kill' | 'crit' | 'bossKill') {
    switch (kind) {
      case 'upgrade':
        this.sfxSweep(400, 800, 0.1, 0.05, 'sine');
        this.time.delayedCall(80, () => this.sfxSweep(600, 1200, 0.15, 0.045, 'sine'));
        this.time.delayedCall(160, () => this.sfxSweep(800, 1600, 0.12, 0.035, 'sine'));
        break;
      case 'levelup':
        // ascending major chord stack — C5 E5 G5 C6 — each note a brief envelope
        this.sfxSweep(523, 784, 0.14, 0.065, 'triangle');
        this.playTone(659, 220, 0.045, 'sine');
        this.time.delayedCall(90, () => { this.sfxSweep(659, 988, 0.16, 0.058, 'triangle'); this.playTone(784, 220, 0.04, 'sine'); });
        this.time.delayedCall(180, () => { this.sfxSweep(784, 1318, 0.2, 0.052, 'sine'); this.playTone(1046, 240, 0.04, 'sine'); });
        this.time.delayedCall(280, () => { this.sfxSweep(1046, 1568, 0.22, 0.048, 'sine'); this.sfxNoise(0.06, 0.025, 2400, 7200); });
        break;
      case 'kill':
        // crunch + metallic ping
        this.sfxSweep(820, 280, 0.07, 0.05, 'square');
        this.sfxNoise(0.05, 0.03, 1600, 6000);
        this.time.delayedCall(50, () => this.playTone(1568, 110, 0.025, 'sine'));
        break;
      case 'crit':
        this.sfxSweep(1600, 520, 0.1, 0.075, 'sawtooth');
        this.sfxNoise(0.07, 0.055, 2400, 6800);
        this.time.delayedCall(40, () => this.sfxSweep(1000, 320, 0.09, 0.055, 'square'));
        this.time.delayedCall(90, () => this.playTone(2093, 140, 0.03, 'sine'));
        break;
      case 'bossKill':
        // big sub drop + triumphant ascending tail
        this.sfxSweep(240, 70, 0.5, 0.1, 'sawtooth');
        this.sfxSweep(120, 36, 0.55, 0.08, 'triangle');
        this.sfxNoise(0.5, 0.12, 50, 3000);
        this.time.delayedCall(180, () => { this.sfxSweep(440, 880, 0.3, 0.075, 'triangle'); this.playTone(523, 320, 0.04, 'sine'); });
        this.time.delayedCall(360, () => { this.sfxSweep(660, 1320, 0.34, 0.065, 'sine'); this.playTone(880, 380, 0.04, 'sine'); });
        this.time.delayedCall(540, () => { this.playTone(1318, 360, 0.04, 'sine'); this.playTone(1568, 360, 0.03, 'sine'); });
        break;
      case 'chest':
        this.sfxSweep(300, 600, 0.08, 0.04, 'triangle');
        this.time.delayedCall(70, () => this.sfxSweep(500, 900, 0.1, 0.04, 'triangle'));
        this.time.delayedCall(140, () => { this.sfxSweep(700, 1400, 0.15, 0.04, 'sine'); this.sfxNoise(0.05, 0.02, 3000, 8000); });
        break;
      case 'boss':
        this.sfxNoise(0.4, 0.1, 50, 2000);
        this.sfxSweep(100, 40, 0.5, 0.07, 'sawtooth');
        this.time.delayedCall(200, () => this.sfxSweep(80, 30, 0.4, 0.06, 'square'));
        break;
      case 'death':
        this.sfxNoise(0.3, 0.09, 100, 3000);
        this.sfxSweep(400, 60, 0.5, 0.07, 'sawtooth');
        this.time.delayedCall(200, () => this.sfxSweep(200, 40, 0.4, 0.05, 'triangle'));
        break;
      case 'weather':
        this.sfxNoiseSweep(200, 400, 3000, 800, 0.3, 0.04);
        this.time.delayedCall(150, () => this.sfxSweep(300, 100, 0.3, 0.035, 'sine'));
        break;
      case 'rampage':
        this.sfxSweep(200, 600, 0.1, 0.05, 'square');
        this.time.delayedCall(100, () => this.sfxSweep(300, 800, 0.1, 0.05, 'square'));
        this.time.delayedCall(200, () => { this.sfxNoise(0.12, 0.06, 200, 3000); this.sfxSweep(250, 100, 0.2, 0.04, 'sawtooth'); });
        break;
      case 'vehicle':
        this.sfxSweep(200, 600, 0.1, 0.05, 'triangle');
        this.time.delayedCall(80, () => { this.sfxSweep(500, 1000, 0.12, 0.04, 'triangle'); this.sfxNoise(0.08, 0.03, 1000, 4000); });
        break;
    }
  }

  private adjustTargetRange(delta: number) {
    this.targetRange = clamp(this.targetRange + delta, TARGET_RANGE_MIN, TARGET_RANGE_MAX);
  }

  private toggleOnlinePanel() {
    if (this.onlinePanel) {
      this.onlinePanel.remove();
      this.onlinePanel = undefined;
      return;
    }

    const panel = document.createElement('div');
    panel.className = 'online-panel';
    document.body.appendChild(panel);
    this.onlinePanel = panel;
    this.renderOnlinePanel();
  }

  private renderOnlinePanel() {
    if (!this.onlinePanel) {
      return;
    }

    const players = this.getUniqueOnlinePlayers();
    this.onlinePanel.replaceChildren();

    const head = document.createElement('div');
    head.className = 'online-head';
    const title = document.createElement('div');
    title.className = 'online-title';
    title.textContent = '在线用户';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '关闭';
    close.addEventListener('click', () => {
      this.onlinePanel?.remove();
      this.onlinePanel = undefined;
    });
    head.append(title, close);

    const grid = document.createElement('div');
    grid.className = 'online-grid';
    TEAM_OPTIONS.forEach((team) => {
      const column = document.createElement('section');
      column.className = 'online-team';
      column.style.setProperty('--team-color', team.color);

      const teamTitle = document.createElement('div');
      teamTitle.className = 'online-team-title';
      const teamPlayers = players
        .filter((player) => player.teamKey === team.key)
        .sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0));
      teamTitle.textContent = `${team.name} ${teamPlayers.length}`;
      column.appendChild(teamTitle);

      if (teamPlayers.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'online-empty';
        empty.textContent = '暂无真人';
        column.appendChild(empty);
      } else {
        teamPlayers.forEach((player) => {
          const row = document.createElement('div');
          row.className = `online-player${player.alive ? '' : ' is-dead'}`;

          const name = document.createElement('span');
          name.className = 'online-name';
          name.textContent = `${player.teamLeader ? '★ ' : ''}${player.name}${player.socketId === this.localSocketId ? '（你）' : ''}`;

          const crown = document.createElement('span');
          crown.className = 'online-crown';
          crown.textContent = player.crown ? `👑${Math.min(9, player.crown)}` : '';

          row.append(name, crown);
          column.appendChild(row);
        });
      }

      grid.appendChild(column);
    });

    this.onlinePanel.append(head, grid);
  }

  private getUniqueOnlinePlayers() {
    const players = this.latestRoomState?.players ?? [];
    const byUserId = new Map<string, NetworkPlayer>();
    players.forEach((player) => {
      const key = player.userId || player.socketId;
      const existing = byUserId.get(key);
      if (!existing) {
        byUserId.set(key, player);
        return;
      }

      byUserId.set(key, {
        ...existing,
        ...player,
        socketId: existing.socketId === this.localSocketId ? existing.socketId : player.socketId,
        name: existing.name || player.name,
        crown: Math.max(existing.crown ?? 0, player.crown ?? 0),
        teamLeader: Boolean(existing.teamLeader || player.teamLeader),
        joinedAt: Math.min(existing.joinedAt ?? Number.MAX_SAFE_INTEGER, player.joinedAt ?? Number.MAX_SAFE_INTEGER),
        aliveSince: Math.min(existing.aliveSince ?? Number.MAX_SAFE_INTEGER, player.aliveSince ?? Number.MAX_SAFE_INTEGER),
        alive: Boolean(existing.alive || player.alive),
      });
    });
    return [...byUserId.values()];
  }

  private handleTeamSummon(payload: {
    teamKey: string;
    leaderSocketId: string;
    leaderName: string;
    x: number;
    y: number;
    cooldownMs: number;
    message?: string;
  }) {
    if (payload.teamKey !== this.localTeamKey) {
      return;
    }

    this.summonReadyAt = this.elapsedMs + payload.cooldownMs;
    this.showAnnouncement(payload.message || `${payload.leaderName} 召集了队友`, 4200);
    this.flashAt(payload.x, payload.y, this.localTeamTint || 0x4d8eff, 18);
    if (payload.leaderSocketId !== this.localSocketId) {
      this.player.setPosition(
        clamp(payload.x + Phaser.Math.Between(-72, 72), 60, WORLD_WIDTH - 60),
        clamp(payload.y + Phaser.Math.Between(-72, 72), 60, WORLD_HEIGHT - 60),
      );
      this.moveTarget = undefined;
      this.flashAt(this.player.x, this.player.y, this.localTeamTint || 0x4d8eff, 18);
      this.sendNetworkState();
    }
    this.syncSummonButton();
  }

  private handleRoomEnd(payload: {
    winner: { key: string; name: string; color: string; score: number };
    scores: Record<string, number>;
  }) {
    if (!this.isInMultiplayerRoom) {
      return;
    }

    this.isGameOver = true;
    this.physics.pause();
    this.gameOverLayer?.destroy(true);
    this.gameOverLayer = undefined;
    this.gameOverPanel?.remove();
    this.gameOverPanel = undefined;
    this.removeJoystick();

    const width = this.scale.width;
    const height = this.scale.height;
    const isWinner = payload.winner.key === this.localTeamKey;
    const container = this.add.container(0, 0).setScrollFactor(0).setDepth(1350);
    const overlay = this.add.rectangle(0, 0, width, height, 0x050709, 0.78).setOrigin(0);
    const title = this.add
      .text(width / 2, height / 2 - 86, isWinner ? '阵营胜利' : '战区结算', {
        fontFamily: 'Inter, "Segoe UI", sans-serif',
        fontSize: '42px',
        color: payload.winner.color,
      })
      .setOrigin(0.5);
    const detail = this.add
      .text(
        width / 2,
        height / 2 - 22,
        `${payload.winner.name} 获胜   ${payload.winner.score} 分   3 秒后进入下一局`,
        {
          fontFamily: 'Inter, "Segoe UI", sans-serif',
          fontSize: '18px',
          color: '#e8f7f4',
        },
      )
      .setOrigin(0.5);
    const button = this.add
      .rectangle(width / 2, height / 2 + 58, 190, 48, 0x111a1f, 1)
      .setStrokeStyle(2, 0x4d8eff)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(width / 2, height / 2 + 58, '继续下一局', {
        fontFamily: 'Inter, "Segoe UI", sans-serif',
        fontSize: '18px',
        color: '#e8f7f4',
      })
      .setOrigin(0.5);
    let resumed = false;
    const startNextRound = () => {
      if (resumed || !this.isInMultiplayerRoom) {
        return;
      }
      resumed = true;
      container.destroy(true);
      if (this.gameOverLayer === container) {
        this.gameOverLayer = undefined;
      }
      this.clearRunObjects();
      this.resetRunState(true);
      const statePlayer = this.latestRoomState?.players.find((player) => player.socketId === this.localSocketId);
      const spawn = statePlayer ?? this.getTeamSpawnPosition();
      this.player.setPosition(spawn.x, spawn.y);
      this.applyPreservedBossVehicleOrMech(false);
      this.player.setTint(this.localTeamTint || 0xffffff);
      this.spawnInitialWorld();
      this.physics.resume();
      this.syncJoystick();
      this.sendNetworkState();
    };
    button.on('pointerover', () => button.setFillStyle(0x17252a, 1));
    button.on('pointerout', () => button.setFillStyle(0x111a1f, 1));
    button.on('pointerdown', startNextRound);
    label.setInteractive({ useHandCursor: true }).on('pointerdown', startNextRound);
    container.add([overlay, title, detail, button, label]);
    this.gameOverLayer = container;
    this.time.delayedCall(3000, startNextRound);
  }

  update(_time: number, delta: number) {
    this.drawHud();
    this.drawTargetRing();
    this.drawBattleRoyaleZone();
    if (_time >= this.nextUiSyncAt) {
      this.nextUiSyncAt = _time + 180;
      this.syncSummonButton();
      this.syncExitButton();
      this.syncMobileControls();
    }

    if (!this.isInMultiplayerRoom) {
      this.weatherOverlay?.clear();
      this.battleZoneGraphics?.clear();
      return;
    }

    if (this.isGameOver) {
      this.drawWeatherEffects();
      return;
    }

    this.elapsedMs += delta;
    const deltaSeconds = delta / 1000;
    this.updateUpgradeChoiceTimer();

    if (this.currentVehicle !== 'mech' && this.elapsedMs >= this.vehicleExpiresAt) {
      this.timeoutVehicle();
    }

    this.updateBuffs(deltaSeconds);
    this.updateWeather(deltaSeconds);
    this.updateBattleRoyaleZone();
    if (!this.isChoosingUpgrade) {
      this.handleTargetRangeInput();
      this.handleSkillInput();
      this.updatePlayer(deltaSeconds);
      this.updateSprintTrail();
    } else {
      this.player.setVelocity(0, 0);
      this.handleUpgradeHotkeys();
    }
    this.updateProjectiles(delta);
    this.updateEnemyProjectiles(delta);
    this.updateEnemies(deltaSeconds);
    this.updateSpawns();
    this.autoFire();
    this.updateWeaponSystems(deltaSeconds);
    this.updateRemotePlayerViews(deltaSeconds);
    this.drawUnitShadows();
    this.updateLocalCrownView();
    this.sendNetworkState();
    this.drawEnemyBars();
  }

  private createTextures() {
    this.makeTexture('grid-tile', 256, 256, (g) => {
      // deep gradient background
      g.fillStyle(0x040712, 1);
      g.fillRect(0, 0, 256, 256);
      g.fillStyle(0x08152a, 0.6);
      g.fillRect(0, 0, 256, 128);
      // fine grid
      g.lineStyle(1, 0x0a3a5e, 0.5);
      for (let i = 0; i <= 256; i += 32) {
        g.lineBetween(i, 0, i, 256);
        g.lineBetween(0, i, 256, i);
      }
      // strong central axes
      g.lineStyle(1.5, 0x4d8eff, 0.32);
      g.lineBetween(0, 128, 256, 128);
      g.lineBetween(128, 0, 128, 256);
      // corner markers / bracket motifs
      g.lineStyle(1.5, 0x4d8eff, 0.55);
      const drawBracket = (x: number, y: number) => {
        g.lineBetween(x, y, x + 12, y);
        g.lineBetween(x, y, x, y + 12);
      };
      drawBracket(2, 2);
      g.lineStyle(1.5, 0x4d8eff, 0.55);
      g.lineBetween(254, 2, 242, 2);
      g.lineBetween(254, 2, 254, 14);
      g.lineBetween(2, 254, 14, 254);
      g.lineBetween(2, 254, 2, 242);
      g.lineBetween(254, 254, 242, 254);
      g.lineBetween(254, 254, 254, 242);
      // intersection nodes
      g.fillStyle(0x4d8eff, 0.55);
      g.fillRect(126, 126, 4, 4);
      g.fillStyle(0xb285ff, 0.7);
      g.fillCircle(128, 128, 1.5);
      // accent diagonals (subtle)
      g.lineStyle(1, 0xb285ff, 0.18);
      g.lineBetween(0, 0, 256, 256);
      g.lineBetween(256, 0, 0, 256);
    });

    this.makeTexture('unit-mech', 58, 44, (g) => {
      // base hull glow
      g.fillStyle(0x001a26, 1);
      g.fillRoundedRect(9, 6, 36, 32, 6);
      // chest plate
      g.fillStyle(0x0a2a36, 1);
      g.fillRoundedRect(11, 8, 32, 28, 5);
      g.lineStyle(2.5, 0x4d8eff, 1);
      g.strokeRoundedRect(11, 8, 32, 28, 5);
      // chest emblem
      g.fillStyle(0x4d8eff, 0.85);
      g.fillTriangle(27, 12, 21, 32, 33, 32);
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(27, 22, 2.5);
      // shoulder armor
      g.fillStyle(0x06181f, 1);
      g.fillRoundedRect(2, 13, 12, 9, 2);
      g.fillRoundedRect(2, 23, 12, 9, 2);
      g.lineStyle(1.5, 0x4d8eff, 0.85);
      g.strokeRoundedRect(2, 13, 12, 9, 2);
      g.strokeRoundedRect(2, 23, 12, 9, 2);
      // arm cannons with glowing barrels
      g.fillStyle(0x10242a, 1);
      g.fillRoundedRect(40, 16, 16, 6, 2);
      g.fillRoundedRect(40, 25, 16, 6, 2);
      g.fillStyle(0xb6ff3a, 1);
      g.fillRect(52, 18, 4, 2);
      g.fillRect(52, 27, 4, 2);
      // accent lines
      g.lineStyle(1, 0xb285ff, 0.9);
      g.lineBetween(14, 36, 40, 36);
      g.fillStyle(0xf5c542, 1);
      g.fillRect(42, 21, 4, 7);
    });

    this.makeTexture('unit-bike', 68, 34, (g) => {
      // hover wheels (neon halos)
      g.fillStyle(0x00131c, 1);
      g.fillCircle(14, 25, 9);
      g.fillCircle(52, 25, 9);
      g.lineStyle(3, 0x4d8eff, 1);
      g.strokeCircle(14, 25, 8);
      g.strokeCircle(52, 25, 8);
      g.fillStyle(0xb285ff, 1);
      g.fillCircle(14, 25, 2.5);
      g.fillCircle(52, 25, 2.5);
      // chassis body
      g.fillStyle(0x06141c, 1);
      g.fillRoundedRect(16, 10, 36, 13, 4);
      g.lineStyle(1.5, 0x4d8eff, 0.85);
      g.strokeRoundedRect(16, 10, 36, 13, 4);
      // cockpit canopy
      g.fillStyle(0x9ec8ff, 0.85);
      g.fillTriangle(22, 10, 36, 4, 36, 10);
      // nose / thruster
      g.fillStyle(0xf5c542, 1);
      g.fillTriangle(50, 11, 67, 17, 50, 23);
      g.fillStyle(0xffffff, 0.95);
      g.fillTriangle(54, 14, 64, 17, 54, 20);
      // racing stripe
      g.lineStyle(1.5, 0xb285ff, 1);
      g.lineBetween(18, 17, 50, 17);
    });

    this.makeTexture('unit-tank', 76, 54, (g) => {
      // tracks
      g.fillStyle(0x040707, 1);
      g.fillRoundedRect(5, 4, 60, 7, 2);
      g.fillRoundedRect(5, 43, 60, 7, 2);
      g.fillStyle(0x14201a, 1);
      for (let i = 8; i <= 60; i += 6) {
        g.fillRect(i, 5, 4, 5);
        g.fillRect(i, 44, 4, 5);
      }
      // main hull
      g.fillStyle(0x0c1d12, 1);
      g.fillRoundedRect(7, 8, 56, 38, 5);
      g.lineStyle(2.5, 0xb6ff3a, 1);
      g.strokeRoundedRect(7, 8, 56, 38, 5);
      // turret
      g.fillStyle(0x18301c, 1);
      g.fillRoundedRect(17, 15, 29, 24, 5);
      g.lineStyle(1.5, 0xb6ff3a, 0.9);
      g.strokeRoundedRect(17, 15, 29, 24, 5);
      g.fillStyle(0x9ec8ff, 0.95);
      g.fillCircle(32, 27, 4);
      // main cannon
      g.fillStyle(0x070d09, 1);
      g.fillRoundedRect(42, 23, 32, 8, 2);
      g.fillStyle(0xf5c542, 1);
      g.fillRect(70, 24, 4, 6);
      // chevrons
      g.lineStyle(1.5, 0xb285ff, 1);
      g.lineBetween(20, 19, 26, 22);
      g.lineBetween(26, 22, 20, 25);
    });

    this.makeTexture('unit-fighter', 78, 58, (g) => {
      // wing shadow
      g.fillStyle(0x000810, 1);
      g.fillTriangle(6, 29, 56, 6, 72, 29);
      g.fillTriangle(6, 29, 56, 52, 72, 29);
      // main wing
      g.fillStyle(0x06182a, 1);
      g.fillTriangle(8, 29, 56, 8, 70, 29);
      g.fillTriangle(8, 29, 56, 50, 70, 29);
      g.lineStyle(2.5, 0x4d8eff, 1);
      g.strokeTriangle(8, 29, 56, 8, 70, 29);
      g.strokeTriangle(8, 29, 56, 50, 70, 29);
      // fuselage
      g.fillStyle(0x081f30, 1);
      g.fillRoundedRect(28, 22, 38, 14, 4);
      // cockpit canopy
      g.fillStyle(0xb285ff, 0.95);
      g.fillTriangle(34, 26, 56, 22, 56, 36);
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(48, 29, 2);
      // nose tip
      g.fillStyle(0xf5c542, 1);
      g.fillRect(62, 26, 14, 7);
      g.fillStyle(0xb6ff3a, 1);
      g.fillRect(72, 27, 4, 5);
      // wing accents
      g.lineStyle(1.5, 0xb285ff, 0.95);
      g.lineBetween(20, 18, 38, 30);
      g.lineBetween(20, 40, 38, 28);
    });

    this.makeTexture('unit-hover', 74, 46, (g) => {
      // hover thrust glow
      g.fillStyle(0x4d8eff, 0.18);
      g.fillEllipse(37, 36, 56, 10);
      // hull
      g.fillStyle(0x05141c, 1);
      g.fillRoundedRect(10, 12, 50, 22, 11);
      g.lineStyle(2.5, 0x4d8eff, 1);
      g.strokeRoundedRect(10, 12, 50, 22, 11);
      // canopy strip
      g.fillStyle(0x9ec8ff, 0.9);
      g.fillRoundedRect(18, 16, 32, 6, 3);
      g.fillStyle(0xffffff, 0.85);
      g.fillRect(36, 17, 8, 4);
      // hover pods
      g.fillStyle(0x081f2a, 1);
      g.fillCircle(16, 23, 6);
      g.fillCircle(58, 23, 6);
      g.lineStyle(1.5, 0xb285ff, 0.95);
      g.strokeCircle(16, 23, 5);
      g.strokeCircle(58, 23, 5);
      // nose blaster
      g.fillStyle(0xf5c542, 1);
      g.fillTriangle(50, 15, 72, 23, 50, 31);
      g.fillStyle(0xffffff, 0.9);
      g.fillTriangle(58, 19, 68, 23, 58, 27);
    });

    this.makeTexture('unit-railgun', 82, 44, (g) => {
      // hull
      g.fillStyle(0x05121f, 1);
      g.fillRoundedRect(7, 12, 52, 24, 5);
      g.lineStyle(2.5, 0x9ec8ff, 1);
      g.strokeRoundedRect(7, 12, 52, 24, 5);
      // panel detail
      g.fillStyle(0x0a2840, 1);
      g.fillRoundedRect(12, 16, 18, 16, 2);
      g.lineStyle(1, 0x4d8eff, 0.9);
      g.strokeRoundedRect(12, 16, 18, 16, 2);
      g.fillStyle(0xb285ff, 1);
      g.fillCircle(21, 24, 2.5);
      // rail barrels
      g.fillStyle(0x0e2030, 1);
      g.fillRect(20, 17, 34, 12);
      g.fillStyle(0x9ec8ff, 1);
      g.fillRect(47, 18, 32, 5);
      g.fillRect(47, 26, 32, 5);
      g.fillStyle(0xffffff, 0.9);
      g.fillRect(74, 19, 4, 3);
      g.fillRect(74, 27, 4, 3);
      // landing struts
      g.fillStyle(0x05101a, 1);
      g.fillCircle(18, 37, 4);
      g.fillCircle(48, 37, 4);
      g.lineStyle(1, 0x4d8eff, 0.85);
      g.strokeCircle(18, 37, 4);
      g.strokeCircle(48, 37, 4);
    });

    this.makeTexture('unit-walker', 68, 58, (g) => {
      // hull
      g.fillStyle(0x14092a, 1);
      g.fillRoundedRect(18, 13, 30, 26, 5);
      g.lineStyle(2.5, 0xb285ff, 1);
      g.strokeRoundedRect(18, 13, 30, 26, 5);
      // canopy
      g.fillStyle(0xb285ff, 0.85);
      g.fillRoundedRect(22, 16, 22, 9, 3);
      g.fillStyle(0xffffff, 0.85);
      g.fillCircle(38, 20, 1.8);
      // weapon arm
      g.fillStyle(0x0c1f10, 1);
      g.fillRect(33, 22, 28, 8);
      g.fillStyle(0xb6ff3a, 1);
      g.fillRect(35, 23, 24, 6);
      g.fillStyle(0xffffff, 0.95);
      g.fillRect(56, 24, 4, 4);
      // legs
      g.lineStyle(3, 0x6a4ec9, 1);
      g.lineBetween(22, 38, 9, 53);
      g.lineBetween(44, 38, 57, 53);
      g.lineBetween(22, 16, 8, 4);
      g.lineBetween(44, 16, 58, 4);
      // foot joints
      g.fillStyle(0xf5c542, 1);
      g.fillCircle(9, 53, 3);
      g.fillCircle(57, 53, 3);
      g.fillCircle(8, 4, 3);
      g.fillCircle(58, 4, 3);
    });

    this.makeTexture('unit-artillery', 82, 48, (g) => {
      // hull
      g.fillStyle(0x261d09, 1);
      g.fillRoundedRect(8, 12, 54, 26, 5);
      g.lineStyle(2.5, 0xf5c542, 1);
      g.strokeRoundedRect(8, 12, 54, 26, 5);
      // ammo loader
      g.fillStyle(0x140e05, 1);
      g.fillRect(12, 16, 14, 18);
      g.lineStyle(1, 0xf59a2c, 0.9);
      g.strokeRect(12, 16, 14, 18);
      g.fillStyle(0xff5d6f, 1);
      g.fillCircle(19, 21, 2);
      g.fillCircle(19, 29, 2);
      // missile rack
      g.fillStyle(0xff5d6f, 1);
      g.fillRect(34, 12, 39, 6);
      g.fillRect(34, 21, 39, 6);
      g.fillRect(34, 30, 39, 6);
      g.fillStyle(0xf5c542, 1);
      g.fillRect(70, 13, 4, 4);
      g.fillRect(70, 22, 4, 4);
      g.fillRect(70, 31, 4, 4);
      // treads
      g.fillStyle(0x040504, 1);
      g.fillCircle(20, 39, 4);
      g.fillCircle(50, 39, 4);
      g.lineStyle(1, 0xf59a2c, 0.7);
      g.strokeCircle(20, 39, 4);
      g.strokeCircle(50, 39, 4);
    });

    this.makeTexture('unit-buggy', 74, 42, (g) => {
      // chassis
      g.fillStyle(0x051421, 1);
      g.fillRoundedRect(10, 13, 46, 18, 5);
      g.lineStyle(2.5, 0x4d8eff, 1);
      g.strokeRoundedRect(10, 13, 46, 18, 5);
      // canopy
      g.fillStyle(0x9ec8ff, 0.92);
      g.fillRoundedRect(28, 7, 18, 8, 3);
      g.fillStyle(0xffffff, 0.85);
      g.fillRect(36, 9, 6, 4);
      // booster
      g.fillStyle(0xf5c542, 1);
      g.fillTriangle(54, 14, 72, 22, 54, 30);
      g.fillStyle(0xb285ff, 1);
      g.fillTriangle(60, 17, 70, 22, 60, 27);
      // wheels
      g.fillStyle(0x040506, 1);
      g.fillCircle(19, 33, 7);
      g.fillCircle(50, 33, 7);
      g.lineStyle(1.5, 0x4d8eff, 0.85);
      g.strokeCircle(19, 33, 6);
      g.strokeCircle(50, 33, 6);
      g.fillStyle(0xb285ff, 1);
      g.fillCircle(19, 33, 2);
      g.fillCircle(50, 33, 2);
    });

    this.makeTexture('unit-laser-van', 80, 48, (g) => {
      // hull
      g.fillStyle(0x031628, 1);
      g.fillRoundedRect(9, 11, 54, 28, 6);
      g.lineStyle(2.5, 0x9ec8ff, 1);
      g.strokeRoundedRect(9, 11, 54, 28, 6);
      // core glow
      g.fillStyle(0xb285ff, 0.45);
      g.fillCircle(36, 25, 12);
      g.fillStyle(0xb285ff, 1);
      g.fillCircle(36, 25, 7);
      g.fillStyle(0xffffff, 0.95);
      g.fillCircle(36, 25, 3);
      // side vents
      g.fillStyle(0x05223a, 1);
      g.fillRect(13, 16, 6, 18);
      g.lineStyle(1, 0x4d8eff, 0.85);
      g.strokeRect(13, 16, 6, 18);
      // laser emitter
      g.fillStyle(0x9ec8ff, 1);
      g.fillRect(48, 22, 30, 5);
      g.fillStyle(0xffffff, 0.95);
      g.fillRect(72, 22, 6, 5);
      // antenna
      g.lineStyle(1.5, 0xb285ff, 1);
      g.lineBetween(20, 11, 26, 4);
    });

    this.makeTexture('unit-flame-rig', 84, 50, (g) => {
      // hull
      g.fillStyle(0x2d0a08, 1);
      g.fillRoundedRect(8, 12, 56, 28, 6);
      g.lineStyle(2.5, 0xf59a2c, 1);
      g.strokeRoundedRect(8, 12, 56, 28, 6);
      // canopy
      g.fillStyle(0xf5c542, 0.55);
      g.fillRoundedRect(14, 16, 18, 8, 3);
      // fuel tanks
      g.fillStyle(0x140605, 1);
      g.fillRoundedRect(36, 16, 12, 18, 3);
      g.lineStyle(1.5, 0xf5c542, 0.95);
      g.strokeRoundedRect(36, 16, 12, 18, 3);
      g.fillStyle(0xff5d6f, 1);
      g.fillCircle(42, 21, 2);
      g.fillCircle(42, 29, 2);
      // flame nozzle
      g.fillStyle(0xff5d6f, 1);
      g.fillRect(50, 19, 28, 8);
      g.fillStyle(0xf5c542, 1);
      g.fillTriangle(72, 14, 83, 23, 72, 32);
      g.fillStyle(0xffffff, 0.95);
      g.fillTriangle(76, 19, 82, 23, 76, 27);
      // wheels
      g.fillStyle(0x040506, 1);
      g.fillCircle(22, 41, 4);
      g.fillCircle(54, 41, 4);
      g.lineStyle(1, 0xf59a2c, 0.85);
      g.strokeCircle(22, 41, 4);
      g.strokeCircle(54, 41, 4);
    });

    this.makeTexture('enemy-drone', 38, 38, (g) => {
      g.fillStyle(0x001a26, 1);
      g.fillCircle(19, 19, 14);
      g.fillStyle(0x062430, 1);
      g.fillCircle(19, 19, 12);
      g.lineStyle(2.5, 0x4d8eff, 1);
      g.strokeCircle(19, 19, 13);
      // eye
      g.fillStyle(0xff5d6f, 1);
      g.fillCircle(25, 19, 5);
      g.fillStyle(0xffffff, 0.95);
      g.fillCircle(26, 18, 2);
      // antenna
      g.lineStyle(2, 0x4d8eff, 0.85);
      g.lineBetween(2, 19, 36, 19);
      g.fillStyle(0x9ec8ff, 1);
      g.fillCircle(3, 19, 1.6);
      g.fillCircle(35, 19, 1.6);
    });

    this.makeTexture('enemy-stalker', 46, 34, (g) => {
      g.fillStyle(0x2a1a06, 1);
      g.fillRoundedRect(8, 9, 27, 14, 4);
      g.lineStyle(2.5, 0xf59a2c, 1);
      g.strokeRoundedRect(8, 9, 27, 14, 4);
      // visor
      g.fillStyle(0xff5d6f, 0.95);
      g.fillRect(11, 13, 18, 5);
      g.fillStyle(0xffffff, 0.9);
      g.fillRect(24, 14, 4, 3);
      // claw
      g.fillStyle(0xff5d6f, 1);
      g.fillTriangle(32, 12, 45, 17, 32, 22);
      g.fillStyle(0xf5c542, 1);
      g.fillTriangle(36, 14, 43, 17, 36, 20);
      // limbs
      g.lineStyle(2, 0xf59a2c, 0.95);
      g.lineBetween(13, 23, 6, 32);
      g.lineBetween(24, 23, 19, 32);
      g.lineBetween(14, 9, 6, 2);
      g.lineBetween(27, 9, 35, 2);
    });

    this.makeTexture('enemy-hopper', 44, 42, (g) => {
      g.fillStyle(0x041a2a, 1);
      g.fillRoundedRect(10, 10, 24, 18, 5);
      g.lineStyle(2.5, 0x4d8eff, 1);
      g.strokeRoundedRect(10, 10, 24, 18, 5);
      // eye
      g.fillStyle(0xff5d6f, 1);
      g.fillCircle(28, 18, 5);
      g.fillStyle(0xffffff, 0.95);
      g.fillCircle(29, 17, 2);
      // visor stripe
      g.fillStyle(0x9ec8ff, 0.85);
      g.fillRect(13, 14, 14, 3);
      // legs
      g.lineStyle(3, 0x4d8eff, 0.95);
      g.lineBetween(14, 27, 6, 40);
      g.lineBetween(30, 27, 38, 40);
      g.lineBetween(14, 10, 7, 3);
      g.lineBetween(30, 10, 37, 3);
      g.fillStyle(0xf5c542, 1);
      g.fillCircle(6, 40, 2);
      g.fillCircle(38, 40, 2);
    });

    this.makeTexture('enemy-leaper', 58, 50, (g) => {
      g.fillStyle(0x320a28, 1);
      g.fillRoundedRect(10, 9, 34, 26, 6);
      g.lineStyle(3, 0xb285ff, 1);
      g.strokeRoundedRect(10, 9, 34, 26, 6);
      // eyes
      g.fillStyle(0xff5d6f, 1);
      g.fillCircle(20, 18, 3);
      g.fillCircle(33, 18, 3);
      g.fillStyle(0xffffff, 0.95);
      g.fillCircle(21, 17, 1.2);
      g.fillCircle(34, 17, 1.2);
      // mouth
      g.fillStyle(0xf5c542, 1);
      g.fillRect(18, 26, 18, 4);
      // claw
      g.fillStyle(0xf5c542, 1);
      g.fillTriangle(39, 16, 55, 25, 39, 34);
      g.fillStyle(0xb285ff, 1);
      g.fillTriangle(43, 19, 53, 25, 43, 31);
      // limbs
      g.lineStyle(3, 0xb285ff, 0.95);
      g.lineBetween(15, 34, 4, 48);
      g.lineBetween(39, 34, 51, 48);
      g.lineBetween(18, 9, 10, 1);
      g.lineBetween(36, 9, 47, 1);
    });

    this.makeTexture('enemy-warden', 52, 52, (g) => {
      g.fillStyle(0x062213, 1);
      g.fillRoundedRect(11, 9, 30, 34, 5);
      g.lineStyle(2.5, 0xb6ff3a, 1);
      g.strokeRoundedRect(11, 9, 30, 34, 5);
      // chest core
      g.fillStyle(0xb6ff3a, 0.9);
      g.fillCircle(26, 26, 6);
      g.fillStyle(0xffffff, 0.95);
      g.fillCircle(26, 26, 2.5);
      // antennas
      g.fillStyle(0xf5c542, 1);
      g.fillRect(26, 2, 5, 13);
      g.fillRect(26, 37, 5, 13);
      g.fillStyle(0xb285ff, 1);
      g.fillCircle(28, 3, 2);
      g.fillCircle(28, 50, 2);
      // weapon
      g.fillStyle(0xb6ff3a, 0.95);
      g.fillRect(32, 23, 16, 6);
      g.fillStyle(0xffffff, 0.95);
      g.fillRect(45, 24, 3, 4);
    });

    this.makeTexture('enemy-crusher', 62, 58, (g) => {
      g.fillStyle(0x320a08, 1);
      g.fillRoundedRect(10, 10, 38, 36, 5);
      g.lineStyle(3, 0xff5d6f, 1);
      g.strokeRoundedRect(10, 10, 38, 36, 5);
      // armor plates
      g.fillStyle(0x1a0606, 1);
      g.fillRect(14, 14, 10, 28);
      g.fillRect(34, 14, 10, 28);
      // eyes
      g.fillStyle(0xf5c542, 1);
      g.fillCircle(19, 22, 4);
      g.fillCircle(19, 35, 4);
      g.fillStyle(0xff5d6f, 1);
      g.fillCircle(19, 22, 2);
      g.fillCircle(19, 35, 2);
      g.fillStyle(0xf5c542, 1);
      g.fillCircle(39, 22, 3);
      g.fillCircle(39, 35, 3);
      // ram horn
      g.fillStyle(0xf5c542, 1);
      g.fillRect(38, 24, 22, 8);
      g.fillStyle(0xff5d6f, 1);
      g.fillTriangle(58, 24, 60, 28, 58, 32);
    });

    this.makeTexture('enemy-mender', 54, 44, (g) => {
      g.fillStyle(0x062213, 1);
      g.fillRoundedRect(10, 9, 32, 24, 5);
      g.lineStyle(2.5, 0xb6ff3a, 1);
      g.strokeRoundedRect(10, 9, 32, 24, 5);
      // big plus icon
      g.fillStyle(0xb6ff3a, 1);
      g.fillRect(24, 13, 5, 16);
      g.fillRect(18, 18, 17, 5);
      g.fillStyle(0xffffff, 0.85);
      g.fillRect(25, 14, 3, 14);
      g.fillRect(19, 19, 15, 3);
      // healing aura ring
      g.lineStyle(2, 0x9ec8ff, 0.95);
      g.strokeCircle(26, 22, 18);
      g.lineStyle(1, 0xb6ff3a, 0.6);
      g.strokeCircle(26, 22, 22);
    });

    this.makeTexture('enemy-sniper', 62, 38, (g) => {
      g.fillStyle(0x031628, 1);
      g.fillRoundedRect(8, 10, 32, 18, 4);
      g.lineStyle(2.5, 0x9ec8ff, 1);
      g.strokeRoundedRect(8, 10, 32, 18, 4);
      // scope
      g.fillStyle(0x000810, 1);
      g.fillCircle(20, 19, 6);
      g.lineStyle(1.5, 0x9ec8ff, 0.95);
      g.strokeCircle(20, 19, 6);
      g.fillStyle(0xff5d6f, 1);
      g.fillCircle(20, 19, 2.5);
      // barrel
      g.fillStyle(0x0e2438, 1);
      g.fillRect(34, 16, 26, 5);
      g.fillStyle(0x9ec8ff, 1);
      g.fillRect(56, 17, 4, 3);
      // dot
      g.fillStyle(0xf5c542, 1);
      g.fillRect(34, 12, 4, 3);
    });

    this.makeTexture('enemy-bomber', 58, 48, (g) => {
      g.fillStyle(0x301f04, 1);
      g.fillCircle(25, 24, 17);
      g.fillStyle(0x140e02, 1);
      g.fillCircle(25, 24, 14);
      g.lineStyle(3, 0xf5c542, 1);
      g.strokeCircle(25, 24, 17);
      // exhaust nozzle
      g.fillStyle(0xff5d6f, 1);
      g.fillTriangle(37, 17, 55, 24, 37, 31);
      g.fillStyle(0xf5c542, 1);
      g.fillTriangle(42, 20, 52, 24, 42, 28);
      // detonator core
      g.fillStyle(0xb285ff, 1);
      g.fillCircle(25, 24, 6);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(25, 24, 2.5);
      // rivets
      g.fillStyle(0xf5c542, 1);
      g.fillCircle(16, 16, 1.5);
      g.fillCircle(16, 32, 1.5);
      g.fillCircle(34, 14, 1.5);
      g.fillCircle(34, 34, 1.5);
    });

    this.makeTexture('enemy-turret', 58, 58, (g) => {
      g.fillStyle(0x031216, 1);
      g.fillCircle(29, 29, 22);
      g.lineStyle(3, 0x4d8eff, 1);
      g.strokeCircle(29, 29, 21);
      // inner ring
      g.lineStyle(1.5, 0xb285ff, 0.85);
      g.strokeCircle(29, 29, 17);
      // barrel
      g.fillStyle(0x0a2028, 1);
      g.fillRoundedRect(25, 4, 8, 28, 3);
      g.lineStyle(1, 0x9ec8ff, 0.85);
      g.strokeRoundedRect(25, 4, 8, 28, 3);
      // core
      g.fillStyle(0xff5d6f, 1);
      g.fillCircle(29, 29, 7);
      g.fillStyle(0xffffff, 0.95);
      g.fillCircle(29, 29, 3);
      // pads
      g.lineStyle(2, 0xf5c542, 0.85);
      g.lineBetween(12, 46, 46, 46);
      g.fillStyle(0xf5c542, 1);
      g.fillCircle(12, 46, 1.5);
      g.fillCircle(46, 46, 1.5);
    });

    this.makeTexture('enemy-raider', 50, 36, (g) => {
      g.fillStyle(0x310812, 1);
      g.fillRoundedRect(8, 9, 30, 18, 5);
      g.lineStyle(2.5, 0xff5d6f, 1);
      g.strokeRoundedRect(8, 9, 30, 18, 5);
      // visor strip
      g.fillStyle(0xb285ff, 0.95);
      g.fillRect(11, 13, 22, 4);
      g.fillStyle(0xffffff, 0.9);
      g.fillRect(28, 14, 4, 2);
      // chevron
      g.lineStyle(1.5, 0xf5c542, 1);
      g.lineBetween(14, 22, 18, 19);
      g.lineBetween(18, 19, 22, 22);
      // blade
      g.fillStyle(0xf5c542, 1);
      g.fillTriangle(35, 7, 49, 18, 35, 29);
      g.fillStyle(0xffffff, 0.95);
      g.fillTriangle(40, 13, 47, 18, 40, 23);
      // legs
      g.lineStyle(2, 0xff5d6f, 0.9);
      g.lineBetween(13, 27, 5, 35);
      g.lineBetween(28, 27, 22, 35);
    });

    this.makeTexture('enemy-mortar', 62, 48, (g) => {
      g.fillStyle(0x2d2208, 1);
      g.fillRoundedRect(10, 14, 34, 24, 5);
      g.lineStyle(2.5, 0xf5c542, 1);
      g.strokeRoundedRect(10, 14, 34, 24, 5);
      // base panel
      g.fillStyle(0x140f04, 1);
      g.fillRect(14, 18, 26, 16);
      g.lineStyle(1, 0xf59a2c, 0.85);
      g.strokeRect(14, 18, 26, 16);
      g.fillStyle(0xff5d6f, 1);
      g.fillCircle(20, 26, 2);
      g.fillCircle(34, 26, 2);
      // barrel
      g.fillStyle(0xff5d6f, 1);
      g.fillRect(28, 4, 10, 30);
      g.fillStyle(0xf5c542, 1);
      g.fillRect(30, 4, 6, 4);
      // wheels
      g.fillStyle(0x050504, 1);
      g.fillCircle(19, 40, 4);
      g.fillCircle(44, 40, 4);
      g.lineStyle(1, 0xf5c542, 0.7);
      g.strokeCircle(19, 40, 4);
      g.strokeCircle(44, 40, 4);
    });

    this.makeTexture('enemy-shielder', 56, 52, (g) => {
      g.fillStyle(0x031628, 1);
      g.fillRoundedRect(16, 10, 26, 32, 5);
      g.lineStyle(2.5, 0x9ec8ff, 1);
      g.strokeRoundedRect(16, 10, 26, 32, 5);
      // visor
      g.fillStyle(0xb285ff, 0.95);
      g.fillRect(19, 16, 20, 5);
      // shield bubble
      g.fillStyle(0x4d8eff, 0.32);
      g.fillCircle(28, 26, 23);
      g.lineStyle(1.5, 0x9ec8ff, 0.7);
      g.strokeCircle(28, 26, 23);
      g.lineStyle(1, 0x4d8eff, 0.5);
      g.strokeCircle(28, 26, 18);
      // weapon
      g.fillStyle(0xf5c542, 1);
      g.fillRect(36, 24, 16, 5);
      g.fillStyle(0xffffff, 0.95);
      g.fillRect(48, 24, 4, 5);
    });

    this.makeTexture('enemy-spark', 44, 44, (g) => {
      g.fillStyle(0x1a0830, 1);
      g.fillCircle(22, 22, 14);
      g.fillStyle(0x0a0420, 1);
      g.fillCircle(22, 22, 11);
      g.lineStyle(2.5, 0xb285ff, 1);
      g.strokeCircle(22, 22, 13);
      // core
      g.fillStyle(0xffffff, 1);
      g.fillCircle(22, 22, 5);
      g.fillStyle(0x9ec8ff, 0.85);
      g.fillCircle(22, 22, 3);
      // arcs
      g.lineStyle(2.5, 0x4d8eff, 0.95);
      g.lineBetween(22, 2, 22, 12);
      g.lineBetween(22, 32, 22, 42);
      g.lineBetween(2, 22, 12, 22);
      g.lineBetween(32, 22, 42, 22);
      g.lineStyle(1.5, 0xb285ff, 0.85);
      g.lineBetween(8, 8, 14, 14);
      g.lineBetween(30, 30, 36, 36);
      g.lineBetween(8, 36, 14, 30);
      g.lineBetween(30, 14, 36, 8);
    });

    this.makeTexture('enemy-boss', 96, 84, (g) => {
      // glow halo
      g.fillStyle(0xb285ff, 0.18);
      g.fillRoundedRect(8, 6, 70, 70, 12);
      g.fillStyle(0x300508, 1);
      g.fillRoundedRect(14, 12, 58, 56, 8);
      g.lineStyle(4, 0xff5d6f, 1);
      g.strokeRoundedRect(14, 12, 58, 56, 8);
      // inner armor
      g.fillStyle(0x180204, 1);
      g.fillRoundedRect(20, 18, 46, 44, 5);
      g.lineStyle(1.5, 0xb285ff, 0.85);
      g.strokeRoundedRect(20, 18, 46, 44, 5);
      // dual eyes
      g.fillStyle(0xf5c542, 1);
      g.fillCircle(34, 34, 9);
      g.fillCircle(54, 34, 9);
      g.fillStyle(0xff5d6f, 1);
      g.fillCircle(34, 34, 5);
      g.fillCircle(54, 34, 5);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(35, 33, 2);
      g.fillCircle(55, 33, 2);
      // jaw / vents
      g.fillStyle(0xb285ff, 1);
      g.fillRect(28, 50, 32, 5);
      g.fillStyle(0xb285ff, 1);
      g.fillRect(30, 50, 4, 5);
      g.fillRect(38, 50, 4, 5);
      g.fillRect(46, 50, 4, 5);
      g.fillRect(54, 50, 4, 5);
      // mega cannon
      g.fillStyle(0xf5c542, 1);
      g.fillRect(66, 36, 25, 10);
      g.fillStyle(0xffffff, 0.95);
      g.fillRect(86, 38, 5, 6);
      // wing spikes
      g.lineStyle(3, 0xb285ff, 0.98);
      g.lineBetween(24, 12, 6, 0);
      g.lineBetween(62, 12, 84, 0);
      g.lineBetween(24, 68, 6, 82);
      g.lineBetween(62, 68, 84, 82);
      g.fillStyle(0xb285ff, 1);
      g.fillCircle(6, 0, 2.5);
      g.fillCircle(84, 0, 2.5);
      g.fillCircle(6, 82, 2.5);
      g.fillCircle(84, 82, 2.5);
    });

    this.makeTexture('shot-pulse', 18, 8, (g) => {
      g.fillStyle(0x9ec8ff, 1);
      g.fillRoundedRect(0, 2, 15, 4, 2);
      g.fillStyle(0xffffff, 1);
      g.fillRect(11, 3, 5, 2);
    });

    this.makeTexture('shot-shell', 24, 10, (g) => {
      g.fillStyle(0xf5c542, 1);
      g.fillRoundedRect(1, 2, 18, 6, 3);
      g.fillStyle(0xff5d6f, 1);
      g.fillTriangle(18, 1, 24, 5, 18, 9);
    });

    this.makeTexture('shot-missile', 24, 9, (g) => {
      g.fillStyle(0xe8f7f4, 1);
      g.fillRoundedRect(0, 2, 17, 5, 2);
      g.fillStyle(0x4d8eff, 1);
      g.fillTriangle(16, 0, 24, 4.5, 16, 9);
      g.fillStyle(0xff5d6f, 1);
      g.fillRect(0, 2, 4, 5);
    });

    this.makeTexture('shot-rail', 32, 8, (g) => {
      g.fillStyle(0x4d8eff, 1);
      g.fillRoundedRect(0, 2, 28, 4, 2);
      g.fillStyle(0xe8f7f4, 1);
      g.fillRect(18, 3, 11, 2);
      g.fillStyle(0xb285ff, 1);
      g.fillTriangle(28, 0, 32, 4, 28, 8);
    });

    this.makeTexture('shot-grenade', 18, 18, (g) => {
      g.fillStyle(0x1b2422, 1);
      g.fillCircle(9, 10, 7);
      g.lineStyle(2, 0xf5c542, 1);
      g.strokeCircle(9, 10, 7);
      g.fillStyle(0xff5d6f, 1);
      g.fillRect(7, 2, 5, 5);
      g.fillStyle(0x9ec8ff, 1);
      g.fillCircle(12, 8, 2);
    });

    this.makeTexture('shot-flame', 22, 14, (g) => {
      g.fillStyle(0xf5c542, 1);
      g.fillEllipse(9, 7, 18, 10);
      g.fillStyle(0xff5d6f, 0.9);
      g.fillEllipse(6, 7, 12, 8);
      g.fillStyle(0xe8f7f4, 0.85);
      g.fillEllipse(13, 7, 7, 4);
    });

    this.makeTexture('shot-saw', 24, 24, (g) => {
      g.fillStyle(0x1c2413, 1);
      g.fillCircle(12, 12, 10);
      g.lineStyle(2, 0xc9ff6a, 1);
      g.strokeCircle(12, 12, 9);
      g.fillStyle(0xc9ff6a, 1);
      g.fillTriangle(12, 0, 16, 8, 8, 8);
      g.fillTriangle(24, 12, 16, 16, 16, 8);
      g.fillTriangle(12, 24, 8, 16, 16, 16);
      g.fillTriangle(0, 12, 8, 8, 8, 16);
      g.fillStyle(0x080b10, 1);
      g.fillCircle(12, 12, 4);
    });

    this.makeTexture('shot-cryo', 22, 22, (g) => {
      g.fillStyle(0x10202a, 1);
      g.fillCircle(11, 11, 8);
      g.lineStyle(2, 0x9ec8ff, 1);
      g.strokeCircle(11, 11, 8);
      g.lineBetween(11, 2, 11, 20);
      g.lineBetween(2, 11, 20, 11);
    });

    this.makeTexture('shot-ion', 34, 8, (g) => {
      g.fillStyle(0x9ec8ff, 1);
      g.fillRoundedRect(0, 2, 28, 4, 2);
      g.fillStyle(0xe8f7f4, 1);
      g.fillTriangle(25, 0, 34, 4, 25, 8);
    });

    this.makeTexture('enemy-bullet', 12, 12, (g) => {
      g.fillStyle(0xff5d6f, 1);
      g.fillCircle(6, 6, 5);
      g.fillStyle(0xf5c542, 0.9);
      g.fillCircle(6, 6, 2);
    });

    this.makeTexture('weapon-attack-drone', 34, 34, (g) => {
      g.fillStyle(0x10181e, 1);
      g.fillCircle(17, 17, 10);
      g.lineStyle(2, 0x4d8eff, 1);
      g.strokeCircle(17, 17, 10);
      g.lineStyle(2, 0x9ec8ff, 0.8);
      g.lineBetween(2, 17, 32, 17);
      g.lineBetween(17, 2, 17, 32);
      g.fillStyle(0xf5c542, 1);
      g.fillCircle(21, 17, 3);
    });

    this.makeTexture('weapon-heal-drone', 34, 34, (g) => {
      g.fillStyle(0x111b14, 1);
      g.fillCircle(17, 17, 10);
      g.lineStyle(2, 0xa7e65d, 1);
      g.strokeCircle(17, 17, 10);
      g.fillStyle(0xa7e65d, 1);
      g.fillRect(15, 8, 4, 18);
      g.fillRect(8, 15, 18, 4);
      g.lineStyle(2, 0x9ec8ff, 0.75);
      g.strokeCircle(17, 17, 15);
    });

    this.makeTexture('weapon-swarm', 34, 34, (g) => {
      g.fillStyle(0x22121d, 1);
      g.fillCircle(17, 17, 10);
      g.lineStyle(2, 0xb285ff, 1);
      g.strokeCircle(17, 17, 10);
      g.fillStyle(0xb285ff, 1);
      g.fillCircle(11, 13, 3);
      g.fillCircle(22, 16, 3);
      g.fillCircle(16, 23, 3);
    });

    this.makeTexture('spark', 10, 10, (g) => {
      g.fillStyle(0xf5c542, 1);
      g.fillCircle(5, 5, 4);
    });

    this.makeTexture('chest', 48, 42, (g) => {
      // body
      g.fillStyle(0x06141c, 1);
      g.fillRoundedRect(4, 10, 40, 25, 4);
      g.lineStyle(2.5, 0xf5c542, 1);
      g.strokeRoundedRect(4, 10, 40, 25, 4);
      // lid
      g.fillStyle(0x101e2a, 1);
      g.fillRect(7, 4, 34, 10);
      g.lineStyle(1.5, 0xf5c542, 0.9);
      g.strokeRect(7, 4, 34, 10);
      // hinges
      g.fillStyle(0xb285ff, 1);
      g.fillCircle(11, 9, 1.5);
      g.fillCircle(37, 9, 1.5);
      // lock core
      g.fillStyle(0x4d8eff, 1);
      g.fillRect(21, 18, 6, 9);
      g.fillStyle(0xffffff, 0.95);
      g.fillCircle(24, 22, 1.6);
      // accent line
      g.lineStyle(1.5, 0x9ec8ff, 0.9);
      g.lineBetween(8, 17, 40, 17);
    });

    this.makeTexture('vehicle-bubble', 70, 70, (g) => {
      g.fillStyle(0x4d8eff, 0.12);
      g.fillCircle(35, 35, 31);
      g.lineStyle(3, 0x4d8eff, 0.92);
      g.strokeCircle(35, 35, 31);
      g.lineStyle(1, 0xe8f7f4, 0.7);
      g.strokeCircle(35, 35, 24);
      g.fillStyle(0xe8f7f4, 0.9);
      g.fillCircle(24, 22, 4);
    });

    this.makeTexture('buff-core', 38, 38, (g) => {
      g.fillStyle(0xffffff, 0.22);
      g.fillCircle(19, 19, 17);
      g.lineStyle(2, 0xffffff, 0.9);
      g.strokeCircle(19, 19, 16);
      g.fillStyle(0xffffff, 0.95);
      g.fillCircle(19, 19, 7);
    });
  }

  private makeTexture(
    key: string,
    width: number,
    height: number,
    draw: (graphics: Phaser.GameObjects.Graphics) => void,
  ) {
    if (this.textures.exists(key)) {
      return;
    }

    const graphics = this.add.graphics();
    draw(graphics);
    graphics.generateTexture(key, width, height);
    graphics.destroy();
  }

  private getTerrainShapePoints(region: TerrainRegion, inset = 0) {
    if (region.key === 'road') {
      return [
        new Phaser.Geom.Point(region.x + inset, region.y + inset),
        new Phaser.Geom.Point(region.x + region.w - inset, region.y + inset),
        new Phaser.Geom.Point(region.x + region.w - inset, region.y + region.h - inset),
        new Phaser.Geom.Point(region.x + inset, region.y + region.h - inset),
      ];
    }

    const cx = region.x + region.w / 2;
    const cy = region.y + region.h / 2;
    const rx = Math.max(16, region.w / 2 - inset);
    const ry = Math.max(16, region.h / 2 - inset);
    const points: Phaser.Geom.Point[] = [];
    const count = 36;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      const wave =
        0.92 +
        Math.sin(i * 1.73 + region.x * 0.003 + region.y * 0.002) * 0.06 +
        Math.cos(i * 2.41 + region.w * 0.004) * 0.045;
      points.push(new Phaser.Geom.Point(cx + Math.cos(angle) * rx * wave, cy + Math.sin(angle) * ry * wave));
    }
    return points;
  }

  private drawTerrainRegionShape(graphics: Phaser.GameObjects.Graphics, region: TerrainRegion) {
    const accent = TERRAIN_ACCENT[region.key];
    const points = this.getTerrainShapePoints(region);
    const innerPoints = this.getTerrainShapePoints(region, Math.min(24, Math.min(region.w, region.h) * 0.08));

    graphics.fillStyle(region.color, region.alpha);
    graphics.fillPoints(points, true, true);
    graphics.fillStyle(accent.stroke, 0.12);
    graphics.fillPoints(innerPoints, true, true);
    graphics.lineStyle(region.key === 'road' ? 4 : 5, accent.stroke, region.key === 'road' ? 0.88 : 0.72);
    graphics.strokePoints(points, true, true);
    graphics.lineStyle(1, 0x050709, 0.42);
    graphics.strokePoints(innerPoints, true, true);
  }

  private addMap() {
    this.add
      .tileSprite(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 'grid-tile')
      .setOrigin(0)
      .setDepth(-20);

    const terrainGfx = this.add.graphics().setDepth(-15);
    for (const r of TERRAIN_REGIONS) {
      if (r.alpha <= 0) continue;
      this.drawTerrainRegionShape(terrainGfx, r);
    }

    const waterRegions = TERRAIN_REGIONS.filter((r) => r.key === 'water');
    for (const wr of waterRegions) {
      const waterPoly = new Phaser.Geom.Polygon(this.getTerrainShapePoints(wr, 22));
      for (let wy = wr.y + 34; wy < wr.y + wr.h - 12; wy += 34) {
        terrainGfx.lineStyle(3, TERRAIN_ACCENT.water.pattern, 0.66);
        terrainGfx.beginPath();
        let drawing = false;
        for (let wx = wr.x + 18; wx < wr.x + wr.w - 24; wx += 32) {
          const x1 = wx + 16;
          const y1 = wy - 8;
          const x2 = wx + 32;
          const y2 = wy;
          if (
            Phaser.Geom.Polygon.Contains(waterPoly, wx, wy) &&
            Phaser.Geom.Polygon.Contains(waterPoly, x1, y1) &&
            Phaser.Geom.Polygon.Contains(waterPoly, x2, y2)
          ) {
            if (!drawing) {
              terrainGfx.moveTo(wx, wy);
              drawing = true;
            }
            terrainGfx.lineTo(x1, y1);
            terrainGfx.lineTo(x2, y2);
          } else {
            drawing = false;
          }
        }
        terrainGfx.strokePath();
      }
    }

    const forestRegions = TERRAIN_REGIONS.filter((r) => r.key === 'forest');
    for (const fr of forestRegions) {
      const forestPoly = new Phaser.Geom.Polygon(this.getTerrainShapePoints(fr, 28));
      for (let ty = fr.y + 38; ty < fr.y + fr.h - 20; ty += 62) {
        for (let tx = fr.x + 36; tx < fr.x + fr.w - 20; tx += 74) {
          const ox = Math.sin((tx + ty) * 0.018) * 13;
          const oy = Math.cos((tx - ty) * 0.014) * 9;
          const x = tx + ox;
          const y = ty + oy;
          if (
            !Phaser.Geom.Polygon.Contains(forestPoly, x, y - 14) ||
            !Phaser.Geom.Polygon.Contains(forestPoly, x - 13, y + 12) ||
            !Phaser.Geom.Polygon.Contains(forestPoly, x + 13, y + 12)
          ) {
            continue;
          }
          terrainGfx.fillStyle(0x072a18, 0.48);
          terrainGfx.fillCircle(x, y + 8, 9);
          terrainGfx.fillStyle(TERRAIN_ACCENT.forest.pattern, 0.62);
          terrainGfx.fillTriangle(x, y - 14, x - 13, y + 12, x + 13, y + 12);
        }
      }
    }

    const swampRegions = TERRAIN_REGIONS.filter((r) => r.key === 'swamp');
    for (const sr of swampRegions) {
      const swampPoly = new Phaser.Geom.Polygon(this.getTerrainShapePoints(sr, 24));
      for (let by = sr.y + 34; by < sr.y + sr.h - 18; by += 48) {
        for (let bx = sr.x + 28; bx < sr.x + sr.w - 18; bx += 58) {
          const ox = Math.sin((bx + by) * 0.021) * 10;
          if (
            !Phaser.Geom.Polygon.Contains(swampPoly, bx + ox - 18, by) ||
            !Phaser.Geom.Polygon.Contains(swampPoly, bx + ox + 18, by) ||
            !Phaser.Geom.Polygon.Contains(swampPoly, bx + ox, by - 12) ||
            !Phaser.Geom.Polygon.Contains(swampPoly, bx + ox, by + 12)
          ) {
            continue;
          }
          terrainGfx.fillStyle(0x15200d, 0.44);
          terrainGfx.fillEllipse(bx + ox, by, 32, 12);
          terrainGfx.lineStyle(2, TERRAIN_ACCENT.swamp.pattern, 0.54);
          terrainGfx.strokeEllipse(bx + ox, by, 24, 10);
          terrainGfx.fillStyle(0xd7ea85, 0.52);
          terrainGfx.fillCircle(bx + ox + 15, by - 9, 3);
        }
      }
    }

    const desertRegions = TERRAIN_REGIONS.filter((r) => r.key === 'desert');
    for (const dr of desertRegions) {
      const desertPoly = new Phaser.Geom.Polygon(this.getTerrainShapePoints(dr, 26));
      terrainGfx.lineStyle(3, TERRAIN_ACCENT.desert.pattern, 0.42);
      for (let sy = dr.y + 36; sy < dr.y + dr.h - 20; sy += 72) {
        const shift = Math.sin(sy * 0.013) * 38;
        terrainGfx.beginPath();
        let drawing = false;
        for (let sx = dr.x + 24; sx < dr.x + dr.w - 24; sx += 86) {
          const x0 = sx + shift;
          const x1 = sx + 42 + shift;
          const y1 = sy + Math.sin(sx * 0.04) * 16;
          const x2 = sx + 84 + shift;
          if (
            Phaser.Geom.Polygon.Contains(desertPoly, x0, sy) &&
            Phaser.Geom.Polygon.Contains(desertPoly, x1, y1) &&
            Phaser.Geom.Polygon.Contains(desertPoly, x2, sy)
          ) {
            if (!drawing) {
              terrainGfx.moveTo(x0, sy);
              drawing = true;
            }
            terrainGfx.lineTo(x1, y1);
            terrainGfx.lineTo(x2, sy);
          } else {
            drawing = false;
          }
        }
        terrainGfx.strokePath();
      }
    }

    TERRAIN_REGIONS.filter((r) => r.label && r.key !== 'road').forEach((r) => {
      this.add
        .text(r.x + r.w / 2, r.y + r.h / 2, r.label, {
          fontFamily: 'Inter, "Segoe UI", sans-serif',
          fontSize: '32px',
          color: TERRAIN_ACCENT[r.key].text,
          stroke: '#041014',
          strokeThickness: 5,
        })
        .setOrigin(0.5)
        .setAlpha(0.58)
        .setDepth(-13);
    });

    // Circuit decorations
    const circuits = this.add.graphics().setDepth(-10);
    circuits.lineStyle(2, 0x4d8eff, 0.22);
    circuits.fillStyle(0xf5c542, 0.38);

    for (let i = 0; i < 150; i += 1) {
      const x = Phaser.Math.Between(80, WORLD_WIDTH - 160);
      const y = Phaser.Math.Between(80, WORLD_HEIGHT - 160);
      const w = Phaser.Math.Between(80, 260);
      const h = Phaser.Math.Between(40, 180);
      circuits.beginPath();
      circuits.moveTo(x, y);
      circuits.lineTo(x + w, y);
      circuits.lineTo(x + w, y + h);
      circuits.strokePath();
      circuits.fillRect(x + w - 4, y + h - 4, 8, 8);
    }
  }

  private updatePlayer(deltaSeconds: number) {
    const vehicle = this.getCurrentVehicleSpec();
    let moveX =
      (this.keys.D.isDown || this.cursors.right?.isDown ? 1 : 0) -
      (this.keys.A.isDown || this.cursors.left?.isDown ? 1 : 0);
    let moveY =
      (this.keys.S.isDown || this.cursors.down?.isDown ? 1 : 0) -
      (this.keys.W.isDown || this.cursors.up?.isDown ? 1 : 0);
    const keyboardMoving = moveX !== 0 || moveY !== 0;
    const joystickMoving = !keyboardMoving && this.joystickVector.lengthSq() > 0.006;
    if (keyboardMoving) {
      this.moveTarget = undefined;
    } else if (joystickMoving) {
      moveX = this.joystickVector.x;
      moveY = this.joystickVector.y;
      this.moveTarget = undefined;
    } else if (this.moveTarget) {
      const distanceToTarget = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        this.moveTarget.x,
        this.moveTarget.y,
      );
      if (distanceToTarget < 18) {
        this.moveTarget = undefined;
      } else {
        moveX = this.moveTarget.x - this.player.x;
        moveY = this.moveTarget.y - this.player.y;
      }
    }

    const length = Math.hypot(moveX, moveY);
    const terrainMod = this.getTerrainSpeedMod(this.player.x, this.player.y);
    const sprintBonus = this.isSkillActive('sprint') ? SPRINT_SPEED_BONUS : 0;
    const speed = (vehicle.speed + this.speedBonus + this.getBuffSpeedBonus() + sprintBonus) * this.getWeatherSpeedMultiplier() * terrainMod;

    if (length > 0) {
      const vx = (moveX / length) * speed;
      const vy = (moveY / length) * speed;
      this.player.setVelocity(vx, vy);
      this.lastAimAngle = Math.atan2(vy, vx);
      if (this.currentWeather === 'snow') {
        this.snowSlideX = vx * 0.42;
        this.snowSlideY = vy * 0.42;
      }
      this.emitEngineTrail(this.lastAimAngle, vehicle);
    } else if (this.currentWeather === 'snow' && Math.hypot(this.snowSlideX, this.snowSlideY) > 10) {
      this.player.setVelocity(this.snowSlideX, this.snowSlideY);
      this.snowSlideX *= 1 - Math.min(0.9, deltaSeconds * 4.2);
      this.snowSlideY *= 1 - Math.min(0.9, deltaSeconds * 4.2);
    } else {
      this.player.setVelocity(0, 0);
      this.snowSlideX = 0;
      this.snowSlideY = 0;
    }

    const target = this.findNearestTarget(this.targetRange);
    if (target) {
      this.lastAimAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
    }
    const prevLean = (this.player.getData('lean') as number | undefined) ?? 0;
    this.player.rotation -= prevLean;
    this.player.setData('lean', 0);
    this.player.setRotation(Phaser.Math.Angle.RotateTo(this.player.rotation, this.lastAimAngle, Math.PI * deltaSeconds * 10));

    const body = this.player.body as Phaser.Physics.Arcade.Body | null;
    this.updateVehicleBodyAnim(this.player, body?.velocity.x ?? 0, body?.velocity.y ?? 0, deltaSeconds);

    this.pullLoot(deltaSeconds);
  }

  private updateVehicleBodyAnim(
    sprite: Phaser.GameObjects.Sprite,
    vx: number,
    vy: number,
    deltaSeconds: number,
  ) {
    const baseX = (sprite.getData('baseScaleX') as number | undefined) ?? sprite.scaleX;
    const baseY = (sprite.getData('baseScaleY') as number | undefined) ?? sprite.scaleY;
    if (sprite.getData('baseScaleX') === undefined) {
      sprite.setData('baseScaleX', sprite.scaleX || 1);
      sprite.setData('baseScaleY', sprite.scaleY || 1);
    }

    let bobT = (sprite.getData('bobT') as number | undefined) ?? 0;
    let idleT = (sprite.getData('idleT') as number | undefined) ?? 0;
    let psx = (sprite.getData('psx') as number | undefined) ?? 0;
    let psy = (sprite.getData('psy') as number | undefined) ?? 0;
    let flipX = (sprite.getData('flipX') as number | undefined) ?? 0;
    let flipY = (sprite.getData('flipY') as number | undefined) ?? 0;
    let lean = (sprite.getData('lean') as number | undefined) ?? 0;

    // Strip last frame's applied lean so we read the true aim rotation
    const aimRotation = sprite.rotation - lean;

    const speed = Math.hypot(vx, vy);
    const moving = speed > 6;

    const sx = Math.abs(vx) > 10 ? Math.sign(vx) : 0;
    const sy = Math.abs(vy) > 10 ? Math.sign(vy) : 0;
    if (sx !== 0 && psx !== 0 && sx !== psx) flipX = 1;
    if (sy !== 0 && psy !== 0 && sy !== psy) flipY = 1;
    if (sx !== 0) psx = sx;
    if (sy !== 0) psy = sy;

    flipX = Math.max(0, flipX - deltaSeconds / 0.24);
    flipY = Math.max(0, flipY - deltaSeconds / 0.24);

    if (moving) bobT += deltaSeconds * 9;
    idleT += deltaSeconds * 2.4;

    const cosR = Math.cos(aimRotation);
    const sinR = Math.sin(aimRotation);
    const forwardVel = vx * cosR + vy * sinR;
    const lateralVel = -vx * sinR + vy * cosR;

    let scaleX = baseX;
    let scaleY = baseY;

    scaleX *= 1 + clamp(forwardVel * 0.00035, -0.05, 0.08);
    scaleY *= 1 - clamp(Math.abs(lateralVel) * 0.00028, 0, 0.07);
    if (moving) {
      scaleY *= 1 + Math.sin(bobT) * 0.03;
    } else {
      // idle hover breathing
      const pulse = Math.sin(idleT) * 0.018;
      scaleX *= 1 + pulse;
      scaleY *= 1 - pulse;
    }

    if (flipX > 0) {
      const f = Math.abs(Math.cos((1 - flipX) * Math.PI));
      scaleX *= Math.max(0.18, f);
    }
    if (flipY > 0) {
      const f = Math.abs(Math.cos((1 - flipY) * Math.PI));
      scaleY *= Math.max(0.18, f);
    }

    const targetLean = clamp(lateralVel * 0.00035, -0.16, 0.16);
    lean += (targetLean - lean) * Math.min(1, deltaSeconds * 6);

    sprite.setScale(scaleX, scaleY);
    sprite.rotation = aimRotation + lean;
    sprite.setData('bobT', bobT);
    sprite.setData('idleT', idleT);
    sprite.setData('psx', psx);
    sprite.setData('psy', psy);
    sprite.setData('flipX', flipX);
    sprite.setData('flipY', flipY);
    sprite.setData('lean', lean);
  }

  private drawUnitShadows() {
    if (!this.shadowLayer) return;
    this.shadowLayer.clear();

    const drawShadow = (
      sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite,
      rx: number,
      ry: number,
      alpha = 0.32,
    ) => {
      if (!sprite.active || !sprite.visible) return;
      // shadow offset slightly down-right for low overhead light angle
      const x = sprite.x + 3;
      const y = sprite.y + ry * 0.7;
      this.shadowLayer.fillStyle(0x000000, alpha * 0.55);
      this.shadowLayer.fillEllipse(x, y, rx * 1.6, ry * 0.7);
      this.shadowLayer.fillStyle(0x000000, alpha);
      this.shadowLayer.fillEllipse(x, y, rx * 1.1, ry * 0.45);
    };

    // local player
    if (this.player && this.player.active) {
      const w = this.player.displayWidth;
      const h = this.player.displayHeight;
      drawShadow(this.player, w * 0.45, h * 0.4);
    }
    // remote players
    this.remotePlayers.forEach((view) => {
      const w = view.sprite.displayWidth;
      const h = view.sprite.displayHeight;
      drawShadow(view.sprite, w * 0.45, h * 0.4, view.sprite.alpha * 0.32);
    });
    // enemies (only on-screen ones for perf)
    const cam = this.cameras.main;
    const cx0 = cam.scrollX - 100;
    const cy0 = cam.scrollY - 100;
    const cx1 = cam.scrollX + cam.width / cam.zoom + 100;
    const cy1 = cam.scrollY + cam.height / cam.zoom + 100;
    this.enemies.getChildren().forEach((rawEnemy) => {
      const enemy = rawEnemy as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) return;
      if (enemy.x < cx0 || enemy.x > cx1 || enemy.y < cy0 || enemy.y > cy1) return;
      const w = enemy.displayWidth;
      const h = enemy.displayHeight;
      drawShadow(enemy, w * 0.4, h * 0.35, enemy.getData('isBoss') ? 0.4 : 0.3);
    });
  }

  private spawnDamageText(x: number, y: number, amount: number, options?: { crit?: boolean; heal?: boolean; player?: boolean }) {
    if (this.isLowFxMode()) return;
    const value = Math.abs(amount);
    if (value < 0.5) return;
    const crit = options?.crit ?? false;
    const heal = options?.heal ?? false;
    const isPlayer = options?.player ?? false;
    const color = heal ? '#b6ff3a' : isPlayer ? '#ff5d6f' : crit ? '#f5c542' : '#ffffff';
    const fontSize = crit ? 18 : isPlayer ? 16 : 13;
    const label = (heal ? '+' : '') + Math.round(value).toString();
    const txt = this.add
      .text(x + Phaser.Math.Between(-6, 6), y - 8, label, {
        fontFamily: '"Orbitron", Inter, "Segoe UI", sans-serif',
        fontSize: `${fontSize}px`,
        color,
        fontStyle: crit ? '900' : '800',
        stroke: '#04060c',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(80);
    if (crit) {
      txt.setShadow(0, 0, '#f5c542', 8, true, true);
    }
    this.tweens.add({
      targets: txt,
      y: txt.y - (crit ? 42 : 30),
      alpha: 0,
      scale: crit ? 1.35 : 1,
      duration: crit ? 720 : 540,
      ease: 'Cubic.easeOut',
      onComplete: () => txt.destroy(),
    });
  }

  private getMagnetPickupRadius() {
    return this.magnetRadius + (this.isBuffActive('magnet') ? 420 : 0);
  }

  private pullLoot(deltaSeconds: number) {
    const magnetPickupRadius = this.getMagnetPickupRadius();
    this.xpOrbs.getChildren().forEach((rawOrb) => {
      const orb = rawOrb as Phaser.Physics.Arcade.Image;
      if (!orb.active) {
        return;
      }

      const expiresAt = (orb.getData('expiresAt') as number | undefined) ?? 0;
      if (expiresAt > 0 && this.elapsedMs >= expiresAt) {
        (orb.getData('halo') as Phaser.GameObjects.Arc | undefined)?.destroy();
        (orb.getData('label') as Phaser.GameObjects.Text | undefined)?.destroy();
        orb.destroy();
        return;
      }

      const distance = Phaser.Math.Distance.Between(orb.x, orb.y, this.player.x, this.player.y);
      const pickupRadius = 160 + magnetPickupRadius;
      if (distance > pickupRadius || distance < 18) {
        return;
      }

      const angle = Phaser.Math.Angle.Between(orb.x, orb.y, this.player.x, this.player.y);
      const pull = clamp(1 - distance / pickupRadius, 0.35, 1);
      const speed = (magnetPickupRadius > 0 ? 620 : 380) * pull;
      orb.x += Math.cos(angle) * speed * deltaSeconds;
      orb.y += Math.sin(angle) * speed * deltaSeconds;
      (orb.body as Phaser.Physics.Arcade.Body).updateFromGameObject();
      (orb.getData('halo') as Phaser.GameObjects.Arc | undefined)?.setPosition(orb.x, orb.y);
      (orb.getData('label') as Phaser.GameObjects.Text | undefined)?.setPosition(orb.x, orb.y - 22);
    });

    if (magnetPickupRadius <= 0) {
      return;
    }

    this.chests.getChildren().forEach((rawChest) => {
      const chest = rawChest as Phaser.Physics.Arcade.Image;
      if (!chest.active) {
        return;
      }

      const distance = Phaser.Math.Distance.Between(chest.x, chest.y, this.player.x, this.player.y);
      if (distance > magnetPickupRadius || distance < 18) {
        return;
      }

      const angle = Phaser.Math.Angle.Between(chest.x, chest.y, this.player.x, this.player.y);
      chest.x += Math.cos(angle) * 120 * deltaSeconds;
      chest.y += Math.sin(angle) * 120 * deltaSeconds;
      (chest.body as Phaser.Physics.Arcade.Body).updateFromGameObject();
    });

    [...this.vehiclePods.getChildren(), ...this.buffPickups.getChildren()].forEach((rawLoot) => {
      const loot = rawLoot as Phaser.Physics.Arcade.Image;
      if (!loot.active) {
        return;
      }

      const distance = Phaser.Math.Distance.Between(loot.x, loot.y, this.player.x, this.player.y);
      if (distance > magnetPickupRadius || distance < 18) {
        return;
      }

      const angle = Phaser.Math.Angle.Between(loot.x, loot.y, this.player.x, this.player.y);
      loot.x += Math.cos(angle) * 145 * deltaSeconds;
      loot.y += Math.sin(angle) * 145 * deltaSeconds;
      (loot.body as Phaser.Physics.Arcade.Body).updateFromGameObject();
      const icon = loot.getData('icon') as Phaser.GameObjects.Image | undefined;
      if (icon) {
        icon.x = loot.x;
        icon.y = loot.y;
      }
    });
  }

  private handleTargetRangeInput() {
    if (Phaser.Input.Keyboard.JustDown(this.rangeKeys.Q)) {
      this.adjustTargetRange(-TARGET_RANGE_STEP);
    }

    if (Phaser.Input.Keyboard.JustDown(this.rangeKeys.E)) {
      this.adjustTargetRange(TARGET_RANGE_STEP);
    }
  }

  private handleSkillInput() {
    if (!this.isInMultiplayerRoom || this.isGameOver || this.isChoosingUpgrade) {
      return;
    }
    if (Phaser.Input.Keyboard.JustDown(this.skillKeys.SHIFT)) {
      this.activateSkill('sprint');
    }
    if (Phaser.Input.Keyboard.JustDown(this.skillKeys.F)) {
      this.activateSkill('airstrike');
    }
  }

  private activateSkill(key: SkillKey) {
    const spec = SKILLS[key];
    if (this.elapsedMs < this.skillReadyAt[key]) {
      return;
    }
    this.skillReadyAt[key] = this.elapsedMs + spec.cooldownMs;
    this.skillActiveUntil[key] = this.elapsedMs + spec.durationMs;
    this.ensureAudioContext();
    if (key === 'sprint') {
      this.triggerSprintEffect();
    } else if (key === 'airstrike') {
      this.triggerAirstrike();
    }
  }

  private triggerSprintEffect() {
    this.shockwave(this.player.x, this.player.y, 70, SKILLS.sprint.color);
    this.flashAt(this.player.x, this.player.y, SKILLS.sprint.color, 8);
    this.sfxSweep(420, 820, 0.18, 0.06, 'triangle');
    this.sfxNoise(0.08, 0.04, 1800, 6000);
    this.showAnnouncement('急速冲刺', 900);
  }

  private isSkillActive(key: SkillKey) {
    return this.elapsedMs < this.skillActiveUntil[key];
  }

  private triggerAirstrike() {
    const target = this.findNearestTarget(AIRSTRIKE_RANGE) ?? { x: this.player.x, y: this.player.y };
    const cx = target.x;
    const cy = target.y;
    const warning = this.add
      .circle(cx, cy, AIRSTRIKE_RADIUS, SKILLS.airstrike.color, 0.18)
      .setStrokeStyle(3, SKILLS.airstrike.color, 0.92)
      .setDepth(64);
    this.tweens.add({
      targets: warning,
      scale: 0.85,
      alpha: 0.45,
      yoyo: true,
      repeat: 3,
      duration: AIRSTRIKE_DELAY_MS / 8,
      ease: 'Sine.easeInOut',
      onComplete: () => warning.destroy(),
    });
    this.sfxSweep(220, 90, 0.5, 0.07, 'sawtooth');
    this.showAnnouncement('空袭信标已锁定', 1200);

    for (let i = 0; i < AIRSTRIKE_STRIKE_COUNT; i += 1) {
      const delay = AIRSTRIKE_DELAY_MS + i * AIRSTRIKE_STRIKE_INTERVAL;
      const angle = (i / AIRSTRIKE_STRIKE_COUNT) * Math.PI * 2;
      const offset = i === 0 ? 0 : AIRSTRIKE_RADIUS * 0.45;
      const strikeX = cx + Math.cos(angle) * offset;
      const strikeY = cy + Math.sin(angle) * offset;
      this.time.delayedCall(delay, () => {
        if (this.isGameOver || !this.isInMultiplayerRoom) {
          return;
        }
        this.resolveAirstrike(strikeX, strikeY);
      });
    }
  }

  private resolveAirstrike(x: number, y: number) {
    const damage = AIRSTRIKE_DAMAGE * this.getDamageMultiplier();
    const radius = AIRSTRIKE_RADIUS;
    this.splashDamage(x, y, radius, damage);
    this.splashDamageRemotePlayers(x, y, radius, damage);
    this.splashDamageChests(x, y, radius, 60);
    this.drawArcBolt(x, y - 460, x, y, SKILLS.airstrike.color, 7, 220);
    this.shockwave(x, y, radius, SKILLS.airstrike.color);
    this.flashAt(x, y, SKILLS.airstrike.color, 22);
    this.cameras.main.shake(140, 0.0055);
    this.sfxExplosion();
  }

  private updateSprintTrail() {
    if (!this.isSkillActive('sprint') || this.elapsedMs < this.nextSprintTrailAt) {
      return;
    }
    this.nextSprintTrailAt = this.elapsedMs + 36;
    const trail = this.add
      .circle(this.player.x, this.player.y, 12, SKILLS.sprint.color, 0.45)
      .setDepth(19);
    this.tweens.add({
      targets: trail,
      alpha: 0,
      scale: 0.3,
      duration: 320,
      ease: 'Cubic.easeOut',
      onComplete: () => trail.destroy(),
    });
  }

  private autoFire() {
    const vehicle = this.getCurrentVehicleSpec();
    const fireDelay = Math.max(52, vehicle.fireDelay * this.getFireRateMultiplier());

    if (this.elapsedMs < this.nextShotAt) {
      return;
    }

    const target = this.findNearestTarget(this.targetRange);
    if (!target) {
      return;
    }

    const baseAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
    const shotCount = vehicle.shots;
    for (let i = 0; i < shotCount; i += 1) {
      const offset = (i - (shotCount - 1) / 2) * vehicle.spread;
      this.spawnProjectile(baseAngle + offset, vehicle);
    }
    this.spawnPerfectVehicleEffect(baseAngle, vehicle, this.getProjectileColor(vehicle.projectileTexture));

    this.lastAimAngle = baseAngle;
    this.player.setRotation(baseAngle);
    this.addThreatNoise(this.player.x, this.player.y, vehicle.noise, vehicle.noiseRadius);
    this.nextShotAt = this.elapsedMs + fireDelay;
  }

  private updateWeaponSystems(deltaSeconds: number) {
    this.updateWeaponVisuals();

    this.weaponSlots.forEach((weapon) => {
      switch (weapon) {
        case 'attackDrone':
          this.updateAttackDrone();
          break;
        case 'healDrone':
          this.updateHealDrone(deltaSeconds);
          break;
        case 'rocketLauncher':
          this.updateRocketLauncher();
          break;
        case 'grenadeLauncher':
          this.updateGrenadeLauncher();
          break;
        case 'teslaEmitter':
          this.updateTeslaEmitter();
          break;
        case 'beamCannon':
          this.updateBeamCannon();
          break;
        case 'orbitalBeacon':
          this.updateOrbitalBeacon();
          break;
        case 'sawLauncher':
          this.updateSawLauncher();
          break;
        case 'cryoMine':
          this.updateCryoMine();
          break;
        case 'nanoSwarm':
          this.updateNanoSwarm();
          break;
        case 'gravityWell':
          this.updateGravityWell();
          break;
        case 'ionLance':
          this.updateIonLance();
          break;
      }
    });
  }

  private updateWeaponVisuals() {
    const droneWeapons = this.weaponSlots.filter(
      (weapon) => weapon === 'attackDrone' || weapon === 'healDrone',
    );

    droneWeapons.forEach((weapon, index) => {
      if (weapon === 'healDrone' && this.elapsedMs < this.healDroneBusyUntil) {
        return;
      }

      const spec = WEAPONS[weapon];
      const visual = this.getWeaponVisual(weapon);
      const angle = this.elapsedMs / 760 + (index / Math.max(1, droneWeapons.length)) * Math.PI * 2;
      const radius = 54 + index * 8;
      visual.setPosition(
        this.player.x + Math.cos(angle) * radius,
        this.player.y + Math.sin(angle) * radius,
      );
      visual.setRotation(angle + Math.PI / 2);
      visual.setTint(spec.color);
      visual.setScale(this.isWeaponPerfect(weapon) ? 1.18 : 0.95);
    });
  }

  private getWeaponVisual(weapon: WeaponKey) {
    const existing = this.weaponVisuals[weapon];
    if (existing?.active) {
      return existing;
    }

    const visual = this.add
      .image(this.player.x, this.player.y, WEAPONS[weapon].texture)
      .setDepth(28)
      .setScale(this.isWeaponPerfect(weapon) ? 1.18 : 0.95);
    this.weaponVisuals[weapon] = visual;
    return visual;
  }

  private updateAttackDrone() {
    const level = this.getWeaponLevel('attackDrone');
    if (level <= 0 || this.elapsedMs < this.weaponCooldowns.attackDrone) {
      return;
    }

    const perfect = this.isWeaponPerfect('attackDrone');
    const target = this.findNearestTarget(this.targetRange + 90 + level * 34 + (perfect ? 160 : 0));
    if (!target) {
      return;
    }

    const visual = this.getWeaponVisual('attackDrone');
    const angle = Phaser.Math.Angle.Between(visual.x, visual.y, target.x, target.y);
    const shots = perfect ? 4 : level >= 4 ? 2 : 1;

    for (let i = 0; i < shots; i += 1) {
      const offset = (i - (shots - 1) / 2) * (perfect ? 0.17 : 0.12);
      this.spawnProjectileFrom({
        x: visual.x + Math.cos(angle) * 16,
        y: visual.y + Math.sin(angle) * 16,
        angle: angle + offset,
        texture: 'shot-pulse',
        damage: (8 + level * 6 + (perfect ? 18 : 0)) * this.getDamageMultiplier(),
        projectileSpeed: 720 + level * 42 + (perfect ? 180 : 0),
        ttl: perfect ? 1150 : 900,
        aoe: perfect ? 42 : level >= 5 ? 18 : 0,
        scale: perfect ? 1.05 : 0.8,
        tint: WEAPONS.attackDrone.color,
        trailColor: 0x4d8eff,
        impactColor: 0x9ec8ff,
      });
    }
    this.drawArcBolt(visual.x, visual.y, target.x, target.y, perfect ? 0xe8f7f4 : 0x4d8eff, perfect ? 3 : 1.4, 110);
    if (perfect) {
      this.shockwave(target.x, target.y, 46, WEAPONS.attackDrone.color);
    }

    this.weaponCooldowns.attackDrone =
      this.elapsedMs + Math.max(perfect ? 120 : 170, (900 - level * 95 - (perfect ? 120 : 0)) * this.getFireRateMultiplier());
  }

  private updateHealDrone(deltaSeconds: number) {
    const level = this.getWeaponLevel('healDrone');
    if (level <= 0) {
      return;
    }
    const perfect = this.isWeaponPerfect('healDrone');

    if (level >= 4) {
      this.hp = clamp(this.hp + (perfect ? 4.2 : 1.8) * deltaSeconds, 0, this.maxHp);
      if (this.currentVehicle !== 'mech' && this.maxVehicleShield > 0) {
        this.vehicleShield = clamp(this.vehicleShield + (perfect ? 5.5 : 2.4) * deltaSeconds, 0, this.maxVehicleShield);
      }
    }

    if (this.elapsedMs < this.weaponCooldowns.healDrone || this.elapsedMs < this.healDroneBusyUntil) {
      return;
    }

    const heal = 7 + level * 7 + (perfect ? 18 : 0);
    const target = this.pickHealDroneTarget();
    if (!target || target.percent >= 0.995) {
      return;
    }

    const visual = this.getWeaponVisual('healDrone');
    const cooldown = Math.max(perfect ? 1450 : 2400, 6200 - level * 430 - (perfect ? 900 : 0));
    this.weaponCooldowns.healDrone = this.elapsedMs + cooldown;

    if (target.self) {
      this.animateSelfHealDrone(visual, heal, level);
      if (perfect) {
        this.healPulse(this.player.x, this.player.y, 112);
      }
      return;
    }

    this.animateAllyHealDrone(visual, target, heal, level);
    if (perfect) {
      this.healPulse(target.x, target.y, 94);
    }
  }

  private pickHealDroneTarget():
    | { self: true; percent: number; x: number; y: number }
    | { self: false; percent: number; socketId: string; x: number; y: number; name: string }
    | undefined {
    const candidates: Array<
      | { self: true; percent: number; x: number; y: number }
      | { self: false; percent: number; socketId: string; x: number; y: number; name: string }
    > = [
      {
        self: true,
        percent: this.maxHp > 0 ? this.hp / this.maxHp : 1,
        x: this.player.x,
        y: this.player.y,
      },
    ];

    this.latestRoomState?.players.forEach((player) => {
      if (
        !player.alive ||
        player.socketId === this.localSocketId ||
        player.teamKey !== this.localTeamKey
      ) {
        return;
      }

      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, player.x, player.y);
      const healLevel = this.getWeaponLevel('healDrone');
      const healRange = this.targetRange + healLevel * 45 + (this.isWeaponPerfect('healDrone') ? 180 : 0);
      if (distance > healRange) {
        return;
      }

      const maxHp = Math.max(1, player.maxHp ?? 1);
      candidates.push({
        self: false,
        percent: clamp((player.hp ?? maxHp) / maxHp, 0, 1),
        socketId: player.socketId,
        x: player.x,
        y: player.y,
        name: player.name,
      });
    });

    return candidates.sort((a, b) => a.percent - b.percent)[0];
  }

  private animateSelfHealDrone(visual: Phaser.GameObjects.Image, heal: number, level: number) {
    this.healDroneBusyUntil = this.elapsedMs + 640;
    this.tweens.addCounter({
      from: 0,
      to: Math.PI * 2,
      duration: 560,
      ease: 'Sine.easeInOut',
      onUpdate: (tween) => {
        const angle = tween.getValue() ?? 0;
        visual.setPosition(this.player.x + Math.cos(angle) * 54, this.player.y + Math.sin(angle) * 54);
        visual.setRotation(angle + Math.PI / 2);
      },
      onComplete: () => {
        this.applyLocalHeal(heal);
        this.flashAt(this.player.x, this.player.y, WEAPONS.healDrone.color, 10 + level * 2);
        this.healPulse(this.player.x, this.player.y, 46 + level * 8);
      },
    });
  }

  private animateAllyHealDrone(
    visual: Phaser.GameObjects.Image,
    target: { socketId: string; x: number; y: number; name: string },
    heal: number,
    level: number,
  ) {
    const startX = visual.x;
    const startY = visual.y;
    const distance = Phaser.Math.Distance.Between(startX, startY, target.x, target.y);
    const outboundMs = clamp(distance * 1.15, 260, 760);
    const returnMs = clamp(distance * 0.9, 220, 640);
    this.healDroneBusyUntil = this.elapsedMs + outboundMs + returnMs + 120;

    this.tweens.add({
      targets: visual,
      x: target.x,
      y: target.y,
      duration: outboundMs,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.socket?.emit('team:heal', { targetSocketId: target.socketId, amount: heal });
        this.flashAt(target.x, target.y, WEAPONS.healDrone.color, 10 + level * 2);
        this.healPulse(target.x, target.y, 46 + level * 8);
        this.tweens.add({
          targets: visual,
          x: startX,
          y: startY,
          duration: returnMs,
          ease: 'Sine.easeInOut',
        });
      },
    });
  }

  private applyTeamHeal(amount: number, healerName?: string) {
    this.applyLocalHeal(amount);
    this.flashAt(this.player.x, this.player.y, WEAPONS.healDrone.color, 12);
    this.healPulse(this.player.x, this.player.y, 58);
    if (healerName) {
      this.showAnnouncement(`${healerName} 的治疗无人机修复了你`, 2200);
    }
  }

  private applyRemotePlayerDamage(amount: number, attackerName?: string) {
    if (this.isGameOver || !this.isInMultiplayerRoom) {
      return;
    }

    const defeatedBy = attackerName ? `${attackerName}（敌对玩家）` : '敌对玩家';
    this.damagePlayer(amount, defeatedBy);
  }

  private applyLocalHeal(amount: number) {
    this.hp = clamp(this.hp + amount, 0, this.maxHp);
    this.sfxHeal();
    this.spawnDamageText(this.player.x, this.player.y - this.player.displayHeight * 0.4, amount, { heal: true });
    if (this.currentVehicle !== 'mech' && this.maxVehicleShield > 0) {
      this.vehicleShield = clamp(this.vehicleShield + amount * 0.8, 0, this.maxVehicleShield);
    }
  }

  private updateRocketLauncher() {
    const level = this.getWeaponLevel('rocketLauncher');
    if (level <= 0 || this.elapsedMs < this.weaponCooldowns.rocketLauncher) {
      return;
    }

    const perfect = this.isWeaponPerfect('rocketLauncher');
    const target = this.findNearestTarget(this.targetRange + 160 + level * 48 + (perfect ? 180 : 0));
    if (!target) {
      return;
    }

    const shots = perfect ? 4 : level >= 5 ? 2 : 1;
    const baseAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
    for (let i = 0; i < shots; i += 1) {
      const offset = (i - (shots - 1) / 2) * (perfect ? 0.22 : 0.16);
      this.spawnProjectileFrom({
        x: this.player.x + Math.cos(baseAngle + offset) * 34,
        y: this.player.y + Math.sin(baseAngle + offset) * 34,
        angle: baseAngle + offset,
        texture: 'shot-missile',
        damage: (26 + level * 22 + (perfect ? 28 : 0)) * this.getDamageMultiplier(),
        projectileSpeed: 520 + level * 52 + (perfect ? 160 : 0),
        ttl: perfect ? 1450 : 1250,
        aoe: 64 + level * 17 + (perfect ? 36 : 0),
        scale: perfect ? 1.28 : 1.08,
        tint: WEAPONS.rocketLauncher.color,
        trailColor: 0xff5d6f,
        impactColor: perfect ? 0xe8f7f4 : 0xf5c542,
      });
    }
    this.cameras.main.shake(perfect ? 110 : 70, perfect ? 0.004 : 0.0025);

    this.addThreatNoise(this.player.x, this.player.y, 34 + level * 4 + (perfect ? 10 : 0), 560 + level * 40);
    this.weaponCooldowns.rocketLauncher =
      this.elapsedMs + Math.max(perfect ? 720 : 820, (2450 - level * 170 - (perfect ? 80 : 0)) * this.getFireRateMultiplier());
  }

  private updateGrenadeLauncher() {
    const level = this.getWeaponLevel('grenadeLauncher');
    if (level <= 0 || this.elapsedMs < this.weaponCooldowns.grenadeLauncher) {
      return;
    }

    const perfect = this.isWeaponPerfect('grenadeLauncher');
    const target = this.findNearestTarget(this.targetRange + 120 + level * 38 + (perfect ? 150 : 0));
    if (!target) {
      return;
    }

    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
    const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, target.x, target.y);
    const shots = perfect ? 3 : 1;
    for (let i = 0; i < shots; i += 1) {
      const offset = (i - (shots - 1) / 2) * 0.24;
      this.spawnProjectileFrom({
        x: this.player.x + Math.cos(angle + offset) * 26,
        y: this.player.y + Math.sin(angle + offset) * 26,
        angle: angle + offset,
        texture: 'shot-grenade',
        damage: (18 + level * 18 + (perfect ? 22 : 0)) * this.getDamageMultiplier(),
        projectileSpeed: 330 + level * 38 + (perfect ? 130 : 0),
        ttl: clamp(distance * (perfect ? 1.65 : 2.1), 420, perfect ? 980 : 1150),
        aoe: 82 + level * 23 + (perfect ? 42 : 0),
        scale: perfect ? 1.28 : 1.05,
        explodeOnExpire: true,
        tint: WEAPONS.grenadeLauncher.color,
        trailColor: perfect ? 0xe8f7f4 : 0xf5c542,
        impactColor: 0xf5c542,
      });
    }

    this.addThreatNoise(this.player.x, this.player.y, 24 + level * 4 + (perfect ? 8 : 0), 480 + level * 38);
    this.weaponCooldowns.grenadeLauncher =
      this.elapsedMs + Math.max(perfect ? 860 : 980, (3050 - level * 190 - (perfect ? 120 : 0)) * this.getFireRateMultiplier());
  }

  private updateTeslaEmitter() {
    const level = this.getWeaponLevel('teslaEmitter');
    if (level <= 0 || this.elapsedMs < this.weaponCooldowns.teslaEmitter) {
      return;
    }

    const perfect = this.isWeaponPerfect('teslaEmitter');
    const targets = this.getTargetsInRange(
      215 + level * 46 + (perfect ? 70 : 0),
      perfect ? 5 : 1 + Math.floor(level / 2),
    );
    if (targets.length === 0) {
      return;
    }

    targets.forEach((target, index) => {
      const damage = (11 + level * 8 + (perfect ? 8 : 0)) * this.getDamageMultiplier() * Math.max(0.35, 1 - index * (perfect ? 0.14 : 0.18));
      this.damageTarget(target, damage);
      this.drawLightningBolt(
        index === 0 ? this.player.x : targets[index - 1].x,
        index === 0 ? this.player.y : targets[index - 1].y,
        target.x,
        target.y,
        perfect ? 0xe8f7f4 : WEAPONS.teslaEmitter.color,
        1.7 + level * 0.42 + (perfect ? 0.65 : 0),
        perfect ? 175 : 150,
      );
      if (perfect) {
        this.shockwave(target.x, target.y, 26, WEAPONS.teslaEmitter.color);
      }
    });

    this.weaponCooldowns.teslaEmitter =
      this.elapsedMs + Math.max(perfect ? 440 : 520, (1420 - level * 115 - (perfect ? 80 : 0)) * this.getFireRateMultiplier());
  }

  private updateBeamCannon() {
    const level = this.getWeaponLevel('beamCannon');
    if (level <= 0 || this.elapsedMs < this.weaponCooldowns.beamCannon) {
      return;
    }

    const perfect = this.isWeaponPerfect('beamCannon');
    const target = this.findNearestEnemyOrPlayer(this.targetRange + 260 + level * 54 + (perfect ? 220 : 0));
    if (!target) {
      return;
    }

    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
    this.drawBeam(this.player.x, this.player.y, target.x, target.y, perfect ? 0xe8f7f4 : WEAPONS.beamCannon.color, 4 + level * 0.45 + (perfect ? 2 : 0), perfect ? 260 : 190);
    const reach = 760 + level * 95 + (perfect ? 320 : 0);
    const beamWidth = 0.13 + level * 0.016 + (perfect ? 0.09 : 0);
    const damage = (18 + level * 16 + (perfect ? 28 : 0)) * this.getDamageMultiplier();
    this.enemies.getChildren().forEach((rawEnemy) => {
      const enemy = rawEnemy as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) {
        return;
      }
      const distanceAlong = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
      if (distanceAlong > reach) {
        return;
      }
      const enemyAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, enemy.x, enemy.y);
      const delta = Math.abs(Phaser.Math.Angle.Wrap(enemyAngle - angle));
      if (delta < beamWidth) {
        this.damageEnemy(enemy, damage);
      }
    });
    this.getHostilePlayerTargets(reach).forEach((player) => {
      const distanceAlong = Phaser.Math.Distance.Between(this.player.x, this.player.y, player.x, player.y);
      if (distanceAlong > reach) {
        return;
      }
      const playerAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, player.x, player.y);
      const delta = Math.abs(Phaser.Math.Angle.Wrap(playerAngle - angle));
      if (delta < beamWidth) {
        this.damageRemotePlayer(player, damage);
      }
    });
    if (perfect) {
      this.shockwave(target.x, target.y, 72, WEAPONS.beamCannon.color);
    }
    this.weaponCooldowns.beamCannon =
      this.elapsedMs + Math.max(perfect ? 980 : 1150, (3300 - level * 180 - (perfect ? 120 : 0)) * this.getFireRateMultiplier());
  }

  private updateOrbitalBeacon() {
    const level = this.getWeaponLevel('orbitalBeacon');
    if (level <= 0 || this.elapsedMs < this.weaponCooldowns.orbitalBeacon) {
      return;
    }

    const perfect = this.isWeaponPerfect('orbitalBeacon');
    const target = this.findNearestTarget(this.targetRange + 220 + level * 50 + (perfect ? 220 : 0));
    if (!target) {
      return;
    }

    const radius = 100 + level * 28 + (perfect ? 98 : 0);
    const strikes = perfect ? 5 : 1;
    this.time.delayedCall(260, () => {
      if (this.isGameOver) {
        return;
      }
      for (let i = 0; i < strikes; i += 1) {
        const angle = (i / strikes) * Math.PI * 2 + this.elapsedMs * 0.001;
        const strikeX = target.x + (perfect ? Math.cos(angle) * 92 : 0);
        const strikeY = target.y + (perfect ? Math.sin(angle) * 92 : 0);
        const damage = (34 + level * 29 + (perfect ? 64 : 0)) * this.getDamageMultiplier();
        this.splashDamage(strikeX, strikeY, radius, damage);
        this.splashDamageRemotePlayers(strikeX, strikeY, radius, damage);
        this.splashDamageChests(strikeX, strikeY, radius, 24 + level * 20 + (perfect ? 28 : 0));
        this.drawArcBolt(strikeX, strikeY - 320, strikeX, strikeY, perfect ? 0xe8f7f4 : WEAPONS.orbitalBeacon.color, perfect ? 6 : 4, 180);
        this.shockwave(strikeX, strikeY, radius, WEAPONS.orbitalBeacon.color);
        this.flashAt(strikeX, strikeY, WEAPONS.orbitalBeacon.color, 18 + level * 3);
      }
      this.cameras.main.shake(perfect ? 150 : 100, perfect ? 0.005 : 0.0035);
    });
    this.shockwave(target.x, target.y, radius * 0.7, WEAPONS.orbitalBeacon.color);
    this.weaponCooldowns.orbitalBeacon =
      this.elapsedMs + Math.max(perfect ? 1550 : 1850, (4300 - level * 240 - (perfect ? 120 : 0)) * this.getFireRateMultiplier());
  }

  private updateSawLauncher() {
    const level = this.getWeaponLevel('sawLauncher');
    if (level <= 0 || this.elapsedMs < this.weaponCooldowns.sawLauncher) {
      return;
    }

    const perfect = this.isWeaponPerfect('sawLauncher');
    const target = this.findNearestTarget(this.targetRange + 110 + level * 42 + (perfect ? 160 : 0));
    if (!target) {
      return;
    }

    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
    const shots = perfect ? 3 : level >= 4 ? 2 : 1;
    for (let i = 0; i < shots; i += 1) {
      const offset = (i - (shots - 1) / 2) * 0.18;
      this.spawnProjectileFrom({
        x: this.player.x + Math.cos(angle + offset) * 30,
        y: this.player.y + Math.sin(angle + offset) * 30,
        angle: angle + offset,
        texture: 'shot-saw',
        damage: (16 + level * 12 + (perfect ? 20 : 0)) * this.getDamageMultiplier(),
        projectileSpeed: 500 + level * 46 + (perfect ? 140 : 0),
        ttl: perfect ? 1800 : 1450,
        aoe: perfect ? 34 : 0,
        scale: perfect ? 1.25 : 1,
        tint: WEAPONS.sawLauncher.color,
        trailColor: 0xc9ff6a,
        impactColor: 0xc9ff6a,
        pierce: true,
        hitIntervalMs: perfect ? 110 : 150,
      });
    }
    this.weaponCooldowns.sawLauncher =
      this.elapsedMs + Math.max(perfect ? 520 : 720, (1900 - level * 175 - (perfect ? 180 : 0)) * this.getFireRateMultiplier());
  }

  private updateCryoMine() {
    const level = this.getWeaponLevel('cryoMine');
    if (level <= 0 || this.elapsedMs < this.weaponCooldowns.cryoMine) {
      return;
    }

    const perfect = this.isWeaponPerfect('cryoMine');
    const target = this.findNearestTarget(this.targetRange + 120 + level * 40 + (perfect ? 160 : 0));
    if (!target) {
      return;
    }

    const radius = 76 + level * 20 + (perfect ? 54 : 0);
    const damage = (20 + level * 16 + (perfect ? 28 : 0)) * this.getDamageMultiplier();
    const marker = this.add
      .circle(target.x, target.y, radius, WEAPONS.cryoMine.color, 0.1)
      .setStrokeStyle(2, WEAPONS.cryoMine.color, 0.72)
      .setDepth(33);
    this.tweens.add({
      targets: marker,
      scale: 0.58,
      yoyo: true,
      repeat: perfect ? 2 : 1,
      duration: 170,
      ease: 'Sine.easeInOut',
    });
    this.time.delayedCall(perfect ? 330 : 460, () => {
      marker.destroy();
      this.splashDamage(target.x, target.y, radius, damage);
      this.splashDamageRemotePlayers(target.x, target.y, radius, damage);
      this.splashDamageChests(target.x, target.y, radius, damage * 0.5);
      this.shockwave(target.x, target.y, radius, WEAPONS.cryoMine.color);
      this.flashAt(target.x, target.y, WEAPONS.cryoMine.color, 16);
      this.slowEnemiesInRadius(target.x, target.y, radius, perfect ? 0.42 : 0.58, perfect ? 2100 : 1400);
    });
    this.weaponCooldowns.cryoMine =
      this.elapsedMs + Math.max(perfect ? 820 : 1050, (2600 - level * 230 - (perfect ? 260 : 0)) * this.getFireRateMultiplier());
  }

  private updateNanoSwarm() {
    const level = this.getWeaponLevel('nanoSwarm');
    if (level <= 0 || this.elapsedMs < this.weaponCooldowns.nanoSwarm) {
      return;
    }

    const perfect = this.isWeaponPerfect('nanoSwarm');
    const range = 180 + level * 44 + (perfect ? 160 : 0);
    const targets = this.getTargetsInRange(range, perfect ? 8 : 2 + Math.floor(level / 2));
    if (targets.length === 0) {
      return;
    }

    targets.forEach((target, index) => {
      const damage = (10 + level * 8 + (perfect ? 12 : 0)) * this.getDamageMultiplier() * Math.max(0.45, 1 - index * 0.08);
      this.damageTarget(target, damage);
      this.drawSwarmTrail(this.player.x, this.player.y, target.x, target.y, WEAPONS.nanoSwarm.color, perfect ? 10 : 5 + level);
      this.flashAt(target.x, target.y, WEAPONS.nanoSwarm.color, perfect ? 8 : 5);
    });
    if (perfect) {
      this.healPulse(this.player.x, this.player.y, 60);
      this.hp = clamp(this.hp + targets.length * 1.8, 0, this.maxHp);
    }
    this.weaponCooldowns.nanoSwarm =
      this.elapsedMs + Math.max(perfect ? 260 : 380, (1150 - level * 105 - (perfect ? 130 : 0)) * this.getFireRateMultiplier());
  }

  private updateGravityWell() {
    const level = this.getWeaponLevel('gravityWell');
    if (level <= 0 || this.elapsedMs < this.weaponCooldowns.gravityWell) {
      return;
    }

    const perfect = this.isWeaponPerfect('gravityWell');
    const target = this.findNearestTarget(this.targetRange + 170 + level * 40 + (perfect ? 180 : 0));
    if (!target) {
      return;
    }

    const radius = 135 + level * 30 + (perfect ? 84 : 0);
    const duration = perfect ? 1800 : 1250;
    const well = this.add
      .circle(target.x, target.y, radius, WEAPONS.gravityWell.color, 0.08)
      .setStrokeStyle(perfect ? 4 : 3, WEAPONS.gravityWell.color, 0.8)
      .setDepth(32);
    this.tweens.add({
      targets: well,
      scale: 0.72,
      alpha: 0.22,
      yoyo: true,
      repeat: 3,
      duration: duration / 4,
      ease: 'Sine.easeInOut',
      onComplete: () => well.destroy(),
    });
    const swirlCount = perfect ? 10 : 7;
    for (let i = 0; i < swirlCount; i += 1) {
      const angle = (i / swirlCount) * Math.PI * 2;
      const startDistance = radius * Phaser.Math.FloatBetween(0.55, 0.95);
      const mote = this.add
        .circle(
          target.x + Math.cos(angle) * startDistance,
          target.y + Math.sin(angle) * startDistance,
          perfect ? 5 : 4,
          WEAPONS.gravityWell.color,
          0.82,
        )
        .setDepth(34);
      this.tweens.add({
        targets: mote,
        x: target.x,
        y: target.y,
        alpha: 0,
        scale: 0.35,
        duration: duration * Phaser.Math.FloatBetween(0.55, 0.95),
        delay: i * 45,
        ease: 'Cubic.easeIn',
        onComplete: () => mote.destroy(),
      });
    }
    const ticks = perfect ? 14 : 10;
    for (let tick = 0; tick < ticks; tick += 1) {
      this.time.delayedCall(tick * (duration / ticks), () => {
        if (!this.isGameOver && this.isInMultiplayerRoom) {
          this.pullAndDamageTargets(
            target.x,
            target.y,
            radius,
            (5 + level * 4 + (perfect ? 7 : 0)) * this.getDamageMultiplier(),
            perfect ? 54 : 42,
          );
        }
      });
    }
    this.weaponCooldowns.gravityWell =
      this.elapsedMs + Math.max(perfect ? 1800 : 2150, (4700 - level * 235 - (perfect ? 180 : 0)) * this.getFireRateMultiplier());
  }

  private updateIonLance() {
    const level = this.getWeaponLevel('ionLance');
    if (level <= 0 || this.elapsedMs < this.weaponCooldowns.ionLance) {
      return;
    }

    const perfect = this.isWeaponPerfect('ionLance');
    const target = this.findNearestEnemyOrPlayer(this.targetRange + 310 + level * 62 + (perfect ? 240 : 0));
    if (!target) {
      return;
    }

    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
    const shots = perfect ? 2 : 1;
    for (let i = 0; i < shots; i += 1) {
      const offset = (i - (shots - 1) / 2) * 0.06;
      this.spawnProjectileFrom({
        x: this.player.x + Math.cos(angle + offset) * 34,
        y: this.player.y + Math.sin(angle + offset) * 34,
        angle: angle + offset,
        texture: 'shot-ion',
        damage: (42 + level * 28 + (perfect ? 42 : 0)) * this.getDamageMultiplier(),
        projectileSpeed: 940 + level * 80 + (perfect ? 240 : 0),
        ttl: perfect ? 1450 : 1180,
        aoe: perfect ? 46 : 18,
        scale: perfect ? 1.3 : 1.05,
        tint: WEAPONS.ionLance.color,
        trailColor: 0x9ec8ff,
        impactColor: 0xe8f7f4,
      });
    }
    this.cameras.main.shake(perfect ? 90 : 55, perfect ? 0.0032 : 0.0018);
    this.weaponCooldowns.ionLance =
      this.elapsedMs + Math.max(perfect ? 760 : 980, (3000 - level * 260 - (perfect ? 280 : 0)) * this.getFireRateMultiplier());
  }

  private spawnProjectile(angle: number, vehicle: VehicleSpec) {
    const color = this.getProjectileColor(vehicle.projectileTexture);
    this.spawnProjectileFrom({
      x: this.player.x + Math.cos(angle) * 28,
      y: this.player.y + Math.sin(angle) * 28,
      angle,
      texture: vehicle.projectileTexture,
      damage: vehicle.damage * this.getDamageMultiplier(),
      projectileSpeed: vehicle.projectileSpeed,
      ttl: 1150,
      aoe: vehicle.aoe,
      scale: vehicle.projectileScale,
      trailColor: color,
      impactColor: color,
    });
  }

  private spawnPerfectVehicleEffect(angle: number, vehicle: VehicleSpec, color: number) {
    if (this.currentVehicle === 'mech' || this.getVehicleRank(this.currentVehicle) < PERFECT_VEHICLE_RANK) {
      return;
    }

    switch (this.currentVehicle) {
      case 'motorcycle':
      case 'buggy':
        [-0.34, 0.34].forEach((offset) => {
          this.spawnProjectileFrom({
            x: this.player.x + Math.cos(angle + offset) * 24,
            y: this.player.y + Math.sin(angle + offset) * 24,
            angle: angle + offset,
            texture: 'shot-pulse',
            damage: vehicle.damage * 0.42 * this.getDamageMultiplier(),
            projectileSpeed: vehicle.projectileSpeed * 1.12,
            ttl: 760,
            aoe: 0,
            scale: 0.72,
            tint: 0x9ec8ff,
            trailColor: 0x9ec8ff,
            impactColor: 0x9ec8ff,
          });
        });
        break;
      case 'tank':
      case 'artillery':
      case 'flameRig':
        this.time.delayedCall(180, () => {
          if (!this.player.active || this.currentVehicle === 'mech') {
            return;
          }
          const target = this.findNearestTarget(this.targetRange + 180);
          const strikeX = target?.x ?? this.player.x + Math.cos(angle) * 360;
          const strikeY = target?.y ?? this.player.y + Math.sin(angle) * 360;
          const radius = vehicle.aoe > 0 ? vehicle.aoe * 1.35 : 96;
          this.splashDamage(strikeX, strikeY, radius, vehicle.damage * 0.72 * this.getDamageMultiplier());
          this.splashDamageRemotePlayers(strikeX, strikeY, radius, vehicle.damage * 0.58 * this.getDamageMultiplier());
          this.shockwave(strikeX, strikeY, radius, color);
          this.flashAt(strikeX, strikeY, color, 16);
        });
        break;
      case 'fighter':
      case 'hovercraft':
        for (let i = 0; i < 2; i += 1) {
          const offset = (i === 0 ? -1 : 1) * 0.22;
          this.spawnProjectileFrom({
            x: this.player.x + Math.cos(angle + offset) * 32,
            y: this.player.y + Math.sin(angle + offset) * 32,
            angle: angle + offset,
            texture: 'shot-missile',
            damage: vehicle.damage * 0.5 * this.getDamageMultiplier(),
            projectileSpeed: vehicle.projectileSpeed * 0.92,
            ttl: 1180,
            aoe: 54,
            scale: 0.82,
            tint: 0xf5c542,
            trailColor: 0xf5c542,
            impactColor: 0xf5c542,
          });
        }
        break;
      case 'railgun':
      case 'laserVan':
        this.drawBeam(this.player.x, this.player.y, this.player.x + Math.cos(angle) * 840, this.player.y + Math.sin(angle) * 840, 0xe8f7f4, 3.2, 170);
        this.enemies.getChildren().forEach((rawEnemy) => {
          const enemy = rawEnemy as Phaser.Physics.Arcade.Sprite;
          if (!enemy.active) {
            return;
          }
          const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
          if (distance > 840) {
            return;
          }
          const enemyAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, enemy.x, enemy.y);
          if (Math.abs(Phaser.Math.Angle.Wrap(enemyAngle - angle)) < 0.075) {
            this.damageEnemy(enemy, vehicle.damage * 0.36 * this.getDamageMultiplier());
          }
        });
        this.splashDamageRemotePlayers(this.player.x + Math.cos(angle) * 420, this.player.y + Math.sin(angle) * 420, 90, vehicle.damage * 0.32 * this.getDamageMultiplier());
        break;
      case 'walker':
        this.shockwave(this.player.x, this.player.y, 112, 0xb285ff);
        this.getTargetsInRange(240, 4).forEach((target, index) => {
          this.damageTarget(target, vehicle.damage * (0.22 - index * 0.025) * this.getDamageMultiplier());
          this.drawArcBolt(this.player.x, this.player.y, target.x, target.y, 0xb285ff, 2.2, 130);
        });
        break;
    }
  }

  private spawnProjectileFrom(config: {
    x: number;
    y: number;
    angle: number;
    texture: string;
    damage: number;
    projectileSpeed: number;
    ttl: number;
    aoe: number;
    scale: number;
    explodeOnExpire?: boolean;
    pierce?: boolean;
    hitIntervalMs?: number;
    tint?: number;
    trailColor?: number;
    impactColor?: number;
  }) {
    const projectile = this.projectiles.get(
      config.x,
      config.y,
      config.texture,
    ) as Phaser.Physics.Arcade.Image | null;

    if (!projectile) {
      return;
    }

    projectile
      .setActive(true)
      .setVisible(true)
      .setDepth(30)
      .setRotation(config.angle)
      .setScale(config.scale);
    if (config.tint) {
      projectile.setTint(config.tint);
    } else {
      projectile.clearTint();
    }
    projectile.setData('damage', config.damage);
    projectile.setData('ttl', config.ttl);
    projectile.setData('aoe', config.aoe);
    projectile.setData('explodeOnExpire', config.explodeOnExpire ?? false);
    projectile.setData('pierce', config.pierce ?? false);
    projectile.setData('hitIntervalMs', config.hitIntervalMs ?? 180);
    projectile.setData('hitMap', new Map<unknown, number>());
    projectile.setData('trailColor', config.trailColor ?? config.tint ?? this.getProjectileColor(config.texture));
    projectile.setData('impactColor', config.impactColor ?? config.tint ?? this.getProjectileColor(config.texture));
    projectile.setData('lastTrailAt', this.elapsedMs);

    const body = projectile.body as Phaser.Physics.Arcade.Body;
    body.enable = true;
    body.setAllowGravity(false);
    body.setSize(projectile.width, projectile.height, true);
    body.setVelocity(
      Math.cos(config.angle) * config.projectileSpeed,
      Math.sin(config.angle) * config.projectileSpeed,
    );
    this.muzzleBurst(config.x, config.y, config.angle, projectile.getData('trailColor') as number);
    if (this.elapsedMs >= this.nextProjectileSfxAt) {
      this.nextProjectileSfxAt = this.elapsedMs + 55;
      this.sfxShoot(config.texture);
    }
  }

  private updateProjectiles(delta: number) {
    this.projectiles.getChildren().forEach((rawProjectile) => {
      const projectile = rawProjectile as Phaser.Physics.Arcade.Image;
      if (!projectile.active) {
        return;
      }

      if (projectile.texture.key === 'shot-saw') {
        projectile.rotation += delta * 0.018;
      }
      this.emitProjectileTrail(projectile);
      if (!projectile.getData('ignoreRemotePlayers') && this.hitRemotePlayerWithProjectile(projectile)) {
        return;
      }

      const ttl = (projectile.getData('ttl') as number) - delta;
      projectile.setData('ttl', ttl);
      if (
        ttl <= 0 ||
        projectile.x < -80 ||
        projectile.x > WORLD_WIDTH + 80 ||
        projectile.y < -80 ||
        projectile.y > WORLD_HEIGHT + 80
      ) {
        if (projectile.getData('explodeOnExpire')) {
          this.explodeProjectile(projectile);
        } else {
          projectile.destroy();
        }
      }
    });
  }

  private updateEnemyProjectiles(delta: number) {
    this.enemyProjectiles.getChildren().forEach((rawProjectile) => {
      const projectile = rawProjectile as Phaser.Physics.Arcade.Image;
      if (!projectile.active) {
        return;
      }

      const lastTrailAt = (projectile.getData('lastTrailAt') as number | undefined) ?? 0;
      if (this.elapsedMs - lastTrailAt > (this.isLowFxMode() ? 90 : 45)) {
        projectile.setData('lastTrailAt', this.elapsedMs);
        const trail = this.add.circle(projectile.x, projectile.y, 4, 0xff5d6f, 0.35).setDepth(22);
        this.tweens.add({
          targets: trail,
          alpha: 0,
          scale: 2,
          duration: 220,
          ease: 'Sine.easeOut',
          onComplete: () => trail.destroy(),
        });
      }

      const ttl = (projectile.getData('ttl') as number) - delta;
      projectile.setData('ttl', ttl);
      if (
        ttl <= 0 ||
        projectile.x < -80 ||
        projectile.x > WORLD_WIDTH + 80 ||
        projectile.y < -80 ||
        projectile.y > WORLD_HEIGHT + 80
      ) {
        projectile.destroy();
      }
    });
  }

  private handleEnemyProjectileHit(
    _playerObject: ArcadeOverlapObject,
    projectileObject: ArcadeOverlapObject,
  ) {
    const projectile = projectileObject as Phaser.Physics.Arcade.Image;
    if (!projectile.active) {
      return;
    }

    const damage = projectile.getData('damage') as number;
    this.damagePlayer(damage, ENEMIES.turret.name);
    this.flashAt(projectile.x, projectile.y, 0xff5d6f, 8);
    projectile.destroy();
  }

  private explodeProjectile(projectile: Phaser.Physics.Arcade.Image) {
    if (!projectile.active) {
      return;
    }

    const damage = projectile.getData('damage') as number;
    const aoe = projectile.getData('aoe') as number;
    const x = projectile.x;
    const y = projectile.y;

    if (aoe > 0) {
      this.sfxExplosion();
      this.splashDamage(x, y, aoe, damage);
      this.splashDamageRemotePlayers(x, y, aoe, damage);
      this.splashDamageChests(x, y, aoe, damage);
      const impactColor = projectile.getData('impactColor') as number;
      if (aoe > 60) {
        this.bigExplosion(x, y, impactColor, Math.max(20, aoe / 3));
      } else {
        this.flashAt(x, y, impactColor, Math.max(14, aoe / 4));
        this.shockwave(x, y, aoe, impactColor);
      }
      this.cameras.main.shake(90, clamp(aoe / 36000, 0.002, 0.006));
    }

    projectile.destroy();
  }

  private hitRemotePlayerWithProjectile(projectile: Phaser.Physics.Arcade.Image) {
    const target = this.findRemotePlayerAt(projectile.x, projectile.y, Math.max(24, projectile.displayWidth * 0.55 + 18));
    if (!target) {
      return false;
    }

    const damage = projectile.getData('damage') as number;
    const aoe = projectile.getData('aoe') as number;
    const impactColor = projectile.getData('impactColor') as number;
    const hitX = projectile.x;
    const hitY = projectile.y;
    const pierce = Boolean(projectile.getData('pierce'));

    if (pierce && !this.registerPierceHit(projectile, target.socketId)) {
      return false;
    }

    this.damageRemotePlayer(target, damage);
    this.impactBurst(hitX, hitY, impactColor, aoe > 0 ? 1.35 : 0.9);
    if (!pierce) {
      projectile.destroy();
    }

    if (aoe > 0) {
      this.splashDamage(hitX, hitY, aoe, damage * 0.62);
      this.splashDamageRemotePlayers(hitX, hitY, aoe, damage * 0.62, target.socketId);
      this.splashDamageChests(hitX, hitY, aoe, damage * 0.62);
      this.flashAt(hitX, hitY, impactColor, Math.max(10, aoe / 4));
      this.shockwave(hitX, hitY, aoe, impactColor);
    }

    return !pierce;
  }

  private updateEnemies(deltaSeconds: number) {
    let aggroTotal = 0;
    let hunterCount = 0;
    let activeCount = 0;

    this.enemies.getChildren().forEach((rawEnemy) => {
      const enemy = rawEnemy as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) {
        return;
      }

      const kind = enemy.getData('kind') as EnemyKind;
      const spec = ENEMIES[kind];
      if (kind === 'boss') {
        const result = this.updateBoss(enemy, spec, deltaSeconds);
        aggroTotal += result.aggro;
        hunterCount += result.hunting ? 2 : 0;
        activeCount += 1;
        enemy.setTint(this.getEnemyTint(enemy));
        return;
      }
      const distanceToPlayer = Phaser.Math.Distance.Between(
        enemy.x,
        enemy.y,
        this.player.x,
        this.player.y,
      );
      const proximity = clamp(1 - distanceToPlayer / spec.noticeRadius, 0, 1);
      const vehicleHeat = this.currentVehicle === 'mech' ? 0 : 8;
      let aggro = enemy.getData('aggro') as number;

      if (proximity > 0) {
        aggro += (spec.proximityGain + vehicleHeat) * proximity * deltaSeconds;
      }

      const anchorX = enemy.getData('anchorX') as number;
      const anchorY = enemy.getData('anchorY') as number;
      if (spec.guardRadius) {
        const distanceToAnchor = Phaser.Math.Distance.Between(
          this.player.x,
          this.player.y,
          anchorX,
          anchorY,
        );
        if (distanceToAnchor < spec.guardRadius) {
          aggro += 20 * (1 - distanceToAnchor / spec.guardRadius) * deltaSeconds;
        }
      }

      const fogCalm = this.currentWeather === 'fog' ? 7 : 0;
      const decayRate = (distanceToPlayer > spec.noticeRadius ? spec.decay * 1.35 : spec.decay * 0.34) + fogCalm;
      aggro = clamp(aggro - decayRate * deltaSeconds, 0, 100);
      enemy.setData('aggro', aggro);

      if ((kind === 'hopper' || kind === 'leaper') && this.updateJumpingEnemy(enemy, spec, distanceToPlayer, aggro)) {
        hunterCount += 1;
        enemy.setTint(this.getEnemyTint(enemy));
        aggroTotal += aggro;
        activeCount += 1;
        return;
      }

      if (kind === 'turret') {
        enemy.setVelocity(0, 0);
        enemy.setRotation(Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y));
        if (aggro >= spec.chaseThreshold && distanceToPlayer <= spec.attackRange) {
          hunterCount += 1;
          this.turretAttack(enemy, spec);
        }
        enemy.setTint(this.getEnemyTint(enemy));
        aggroTotal += aggro;
        activeCount += 1;
        return;
      }

      if (kind === 'mortar' && aggro >= spec.chaseThreshold && distanceToPlayer <= spec.attackRange) {
        hunterCount += 1;
        enemy.setVelocity(0, 0);
        enemy.setRotation(Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y));
        this.mortarAttack(enemy, spec);
        enemy.setTint(this.getEnemyTint(enemy));
        aggroTotal += aggro;
        activeCount += 1;
        return;
      }

      if (aggro >= spec.chaseThreshold) {
        hunterCount += 1;
        this.chasePlayer(enemy, spec, aggro, distanceToPlayer);
      } else if (aggro >= 22) {
        this.watchPlayer(enemy, spec, aggro);
      } else {
        this.patrol(enemy, spec, deltaSeconds);
      }

      if (aggro >= spec.chaseThreshold && distanceToPlayer <= spec.attackRange) {
        if (kind === 'spark') {
          this.sparkAttack(enemy, spec);
        } else {
          this.enemyAttack(enemy, spec);
        }
      }

      this.updateEliteSkill(enemy, spec, distanceToPlayer);

      enemy.setTint(this.getEnemyTint(enemy));

      aggroTotal += aggro;
      activeCount += 1;
    });

    const averageAggro = activeCount > 0 ? aggroTotal / activeCount : 0;
    const targetAlert = clamp(averageAggro * 0.58 + hunterCount * 5.5, 0, 100);
    this.areaAlert += (targetAlert - this.areaAlert) * Math.min(1, deltaSeconds * 3.5);
  }

  private updateBoss(
    enemy: Phaser.Physics.Arcade.Sprite,
    spec: EnemySpec,
    deltaSeconds: number,
  ): { aggro: number; hunting: boolean } {
    const hp = enemy.getData('hp') as number;
    const maxHp = enemy.getData('maxHp') as number;
    const target = this.findBossTarget(enemy, Number.POSITIVE_INFINITY);
    const mode = enemy.getData('bossMode') as string | undefined;
    const healCooldownUntil = (enemy.getData('bossHealCooldownUntil') as number | undefined) ?? 0;

    if (!target) {
      enemy.setData('bossMode', 'heal');
      enemy.setVelocity(0, 0);
      this.healBoss(enemy, deltaSeconds, this.elapsedMs >= healCooldownUntil);
      enemy.setTint(hp < maxHp ? 0xa7e65d : this.getBossColor(enemy));
      return { aggro: hp < maxHp ? 48 : 18, hunting: false };
    }

    if (mode === 'heal') {
      enemy.setData('bossMode', 'attack');
    }

    const targetId = enemy.getData('bossTargetId') as string;
    if (targetId !== target.id) {
      enemy.setData('bossTargetId', target.id);
      enemy.setData('bossTargetSince', this.elapsedMs);
    }

    const targetSince = (enemy.getData('bossTargetSince') as number | undefined) ?? this.elapsedMs;
    const fleeUntil = (enemy.getData('bossFleeUntil') as number | undefined) ?? 0;
    const hasRecentlyFledThisTarget = (enemy.getData('bossFleeFromId') as string | undefined) === target.id && this.elapsedMs < fleeUntil + BOSS_FIXATION_MS;
    if (this.elapsedMs >= fleeUntil && !hasRecentlyFledThisTarget && this.elapsedMs - targetSince > BOSS_FIXATION_MS) {
      enemy.setData('bossMode', 'flee');
      enemy.setData('bossFleeUntil', this.elapsedMs + BOSS_FLEE_MS);
      enemy.setData('bossFleeFromId', target.id);
      enemy.setData('bossTargetSince', this.elapsedMs);
    }

    if ((enemy.getData('bossMode') as string) === 'flee') {
      if (this.elapsedMs < ((enemy.getData('bossFleeUntil') as number | undefined) ?? 0)) {
        this.moveBossAway(enemy, target, spec.speed * 1.35);
        enemy.setTint(0xf5c542);
        return { aggro: 100, hunting: true };
      }
      enemy.setData('bossMode', 'attack');
      enemy.setData('bossTargetSince', this.elapsedMs);
    }

    const distance = Phaser.Math.Distance.Between(enemy.x, enemy.y, target.x, target.y);
    if (distance > spec.attackRange * 0.8) {
      this.moveEnemyToward(enemy, target.x, target.y, spec.speed * 1.12);
    } else {
      enemy.setVelocity(0, 0);
    }

    if (target.isLocal && distance <= spec.attackRange) {
      this.enemyAttack(enemy, spec);
    }

    this.updateBossSkill(enemy, spec, target, distance);
    enemy.setTint(this.getBossColor(enemy));
    return { aggro: 100, hunting: true };
  }

  private getBossVariant(enemy: Phaser.Physics.Arcade.Sprite): BossVariantKey {
    const variant = enemy.getData('bossVariant') as BossVariantKey | undefined;
    return variant && BOSS_VARIANTS[variant] ? variant : 'annihilator';
  }

  private getBossColor(enemy: Phaser.Physics.Arcade.Sprite) {
    return BOSS_VARIANTS[this.getBossVariant(enemy)].color;
  }

  private getBossName(enemy: Phaser.Physics.Arcade.Sprite) {
    return BOSS_VARIANTS[this.getBossVariant(enemy)].name;
  }

  private findBossTarget(enemy: Phaser.Physics.Arcade.Sprite, range: number): BossTarget | undefined {
    const candidates: BossTarget[] = [];
    if (!this.isGameOver) {
      candidates.push({
        id: this.localSocketId || 'local',
        x: this.player.x,
        y: this.player.y,
        isLocal: true,
      });
    }

    this.latestRoomState?.players.forEach((player) => {
      if (!player.alive || player.socketId === this.localSocketId) {
        return;
      }
      candidates.push({
        id: player.socketId,
        x: player.x,
        y: player.y,
        isLocal: false,
      });
    });

      const lockedTargetId = enemy.getData('bossTargetId') as string | undefined;
    const lockedTarget = candidates.find((target) => target.id === lockedTargetId);
    if (lockedTarget) {
      return lockedTarget;
    }

    return candidates
      .map((target) => ({
        target,
        distance: Phaser.Math.Distance.Between(enemy.x, enemy.y, target.x, target.y),
      }))
      .filter((entry) => entry.distance <= range)
      .sort((a, b) => a.distance - b.distance)[0]?.target;
  }

  private healBoss(enemy: Phaser.Physics.Arcade.Sprite, deltaSeconds: number, canHeal: boolean) {
    if (!canHeal) {
      return;
    }

    const hp = enemy.getData('hp') as number;
    const maxHp = enemy.getData('maxHp') as number;
    if (hp >= maxHp) {
      return;
    }

    enemy.setData('hp', clamp(hp + maxHp * BOSS_HEAL_RATE * deltaSeconds, 0, maxHp));
    const lastFxAt = (enemy.getData('bossLastHealFxAt') as number | undefined) ?? 0;
    if (this.elapsedMs - lastFxAt > 700) {
      enemy.setData('bossLastHealFxAt', this.elapsedMs);
      this.healPulse(enemy.x, enemy.y, 90);
    }
  }

  private moveBossAway(enemy: Phaser.Physics.Arcade.Sprite, target: BossTarget, speed: number) {
    const angle = Phaser.Math.Angle.Between(target.x, target.y, enemy.x, enemy.y);
    enemy.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    enemy.setRotation(Phaser.Math.Angle.RotateTo(enemy.rotation, angle, 0.25));
  }

  private updateBossSkill(enemy: Phaser.Physics.Arcade.Sprite, spec: EnemySpec, target: BossTarget, distance: number) {
    const nextSkillAt = (enemy.getData('nextSkillAt') as number | undefined) ?? 0;
    if (this.elapsedMs < nextSkillAt) {
      return;
    }

    const variant = this.getBossVariant(enemy);
    const variantSpec = BOSS_VARIANTS[variant];
    const bossName = variantSpec.name;
    enemy.setData('nextSkillAt', this.elapsedMs + Phaser.Math.Between(variantSpec.skillDelay[0], variantSpec.skillDelay[1]));

    if (variant === 'stormLord') {
      const arcs = distance < 260 ? 4 : 3;
      for (let i = 0; i < arcs; i += 1) {
        const offset = (i - (arcs - 1) / 2) * 46;
        const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, target.x, target.y) + Math.PI / 2;
        const tx = target.x + Math.cos(angle) * offset + Phaser.Math.Between(-18, 18);
        const ty = target.y + Math.sin(angle) * offset + Phaser.Math.Between(-18, 18);
        this.drawArcBolt(enemy.x, enemy.y, tx, ty, variantSpec.color, 3.2, 170);
        this.shockwave(tx, ty, 58, variantSpec.color);
        if (target.isLocal && Phaser.Math.Distance.Between(this.player.x, this.player.y, tx, ty) < 86) {
          this.damagePlayer((enemy.getData('damage') as number) * 0.46, bossName);
        }
      }
      return;
    }

    if (variant === 'siegeCore') {
      const radius = distance < 240 ? 230 : 150;
      this.shockwave(enemy.x, enemy.y, radius, variantSpec.color);
      this.flashAt(enemy.x, enemy.y, variantSpec.color, 18);
      if (target.isLocal && Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y) < radius) {
        this.damagePlayer((enemy.getData('damage') as number) * 0.88, bossName);
      }
      for (let i = 0; i < 2; i += 1) {
        const spawnAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
        this.spawnEnemy(i % 2 === 0 ? 'leaper' : 'hopper', 'purple', {
          x: clamp(enemy.x + Math.cos(spawnAngle) * Phaser.Math.Between(80, 150), 60, WORLD_WIDTH - 60),
          y: clamp(enemy.y + Math.sin(spawnAngle) * Phaser.Math.Between(80, 150), 60, WORLD_HEIGHT - 60),
        });
      }
      return;
    }

    if (distance < 180) {
      this.shockwave(enemy.x, enemy.y, 180, variantSpec.color);
      if (target.isLocal) {
        this.damagePlayer((enemy.getData('damage') as number) * 1.25, bossName);
      }
      return;
    }

    this.drawArcBolt(enemy.x, enemy.y, target.x, target.y, variantSpec.color, 4, 220);
    if (target.isLocal && distance < 520) {
      this.damagePlayer((enemy.getData('damage') as number) * 0.62, bossName);
    }
  }

  private updateEliteSkill(enemy: Phaser.Physics.Arcade.Sprite, spec: EnemySpec, distanceToPlayer: number) {
    const tier = enemy.getData('tier') as EnemyTier;
    if (tier !== 'purple' && tier !== 'red') {
      return;
    }

    const nextSkillAt = (enemy.getData('nextSkillAt') as number | undefined) ?? 0;
    if (this.elapsedMs < nextSkillAt) {
      return;
    }

    const kind = enemy.getData('kind') as EnemyKind;
    enemy.setData('nextSkillAt', this.elapsedMs + Phaser.Math.Between(3200, 5200));

    if (kind === 'mender') {
      this.healNearbyEnemies(enemy.x, enemy.y, tier === 'red' ? 160 : 110);
      return;
    }

    if (kind === 'sniper' && distanceToPlayer < 620) {
      this.drawArcBolt(enemy.x, enemy.y, this.player.x, this.player.y, 0x4d8eff, tier === 'red' ? 3.5 : 2.5, 160);
      this.damagePlayer(spec.damage * (tier === 'red' ? 0.9 : 0.62), spec.name);
      return;
    }

    if ((kind === 'bomber' || kind === 'crusher') && distanceToPlayer < 150) {
      const radius = tier === 'red' ? 150 : 105;
      this.shockwave(enemy.x, enemy.y, radius, 0xf5c542);
      this.damagePlayer(spec.damage * (tier === 'red' ? 1.1 : 0.72), spec.name);
      return;
    }

    if (kind === 'stalker' || kind === 'drone') {
      this.moveEnemyToward(enemy, this.player.x, this.player.y, this.getEnemySpeed(enemy, spec) * 1.85);
      this.flashAt(enemy.x, enemy.y, ENEMY_TIERS[tier].color, 8);
    }
  }

  private updateJumpingEnemy(
    enemy: Phaser.Physics.Arcade.Sprite,
    spec: EnemySpec,
    distanceToPlayer: number,
    aggro: number,
  ) {
    const jumpUntil = (enemy.getData('jumpUntil') as number | undefined) ?? 0;
    const landingAt = (enemy.getData('jumpLandingAt') as number | undefined) ?? 0;
    if (jumpUntil > this.elapsedMs) {
      enemy.setRotation(Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y));
      return true;
    }

    if (landingAt > 0 && this.elapsedMs >= landingAt) {
      enemy.setData('jumpLandingAt', 0);
      enemy.setScale(1);
      const radius = spec.name === ENEMIES.leaper.name ? 84 : 58;
      this.shockwave(enemy.x, enemy.y, radius, 0x9ec8ff);
      if (distanceToPlayer <= radius) {
        this.damagePlayer((enemy.getData('damage') as number) * 1.1, spec.name);
      }
      return false;
    }

    const nextSkillAt = (enemy.getData('nextSkillAt') as number | undefined) ?? 0;
    if (aggro < spec.chaseThreshold || this.elapsedMs < nextSkillAt || distanceToPlayer < 120 || distanceToPlayer > 560) {
      return false;
    }

    const duration = spec.name === ENEMIES.leaper.name ? 560 : 430;
    const speed = clamp(distanceToPlayer / (duration / 1000), 360, spec.name === ENEMIES.leaper.name ? 760 : 680);
    const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
    enemy.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    enemy.setData('jumpUntil', this.elapsedMs + duration);
    enemy.setData('jumpLandingAt', this.elapsedMs + duration);
    enemy.setData('nextSkillAt', this.elapsedMs + Phaser.Math.Between(2600, 4300));
    enemy.setScale(1.16);
    this.flashAt(enemy.x, enemy.y, 0x9ec8ff, 8);
    return true;
  }

  private healNearbyEnemies(x: number, y: number, amount: number) {
    this.healPulse(x, y, 150);
    this.enemies.getChildren().forEach((rawEnemy) => {
      const enemy = rawEnemy as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active || Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y) > 180) {
        return;
      }

      const hp = enemy.getData('hp') as number;
      const maxHp = enemy.getData('maxHp') as number;
      enemy.setData('hp', clamp(hp + amount, 0, maxHp));
    });
  }

  private getEnemyTint(enemy: Phaser.Physics.Arcade.Sprite) {
    if (enemy.getData('isBoss')) {
      const mode = enemy.getData('bossMode');
      if (mode === 'heal') return 0xa7e65d;
      if (mode === 'flee') return 0xf5c542;
      return this.getBossColor(enemy);
    }
    const tier = enemy.getData('tier') as EnemyTier | undefined;
    return tier ? ENEMY_TIERS[tier].color : 0xe8f7f4;
  }

  private getEnemySpeed(enemy: Phaser.Physics.Arcade.Sprite, fallback: EnemySpec) {
    const baseSpeed = (enemy.getData('speed') as number | undefined) ?? fallback.speed;
    const slowUntil = (enemy.getData('slowUntil') as number | undefined) ?? 0;
    if (this.elapsedMs >= slowUntil) {
      enemy.setData('slowMultiplier', 1);
      return baseSpeed;
    }

    return baseSpeed * ((enemy.getData('slowMultiplier') as number | undefined) ?? 1);
  }

  private patrol(
    enemy: Phaser.Physics.Arcade.Sprite,
    spec: EnemySpec,
    deltaSeconds: number,
  ) {
    let targetX = enemy.getData('patrolX') as number | undefined;
    let targetY = enemy.getData('patrolY') as number | undefined;
    const patrolTimeout = (enemy.getData('patrolTimeout') as number | undefined) ?? 0;

    if (
      targetX === undefined ||
      targetY === undefined ||
      Phaser.Math.Distance.Between(enemy.x, enemy.y, targetX, targetY) < 24 ||
      patrolTimeout <= 0
    ) {
      this.assignPatrolTarget(enemy, spec);
      targetX = enemy.getData('patrolX') as number;
      targetY = enemy.getData('patrolY') as number;
      enemy.setData('patrolTimeout', Phaser.Math.FloatBetween(2.2, 5.2));
    } else {
      enemy.setData('patrolTimeout', patrolTimeout - deltaSeconds);
    }

    this.moveEnemyToward(enemy, targetX, targetY, this.getEnemySpeed(enemy, spec) * 0.34);
  }

  private assignPatrolTarget(enemy: Phaser.Physics.Arcade.Sprite, spec: EnemySpec) {
    const anchorX = enemy.getData('anchorX') as number;
    const anchorY = enemy.getData('anchorY') as number;
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const radius = Phaser.Math.Between(60, spec.patrolRadius);
    enemy.setData('patrolX', clamp(anchorX + Math.cos(angle) * radius, 40, WORLD_WIDTH - 40));
    enemy.setData('patrolY', clamp(anchorY + Math.sin(angle) * radius, 40, WORLD_HEIGHT - 40));
  }

  private watchPlayer(enemy: Phaser.Physics.Arcade.Sprite, spec: EnemySpec, aggro: number) {
    const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
    const strafe = Math.sin(this.elapsedMs / 420 + enemy.x * 0.01) * 0.8;
    const speed = this.getEnemySpeed(enemy, spec) * (0.28 + aggro / 340);
    enemy.setVelocity(
      Math.cos(angle + strafe) * speed,
      Math.sin(angle + strafe) * speed,
    );
    enemy.setRotation(Phaser.Math.Angle.RotateTo(enemy.rotation, angle, 0.25));
  }

  private chasePlayer(
    enemy: Phaser.Physics.Arcade.Sprite,
    spec: EnemySpec,
    aggro: number,
    distanceToPlayer: number,
  ) {
    if (distanceToPlayer <= spec.attackRange * 0.78) {
      enemy.setVelocity(0, 0);
      return;
    }

    const speed = this.getEnemySpeed(enemy, spec) * (0.78 + aggro / 190);
    this.moveEnemyToward(enemy, this.player.x, this.player.y, speed);
  }

  private moveEnemyToward(
    enemy: Phaser.Physics.Arcade.Sprite,
    targetX: number,
    targetY: number,
    speed: number,
  ) {
    const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, targetX, targetY);
    enemy.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    enemy.setRotation(Phaser.Math.Angle.RotateTo(enemy.rotation, angle, 0.25));
  }

  private enemyAttack(enemy: Phaser.Physics.Arcade.Sprite, spec: EnemySpec) {
    const nextAttackAt = (enemy.getData('nextAttackAt') as number | undefined) ?? 0;
    if (this.elapsedMs < nextAttackAt) {
      return;
    }

    enemy.setData('nextAttackAt', this.elapsedMs + spec.attackDelay);
    enemy.setData('aggro', clamp((enemy.getData('aggro') as number) + 9, 0, 100));
    this.damagePlayer(enemy.getData('damage') as number, spec.name);
    this.flashAt(enemy.x, enemy.y, 0xff5d6f, 5);
  }

  private turretAttack(enemy: Phaser.Physics.Arcade.Sprite, spec: EnemySpec) {
    const nextAttackAt = (enemy.getData('nextAttackAt') as number | undefined) ?? 0;
    if (this.elapsedMs < nextAttackAt) {
      return;
    }

    enemy.setData('nextAttackAt', this.elapsedMs + spec.attackDelay);
    const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
    const tier = enemy.getData('tier') as EnemyTier;
    const shots = tier === 'red' ? 3 : tier === 'purple' ? 2 : 1;
    for (let i = 0; i < shots; i += 1) {
      const offset = (i - (shots - 1) / 2) * 0.14;
      this.spawnEnemyProjectile(
        enemy.x + Math.cos(angle + offset) * 28,
        enemy.y + Math.sin(angle + offset) * 28,
        angle + offset,
        enemy.getData('damage') as number,
        245 + shots * 20,
      );
    }
    this.muzzleBurst(enemy.x, enemy.y, angle, 0xff5d6f);
  }

  private mortarAttack(enemy: Phaser.Physics.Arcade.Sprite, spec: EnemySpec) {
    const nextAttackAt = (enemy.getData('nextAttackAt') as number | undefined) ?? 0;
    if (this.elapsedMs < nextAttackAt) {
      return;
    }

    enemy.setData('nextAttackAt', this.elapsedMs + spec.attackDelay);
    const targetX = this.player.x + Phaser.Math.Between(-42, 42);
    const targetY = this.player.y + Phaser.Math.Between(-42, 42);
    const radius = 74;
    const warning = this.add
      .circle(targetX, targetY, radius, 0xf5c542, 0.1)
      .setStrokeStyle(2, 0xf5c542, 0.74)
      .setDepth(33);
    this.tweens.add({
      targets: warning,
      scale: 0.45,
      alpha: 0.7,
      yoyo: true,
      repeat: 1,
      duration: 180,
      ease: 'Sine.easeInOut',
      onComplete: () => warning.destroy(),
    });
    this.time.delayedCall(640, () => {
      if (!enemy.active || this.isGameOver) {
        return;
      }
      this.shockwave(targetX, targetY, radius, 0xf5c542);
      this.flashAt(targetX, targetY, 0xf5c542, 13);
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, targetX, targetY);
      if (distance <= radius) {
        this.damagePlayer((enemy.getData('damage') as number) * (1 - distance / radius * 0.45), spec.name);
      }
    });
    this.muzzleBurst(enemy.x, enemy.y, enemy.rotation, 0xf5c542);
  }

  private sparkAttack(enemy: Phaser.Physics.Arcade.Sprite, spec: EnemySpec) {
    const nextAttackAt = (enemy.getData('nextAttackAt') as number | undefined) ?? 0;
    if (this.elapsedMs < nextAttackAt) {
      return;
    }

    enemy.setData('nextAttackAt', this.elapsedMs + spec.attackDelay);
    this.shockwave(enemy.x, enemy.y, 92, 0xb285ff);
    this.drawArcBolt(enemy.x, enemy.y, this.player.x, this.player.y, 0xb285ff, 2.4, 130);
    this.damagePlayer(enemy.getData('damage') as number, spec.name);
    this.flashAt(enemy.x, enemy.y, 0xb285ff, 10);
  }

  private spawnEnemyProjectile(x: number, y: number, angle: number, damage: number, speed: number) {
    const projectile = this.enemyProjectiles.get(x, y, 'enemy-bullet') as Phaser.Physics.Arcade.Image | null;
    if (!projectile) {
      return;
    }

    projectile
      .setActive(true)
      .setVisible(true)
      .setDepth(31)
      .setRotation(angle)
      .setScale(1);
    projectile.setData('damage', damage);
    projectile.setData('ttl', 2800);
    projectile.setData('lastTrailAt', this.elapsedMs);
    const body = projectile.body as Phaser.Physics.Arcade.Body;
    body.enable = true;
    body.setAllowGravity(false);
    body.setCircle(5);
    body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  }

  private damagePlayer(amount: number, defeatedBy = '未知单位') {
    const shieldMultiplier = this.isBuffActive('barrier') ? 0.55 : 1;
    const taken = amount * this.getCurrentVehicleSpec().damageTaken * shieldMultiplier;
    this.lastDefeatedBy = defeatedBy;
    if (this.elapsedMs >= this.nextDamageSfxAt) {
      this.nextDamageSfxAt = this.elapsedMs + 180;
      this.sfxDamage();
    }
    if (taken >= 20) {
      this.cameras.main.shake(160, 0.0055);
    } else if (taken >= 8) {
      this.cameras.main.shake(90, 0.0028);
    }
    this.spawnDamageText(this.player.x, this.player.y - this.player.displayHeight * 0.4, taken, { player: true });
    if (this.currentVehicle !== 'mech' && this.vehicleShield > 0) {
      this.vehicleShield = Math.max(0, this.vehicleShield - taken);
      this.player.setTint(0x4d8eff);
      this.time.delayedCall(90, () => {
        if (!this.isGameOver) {
          this.player.setTint(this.localTeamTint || 0xffffff);
        }
      });
      if (this.vehicleShield <= 0) {
        this.destroyVehicleByShieldBreak();
      }
      return;
    }

    this.hp = clamp(this.hp - taken, 0, this.maxHp);
    this.player.setTint(0xff5d6f);
    this.time.delayedCall(90, () => {
      if (!this.isGameOver) {
        this.player.setTint(this.localTeamTint || 0xffffff);
      }
    });

    if (this.hp <= 0) {
      this.showGameOver();
    }
  }

  private executeLocalPlayer(defeatedBy: string) {
    if (this.isGameOver || !this.isInMultiplayerRoom) {
      return;
    }

    this.lastDefeatedBy = defeatedBy;
    this.vehicleShield = 0;
    this.hp = 0;
    this.shockwave(this.player.x, this.player.y, 170, 0x4d8eff);
    this.flashAt(this.player.x, this.player.y, 0xcfefff, 24);
    this.showGameOver();
  }

  private handleProjectileHit(
    rawProjectile: ArcadeOverlapObject,
    rawEnemy: ArcadeOverlapObject,
  ) {
    const projectile = rawProjectile as Phaser.Physics.Arcade.Image;
    const enemy = rawEnemy as Phaser.Physics.Arcade.Sprite;
    if (!projectile.active || !enemy.active) {
      return;
    }

    const damage = projectile.getData('damage') as number;
    const aoe = projectile.getData('aoe') as number;
    const impactColor = projectile.getData('impactColor') as number;
    const hitX = projectile.x;
    const hitY = projectile.y;
    const pierce = Boolean(projectile.getData('pierce'));
    if (pierce && !this.registerPierceHit(projectile, enemy)) {
      return;
    }

    this.damageEnemy(enemy, damage);
    this.sfxHit();
    this.impactBurst(hitX, hitY, impactColor, aoe > 0 ? 1.35 : 0.9);
    if (!pierce) {
      projectile.destroy();
    } else {
      this.flashAt(hitX, hitY, impactColor, 5);
    }

    if (aoe > 0) {
      this.splashDamage(hitX, hitY, aoe, damage * 0.62);
      this.splashDamageRemotePlayers(hitX, hitY, aoe, damage * 0.62);
      this.flashAt(hitX, hitY, impactColor, Math.max(10, aoe / 4));
      this.shockwave(hitX, hitY, aoe, impactColor);
    }
  }

  private handleChestHit(
    rawProjectile: ArcadeOverlapObject,
    rawChest: ArcadeOverlapObject,
  ) {
    const projectile = rawProjectile as Phaser.Physics.Arcade.Image;
    const chest = rawChest as Phaser.Physics.Arcade.Image;
    if (!projectile.active || !chest.active || chest.getData('broken')) {
      return;
    }

    const damage = projectile.getData('damage') as number;
    const aoe = projectile.getData('aoe') as number;
    const impactColor = projectile.getData('impactColor') as number;
    const hitX = projectile.x;
    const hitY = projectile.y;
    const pierce = Boolean(projectile.getData('pierce'));
    if (pierce && !this.registerPierceHit(projectile, chest)) {
      return;
    }
    if (!pierce) {
      projectile.destroy();
    }

    this.damageChest(chest, damage);
    this.sfxHit();
    this.impactBurst(hitX, hitY, impactColor, aoe > 0 ? 1.2 : 0.8);

    if (aoe > 0) {
      this.splashDamage(hitX, hitY, aoe, damage * 0.62);
      this.splashDamageRemotePlayers(hitX, hitY, aoe, damage * 0.62);
      this.splashDamageChests(hitX, hitY, aoe, damage * 0.62, chest);
      this.flashAt(hitX, hitY, impactColor, Math.max(10, aoe / 4));
      this.shockwave(hitX, hitY, aoe, impactColor);
    }
  }

  private registerPierceHit(projectile: Phaser.Physics.Arcade.Image, key: unknown) {
    const hitMap = projectile.getData('hitMap') as Map<unknown, number> | undefined;
    if (!hitMap) {
      return true;
    }

    const interval = (projectile.getData('hitIntervalMs') as number | undefined) ?? 180;
    const lastHitAt = hitMap.get(key) ?? -Infinity;
    if (this.elapsedMs - lastHitAt < interval) {
      return false;
    }

    hitMap.set(key, this.elapsedMs);
    return true;
  }

  private damageChest(chest: Phaser.Physics.Arcade.Image, damage: number) {
    const hp = (chest.getData('hp') as number) - damage;
    chest.setData('hp', hp);
    chest.setTint(0xe8f7f4);
    this.time.delayedCall(60, () => {
      if (chest.active && !chest.getData('broken')) {
        chest.clearTint();
      }
    });

    if (hp <= 0) {
      this.breakChest(chest);
    }
  }

  private damageEnemy(enemy: Phaser.Physics.Arcade.Sprite, damage: number) {
    const kind = enemy.getData('kind') as EnemyKind;
    const maxHp = enemy.getData('maxHp') as number;
    const guardedDamage = kind === 'shielder' && (enemy.getData('hp') as number) > maxHp * 0.45 ? damage * 0.62 : damage;
    const hp = (enemy.getData('hp') as number) - guardedDamage;
    enemy.setData('hp', hp);
    enemy.setData('aggro', clamp((enemy.getData('aggro') as number) + 46, 0, 100));
    enemy.setData('lastHitAt', this.elapsedMs);
    if (enemy.getData('isBoss')) {
      enemy.setData('neutralAsleep', false);
      enemy.setData('bossMode', 'attack');
      enemy.setData('bossTargetId', this.localSocketId || 'local');
      enemy.setData('bossHealCooldownUntil', this.elapsedMs + BOSS_HEAL_COOLDOWN_MS);
    }
    enemy.setTint(0xffffff);
    // Brief hit punch — store baseline so we don't fight the body anim's scale.
    if (enemy.getData('hitPunchUntil') === undefined) {
      const baseSX = enemy.scaleX;
      const baseSY = enemy.scaleY;
      enemy.setScale(baseSX * 1.18, baseSY * 0.84);
      enemy.setData('hitPunchUntil', this.elapsedMs + 90);
      this.time.delayedCall(90, () => {
        if (enemy.active) {
          enemy.setScale(baseSX, baseSY);
          enemy.setData('hitPunchUntil', undefined);
        }
      });
    }
    this.time.delayedCall(60, () => {
      if (enemy.active) {
        enemy.setTint(this.getEnemyTint(enemy));
      }
    });

    // Floating damage number — crit if damage > 1.6x raw expected
    const crit = guardedDamage >= damage * 0.999 && damage >= maxHp * 0.18;
    this.spawnDamageText(enemy.x, enemy.y - enemy.displayHeight * 0.4, guardedDamage, { crit });

    if (hp <= 0) {
      this.killEnemy(enemy);
    }
  }

  private splashDamage(x: number, y: number, radius: number, damage: number) {
    this.enemies.getChildren().forEach((rawEnemy) => {
      const enemy = rawEnemy as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) {
        return;
      }

      const distance = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
      if (distance > radius) {
        return;
      }

      const falloff = 1 - distance / radius;
      this.damageEnemy(enemy, damage * falloff);
    });
  }

  private splashDamageRemotePlayers(
    x: number,
    y: number,
    radius: number,
    damage: number,
    skippedSocketId?: string,
  ) {
    this.getHostilePlayerTargets(radius, x, y).forEach((target) => {
      if (target.socketId === skippedSocketId) {
        return;
      }

      const distance = Phaser.Math.Distance.Between(x, y, target.x, target.y);
      const falloff = 1 - distance / radius;
      this.damageRemotePlayer(target, damage * falloff);
    });
  }

  private splashDamageChests(
    x: number,
    y: number,
    radius: number,
    damage: number,
    skippedChest?: Phaser.Physics.Arcade.Image,
  ) {
    this.chests.getChildren().forEach((rawChest) => {
      const chest = rawChest as Phaser.Physics.Arcade.Image;
      if (!chest.active || chest === skippedChest || chest.getData('broken')) {
        return;
      }

      const distance = Phaser.Math.Distance.Between(x, y, chest.x, chest.y);
      if (distance > radius) {
        return;
      }

      const falloff = 1 - distance / radius;
      this.damageChest(chest, damage * falloff);
    });
  }

  private slowEnemiesInRadius(x: number, y: number, radius: number, multiplier: number, durationMs: number) {
    this.enemies.getChildren().forEach((rawEnemy) => {
      const enemy = rawEnemy as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active || Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y) > radius) {
        return;
      }

      const currentMultiplier = (enemy.getData('slowMultiplier') as number | undefined) ?? 1;
      enemy.setData('slowMultiplier', Math.min(currentMultiplier, multiplier));
      enemy.setData('slowUntil', Math.max((enemy.getData('slowUntil') as number | undefined) ?? 0, this.elapsedMs + durationMs));
      this.flashAt(enemy.x, enemy.y, WEAPONS.cryoMine.color, 5);
    });
  }

  private pullAndDamageTargets(x: number, y: number, radius: number, damage: number, pullStrength = 24) {
    this.enemies.getChildren().forEach((rawEnemy) => {
      const enemy = rawEnemy as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) {
        return;
      }

      const distance = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
      if (distance > radius) {
        return;
      }

      const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, x, y);
      const pull = clamp(1 - distance / radius, 0.2, 1);
      const step = pullStrength * (0.35 + pull);
      enemy.x += Math.cos(angle) * step;
      enemy.y += Math.sin(angle) * step;
      const body = enemy.body as Phaser.Physics.Arcade.Body | undefined;
      body?.updateFromGameObject();
      this.damageEnemy(enemy, damage * pull);
    });

    this.getHostilePlayerTargets(radius, x, y).forEach((target) => {
      this.damageRemotePlayer(target, damage * 0.75);
    });
    this.shockwave(x, y, radius * 0.42, WEAPONS.gravityWell.color);
  }

  private damageRemotePlayer(target: RemotePlayerTarget, damage: number) {
    if (!this.socket?.connected || !this.isInMultiplayerRoom || target.hp <= 0) {
      return;
    }

    const amount = clamp(damage, 0, 500);
    if (amount <= 0) {
      return;
    }

    this.socket.emit('player:damage', {
      targetSocketId: target.socketId,
      amount,
    });
    this.flashAt(target.x, target.y, 0xff5d6f, 8);
  }

  private breakChest(chest: Phaser.Physics.Arcade.Image) {
    if (!chest.active || chest.getData('broken')) {
      return;
    }

    chest.setData('broken', true);
    const chestX = chest.x;
    const chestY = chest.y;
    this.requestChestReward(
      chest,
      (reward) => {
        this.applyServerReward(reward, chestX, chestY);
        chest.destroy();
      },
      () => {
        if (chest.active) {
          chest.setData('broken', false);
          chest.setTint(0xff5d6f);
          this.time.delayedCall(120, () => {
            if (chest.active && !chest.getData('broken')) {
              chest.clearTint();
            }
          });
        }
      },
    );
    this.flashAt(chest.x, chest.y, 0xf5c542, 14);
    this.shockwave(chest.x, chest.y, 86, 0xf5c542);
    this.playCue('chest');
    this.addThreatNoise(chest.x, chest.y, 24, 420);
  }

  private killEnemy(enemy: Phaser.Physics.Arcade.Sprite) {
    const kind = enemy.getData('kind') as EnemyKind;
    const tier = enemy.getData('tier') as EnemyTier;
    const xp = enemy.getData('xp') as number;
    const killX = enemy.x;
    const killY = enemy.y;
    const isBoss = kind === 'boss';
    const tierColor = isBoss ? this.getBossColor(enemy) : ENEMY_TIERS[tier].color;
    if (isBoss) {
      this.bigExplosion(killX, killY, tierColor, 60);
      this.playCue('bossKill');
      this.cameras.main.shake(280, 0.012);
    } else if (tier === 'red') {
      this.bigExplosion(killX, killY, tierColor, 28);
      if (this.elapsedMs >= this.nextCritCueAt) {
        this.nextCritCueAt = this.elapsedMs + 130;
        this.playCue('crit');
      }
    } else {
      this.flashAt(killX, killY, tierColor, tier === 'purple' ? 14 : 8);
      if (tier === 'purple') {
        this.shockwave(killX, killY, 105, tierColor);
        if (this.elapsedMs >= this.nextCritCueAt) {
          this.nextCritCueAt = this.elapsedMs + 130;
          this.playCue('crit');
        }
      } else if (this.elapsedMs >= this.nextKillCueAt) {
        this.nextKillCueAt = this.elapsedMs + 90;
        this.playCue('kill');
      }
    }

    this.kills += 1;
    if (xp > 0) {
      this.spawnXpOrb(killX, killY, xp);
    }
    const killSnapshot = {
      id: enemy.getData('entityId'),
      kind: enemy.getData('kind'),
      tier: enemy.getData('tier'),
      x: killX,
      y: killY,
    };
    enemy.destroy();

    this.requestEnemyKillRewardById(killSnapshot, (reward) => {
      this.applyServerReward(reward, killX, killY, { skipXp: true });
      if (isBoss) {
        this.time.delayedCall(1800, () => {
          if (this.isInMultiplayerRoom && !this.isGameOver) {
            this.ensureBossCount();
          }
        });
      }
    });
  }

  private spawnXpOrb(x: number, y: number, amount: number) {
    const scatterAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const scatterDistance = Phaser.Math.Between(12, 54);
    const orbX = clamp(x + Math.cos(scatterAngle) * scatterDistance, 24, WORLD_WIDTH - 24);
    const orbY = clamp(y + Math.sin(scatterAngle) * scatterDistance, 24, WORLD_HEIGHT - 24);
    const orb = this.physics.add.image(orbX, orbY, 'buff-core');
    const halo = this.add.circle(orbX, orbY, 13, 0x9ec8ff, 0.24).setDepth(65);
    const label = this.add
      .text(orbX, orbY - 22, `+${amount}`, {
        fontFamily: 'Inter, "Segoe UI", sans-serif',
        fontSize: '13px',
        color: '#9fffe0',
      })
      .setOrigin(0.5)
      .setDepth(67);
    orb.setDepth(66);
    orb.setTint(0x4d8eff);
    orb.setScale(amount >= 120 ? 1.2 : amount >= 50 ? 1 : 0.82);
    orb.setData('amount', amount);
    orb.setData('halo', halo);
    orb.setData('label', label);
    orb.setData('expiresAt', this.elapsedMs + 45000);
    const body = orb.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setCircle(11);
    this.xpOrbs.add(orb);
    this.tweens.add({
      targets: [orb, halo],
      y: orbY - 5,
      duration: 760,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        if (!orb.active || !label.active || !halo.active) {
          return;
        }
        (orb.body as Phaser.Physics.Arcade.Body | undefined)?.updateFromGameObject();
        label.setPosition(orb.x, orb.y - 22);
        halo.setPosition(orb.x, orb.y);
      },
    });
  }

  private handleXpOrbPickup(
    _rawPlayer: ArcadeOverlapObject,
    rawOrb: ArcadeOverlapObject,
  ) {
    const orb = rawOrb as Phaser.Physics.Arcade.Image;
    if (!orb.active) {
      return;
    }

    const amount = orb.getData('amount') as number;
    const halo = orb.getData('halo') as Phaser.GameObjects.Arc | undefined;
    const label = orb.getData('label') as Phaser.GameObjects.Text | undefined;
    halo?.destroy();
    label?.destroy();
    orb.destroy();
    this.gainXp(amount);
    this.sfxPickup();
    this.flashAt(this.player.x, this.player.y, 0x4d8eff, 5);
  }

  private grantPermanentVehicle(x: number, y: number, grantedVehicle?: VehicleKey) {
    const vehicle = grantedVehicle ?? Phaser.Utils.Array.GetRandom(VEHICLE_ORDER);
    const nextRank = PERFECT_VEHICLE_RANK;
    this.permanentVehicleRanks[vehicle] = nextRank;
    this.vehicleRanks[vehicle] = nextRank;
    this.lockedBossVehicle = vehicle;
    this.applyVehicle(vehicle, true, false);
    this.vehicleExpiresAt = Number.POSITIVE_INFINITY;
    this.hp = clamp(this.hp + 28, 0, this.maxHp);
    this.flashAt(x, y, BOSS_MINIMAP_COLOR, 24);
    this.shockwave(x, y, 240, BOSS_MINIMAP_COLOR);
    this.playCue('boss');
    this.showAnnouncement(`击败 Boss，永久驾驶完全体 ${VEHICLES[vehicle].name} Lv.${nextRank}`, 4200);
  }

  private gainXp(amount: number) {
    this.xp += amount;
    this.resolvePendingLevelUps();
  }

  private resolvePendingLevelUps() {
    if (this.isChoosingUpgrade || this.isGameOver) {
      return;
    }

    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level += 1;
      this.xpToNext = this.getXpRequirementForLevel(this.level);
      this.levelUpBurst();
      this.showUpgradeChoices();
      if (this.isChoosingUpgrade) {
        break;
      }
    }
  }

  private getXpRequirementForLevel(level: number) {
    if (level < 20) {
      return Math.floor(30 + level * 6.4 + Math.pow(level, 1.16) * 4.6);
    }

    if (level < 30) {
      return Math.floor(210 + (level - 20) * 38 + Math.pow(level - 19, 1.42) * 16);
    }

    return Math.floor(640 + (level - 30) * 86 + Math.pow(level - 29, 1.62) * 32);
  }

  private showUpgradeChoices() {
    if (this.isChoosingUpgrade || this.isGameOver) {
      return;
    }

    const choices = this.pickUpgradeChoices();
    if (choices.length === 0) {
      this.restoreOnUpgrade();
      return;
    }

    this.isChoosingUpgrade = true;
    this.currentUpgradeChoices = choices;
    this.upgradeChoiceExpiresAt = this.elapsedMs + 5000;
    this.showUpgradePanel(choices);
    this.updateUpgradeChoiceTimer();
  }

  private showUpgradePanel(choices: UpgradeSpec[]) {
    this.upgradePanel?.remove();

    const panel = document.createElement('div');
    panel.className = 'upgrade-panel';

    const box = document.createElement('div');
    box.className = 'upgrade-box';

    const title = document.createElement('div');
    title.className = 'upgrade-title';
    title.textContent = `等级 ${this.level}`;

    const hint = document.createElement('div');
    hint.className = 'upgrade-hint';
    hint.textContent = '点击选择升级，5 秒后默认选择 1';

    const countdown = document.createElement('div');
    countdown.className = 'upgrade-countdown';
    countdown.textContent = '剩余 5.0s';

    const list = document.createElement('div');
    list.className = 'upgrade-list';

    choices.forEach((choice, index) => {
      const button = document.createElement('button');
      button.className = 'upgrade-card';
      button.type = 'button';
      button.innerHTML = `
        <span class="upgrade-key">${index + 1}</span>
        <span class="upgrade-name"></span>
        <span class="upgrade-detail"></span>
        <span class="upgrade-choose">选择</span>
      `;
      const name = button.querySelector<HTMLSpanElement>('.upgrade-name');
      const detail = button.querySelector<HTMLSpanElement>('.upgrade-detail');
      if (name) {
        name.textContent = choice.title;
      }
      if (detail) {
        detail.textContent = choice.detail;
      }
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.applyUpgrade(choice);
      });
      list.appendChild(button);
    });

    box.append(title, hint, countdown, list);
    panel.appendChild(box);
    document.body.appendChild(panel);
    this.upgradePanel = panel;
    this.upgradeCountdownEl = countdown;
  }

  private updateUpgradeChoiceTimer() {
    if (!this.isChoosingUpgrade || this.currentUpgradeChoices.length === 0) {
      return;
    }

    const remainingMs = Math.max(0, this.upgradeChoiceExpiresAt - this.elapsedMs);
    if (this.upgradeCountdownEl) {
      this.upgradeCountdownEl.textContent = `剩余 ${(remainingMs / 1000).toFixed(1)}s`;
    }
    if (remainingMs <= 0) {
      this.applyUpgrade(this.currentUpgradeChoices[0]);
    }
  }

  private handleUpgradeHotkeys() {
    if (!this.isChoosingUpgrade || this.currentUpgradeChoices.length === 0) {
      return;
    }

    for (let index = 0; index < 3; index += 1) {
      const mainKey = this.upgradeHotkeys[index];
      const numpadKey = this.upgradeHotkeys[index + 3];
      if (
        Phaser.Input.Keyboard.JustDown(mainKey) ||
        Phaser.Input.Keyboard.JustDown(numpadKey)
      ) {
        this.applyUpgrade(this.currentUpgradeChoices[index]);
        return;
      }
    }
  }

  private updateBuffs(deltaSeconds: number) {
    if (this.isBuffActive('regen')) {
      this.hp = clamp(this.hp + 8 * deltaSeconds, 0, this.maxHp);
    }
  }

  private isBuffActive(buff: BuffKey) {
    return this.activeBuffs[buff] > this.elapsedMs;
  }

  private getDamageMultiplier() {
    return this.damageMultiplier * (this.isBuffActive('overclock') ? 1.35 : 1) * (this.currentWeather === 'heat' ? 1.12 : 1);
  }

  private getFireRateMultiplier() {
    return this.fireRateMultiplier * (this.isBuffActive('rapid') ? 0.72 : 1) * (this.currentWeather === 'heat' ? 1.14 : 1);
  }

  private getBuffSpeedBonus() {
    return this.isBuffActive('overclock') ? 46 : 0;
  }

  private getWeatherSpeedMultiplier() {
    return this.currentWeather === 'wind' ? 0.78 : 1;
  }

  private getActiveBuffText() {
    const active = BUFF_ORDER.filter((buff) => this.isBuffActive(buff)).map((buff) => {
      const remaining = Math.ceil((this.activeBuffs[buff] - this.elapsedMs) / 1000);
      return `${BUFFS[buff].name}${remaining}s`;
    });

    return active.length > 0 ? active.join('  ') : '无临时增益';
  }

  private getWeatherHudText() {
    if (this.pendingWeather) {
      const remaining = Math.max(0, Math.ceil((this.pendingWeather.startsAt - this.elapsedMs) / 1000));
      return `天气 ${WEATHER_SPECS[this.pendingWeather.key].name}预警 ${remaining}s`;
    }

    if (this.currentWeather === 'sunny') {
      return '天气 晴朗';
    }

    const remaining = Math.max(0, Math.ceil((this.weatherActiveUntil - this.elapsedMs) / 1000));
    return `天气 ${WEATHER_SPECS[this.currentWeather].name} ${remaining}s`;
  }

  private pickUpgradeChoices() {
    const weaponChoices = Phaser.Utils.Array.Shuffle(this.getWeaponUpgrades());
    const coreChoices = Phaser.Utils.Array.Shuffle(this.getUpgrades());
    const choices: UpgradeSpec[] = [];

    while (weaponChoices.length > 0 && choices.length < 2) {
      choices.push(weaponChoices.shift()!);
    }

    while (coreChoices.length > 0 && choices.length < 3) {
      choices.push(coreChoices.shift()!);
    }

    while (weaponChoices.length > 0 && choices.length < 3) {
      choices.push(weaponChoices.shift()!);
    }

    return choices;
  }

  private getWeaponUpgrades(): UpgradeSpec[] {
    const upgrades: UpgradeSpec[] = [];
    const hasOpenWeaponSlot = this.weaponSlots.length < MAX_WEAPON_SLOTS;

    WEAPON_ORDER.forEach((weapon) => {
      const spec = WEAPONS[weapon];
      const level = this.getWeaponLevel(weapon);

      if (level > 0 && level < PERFECT_WEAPON_LEVEL) {
        const nextLevel = level + 1;
        upgrades.push({
          key: `weapon-upgrade-${weapon}`,
          title: `${spec.name} Lv.${nextLevel}`,
          detail: nextLevel === PERFECT_WEAPON_LEVEL ? '升到 6 级后变质为完全体，获得全新效果' : `继续强化范围、伤害和速度：${spec.detail}`,
          apply: (scene) => {
            scene.equipOrUpgradeWeapon(weapon);
          },
        });
        return;
      }

      if (level === 0 && hasOpenWeaponSlot) {
        upgrades.push({
          key: `weapon-new-${weapon}`,
          title: `武器槽：${spec.name}`,
          detail: `装备到空槽 ${this.weaponSlots.length + 1}/${MAX_WEAPON_SLOTS}。${spec.detail}`,
          apply: (scene) => {
            scene.equipOrUpgradeWeapon(weapon);
          },
        });
      }
    });

    return upgrades;
  }

  private equipOrUpgradeWeapon(weapon: WeaponKey) {
    const currentLevel = this.getWeaponLevel(weapon);
    if (currentLevel === 0) {
      if (this.weaponSlots.length >= MAX_WEAPON_SLOTS) {
        return;
      }

      this.weaponSlots.push(weapon);
      this.weaponLevels[weapon] = 1;
      this.weaponCooldowns[weapon] = this.elapsedMs + 300;
      if (weapon === 'attackDrone' || weapon === 'healDrone') {
        this.getWeaponVisual(weapon);
      }
      return;
    }

    const nextLevel = currentLevel + 1;
    if (currentLevel >= PERFECT_WEAPON_LEVEL) {
      return;
    }
    this.weaponLevels[weapon] = nextLevel;
    if (nextLevel === PERFECT_WEAPON_LEVEL) {
      this.showAnnouncement(`${WEAPONS[weapon].name} 变质为完全体`, 3000);
      this.flashAt(this.player.x, this.player.y, WEAPONS[weapon].color, 22);
      this.shockwave(this.player.x, this.player.y, 132, WEAPONS[weapon].color);
    }
  }

  private getWeaponLevel(weapon: WeaponKey) {
    return this.weaponLevels[weapon] ?? 0;
  }

  private isWeaponPerfect(weapon: WeaponKey) {
    return this.getWeaponLevel(weapon) >= PERFECT_WEAPON_LEVEL;
  }

  private getWeaponSlotText() {
    if (this.weaponSlots.length === 0) {
      return `武器槽 0/${MAX_WEAPON_SLOTS}`;
    }

    const weapons = this.weaponSlots.map((weapon) => {
      const level = this.getWeaponLevel(weapon);
      return `${WEAPONS[weapon].name}Lv.${level}${this.isWeaponPerfect(weapon) ? '完全体' : ''}`;
    });

    return `武器槽 ${this.weaponSlots.length}/${MAX_WEAPON_SLOTS}  ${weapons.join(' / ')}`;
  }

  private getUpgrades(): UpgradeSpec[] {
    return [
      {
        key: 'damage',
        title: '聚焦核心',
        detail: '武器伤害 +14%',
        apply: (scene) => {
          scene.damageMultiplier *= 1.14;
        },
      },
      {
        key: 'rate',
        title: '冷却阵列',
        detail: '开火间隔 -10%',
        apply: (scene) => {
          scene.fireRateMultiplier *= 0.9;
        },
      },
      {
        key: 'speed',
        title: '伺服腿组',
        detail: '移动速度 +18',
        apply: (scene) => {
          scene.speedBonus += 18;
        },
      },
      {
        key: 'armor',
        title: '纳米护甲',
        detail: '最大生命 +22',
        apply: (scene) => {
          scene.maxHp += 22;
          scene.hp = clamp(scene.hp + 22, 0, scene.maxHp);
        },
      },
      {
        key: 'magnet',
        title: '吸铁石线圈',
        detail: '扩大经验球、宝箱和掉落物牵引范围',
        apply: (scene) => {
          scene.magnetRadius += 110;
        },
      },
    ];
  }

  private applyUpgrade(choice?: UpgradeSpec) {
    if (!choice || !this.isChoosingUpgrade) {
      return;
    }

    choice.apply(this);
    this.playCue('upgrade');
    this.restoreOnUpgrade();
    this.modal?.destroy(true);
    this.modal = undefined;
    this.upgradePanel?.remove();
    this.upgradePanel = undefined;
    this.upgradeCountdownEl = undefined;
    this.upgradeChoiceExpiresAt = 0;
    this.currentUpgradeChoices = [];
    this.isChoosingUpgrade = false;
    this.resolvePendingLevelUps();
  }

  private restoreOnUpgrade() {
    const heal = Math.max(10, this.maxHp * 0.16);
    this.hp = clamp(this.hp + heal, 0, this.maxHp);
    if (this.currentVehicle !== 'mech' && this.maxVehicleShield > 0) {
      this.vehicleShield = clamp(this.vehicleShield + this.maxVehicleShield * 0.18, 0, this.maxVehicleShield);
    }
    this.healPulse(this.player.x, this.player.y, 64);
  }

  private spawnEnemy(
    preferredKind?: EnemyKind,
    forcedTier?: EnemyTier,
    forcedPosition?: { x: number; y: number },
  ) {
    const kind = preferredKind ?? this.pickEnemyKind();
    const spec = ENEMIES[kind];
    const tier = forcedTier ?? (kind === 'boss' ? 'red' : this.pickEnemyTier());
    const tierSpec = ENEMY_TIERS[tier];
    const position = forcedPosition ?? this.pickSpawnPosition();
    const bossVariant = kind === 'boss'
      ? Phaser.Utils.Array.GetRandom(BOSS_VARIANT_ORDER)
      : undefined;
    const bossVariantSpec = bossVariant ? BOSS_VARIANTS[bossVariant] : undefined;
    const enemy = this.physics.add.sprite(position.x, position.y, spec.texture);
    enemy.setDepth(kind === 'boss' ? 19 : 18);
    enemy.setTint(tierSpec.color);
    enemy.setCollideWorldBounds(true);
    const timeHpBonus = Math.floor(this.elapsedMs / 45000) * 12;
    const lateGameMultiplier = this.getLateGameEnemyMultiplier();
    const maxHp = Math.round(
      (spec.hp + (kind === 'boss' ? timeHpBonus * 6 : timeHpBonus))
      * tierSpec.hpMultiplier
      * (bossVariantSpec?.hp ?? 1)
      * lateGameMultiplier.hp,
    );
    enemy.setData('kind', kind);
    enemy.setData('tier', tier);
    enemy.setData('hp', maxHp);
    enemy.setData('maxHp', maxHp);
    enemy.setData('speed', spec.speed * tierSpec.speedMultiplier * (bossVariantSpec?.speed ?? 1) * lateGameMultiplier.speed);
    enemy.setData('damage', Math.round(spec.damage * tierSpec.damageMultiplier * (bossVariantSpec?.damage ?? 1) * lateGameMultiplier.damage));
    enemy.setData('xp', Math.max(1, Math.round(spec.xp * tierSpec.xpMultiplier)));
    enemy.setData('aggro', Phaser.Math.Between(0, 15));
    enemy.setData('anchorX', position.x);
    enemy.setData('anchorY', position.y);
    enemy.setData('nextAttackAt', 0);
    enemy.setData('patrolTimeout', 0);
    enemy.setData('nextSkillAt', this.elapsedMs + Phaser.Math.Between(2400, 5200));
    enemy.setData('slowMultiplier', 1);
    enemy.setData('slowUntil', 0);

    if (kind === 'boss') {
      enemy.setData('isBoss', true);
      enemy.setData('bossVariant', bossVariant ?? 'annihilator');
      enemy.setData('aggro', 100);
      enemy.setData('neutralAsleep', false);
      enemy.setData('bossMode', 'attack');
      enemy.setData('bossTargetId', '');
      enemy.setData('bossTargetSince', this.elapsedMs);
      enemy.setData('bossFleeUntil', 0);
      enemy.setData('bossFleeFromId', '');
      enemy.setData('bossHealCooldownUntil', 0);
      enemy.setData('bossLastHealFxAt', 0);
    }

    const body = enemy.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    if (kind === 'turret') {
      body.setImmovable(true);
      body.setSize(48, 48, true);
    }
    body.setSize(
      Math.max(20, enemy.width * (kind === 'boss' ? 0.82 : 0.72)),
      Math.max(20, enemy.height * (kind === 'boss' ? 0.82 : 0.72)),
      true,
    );

    enemy.setData('entityId', this.makeLocalEntityId('enemy'));
    this.enemies.add(enemy);
    this.assignPatrolTarget(enemy, spec);
    this.registerPveEntity(enemy);
    return enemy;
  }

  private getLateGameEnemyMultiplier() {
    const overLevel = Math.max(0, this.level - 30);
    const overMinutes = Math.max(0, this.elapsedMs / 60000 - 9);
    const pressure = overLevel * 0.024 + overMinutes * 0.058;
    return {
      hp: 1 + pressure,
      damage: 1 + pressure * 0.42,
      speed: 1 + Math.min(0.18, pressure * 0.13),
    };
  }

  private ensureBossCount() {
    if (this.elapsedMs < BOSS_START_MS) {
      return;
    }

    const activeBosses = this.enemies
      .getChildren()
      .filter((rawEnemy) => {
        const enemy = rawEnemy as Phaser.Physics.Arcade.Sprite;
        return enemy.active && enemy.getData('kind') === 'boss';
      }).length;

    if (activeBosses < MIN_BOSS_COUNT) {
      this.playCue('boss');
    }

    for (let i = activeBosses; i < MIN_BOSS_COUNT; i += 1) {
      const spawn = BOSS_SPAWNS[i % BOSS_SPAWNS.length];
      const boss = this.spawnEnemy('boss', 'red', {
        x: clamp(spawn.x + Phaser.Math.Between(-120, 120), 100, WORLD_WIDTH - 100),
        y: clamp(spawn.y + Phaser.Math.Between(-120, 120), 100, WORLD_HEIGHT - 100),
      });
      boss.setScale(1.12);
      this.shockwave(boss.x, boss.y, 110, this.getBossColor(boss));
    }
  }

  private pickEnemyTier(): EnemyTier {
    const seconds = this.elapsedMs / 1000;
    const roll = Phaser.Math.Between(1, 100);
    if (this.level >= 30 || seconds > 540) {
      if (roll <= 8) return 'green';
      if (roll <= 34) return 'blue';
      if (roll <= 76) return 'purple';
      return 'red';
    }

    if (seconds < 30) {
      if (roll <= 78) return 'white';
      if (roll <= 96) return 'green';
      return 'blue';
    }

    if (seconds < 75) {
      if (roll <= 48) return 'white';
      if (roll <= 78) return 'green';
      if (roll <= 94) return 'blue';
      return 'purple';
    }

    if (seconds < 130) {
      if (roll <= 28) return 'white';
      if (roll <= 58) return 'green';
      if (roll <= 84) return 'blue';
      if (roll <= 97) return 'purple';
      return 'red';
    }

    if (roll <= 16) return 'white';
    if (roll <= 42) return 'green';
    if (roll <= 72) return 'blue';
    if (roll <= 94) return 'purple';
    return 'red';
  }

  private pickEnemyKind(): EnemyKind {
    const seconds = this.elapsedMs / 1000;
    const roll = Phaser.Math.Between(1, 100);

    if (seconds < 24) {
      if (roll < 58) return 'drone';
      if (roll < 82) return 'stalker';
      if (roll < 92) return 'hopper';
      return 'mender';
    }

    if (seconds < 70) {
      if (roll < 24) return 'drone';
      if (roll < 48) return 'stalker';
      if (roll < 61) return 'hopper';
      if (roll < 73) return 'mender';
      if (roll < 82) return 'sniper';
      if (roll < 89) return 'raider';
      if (roll < 95) return 'turret';
      return 'warden';
    }

    if (roll < 9) return 'drone';
    if (roll < 24) return 'stalker';
    if (roll < 36) return 'hopper';
    if (roll < 45) return 'leaper';
    if (roll < 55) return 'raider';
    if (roll < 64) return 'spark';
    if (roll < 72) return 'mender';
    if (roll < 80) return 'sniper';
    if (roll < 86) return 'mortar';
    if (roll < 91) return 'shielder';
    if (roll < 95) return 'turret';
    if (roll < 98) return 'bomber';
    if (roll < 100) return 'warden';
    return 'crusher';
  }

  private pickSpawnPosition() {
    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const distance = Phaser.Math.Between(560, 880);
      const x = clamp(this.player.x + Math.cos(angle) * distance, 60, WORLD_WIDTH - 60);
      const y = clamp(this.player.y + Math.sin(angle) * distance, 60, WORLD_HEIGHT - 60);
      if (this.getTerrainAt(x, y) !== 'water') {
        return { x, y };
      }
    }
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const distance = Phaser.Math.Between(560, 880);
    return {
      x: clamp(this.player.x + Math.cos(angle) * distance, 60, WORLD_WIDTH - 60),
      y: clamp(this.player.y + Math.sin(angle) * distance, 60, WORLD_HEIGHT - 60),
    };
  }

  private updateSpawns() {
    if (this.elapsedMs >= this.nextEnemySpawnAt) {
      const realPlayers = this.getRealPlayerCount();
      const playerPressure = 1 + Math.max(0, realPlayers - 1) * 0.38;
      const lateLevelPressure = this.level >= 30 ? 1 + (this.level - 29) * 0.06 : 1;
      const difficulty = (1 + this.elapsedMs / 68000) * playerPressure * lateLevelPressure;
      const count = clamp(Math.floor(difficulty), 1, realPlayers >= 6 ? 9 : 6);
      for (let i = 0; i < count; i += 1) {
        this.spawnEnemy();
      }
      this.nextEnemySpawnAt =
        this.elapsedMs + Math.max(320, (1340 - this.elapsedMs / 115) / Math.min(1.8, playerPressure));
    }

    if (this.elapsedMs >= this.nextChestAt) {
      this.spawnChestNearPlayer(Phaser.Math.Between(360, 620));
      this.nextChestAt = this.elapsedMs + Phaser.Math.Between(13000, 19000);
    }

    this.ensureBossCount();
  }

  private getRealPlayerCount() {
    return Math.max(
      1,
      this.latestRoomState?.room.players
        ?? this.currentRoom?.players
        ?? this.latestRoomState?.players.length
        ?? 1,
    );
  }

  private spawnChestNearPlayer(distance: number) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const x = clamp(this.player.x + Math.cos(angle) * distance, 80, WORLD_WIDTH - 80);
      const y = clamp(this.player.y + Math.sin(angle) * distance, 80, WORLD_HEIGHT - 80);
      if (this.getTerrainAt(x, y) !== 'water') {
        this.spawnChestAt(x, y);
        return;
      }
    }
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    this.spawnChestAt(
      clamp(this.player.x + Math.cos(angle) * distance, 80, WORLD_WIDTH - 80),
      clamp(this.player.y + Math.sin(angle) * distance, 80, WORLD_HEIGHT - 80),
    );
  }

  private spawnChestAt(x: number, y: number) {
    const chest = this.physics.add.image(x, y, 'chest');
    chest.setDepth(12);
    chest.setImmovable(true);
    chest.setData('broken', false);
    chest.setData('hp', 90 + Math.floor(this.elapsedMs / 45000) * 18);
    chest.setData('maxHp', chest.getData('hp'));
    chest.setData('entityId', this.makeLocalEntityId('chest'));
    const body = chest.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(38, 30, true);
    this.chests.add(chest);
    this.registerChestEntity(chest);

    this.tweens.add({
      targets: chest,
      y: y - 7,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private spawnVehiclePod(x: number, y: number, vehicle: VehicleKey) {
    const pod = this.physics.add.image(x, y, 'vehicle-bubble');
    const icon = this.add
      .image(x, y, VEHICLES[vehicle].texture)
      .setDepth(16)
      .setScale(0.58);
    pod.setDepth(15);
    pod.setData('vehicle', vehicle);
    pod.setData('icon', icon);
    const body = pod.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(52, 52, true);
    this.vehiclePods.add(pod);

    this.tweens.add({
      targets: [pod, icon],
      y: y - 9,
      duration: 950,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private spawnBuffAt(x: number, y: number, forcedBuff?: BuffKey) {
    const buff = forcedBuff ?? Phaser.Utils.Array.GetRandom(BUFF_ORDER);
    const spec = BUFFS[buff];
    const pickup = this.physics.add.image(x, y, 'buff-core');
    pickup.setDepth(17);
    pickup.setTint(spec.color);
    pickup.setData('buff', buff);
    const body = pickup.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(30, 30, true);
    this.buffPickups.add(pickup);

    this.tweens.add({
      targets: pickup,
      scale: 1.22,
      alpha: 0.75,
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private handleVehiclePodPickup(
    _rawPlayer: ArcadeOverlapObject,
    rawPod: ArcadeOverlapObject,
  ) {
    const pod = rawPod as Phaser.Physics.Arcade.Image;
    if (!pod.active) {
      return;
    }

    const vehicle = pod.getData('vehicle') as VehicleKey;
    if (this.currentVehicle !== 'mech' && vehicle !== this.currentVehicle) {
      if (this.lockedBossVehicle && vehicle === this.lockedBossVehicle) {
        this.applyVehicle(vehicle, true, false);
        this.vehicleExpiresAt = Number.POSITIVE_INFINITY;
        this.hp = clamp(this.hp + 8, 0, this.maxHp);
        this.flashAt(pod.x, pod.y, 0x9ec8ff, 13);
        const lockedReturnIcon = pod.getData('icon') as Phaser.GameObjects.Image | undefined;
        lockedReturnIcon?.destroy();
        pod.destroy();
        return;
      }
      this.hp = clamp(this.hp + 8, 0, this.maxHp);
      this.flashAt(pod.x, pod.y, 0x9ec8ff, 11);
      this.showAnnouncement(`${VEHICLES[this.currentVehicle].name} 未结束，不能替换为 ${VEHICLES[vehicle].name}`, 2200);
      const blockedIcon = pod.getData('icon') as Phaser.GameObjects.Image | undefined;
      blockedIcon?.destroy();
      pod.destroy();
      return;
    }
    this.applyVehicle(vehicle, true);
    this.hp = clamp(this.hp + 8, 0, this.maxHp);
    this.flashAt(pod.x, pod.y, 0x4d8eff, 13);
    const icon = pod.getData('icon') as Phaser.GameObjects.Image | undefined;
    icon?.destroy();
    pod.destroy();
  }

  private handleBuffPickup(
    _rawPlayer: ArcadeOverlapObject,
    rawPickup: ArcadeOverlapObject,
  ) {
    const pickup = rawPickup as Phaser.Physics.Arcade.Image;
    if (!pickup.active) {
      return;
    }

    const buff = pickup.getData('buff') as BuffKey;
    this.activeBuffs[buff] = this.elapsedMs + (buff === 'magnet' ? 22000 : 60000);
    this.flashAt(pickup.x, pickup.y, BUFFS[buff].color, 12);
    this.sfxPickup();
    pickup.destroy();
  }

  private applyVehicle(vehicle: VehicleKey, burst: boolean, rankUp = true) {
    const previousVehicle = this.currentVehicle;
    if (vehicle !== 'mech' && rankUp) {
      this.vehicleRanks[vehicle] = clamp(this.vehicleRanks[vehicle] + 1, 1, PERFECT_VEHICLE_RANK);
    }

    this.currentVehicle = vehicle;
    const baseSpec = VEHICLES[vehicle];
    const spec = this.getVehicleSpec(vehicle);
    this.player.setTexture(baseSpec.texture);
    // Reset body-anim transients on vehicle swap so the new vehicle starts neutral.
    this.player.setData('baseScaleX', undefined);
    this.player.setData('baseScaleY', undefined);
    this.player.setData('bobT', 0);
    this.player.setData('psx', 0);
    this.player.setData('psy', 0);
    this.player.setData('flipX', 0);
    this.player.setData('flipY', 0);
    this.player.setData('lean', 0);
    this.player.setScale(1, 1);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(baseSpec.bodyWidth, baseSpec.bodyHeight, true);
    body.setAllowGravity(false);
    this.player.setMaxVelocity(spec.speed + this.speedBonus);
    this.nextShotAt = Math.min(
      this.nextShotAt,
      this.elapsedMs + Math.max(52, spec.fireDelay * this.getFireRateMultiplier()),
    );

    if (vehicle === 'mech') {
      this.vehicleExpiresAt = 0;
      this.vehicleShield = 0;
      this.maxVehicleShield = 0;
    } else if (this.lockedBossVehicle === vehicle) {
      this.vehicleExpiresAt = Number.POSITIVE_INFINITY;
      this.maxVehicleShield = spec.shield;
      this.vehicleShield =
        previousVehicle === vehicle
          ? clamp(this.vehicleShield + spec.shield * 0.35, Math.min(1, spec.shield), this.maxVehicleShield)
          : this.maxVehicleShield;
    } else {
      this.vehicleExpiresAt =
        previousVehicle === vehicle
          ? Math.min(this.elapsedMs + 30000, Math.max(this.vehicleExpiresAt, this.elapsedMs) + 10000)
          : this.elapsedMs + Phaser.Math.Between(20000, 30000);
      this.maxVehicleShield = spec.shield;
      this.vehicleShield =
        previousVehicle === vehicle
          ? clamp(this.vehicleShield + spec.shield * 0.35, 1, this.maxVehicleShield)
          : this.maxVehicleShield;
    }

    if (burst) {
      this.playCue('vehicle');
      const color =
        vehicle === 'tank' || vehicle === 'artillery'
          ? 0xa7e65d
          : vehicle === 'railgun'
            ? 0x4d8eff
            : vehicle === 'walker'
              ? 0xb285ff
              : 0x4d8eff;
      this.flashAt(
        this.player.x,
        this.player.y,
        color,
        16,
      );
      this.vehicleSwitchRing(color);
      if (vehicle !== 'mech' && this.getVehicleRank(vehicle) >= PERFECT_VEHICLE_RANK) {
        this.showAnnouncement(`${VEHICLES[vehicle].name} 完全体武装已解锁`, 2600);
        this.shockwave(this.player.x, this.player.y, 155, color);
      }
      this.cameras.main.shake(110, 0.0025);
    }
  }

  private applyPreservedBossVehicleOrMech(burst: boolean) {
    if (this.lockedBossVehicle && (this.permanentVehicleRanks[this.lockedBossVehicle] ?? 0) >= PERFECT_VEHICLE_RANK) {
      this.vehicleRanks[this.lockedBossVehicle] = Math.max(
        this.vehicleRanks[this.lockedBossVehicle] ?? 0,
        this.permanentVehicleRanks[this.lockedBossVehicle],
      );
      this.applyVehicle(this.lockedBossVehicle, burst, false);
      this.vehicleExpiresAt = Number.POSITIVE_INFINITY;
      return;
    }

    this.applyVehicle('mech', burst, false);
  }

  private getTerrainAt(x: number, y: number): TerrainKey {
    for (let i = TERRAIN_REGIONS.length - 1; i >= 0; i--) {
      const r = TERRAIN_REGIONS[i];
      if (r.key === 'road') continue;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        return r.key;
      }
    }
    for (let i = TERRAIN_REGIONS.length - 1; i >= 0; i--) {
      const r = TERRAIN_REGIONS[i];
      if (r.key !== 'road') continue;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        return r.key;
      }
    }
    return 'plain';
  }

  private getTerrainSpeedMod(x: number, y: number): number {
    const terrain = this.getTerrainAt(x, y);
    const baseMod = TERRAIN_SPECS[terrain].speedMod;
    const vehicleOverrides = VEHICLE_TERRAIN[this.currentVehicle];
    if (vehicleOverrides && vehicleOverrides[terrain] !== undefined) {
      return vehicleOverrides[terrain]!;
    }
    if (baseMod === 0) {
      return 0.28;
    }
    return baseMod;
  }

  private timeoutVehicle() {
    if (this.currentVehicle === 'mech') {
      return;
    }
    if (this.currentVehicle === this.lockedBossVehicle) {
      this.vehicleExpiresAt = Number.POSITIVE_INFINITY;
      return;
    }

    const expiredVehicle = this.currentVehicle;
    this.applyVehicle('mech', true, false);
    this.showAnnouncement(`${VEHICLES[expiredVehicle].name} 时间结束`, 2200);
  }

  private destroyVehicleByShieldBreak() {
    if (this.currentVehicle === 'mech') {
      return;
    }

    const expiredVehicle = this.currentVehicle;
    if (expiredVehicle === this.lockedBossVehicle) {
      this.vehicleShield = Math.max(this.maxVehicleShield * 0.35, 1);
      this.hp = Math.max(1, this.hp - this.maxHp * 0.12);
      this.shockwave(this.player.x, this.player.y, 130, 0x9ec8ff);
      this.flashAt(this.player.x, this.player.y, 0x9ec8ff, 22);
      this.showAnnouncement(`${VEHICLES[expiredVehicle].name} 永久核心重启，生命扣除 12%`, 2400);
      return;
    }
    const blastColor =
      expiredVehicle === 'tank' || expiredVehicle === 'artillery' || expiredVehicle === 'flameRig'
        ? 0xf5c542
        : expiredVehicle === 'railgun' || expiredVehicle === 'laserVan'
          ? 0x4d8eff
          : 0xff5d6f;
    this.shockwave(this.player.x, this.player.y, 120, blastColor);
    this.flashAt(this.player.x, this.player.y, blastColor, 24);
    this.cameras.main.shake(160, 0.005);

    const terrain = this.getTerrainAt(this.player.x, this.player.y);
    const isFlyingVehicle = expiredVehicle === 'fighter';
    const isHoverVehicle = expiredVehicle === 'hovercraft';
    if (terrain === 'water' && !isFlyingVehicle && !isHoverVehicle) {
      this.hp = 0;
      this.applyVehicle('mech', false, false);
      this.showAnnouncement(`${VEHICLES[expiredVehicle].name} 在水域坠毁，直接阵亡`, 2600);
      this.showGameOver();
      return;
    }
    if (terrain === 'swamp') {
      this.hp = Math.max(0, this.hp - this.maxHp * 0.4);
      if (this.hp <= 0) {
        this.applyVehicle('mech', false, false);
        this.showAnnouncement(`${VEHICLES[expiredVehicle].name} 在沼泽沉没，直接阵亡`, 2600);
        this.showGameOver();
        return;
      }
    }

    this.hp = Math.max(1, this.hp - this.maxHp * 0.18);
    this.applyVehicle('mech', false, false);
    this.showAnnouncement(`${VEHICLES[expiredVehicle].name} 护盾破碎爆炸，生命扣除 18%`, 2600);
  }

  private getCurrentVehicleSpec() {
    return this.getVehicleSpec(this.currentVehicle);
  }

  private getVehicleSpec(vehicle: VehicleKey): VehicleSpec {
    const base = VEHICLES[vehicle];
    const rank = this.getVehicleRank(vehicle);
    const rankBonus = rank - 1;

    return {
      ...base,
      speed: base.speed + rankBonus * 18,
      fireDelay: Math.max(50, base.fireDelay * (1 - rankBonus * 0.075)),
      damage: base.damage * (1 + rankBonus * 0.16),
      range: base.range + rankBonus * 35,
      shots: base.shots + Math.floor(rankBonus / 2),
      noise: base.noise + rankBonus * 3,
      noiseRadius: base.noiseRadius + rankBonus * 24,
      damageTaken: Math.max(0.42, base.damageTaken * (1 - rankBonus * 0.045)),
      shield: base.shield + rankBonus * 26,
      aoe: base.aoe > 0 ? base.aoe + rankBonus * 10 : base.aoe,
    };
  }

  private getVehicleRank(vehicle: VehicleKey) {
    if (vehicle === 'mech') {
      return 1;
    }

    return Math.max(1, this.vehicleRanks[vehicle]);
  }

  private isRemotePlayerTarget(target: CombatTarget): target is RemotePlayerTarget {
    return (target as RemotePlayerTarget).targetType === 'remotePlayer';
  }

  private getHostilePlayerTargets(
    range: number,
    originX = this.player.x,
    originY = this.player.y,
  ): RemotePlayerTarget[] {
    if (!this.latestRoomState || !this.localTeamKey) {
      return [];
    }

    return this.latestRoomState.players
      .filter(
        (player) =>
          player.alive &&
          player.socketId !== this.localSocketId &&
          player.teamKey !== this.localTeamKey,
      )
      .map((player) => ({
        targetType: 'remotePlayer' as const,
        socketId: player.socketId,
        name: player.name,
        x: player.x,
        y: player.y,
        hp: player.hp ?? 0,
        maxHp: player.maxHp ?? 1,
        distance: Phaser.Math.Distance.Between(originX, originY, player.x, player.y),
      }))
      .filter((player) => player.distance <= range)
      .map(({ distance: _distance, ...player }) => player);
  }

  private findRemotePlayerAt(x: number, y: number, radius: number) {
    return this.getHostilePlayerTargets(radius, x, y)
      .sort(
        (a, b) =>
          Phaser.Math.Distance.Between(x, y, a.x, a.y) -
          Phaser.Math.Distance.Between(x, y, b.x, b.y),
      )[0];
  }

  private findNearestTarget(range: number) {
    let nearest: CombatTarget | undefined;
    let nearestDistance = range;

    this.enemies.getChildren().forEach((rawEnemy) => {
      const enemy = rawEnemy as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) {
        return;
      }

      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        enemy.x,
        enemy.y,
      );
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = enemy;
      }
    });

    this.chests.getChildren().forEach((rawChest) => {
      const chest = rawChest as Phaser.Physics.Arcade.Image;
      if (!chest.active || chest.getData('broken')) {
        return;
      }

      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        chest.x,
        chest.y,
      );
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = chest;
      }
    });

    this.getHostilePlayerTargets(range).forEach((player) => {
      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        player.x,
        player.y,
      );
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = player;
      }
    });

    return nearest;
  }

  private getTargetsInRange(
    range: number,
    limit: number,
  ): CombatTarget[] {
    const targets: Array<{
      target: CombatTarget;
      distance: number;
    }> = [];

    this.enemies.getChildren().forEach((rawEnemy) => {
      const enemy = rawEnemy as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) {
        return;
      }

      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        enemy.x,
        enemy.y,
      );
      if (distance <= range) {
        targets.push({ target: enemy, distance });
      }
    });

    this.chests.getChildren().forEach((rawChest) => {
      const chest = rawChest as Phaser.Physics.Arcade.Image;
      if (!chest.active || chest.getData('broken')) {
        return;
      }

      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        chest.x,
        chest.y,
      );
      if (distance <= range) {
        targets.push({ target: chest, distance });
      }
    });

    this.getHostilePlayerTargets(range).forEach((player) => {
      targets.push({
        target: player,
        distance: Phaser.Math.Distance.Between(this.player.x, this.player.y, player.x, player.y),
      });
    });

    return targets
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit)
      .map((entry) => entry.target);
  }

  private damageTarget(
    target: CombatTarget,
    damage: number,
  ) {
    if (this.isRemotePlayerTarget(target)) {
      this.damageRemotePlayer(target, damage);
      return;
    }

    if (target.getData('kind')) {
      this.damageEnemy(target as Phaser.Physics.Arcade.Sprite, damage);
      return;
    }

    this.damageChest(target as Phaser.Physics.Arcade.Image, damage);
  }

  private drawArcBolt(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: number,
    width = 3,
    duration = 160,
  ) {
    const bolt = this.add.line(0, 0, x1, y1, x2, y2, color, 0.9).setOrigin(0).setDepth(35);
    bolt.setLineWidth(width, Math.max(1, width * 0.35));
    const angle = Phaser.Math.Angle.Between(x1, y1, x2, y2);
    const distance = Phaser.Math.Distance.Between(x1, y1, x2, y2);
    const sparkCount = this.isLowFxMode() ? 1 : 3;
    for (let i = 0; i < sparkCount; i += 1) {
      const t = (i + 1) / 4;
      const jitter = Phaser.Math.Between(-14, 14);
      const spark = this.add
        .circle(
          x1 + Math.cos(angle) * distance * t + Math.cos(angle + Math.PI / 2) * jitter,
          y1 + Math.sin(angle) * distance * t + Math.sin(angle + Math.PI / 2) * jitter,
          Math.max(2, width),
          color,
          0.9,
        )
        .setDepth(36);
      this.tweens.add({
        targets: spark,
        alpha: 0,
        scale: 2.2,
        duration,
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
    this.tweens.add({
      targets: bolt,
      alpha: 0,
      duration,
      ease: 'Cubic.easeOut',
      onComplete: () => bolt.destroy(),
    });
    this.flashAt(x2, y2, color, 7 + width);
  }

  private drawLightningBolt(
    x1: number, y1: number, x2: number, y2: number,
    color: number, width = 3, duration = 180,
  ) {
    const angle = Phaser.Math.Angle.Between(x1, y1, x2, y2);
    const distance = Phaser.Math.Distance.Between(x1, y1, x2, y2);
    const segments = Math.max(3, Math.floor(distance / 40));
    const perpX = Math.cos(angle + Math.PI / 2);
    const perpY = Math.sin(angle + Math.PI / 2);

    const points: { x: number; y: number }[] = [{ x: x1, y: y1 }];
    for (let i = 1; i < segments; i += 1) {
      const t = i / segments;
      const jitter = Phaser.Math.Between(-18, 18);
      points.push({
        x: x1 + Math.cos(angle) * distance * t + perpX * jitter,
        y: y1 + Math.sin(angle) * distance * t + perpY * jitter,
      });
    }
    points.push({ x: x2, y: y2 });

    for (let i = 0; i < points.length - 1; i += 1) {
      const seg = this.add.line(0, 0, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y, color, 0.85)
        .setOrigin(0).setDepth(35);
      seg.setLineWidth(width, Math.max(1, width * 0.35));
      this.tweens.add({
        targets: seg,
        alpha: 0,
        duration,
        ease: 'Cubic.easeOut',
        onComplete: () => seg.destroy(),
      });
    }

    for (let i = 0; i < 5; i += 1) {
      const t = (i + 1) / 6;
      const jitter = Phaser.Math.Between(-22, 22);
      const spark = this.add.circle(
        x1 + Math.cos(angle) * distance * t + perpX * jitter,
        y1 + Math.sin(angle) * distance * t + perpY * jitter,
        Math.max(2, width * 0.8), color, 0.9,
      ).setDepth(36);
      this.tweens.add({
        targets: spark,
        alpha: 0, scale: 2.8,
        duration,
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      });
    }

    this.flashAt(x2, y2, color, Math.max(3, width));
  }

  private drawSwarmTrail(
    x1: number, y1: number, x2: number, y2: number,
    color: number, count = 6,
  ) {
    const angle = Phaser.Math.Angle.Between(x1, y1, x2, y2);
    const distance = Phaser.Math.Distance.Between(x1, y1, x2, y2);
    const perpX = Math.cos(angle + Math.PI / 2);
    const perpY = Math.sin(angle + Math.PI / 2);

    for (let i = 0; i < count; i += 1) {
      const spread = Phaser.Math.Between(-24, 24);
      const delay = i * 28;
      const size = Phaser.Math.Between(2, 4);

      const bug = this.add.circle(
        x1 + perpX * spread,
        y1 + perpY * spread,
        size, color, 0.9,
      ).setDepth(36);

      this.tweens.add({
        targets: bug,
        x: x2 + perpX * Phaser.Math.Between(-14, 14),
        y: y2 + perpY * Phaser.Math.Between(-14, 14),
        alpha: 0,
        duration: 140 + Phaser.Math.Between(0, 80),
        delay,
        ease: 'Quad.easeIn',
        onComplete: () => bug.destroy(),
      });
    }

    this.flashAt(x2, y2, color, 5);
  }

  private drawBeam(
    x1: number, y1: number, x2: number, y2: number,
    color: number, width = 6, duration = 220,
  ) {
    const glow = this.add.line(0, 0, x1, y1, x2, y2, color, 0.3)
      .setOrigin(0).setDepth(34);
    glow.setLineWidth(width * 2.2, width * 1.6);

    const beam = this.add.line(0, 0, x1, y1, x2, y2, color, 0.92)
      .setOrigin(0).setDepth(35);
    beam.setLineWidth(width, Math.max(1, width * 0.5));

    const core = this.add.line(0, 0, x1, y1, x2, y2, 0xe8f7f4, 0.7)
      .setOrigin(0).setDepth(36);
    core.setLineWidth(Math.max(1, width * 0.35), 1);

    this.tweens.add({
      targets: glow,
      alpha: 0,
      duration: duration + 60,
      ease: 'Cubic.easeOut',
      onComplete: () => glow.destroy(),
    });
    this.tweens.add({
      targets: beam,
      alpha: 0,
      duration,
      ease: 'Cubic.easeOut',
      onComplete: () => beam.destroy(),
    });
    this.tweens.add({
      targets: core,
      alpha: 0,
      duration: duration - 40,
      ease: 'Cubic.easeOut',
      onComplete: () => core.destroy(),
    });

    this.flashAt(x2, y2, color, Math.max(4, width));
  }

  private findNearestEnemy(range: number) {
    let nearest: Phaser.Physics.Arcade.Sprite | undefined;
    let nearestDistance = range;

    this.enemies.getChildren().forEach((rawEnemy) => {
      const enemy = rawEnemy as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) {
        return;
      }

      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        enemy.x,
        enemy.y,
      );
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = enemy;
      }
    });

    return nearest;
  }

  private findNearestEnemyOrPlayer(range: number): Phaser.Physics.Arcade.Sprite | RemotePlayerTarget | undefined {
    let nearest: Phaser.Physics.Arcade.Sprite | RemotePlayerTarget | undefined;
    let nearestDistance = range;

    this.enemies.getChildren().forEach((rawEnemy) => {
      const enemy = rawEnemy as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) {
        return;
      }

      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        enemy.x,
        enemy.y,
      );
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = enemy;
      }
    });

    this.getHostilePlayerTargets(range).forEach((player) => {
      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        player.x,
        player.y,
      );
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = player;
      }
    });

    return nearest;
  }

  private addThreatNoise(x: number, y: number, strength: number, radius: number) {
    this.enemies.getChildren().forEach((rawEnemy) => {
      const enemy = rawEnemy as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) {
        return;
      }

      const kind = enemy.getData('kind') as EnemyKind;
      const spec = ENEMIES[kind];
      const distance = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
      if (distance > radius) {
        return;
      }

      const gain = strength * spec.noiseMultiplier * (1 - distance / radius);
      enemy.setData('aggro', clamp((enemy.getData('aggro') as number) + gain, 0, 100));
    });
  }

  private drawTargetRing() {
    if (!this.targetRing || !this.player) {
      return;
    }

    this.targetRing.clear();
    this.targetRing.lineStyle(2, 0x4d8eff, 0.42);
    this.targetRing.strokeCircle(this.player.x, this.player.y, this.targetRange);
    this.targetRing.lineStyle(1, 0xe8f7f4, 0.18);
    this.targetRing.strokeCircle(this.player.x, this.player.y, Math.max(12, this.targetRange - 8));
  }

  private drawBattleRoyaleZone() {
    if (!this.battleZoneGraphics) {
      return;
    }

    this.battleZoneGraphics.clear();
    if (!this.isInMultiplayerRoom || !this.isBattleRoyaleRoom()) {
      return;
    }

    const zone = this.getBattleRoyaleZone();
    if (!zone) {
      return;
    }

    const locked = zone.radius <= zone.minRadius + 2;
    const ringColor = locked ? 0xf5c542 : 0x4d8eff;
    this.battleZoneGraphics.lineStyle(18, 0x06101a, 0.36);
    this.battleZoneGraphics.strokeCircle(zone.centerX, zone.centerY, zone.radius + 8);
    this.battleZoneGraphics.lineStyle(5, ringColor, 0.88);
    this.battleZoneGraphics.strokeCircle(zone.centerX, zone.centerY, zone.radius);
    this.battleZoneGraphics.lineStyle(2, 0xcfefff, 0.48);
    this.battleZoneGraphics.strokeCircle(zone.centerX, zone.centerY, Math.max(zone.minRadius, zone.radius - 10));

    const t = this.elapsedMs / 1000;
    this.battleZoneGraphics.lineStyle(3, 0xcfefff, 0.76);
    for (let i = 0; i < 28; i += 1) {
      const angle = (i * 2.399 + t * 0.42) % (Math.PI * 2);
      const inner = zone.radius + 12 + (i % 3) * 8;
      const outer = inner + 44 + (i % 5) * 10;
      const x1 = zone.centerX + Math.cos(angle) * inner;
      const y1 = zone.centerY + Math.sin(angle) * inner;
      const x2 = zone.centerX + Math.cos(angle + Math.sin(t + i) * 0.035) * outer;
      const y2 = zone.centerY + Math.sin(angle + Math.cos(t + i) * 0.035) * outer;
      this.battleZoneGraphics.lineBetween(x1, y1, x2, y2);
    }
  }

  private drawEnemyBars() {
    this.enemyHud.clear();
    this.enemies.getChildren().forEach((rawEnemy) => {
      const enemy = rawEnemy as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) {
        return;
      }

      const aggro = enemy.getData('aggro') as number;
      const hp = enemy.getData('hp') as number;
      const maxHp = enemy.getData('maxHp') as number;
      const tier = enemy.getData('tier') as EnemyTier;
      const isBoss = enemy.getData('isBoss');
      const barWidth = isBoss ? 92 : 38;
      const x = enemy.x - barWidth / 2;
      const y = enemy.y - enemy.displayHeight / 2 - (isBoss ? 20 : 13);

      this.enemyHud.fillStyle(ENEMY_TIERS[tier].color, 1);
      this.enemyHud.fillRect(x - 6, y, 4, isBoss ? 18 : 12);
      this.enemyHud.fillStyle(0x050709, 0.82);
      this.enemyHud.fillRect(x, y, barWidth, isBoss ? 6 : 4);
      this.enemyHud.fillStyle(aggro > 62 ? 0xff5d6f : aggro > 24 ? 0xf5c542 : 0x4d8eff, 1);
      this.enemyHud.fillRect(x, y, barWidth * (aggro / 100), isBoss ? 6 : 4);
      this.enemyHud.fillStyle(0xa7e65d, 0.95);
      this.enemyHud.fillRect(x, y + (isBoss ? 8 : 5), barWidth * clamp(hp / maxHp, 0, 1), isBoss ? 5 : 3);
    });

    this.chests.getChildren().forEach((rawChest) => {
      const chest = rawChest as Phaser.Physics.Arcade.Image;
      if (!chest.active || chest.getData('broken')) {
        return;
      }

      const hp = chest.getData('hp') as number;
      const maxHp = chest.getData('maxHp') as number;
      const x = chest.x - 21;
      const y = chest.y - chest.displayHeight / 2 - 10;
      this.enemyHud.fillStyle(0x050709, 0.82);
      this.enemyHud.fillRect(x, y, 42, 5);
      this.enemyHud.fillStyle(0xf5c542, 1);
      this.enemyHud.fillRect(x, y, 42 * clamp(hp / maxHp, 0, 1), 5);
    });
  }

  private drawSkillChips(x: number, y: number, isCompact: boolean) {
    const chipW = isCompact ? 64 : 86;
    const chipH = isCompact ? 22 : 28;
    const gap = 8;
    SKILL_ORDER.forEach((key, index) => {
      const spec = SKILLS[key];
      const cx = x + index * (chipW + gap);
      const ready = this.elapsedMs >= this.skillReadyAt[key];
      const active = this.isSkillActive(key);
      const cooldownMs = Math.max(0, this.skillReadyAt[key] - this.elapsedMs);
      const progress = ready ? 1 : 1 - cooldownMs / spec.cooldownMs;
      this.hud.fillStyle(0x050709, 0.78);
      this.hud.fillRoundedRect(cx, y, chipW, chipH, 6);
      this.hud.fillStyle(spec.color, ready ? 0.32 : 0.18);
      this.hud.fillRoundedRect(cx, y, chipW * progress, chipH, 6);
      this.hud.lineStyle(1.5, spec.color, active ? 1 : ready ? 0.85 : 0.42);
      this.hud.strokeRoundedRect(cx, y, chipW, chipH, 6);

      let label = this.skillHudTexts[key];
      if (!label) {
        label = this.add
          .text(cx + chipW / 2, y + chipH / 2, '', {
            fontFamily: 'Inter, "Segoe UI", sans-serif',
            fontSize: isCompact ? '11px' : '13px',
            color: '#e8f7f4',
            fontStyle: 'bold',
            align: 'center',
          })
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setDepth(95);
        this.skillHudTexts[key] = label;
      }
      label.setFontSize(isCompact ? 11 : 13);
      label.setPosition(cx + chipW / 2, y + chipH / 2);
      const keyLabel = key === 'sprint' ? '冲 Shift' : '炸 F';
      if (active) {
        label.setText(`${spec.icon} 进行中`);
        label.setColor('#e8f7f4');
      } else if (ready) {
        label.setText(keyLabel);
        label.setColor(`#${spec.color.toString(16).padStart(6, '0')}`);
      } else {
        label.setText(`${spec.icon} ${(cooldownMs / 1000).toFixed(1)}s`);
        label.setColor('#a9c7c1');
      }
    });
  }

  private drawHud() {
    if (!this.hud || !this.hudText) {
      return;
    }

    const width = this.scale.width;
    const height = this.scale.height;
    const vehicle = VEHICLES[this.currentVehicle];
    const vehicleSpec = this.getCurrentVehicleSpec();
    const vehicleRank = this.getVehicleRank(this.currentVehicle);
    const isMobileLandscape = width > height && width <= 960 && height <= 540;
    const isMobilePortrait = height > width && width <= 680;
    const targetZoom = isMobileLandscape ? 0.78 : 1;
    const currentZoom = this.cameras.main.zoom;
    if (Math.abs(currentZoom - targetZoom) > 0.005) {
      this.cameras.main.setZoom(currentZoom + (targetZoom - currentZoom) * 0.08);
    } else if (currentZoom !== targetZoom) {
      this.cameras.main.setZoom(targetZoom);
    }
    const isCompact = width < 760 || isMobileLandscape || isMobilePortrait;
    const hudMargin = isMobileLandscape || isMobilePortrait ? 10 : 16;
    const hudTextX = hudMargin + (isMobilePortrait ? 10 : 18);
    const leftPanelX = hudMargin;
    const leftPanelY = hudMargin;
    const minimapSize = isMobileLandscape ? 76 : isMobilePortrait ? 72 : isCompact ? 104 : 150;
    const minimapX = width - minimapSize - (isMobileLandscape || isMobilePortrait ? 10 : 16);
    const minimapY = isMobileLandscape || isMobilePortrait ? 10 : 16;
    const leftPanelWidth = isMobileLandscape
      ? Math.min(312, width * 0.38)
      : isMobilePortrait
        ? Math.min(270, Math.max(168, width - minimapSize - 34))
        : isCompact
          ? Math.min(360, width - 32)
          : 430;
    const leftPanelHeight = isMobileLandscape ? 132 : isMobilePortrait ? 112 : 198;
    const barWidth = isMobileLandscape ? Math.max(118, leftPanelWidth - 142) : isMobilePortrait ? Math.max(86, leftPanelWidth - 116) : 220;
    const rightPanelWidth = isMobileLandscape ? Math.max(176, Math.min(236, width - leftPanelWidth - minimapSize - 48)) : Math.min(284, width - 32);
    const rightPanelHeight = isMobileLandscape ? 118 : 128;
    const rightPanelX = isMobileLandscape
      ? Math.max(leftPanelWidth + 20, minimapX - rightPanelWidth - 10)
      : isCompact
        ? 16
        : width - rightPanelWidth - 16;
    const rightPanelY = isMobileLandscape
      ? minimapY + minimapSize + 8
      : isCompact
        ? Math.max(154, height - rightPanelHeight - 16)
        : minimapY + minimapSize + 12;
    const remainingVehicle =
      this.currentVehicle === 'mech'
        ? 0
        : clamp((this.vehicleExpiresAt - this.elapsedMs) / 28000, 0, 1);
    const seconds = Math.floor(this.elapsedMs / 1000);
    const minutes = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0');
    const restSeconds = (seconds % 60).toString().padStart(2, '0');
    const roomRemainingMs = this.getRoomRemainingMs();
    const remainingText = roomRemainingMs !== undefined
      ? this.formatClock(roomRemainingMs)
      : `${minutes}:${restSeconds}`;
    const teamScore = this.latestRoomState?.scores[this.localTeamKey] ?? 0;
    const roomModeName = this.latestRoomState?.room.modeName ?? this.currentRoom?.modeName ?? '普通模式';
    const battleZoneText = this.getBattleRoyaleZoneStatus();
    const currentTerrain = this.getTerrainAt(this.player.x, this.player.y);
    const terrainLabel = TERRAIN_SPECS[currentTerrain].label;
    const terrainMod = this.getTerrainSpeedMod(this.player.x, this.player.y);
    const terrainHudText = terrainLabel
      ? `${terrainLabel} ${terrainMod < 1 ? `x${terrainMod.toFixed(2)}` : terrainMod > 1 ? `x${terrainMod.toFixed(2)}` : ''}`
      : '';

    this.hud.clear();

    // Left HUD panel backdrop with neon corner brackets
    if (!isMobilePortrait) {
      const lpX = hudTextX - 10;
      const lpY = (isMobileLandscape ? 16 : 20);
      const lpW = barWidth + 20;
      const lpH = (isMobileLandscape ? 90 : 108);
      this.hud.fillStyle(0x040712, 0.78);
      this.hud.fillRoundedRect(lpX, lpY, lpW, lpH, 6);
      this.hud.lineStyle(1.5, 0x4d8eff, 0.55);
      this.hud.strokeRoundedRect(lpX, lpY, lpW, lpH, 6);
      // corner brackets
      const bk = 9;
      this.hud.lineStyle(2, 0x4d8eff, 0.95);
      this.hud.lineBetween(lpX, lpY, lpX + bk, lpY);
      this.hud.lineBetween(lpX, lpY, lpX, lpY + bk);
      this.hud.lineBetween(lpX + lpW, lpY, lpX + lpW - bk, lpY);
      this.hud.lineBetween(lpX + lpW, lpY, lpX + lpW, lpY + bk);
      this.hud.lineBetween(lpX, lpY + lpH, lpX + bk, lpY + lpH);
      this.hud.lineBetween(lpX, lpY + lpH, lpX, lpY + lpH - bk);
      this.hud.lineBetween(lpX + lpW, lpY + lpH, lpX + lpW - bk, lpY + lpH);
      this.hud.lineBetween(lpX + lpW, lpY + lpH, lpX + lpW, lpY + lpH - bk);
    }

    const barY1 = isMobileLandscape ? 48 : isMobilePortrait ? 38 : 56;
    const barY2 = isMobileLandscape ? 66 : isMobilePortrait ? 54 : 82;
    const barY3 = isMobileLandscape ? 84 : isMobilePortrait ? 70 : 108;
    const barH1 = isMobileLandscape ? 8 : isMobilePortrait ? 6 : 11;
    const barH2 = isMobileLandscape ? 7 : isMobilePortrait ? 5 : 9;
    // HP bar
    this.hud.fillStyle(0x040712, 0.95);
    this.hud.fillRect(hudTextX - 1, barY1 - 1, barWidth + 2, barH1 + 2);
    this.hud.fillStyle(0x150612, 1);
    this.hud.fillRect(hudTextX, barY1, barWidth, barH1);
    const hpRatio = clamp(this.hp / this.maxHp, 0, 1);
    this.hud.fillStyle(0xff5d6f, 1);
    this.hud.fillRect(hudTextX, barY1, barWidth * hpRatio, barH1);
    this.hud.fillStyle(0xff9ea8, 0.85);
    this.hud.fillRect(hudTextX, barY1, barWidth * hpRatio, Math.max(1, Math.floor(barH1 / 3)));
    this.hud.lineStyle(1, 0xff5d6f, 0.85);
    this.hud.strokeRect(hudTextX, barY1, barWidth, barH1);
    // XP bar
    this.hud.fillStyle(0x041820, 1);
    this.hud.fillRect(hudTextX, barY2, barWidth, barH2);
    const xpRatio = clamp(this.xp / this.xpToNext, 0, 1);
    this.hud.fillStyle(0x4d8eff, 1);
    this.hud.fillRect(hudTextX, barY2, barWidth * xpRatio, barH2);
    this.hud.fillStyle(0xffffff, 0.7);
    this.hud.fillRect(hudTextX, barY2, barWidth * xpRatio, 1);
    this.hud.lineStyle(1, 0x4d8eff, 0.65);
    this.hud.strokeRect(hudTextX, barY2, barWidth, barH2);
    // Alert bar
    this.hud.fillStyle(0x0c1410, 1);
    this.hud.fillRect(hudTextX, barY3, barWidth, barH2);
    const alertColor =
      this.areaAlert > 68 ? 0xff5d6f : this.areaAlert > 34 ? 0xf5c542 : 0xb6ff3a;
    this.hud.fillStyle(alertColor, 1);
    this.hud.fillRect(hudTextX, barY3, barWidth * (this.areaAlert / 100), barH2);
    this.hud.lineStyle(1, alertColor, 0.65);
    this.hud.strokeRect(hudTextX, barY3, barWidth, barH2);

    this.drawSkillChips(hudTextX, barY3 + barH2 + (isMobileLandscape || isMobilePortrait ? 4 : 8), isCompact);

    this.drawMiniMap(minimapX, minimapY, minimapSize);

    if (!isMobilePortrait) {
      this.hud.fillStyle(0x030610, 0.86);
      this.hud.fillRoundedRect(rightPanelX, rightPanelY, rightPanelWidth, rightPanelHeight, 8);
      this.hud.lineStyle(1.5, 0xf5c542, 0.6);
      this.hud.strokeRoundedRect(rightPanelX, rightPanelY, rightPanelWidth, rightPanelHeight, 8);
      // corner ticks
      const rb = 8;
      this.hud.lineStyle(2, 0xf5c542, 0.95);
      this.hud.lineBetween(rightPanelX, rightPanelY, rightPanelX + rb, rightPanelY);
      this.hud.lineBetween(rightPanelX, rightPanelY, rightPanelX, rightPanelY + rb);
      this.hud.lineBetween(rightPanelX + rightPanelWidth, rightPanelY + rightPanelHeight, rightPanelX + rightPanelWidth - rb, rightPanelY + rightPanelHeight);
      this.hud.lineBetween(rightPanelX + rightPanelWidth, rightPanelY + rightPanelHeight, rightPanelX + rightPanelWidth, rightPanelY + rightPanelHeight - rb);

      if (this.currentVehicle !== 'mech') {
        const vehicleBarWidth = rightPanelWidth - 34;
        this.hud.fillStyle(0x041820, 1);
        this.hud.fillRect(rightPanelX + 17, rightPanelY + 14, vehicleBarWidth, 10);
        const vColor = this.currentVehicle === 'tank' ? 0xb6ff3a : 0x4d8eff;
        this.hud.fillStyle(vColor, 1);
        this.hud.fillRect(rightPanelX + 17, rightPanelY + 14, vehicleBarWidth * remainingVehicle, 10);
        this.hud.fillStyle(0xffffff, 0.6);
        this.hud.fillRect(rightPanelX + 17, rightPanelY + 14, vehicleBarWidth * remainingVehicle, 2);
        this.hud.lineStyle(1, vColor, 0.7);
        this.hud.strokeRect(rightPanelX + 17, rightPanelY + 14, vehicleBarWidth, 10);
      }
    }

    const hudLines = isMobileLandscape
      ? [
        `生命 ${Math.ceil(this.hp)}/${this.maxHp}   Lv.${this.level}`,
        `经验 ${this.xp}/${this.xpToNext}   警戒 ${Math.round(this.areaAlert)}%`,
        `击杀 ${this.kills}   剩余 ${remainingText}   分 ${teamScore}`,
        `${vehicle.name}${this.currentVehicle === 'mech' ? '' : ` Lv.${vehicleRank}`}   ${battleZoneText || this.getWeatherHudText()}`,
        this.getWeaponSlotText(),
      ]
      : isMobilePortrait
        ? [
          `生命 ${Math.ceil(this.hp)}/${this.maxHp}   Lv.${this.level}`,
          `经验 ${this.xp}/${this.xpToNext}   警戒 ${Math.round(this.areaAlert)}%`,
          `击杀 ${this.kills}   ${remainingText}   分 ${teamScore}`,
          `${vehicle.name}${this.currentVehicle === 'mech' ? '' : ` Lv.${vehicleRank}`} ${battleZoneText || terrainHudText || this.getWeatherHudText()}`,
        ]
        : [
          `生命 ${Math.ceil(this.hp)}/${this.maxHp}     等级 ${this.level}`,
          `经验 ${this.xp}/${this.xpToNext}`,
          `索敌 ${Math.round(this.targetRange)}   区域警戒 ${Math.round(this.areaAlert)}%`,
          `击杀 ${this.kills}     剩余 ${remainingText}`,
          `阵营 ${this.localTeamName || '未加入'}     积分 ${teamScore}`,
          `模式 ${roomModeName}${battleZoneText ? `     ${battleZoneText}` : ''}`,
          `载具 ${vehicle.name}${this.currentVehicle === 'mech' ? '' : ` Lv.${vehicleRank}`}`,
          this.getWeatherHudText(),
          this.getWeaponSlotText(),
        ];
    this.hudText.setStyle({
      fontFamily: 'Inter, "Segoe UI", sans-serif',
      fontSize: isMobileLandscape || isMobilePortrait ? '10px' : isCompact ? '13px' : '15px',
      color: '#e8f7f4',
      lineSpacing: isMobileLandscape ? 3 : isMobilePortrait ? 2 : 7,
      wordWrap: { width: leftPanelWidth - (isMobilePortrait ? 20 : 32) },
    });
    this.hudText.setText(hudLines.join('\n'));
    this.hudText.setPosition(hudTextX, isMobileLandscape ? 24 : isMobilePortrait ? 18 : 28);

    const rightText =
      this.currentVehicle === 'mech'
        ? '载具舱：待发现'
        : this.currentVehicle === this.lockedBossVehicle
          ? `${vehicle.name} Lv.${vehicleRank}  永久`
          : `${vehicle.name} Lv.${vehicleRank}  ${Math.ceil(
              (this.vehicleExpiresAt - this.elapsedMs) / 1000,
            )}s`;
    const rightTextY = rightPanelY + (this.currentVehicle === 'mech' ? 18 : 30);
    const statTextY = rightPanelY + (isMobileLandscape ? 36 : 52);
    const controlTextY = rightPanelY + (isMobileLandscape ? 55 : 73);
    const buffTextY = rightPanelY + (isMobileLandscape ? 70 : 96);
    this.hudText.setDepth(901);

    if (isMobilePortrait) {
      ['vehicle-readout', 'stat-readout', 'control-readout', 'buff-readout', 'terrain-readout'].forEach((name) => {
        (this.children.getByName(name) as Phaser.GameObjects.Text | null)?.setVisible(false);
      });
    } else {
    const existing = this.children.getByName('vehicle-readout') as Phaser.GameObjects.Text | null;
    if (existing) {
      existing.setVisible(true);
      existing.setStyle({
        fontFamily: 'Inter, "Segoe UI", sans-serif',
        fontSize: isMobileLandscape ? '12px' : '18px',
        color: '#e8f7f4',
      });
      existing.setText(rightText);
      existing.setPosition(rightPanelX + 18, rightTextY);
    } else {
      this.add
        .text(rightPanelX + 18, rightTextY, rightText, {
          fontFamily: 'Inter, "Segoe UI", sans-serif',
          fontSize: isMobileLandscape ? '12px' : '18px',
          color: '#e8f7f4',
        })
        .setName('vehicle-readout')
        .setScrollFactor(0)
        .setDepth(901);
    }

    const stat = this.children.getByName('stat-readout') as Phaser.GameObjects.Text | null;
    const shieldText =
      this.currentVehicle === 'mech'
        ? ''
        : isMobileLandscape
          ? ` 盾 ${Math.ceil(this.vehicleShield)}/${Math.ceil(this.maxVehicleShield)}`
          : `   护盾 ${Math.ceil(this.vehicleShield)}/${Math.ceil(this.maxVehicleShield)}`;
    const actualFireDelay = Math.max(52, vehicleSpec.fireDelay * this.getFireRateMultiplier());
    const shotsPerSecond = (vehicleSpec.shots * 1000) / actualFireDelay;
    const vehiclePerfectText = this.currentVehicle !== 'mech' && vehicleRank >= PERFECT_VEHICLE_RANK ? ' 完全体' : '';
    const statText = isMobileLandscape
      ? `火x${this.getDamageMultiplier().toFixed(2)}${vehiclePerfectText}  射${shotsPerSecond.toFixed(1)}/s  冷却${Math.round(actualFireDelay)}ms${shieldText}`
      : `火力 x${this.getDamageMultiplier().toFixed(2)}${vehiclePerfectText}   射速 ${shotsPerSecond.toFixed(
          1,
        )}/s   冷却 ${Math.round(actualFireDelay)}ms${shieldText}`;
    if (stat) {
      stat.setVisible(true);
      stat.setStyle({
        fontFamily: 'Inter, "Segoe UI", sans-serif',
        fontSize: isMobileLandscape ? '10px' : '13px',
        color: '#a9c7c1',
        wordWrap: { width: rightPanelWidth - 34 },
      });
      stat.setText(statText);
      stat.setPosition(rightPanelX + 18, statTextY);
    } else {
      this.add
        .text(rightPanelX + 18, statTextY, statText, {
          fontFamily: 'Inter, "Segoe UI", sans-serif',
          fontSize: isMobileLandscape ? '10px' : '13px',
          color: '#a9c7c1',
          wordWrap: { width: rightPanelWidth - 34 },
        })
        .setName('stat-readout')
        .setScrollFactor(0)
        .setDepth(901);
    }

    const controls = this.children.getByName('control-readout') as Phaser.GameObjects.Text | null;
    const controlText = isMobileLandscape ? '摇杆移动   Q/E索敌' : 'WASD移动   Q/E调索敌圈';
    if (controls) {
      controls.setVisible(true);
      controls.setStyle({
        fontFamily: 'Inter, "Segoe UI", sans-serif',
        fontSize: isMobileLandscape ? '10px' : '12px',
        color: '#9fffe0',
      });
      controls.setText(controlText);
      controls.setPosition(rightPanelX + 18, controlTextY);
    } else {
      this.add
        .text(rightPanelX + 18, controlTextY, controlText, {
          fontFamily: 'Inter, "Segoe UI", sans-serif',
          fontSize: isMobileLandscape ? '10px' : '12px',
          color: '#9fffe0',
        })
        .setName('control-readout')
        .setScrollFactor(0)
        .setDepth(901);
    }

    const buffs = this.children.getByName('buff-readout') as Phaser.GameObjects.Text | null;
    const buffText = this.getActiveBuffText();
    if (buffs) {
      buffs.setVisible(true);
      buffs.setStyle({
        fontFamily: 'Inter, "Segoe UI", sans-serif',
        fontSize: isMobileLandscape ? '10px' : '12px',
        color: '#ffda8a',
        wordWrap: { width: rightPanelWidth - 36 },
      });
      buffs.setText(buffText);
      buffs.setPosition(rightPanelX + 18, buffTextY);
    } else {
      this.add
        .text(rightPanelX + 18, buffTextY, buffText, {
          fontFamily: 'Inter, "Segoe UI", sans-serif',
          fontSize: isMobileLandscape ? '10px' : '12px',
          color: '#ffda8a',
          wordWrap: { width: rightPanelWidth - 36 },
        })
        .setName('buff-readout')
        .setScrollFactor(0)
        .setDepth(901);
    }

    const terrainIndicator = this.children.getByName('terrain-readout') as Phaser.GameObjects.Text | null;
    const terrainTextY = rightPanelY + (isMobileLandscape ? 82 : 110);
    if (terrainIndicator) {
      terrainIndicator.setVisible(true);
      terrainIndicator.setStyle({
        fontFamily: 'Inter, "Segoe UI", sans-serif',
        fontSize: isMobileLandscape ? '12px' : '14px',
        color: TERRAIN_ACCENT[currentTerrain].text,
        backgroundColor: currentTerrain === 'plain' ? 'transparent' : 'rgba(5, 7, 9, 0.62)',
        padding: { x: 6, y: 3 },
      });
      terrainIndicator.setText(terrainHudText);
      terrainIndicator.setPosition(rightPanelX + 18, terrainTextY);
    } else {
      this.add
        .text(rightPanelX + 18, terrainTextY, terrainHudText, {
          fontFamily: 'Inter, "Segoe UI", sans-serif',
          fontSize: isMobileLandscape ? '12px' : '14px',
          color: TERRAIN_ACCENT[currentTerrain].text,
          backgroundColor: currentTerrain === 'plain' ? 'transparent' : 'rgba(5, 7, 9, 0.62)',
          padding: { x: 6, y: 3 },
        })
        .setName('terrain-readout')
        .setScrollFactor(0)
        .setDepth(901);
    }
    }

    const vignetteAlpha = clamp(this.areaAlert / 100, 0, 0.34);
    this.hud.lineStyle(4, this.areaAlert > 65 ? 0xff5d6f : 0xf5c542, vignetteAlpha);
    this.hud.strokeRect(2, 2, width - 4, height - 4);

    if (this.invasionMessage && Number.isFinite(this.invasionMessageUntil) && this.elapsedMs >= this.invasionMessageUntil) {
      this.hideAnnouncement();
    }

    const systemAnnouncement = this.getSystemAnnouncementText();
    const showTransient = Boolean(this.invasionMessage);
    const showSystem = Boolean(systemAnnouncement);
    const announcementCenterX = isMobileLandscape ? (16 + leftPanelWidth + minimapX) / 2 : width / 2;
    const announcementMaxWidth = isMobileLandscape
      ? Math.max(170, minimapX - (16 + leftPanelWidth) - 24)
      : width - 32;

    // System countdown (gold) - always at top
    const sysW = isMobileLandscape ? Math.min(260, announcementMaxWidth) : 340;
    const sysH = isMobileLandscape ? 20 : 36;
    const sysY = isMobileLandscape ? 4 : 20;
    const sysCY = sysY + sysH / 2;
    const sysFont = isMobileLandscape ? '9px' : '15px';

    if (showSystem) {
      this.hud.fillStyle(0x050709, 0.68);
      this.hud.fillRoundedRect(announcementCenterX - sysW / 2, sysY, sysW, sysH, 6);
      this.hud.lineStyle(1, 0xffda8a, 0.55);
      this.hud.strokeRoundedRect(announcementCenterX - sysW / 2, sysY, sysW, sysH, 6);
    }

    const sysText = this.children.getByName('system-readout') as Phaser.GameObjects.Text | null;
    if (sysText) {
      sysText.setVisible(showSystem);
      if (showSystem) {
        sysText.setStyle({
          fontFamily: 'Inter, "Segoe UI", sans-serif',
          fontSize: sysFont,
          color: '#ffda8a',
          wordWrap: { width: sysW - 16 },
        });
        sysText.setText(systemAnnouncement);
        sysText.setPosition(announcementCenterX, sysCY);
      }
    } else {
      this.add
        .text(announcementCenterX, sysCY, '', {
          fontFamily: 'Inter, "Segoe UI", sans-serif',
          fontSize: sysFont,
          color: '#ffda8a',
          wordWrap: { width: sysW - 16 },
        })
        .setName('system-readout')
        .setScrollFactor(0)
        .setOrigin(0.5)
        .setVisible(showSystem)
        .setDepth(902);
    }

    // Transient announcement (red, with close) - below system when both exist
    const tranW = isMobileLandscape ? Math.min(280, announcementMaxWidth) : Math.min(364, width - 32);
    const tranH = isMobileLandscape ? 24 : 42;
    const tranY = showSystem ? sysY + sysH + (isMobileLandscape ? 2 : 4) : (isMobileLandscape ? 4 : 20);
    const tranCY = tranY + tranH / 2;
    const tranFont = isMobileLandscape ? '10px' : '18px';
    const tranTextX = announcementCenterX - (isMobileLandscape ? 6 : 8);

    if (showTransient) {
      this.hud.fillStyle(0x050709, 0.76);
      this.hud.fillRoundedRect(announcementCenterX - tranW / 2, tranY, tranW, tranH, 8);
      this.hud.lineStyle(1, 0xff5d6f, 0.85);
      this.hud.strokeRoundedRect(announcementCenterX - tranW / 2, tranY, tranW, tranH, 8);
    }

    const invasion = this.children.getByName('invasion-readout') as Phaser.GameObjects.Text | null;
    if (invasion) {
      invasion.setVisible(showTransient);
      if (showTransient) {
        invasion.setStyle({
          fontFamily: 'Inter, "Segoe UI", sans-serif',
          fontSize: tranFont,
          color: '#ff6961',
          wordWrap: { width: tranW - (isMobileLandscape ? 36 : 44) },
        });
        invasion.setText(this.invasionMessage);
        invasion.setPosition(tranTextX, tranCY);
      }
    } else {
      this.add
        .text(tranTextX, tranCY, '', {
          fontFamily: 'Inter, "Segoe UI", sans-serif',
          fontSize: tranFont,
          color: '#ff6961',
          wordWrap: { width: tranW - (isMobileLandscape ? 36 : 44) },
        })
        .setName('invasion-readout')
        .setScrollFactor(0)
        .setOrigin(0.5)
        .setVisible(showTransient)
        .setDepth(902);
    }

    if (showTransient) {
      const closeX = announcementCenterX + tranW / 2 - (isMobileLandscape ? 14 : 28);
      if (this.announcementClose) {
        this.announcementClose.setVisible(true);
        this.announcementClose.setStyle({
          fontFamily: 'Inter, "Segoe UI", sans-serif',
          fontSize: isMobileLandscape ? '12px' : '18px',
          color: '#e8f7f4',
        });
        this.announcementClose.setPosition(closeX, tranCY);
      } else {
        this.announcementClose = this.add
          .text(closeX, tranCY, 'x', {
            fontFamily: 'Inter, "Segoe UI", sans-serif',
            fontSize: isMobileLandscape ? '12px' : '18px',
            color: '#e8f7f4',
          })
          .setName('announcement-close')
          .setScrollFactor(0)
          .setOrigin(0.5)
          .setInteractive({ useHandCursor: true })
          .setDepth(903);
        this.announcementClose.on('pointerdown', () => this.hideAnnouncement());
      }
    } else {
      this.announcementClose?.setVisible(false);
    }
  }

  private drawMiniMap(x: number, y: number, size: number) {
    if (!this.isInMultiplayerRoom) {
      return;
    }

    const foggy = this.currentWeather === 'fog';
    this.hud.fillStyle(foggy ? 0x23282b : 0x050709, foggy ? 0.86 : 0.78);
    this.hud.fillRoundedRect(x, y, size, size, 8);
    this.hud.lineStyle(1, foggy ? 0x8f989b : 0x4d8eff, foggy ? 0.55 : 0.5);
    this.hud.strokeRoundedRect(x, y, size, size, 8);

    const toMiniX = (worldX: number) => x + clamp(worldX / WORLD_WIDTH, 0, 1) * size;
    const toMiniY = (worldY: number) => y + clamp(worldY / WORLD_HEIGHT, 0, 1) * size;

    for (const r of TERRAIN_REGIONS) {
      if (r.alpha <= 0) continue;
      const rx = toMiniX(r.x);
      const ry = toMiniY(r.y);
      const rw = (r.w / WORLD_WIDTH) * size;
      const rh = (r.h / WORLD_HEIGHT) * size;
      this.hud.fillStyle(r.color, r.key === 'water' ? 0.78 : 0.66);
      this.hud.fillRect(rx, ry, rw, rh);
      this.hud.lineStyle(1.4, TERRAIN_ACCENT[r.key].stroke, 0.9);
      this.hud.strokeRect(rx, ry, rw, rh);
    }

    const zone = this.getBattleRoyaleZone();
    if (zone) {
      const zoneX = toMiniX(zone.centerX);
      const zoneY = toMiniY(zone.centerY);
      const zoneWidth = clamp((zone.radius * 2 / WORLD_WIDTH) * size, 3, size * 1.6);
      const zoneHeight = clamp((zone.radius * 2 / WORLD_HEIGHT) * size, 3, size * 1.6);
      this.hud.lineStyle(2, zone.radius <= zone.minRadius + 2 ? 0xf5c542 : 0x4d8eff, foggy ? 0.62 : 0.9);
      this.hud.strokeEllipse(zoneX, zoneY, zoneWidth, zoneHeight);
      this.hud.lineStyle(1, 0xcfefff, foggy ? 0.2 : 0.38);
      this.hud.strokeEllipse(zoneX, zoneY, Math.max(3, zoneWidth - 5), Math.max(3, zoneHeight - 5));
    }

    this.enemies.getChildren().forEach((rawEnemy) => {
      const enemy = rawEnemy as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active || !enemy.getData('isBoss')) {
        return;
      }

      this.hud.fillStyle(foggy ? 0xb8bec1 : this.getBossColor(enemy), foggy ? 0.62 : 0.95);
      this.hud.fillCircle(toMiniX(enemy.x), toMiniY(enemy.y), 4);
    });

    this.latestRoomState?.players.forEach((player) => {
      if (!player.alive || player.socketId === this.localSocketId) {
        return;
      }

      const isAlly = player.teamKey === this.localTeamKey;
      this.hud.fillStyle(foggy ? 0xb8bec1 : isAlly ? 0x4d8eff : 0xff4d4d, foggy ? 0.58 : 0.92);
      this.hud.fillCircle(toMiniX(player.x), toMiniY(player.y), isAlly ? 3.2 : 2.8);
    });

    this.hud.fillStyle(foggy ? 0xe0e5e5 : 0x4d8eff, 1);
    this.hud.fillCircle(toMiniX(this.player.x), toMiniY(this.player.y), 4.4);

    this.hud.lineStyle(1, foggy ? 0xc4cbcc : 0xe8f7f4, foggy ? 0.14 : 0.22);
    this.hud.lineBetween(x + size / 2, y + 6, x + size / 2, y + size - 6);
    this.hud.lineBetween(x + 6, y + size / 2, x + size - 6, y + size / 2);
  }

  private getProjectileColor(texture: string) {
    if (texture === 'shot-shell') return 0xf5c542;
    if (texture === 'shot-missile') return 0xff5d6f;
    if (texture === 'shot-rail') return 0x4d8eff;
    if (texture === 'shot-grenade') return 0xf5c542;
    if (texture === 'shot-flame') return 0xff9f1c;
    return 0x4d8eff;
  }

  private muzzleBurst(x: number, y: number, angle: number, color: number) {
    const tipX = x + Math.cos(angle) * 12;
    const tipY = y + Math.sin(angle) * 12;
    // bright white core flash
    const core = this.add.circle(tipX, tipY, 8, 0xffffff, 0.95).setDepth(33);
    this.tweens.add({
      targets: core,
      scale: 1.8,
      alpha: 0,
      duration: 90,
      ease: 'Cubic.easeOut',
      onComplete: () => core.destroy(),
    });
    // colored flame cone (elongated along barrel)
    const flame = this.add
      .ellipse(tipX, tipY, 18, 10, color, 0.88)
      .setDepth(32);
    flame.setRotation(angle);
    this.tweens.add({
      targets: flame,
      scaleX: 3.2,
      scaleY: 0.45,
      alpha: 0,
      duration: 150,
      ease: 'Cubic.easeOut',
      onComplete: () => flame.destroy(),
    });
    // light cone (very faint)
    if (!this.isLowFxMode()) {
      const lightCone = this.add.triangle(
        x, y,
        0, 0,
        Math.cos(angle - 0.32) * 60, Math.sin(angle - 0.32) * 60,
        Math.cos(angle + 0.32) * 60, Math.sin(angle + 0.32) * 60,
        color, 0.22,
      ).setDepth(31);
      this.tweens.add({
        targets: lightCone,
        alpha: 0,
        duration: 130,
        ease: 'Cubic.easeOut',
        onComplete: () => lightCone.destroy(),
      });
    }
    // sparks
    const sparkCount = this.isLowFxMode() ? 2 : 5;
    for (let i = 0; i < sparkCount; i += 1) {
      const sa = angle + Phaser.Math.FloatBetween(-0.55, 0.55);
      const sd = Phaser.Math.Between(14, 34);
      const spark = this.add.circle(tipX, tipY, Phaser.Math.FloatBetween(1.4, 2.4), i % 2 ? 0xffffff : color, 0.95).setDepth(34);
      this.tweens.add({
        targets: spark,
        x: tipX + Math.cos(sa) * sd,
        y: tipY + Math.sin(sa) * sd,
        alpha: 0,
        scale: 0.15,
        duration: 160,
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
    // shell-eject puff for ballistic types
    if (color === 0xf5c542 || color === 0xff5d6f) {
      const puff = this.add.circle(x, y, 4, 0x8a9199, 0.5).setDepth(31);
      this.tweens.add({
        targets: puff,
        x: x + Math.cos(angle + Math.PI) * 10 + Phaser.Math.Between(-3, 3),
        y: y + Math.sin(angle + Math.PI) * 10 + Phaser.Math.Between(-3, 3),
        scale: 2,
        alpha: 0,
        duration: 280,
        ease: 'Cubic.easeOut',
        onComplete: () => puff.destroy(),
      });
    }
  }

  private emitProjectileTrail(projectile: Phaser.Physics.Arcade.Image) {
    const lastTrailAt = (projectile.getData('lastTrailAt') as number | undefined) ?? 0;
    if (this.elapsedMs - lastTrailAt < (this.isLowFxMode() ? 56 : 28)) {
      return;
    }

    projectile.setData('lastTrailAt', this.elapsedMs);
    const color = projectile.getData('trailColor') as number;
    const texture = projectile.texture.key;
    const angle = projectile.rotation + Math.PI;
    const bx = projectile.x + Math.cos(angle) * 8;
    const by = projectile.y + Math.sin(angle) * 8;

    if (texture === 'shot-flame') {
      const ember = this.add.circle(bx + Phaser.Math.Between(-4, 4), by + Phaser.Math.Between(-4, 4), Phaser.Math.FloatBetween(3, 6), Phaser.Math.Between(0, 1) ? 0xff5d6f : 0xf5c542, 0.7).setDepth(24);
      this.tweens.add({ targets: ember, alpha: 0, scale: 2, duration: 200, ease: 'Cubic.easeOut', onComplete: () => ember.destroy() });
    } else if (texture === 'shot-missile') {
      const smoke = this.add.circle(bx, by, Phaser.Math.FloatBetween(3, 5), 0x8a9199, 0.35).setDepth(24);
      this.tweens.add({ targets: smoke, alpha: 0, scale: 3, x: smoke.x + Phaser.Math.Between(-8, 8), y: smoke.y + Phaser.Math.Between(-8, 8), duration: 320, ease: 'Cubic.easeOut', onComplete: () => smoke.destroy() });
      const hot = this.add.circle(bx, by, 2, color, 0.75).setDepth(25);
      this.tweens.add({ targets: hot, alpha: 0, duration: 160, onComplete: () => hot.destroy() });
    } else if (texture === 'shot-rail' || texture === 'shot-ion') {
      const streak = this.add.circle(bx, by, Phaser.Math.FloatBetween(1.5, 3), 0xe8f7f4, 0.7).setDepth(24);
      this.tweens.add({ targets: streak, alpha: 0, scale: 0.3, duration: 180, ease: 'Cubic.easeOut', onComplete: () => streak.destroy() });
    } else if (texture === 'shot-saw') {
      const sp = this.add.circle(bx + Phaser.Math.Between(-6, 6), by + Phaser.Math.Between(-6, 6), Phaser.Math.FloatBetween(1, 2.5), Phaser.Math.Between(0, 1) ? 0xc9ff6a : 0xe8f7f4, 0.9).setDepth(24);
      this.tweens.add({ targets: sp, alpha: 0, scale: 0.2, duration: 140, ease: 'Cubic.easeOut', onComplete: () => sp.destroy() });
    } else {
      const trail = this.add.circle(bx, by, Phaser.Math.FloatBetween(2.5, 5.5), color, 0.58).setDepth(24);
      this.tweens.add({ targets: trail, alpha: 0, scale: 2.8, duration: 260, ease: 'Cubic.easeOut', onComplete: () => trail.destroy() });
    }
  }

  private impactBurst(x: number, y: number, color: number, scale: number) {
    // brief white flash
    const flash = this.add.circle(x, y, 5 * scale, 0xffffff, 0.95).setDepth(43);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 1.8,
      duration: 90,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    });
    const core = this.add.circle(x, y, 7 * scale, color, 0.92).setDepth(42);
    this.tweens.add({
      targets: core,
      alpha: 0,
      scale: 3.4,
      duration: 220,
      ease: 'Cubic.easeOut',
      onComplete: () => core.destroy(),
    });
    // expanding ring
    const ring = this.add.circle(x, y, 4 * scale, color, 0)
      .setStrokeStyle(2, color, 0.8)
      .setDepth(42);
    this.tweens.add({
      targets: ring,
      radius: 22 * scale,
      alpha: 0,
      duration: 260,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });

    for (let i = 0; i < 6; i += 1) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const spark = this.add.circle(x, y, 2.4 * scale, i % 2 ? 0xffffff : color, 0.95).setDepth(43);
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * Phaser.Math.Between(18, 42) * scale,
        y: y + Math.sin(angle) * Phaser.Math.Between(18, 42) * scale,
        alpha: 0,
        scale: 0.15,
        duration: 250,
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
  }

  private shockwave(x: number, y: number, radius: number, color: number) {
    const glow = this.add.circle(x, y, 10, color, 0.18).setDepth(40);
    this.tweens.add({
      targets: glow,
      radius: radius * 0.6,
      alpha: 0,
      duration: 300,
      ease: 'Cubic.easeOut',
      onComplete: () => glow.destroy(),
    });
    const ring = this.add.circle(x, y, 10, color, 0).setStrokeStyle(3, color, 0.82).setDepth(41);
    this.tweens.add({
      targets: ring,
      radius,
      alpha: 0,
      duration: 360,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  private healPulse(x: number, y: number, radius: number) {
    const ring = this.add.circle(x, y, 12, 0xa7e65d, 0.08).setStrokeStyle(2, 0xa7e65d, 0.88).setDepth(34);
    this.tweens.add({
      targets: ring,
      radius,
      alpha: 0,
      duration: 520,
      ease: 'Sine.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  private vehicleSwitchRing(color: number) {
    const ring = this.add
      .circle(this.player.x, this.player.y, 20, color, 0.08)
      .setStrokeStyle(4, color, 0.92)
      .setDepth(38);
    this.tweens.add({
      targets: ring,
      radius: 92,
      alpha: 0,
      duration: 430,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
    const inner = this.add
      .circle(this.player.x, this.player.y, 12, 0xe8f7f4, 0)
      .setStrokeStyle(2, 0xe8f7f4, 0.6)
      .setDepth(38);
    this.tweens.add({
      targets: inner,
      radius: 60,
      alpha: 0,
      duration: 340,
      ease: 'Cubic.easeOut',
      onComplete: () => inner.destroy(),
    });
  }

  private emitEngineTrail(angle: number, vehicle: VehicleSpec) {
    if (this.elapsedMs < this.nextEngineTrailAt) {
      return;
    }

    const trailDelay = this.currentVehicle === 'fighter' ? 34 : 58;
    this.nextEngineTrailAt = this.elapsedMs + (this.isLowFxMode() ? trailDelay * 1.8 : trailDelay);
    const color = this.getProjectileColor(vehicle.projectileTexture);
    const backAngle = angle + Math.PI;
    const x = this.player.x + Math.cos(backAngle) * (vehicle.bodyWidth * 0.55);
    const y = this.player.y + Math.sin(backAngle) * (vehicle.bodyHeight * 0.55);

    const trail = this.add.circle(x, y, this.currentVehicle === 'mech' ? 4 : 7, color, 0.34).setDepth(10);
    this.tweens.add({
      targets: trail,
      x: x + Math.cos(backAngle) * 28,
      y: y + Math.sin(backAngle) * 28,
      alpha: 0,
      scale: this.currentVehicle === 'tank' || this.currentVehicle === 'artillery' ? 2.4 : 1.8,
      duration: 360,
      ease: 'Sine.easeOut',
      onComplete: () => trail.destroy(),
    });

    if (this.currentVehicle !== 'mech' && !this.isLowFxMode()) {
      const ox = Phaser.Math.Between(-4, 4);
      const oy = Phaser.Math.Between(-4, 4);
      const secondary = this.add.circle(x + ox, y + oy, 3, color, 0.2).setDepth(9);
      this.tweens.add({
        targets: secondary,
        x: secondary.x + Math.cos(backAngle) * 20 + Phaser.Math.Between(-8, 8),
        y: secondary.y + Math.sin(backAngle) * 20 + Phaser.Math.Between(-8, 8),
        alpha: 0,
        scale: 2,
        duration: 300,
        ease: 'Sine.easeOut',
        onComplete: () => secondary.destroy(),
      });
    }
  }

  private bigExplosion(x: number, y: number, color: number, size: number) {
    // bright white flash (very short)
    const flash = this.add.circle(x, y, size * 0.35, 0xffffff, 1).setDepth(43);
    this.tweens.add({ targets: flash, alpha: 0, scale: 2.6, duration: 130, ease: 'Cubic.easeOut', onComplete: () => flash.destroy() });
    // hot core
    const core = this.add.circle(x, y, size * 0.3, 0xfff1d0, 0.95).setDepth(42);
    this.tweens.add({ targets: core, alpha: 0, scale: 3.8, duration: 260, ease: 'Cubic.easeOut', onComplete: () => core.destroy() });
    // colored glow
    const glow = this.add.circle(x, y, size * 0.45, color, 0.42).setDepth(40);
    this.tweens.add({ targets: glow, alpha: 0, scale: 4.4, duration: 360, ease: 'Cubic.easeOut', onComplete: () => glow.destroy() });
    // outer shockwave ring
    const r1 = this.add.circle(x, y, 8, color, 0).setStrokeStyle(4, color, 0.95).setDepth(41);
    this.tweens.add({ targets: r1, radius: size * 1.5, alpha: 0, duration: 460, ease: 'Cubic.easeOut', onComplete: () => r1.destroy() });
    // white inner ring
    const r2 = this.add.circle(x, y, 6, 0xffffff, 0).setStrokeStyle(2, 0xffffff, 0.7).setDepth(41);
    this.tweens.add({ targets: r2, radius: size * 0.9, alpha: 0, duration: 340, ease: 'Cubic.easeOut', onComplete: () => r2.destroy() });
    // delayed secondary ring
    this.time.delayedCall(120, () => {
      const r3 = this.add.circle(x, y, 6, color, 0).setStrokeStyle(2, color, 0.6).setDepth(41);
      this.tweens.add({ targets: r3, radius: size * 1.8, alpha: 0, duration: 420, ease: 'Cubic.easeOut', onComplete: () => r3.destroy() });
    });
    // smoke puffs (3 dark puffs that linger)
    if (!this.isLowFxMode()) {
      for (let i = 0; i < 3; i += 1) {
        const ang = Phaser.Math.FloatBetween(0, Math.PI * 2);
        const dist = Phaser.Math.Between(8, size * 0.6);
        const smoke = this.add.circle(
          x + Math.cos(ang) * dist,
          y + Math.sin(ang) * dist,
          size * 0.25,
          0x3a3e44,
          0.55,
        ).setDepth(39);
        this.tweens.add({
          targets: smoke,
          x: smoke.x + Math.cos(ang) * size * 0.4,
          y: smoke.y + Math.sin(ang) * size * 0.4 - 12,
          scale: 2.2,
          alpha: 0,
          duration: 720,
          ease: 'Sine.easeOut',
          onComplete: () => smoke.destroy(),
        });
      }
    }
    // debris (radial sparks)
    const debrisCount = this.isLowFxMode() ? 8 : 16;
    for (let i = 0; i < debrisCount; i += 1) {
      const a = (i / debrisCount) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.18, 0.18);
      const d = Phaser.Math.Between(size * 1.2, size * 3.6);
      const sp = this.add.circle(x, y, Phaser.Math.FloatBetween(1.5, 4), i % 3 === 0 ? 0xffffff : color, 0.95).setDepth(43);
      this.tweens.add({
        targets: sp,
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d,
        alpha: 0,
        scale: 0.1,
        duration: 220 + Phaser.Math.Between(0, 320),
        ease: 'Cubic.easeOut',
        onComplete: () => sp.destroy(),
      });
    }
    this.cameras.main.shake(180, 0.0055);
  }

  private levelUpBurst() {
    const x = this.player.x;
    const y = this.player.y;
    // central flash
    const flash = this.add.circle(x, y, 24, 0xffffff, 0.92).setDepth(44);
    this.tweens.add({ targets: flash, alpha: 0, scale: 3.6, duration: 320, ease: 'Cubic.easeOut', onComplete: () => flash.destroy() });
    // gold + blue dual rings
    const ringGold = this.add.circle(x, y, 12, 0xf5c542, 0)
      .setStrokeStyle(3, 0xf5c542, 0.95).setDepth(43);
    this.tweens.add({ targets: ringGold, radius: 100, alpha: 0, duration: 520, ease: 'Cubic.easeOut', onComplete: () => ringGold.destroy() });
    const ringBlue = this.add.circle(x, y, 8, 0x4d8eff, 0)
      .setStrokeStyle(2, 0x4d8eff, 0.85).setDepth(43);
    this.tweens.add({ targets: ringBlue, radius: 70, alpha: 0, duration: 440, ease: 'Cubic.easeOut', onComplete: () => ringBlue.destroy() });
    // rising particles
    for (let i = 0; i < 18; i += 1) {
      const a = (i / 18) * Math.PI * 2;
      const p = this.add.circle(x, y, 3.4, i % 3 === 0 ? 0xf5c542 : i % 3 === 1 ? 0xffffff : 0x4d8eff, 0.95).setDepth(44);
      this.tweens.add({
        targets: p,
        x: x + Math.cos(a) * 96,
        y: y + Math.sin(a) * 96 - 22,
        alpha: 0,
        scale: 0.18,
        duration: 520,
        ease: 'Cubic.easeOut',
        onComplete: () => p.destroy(),
      });
    }
    // hexagon outline pulse
    if (!this.isLowFxMode()) {
      const hex = this.add.graphics().setDepth(43);
      const startR = 28;
      hex.lineStyle(2, 0xf5c542, 0.85);
      const drawHex = (r: number) => {
        hex.beginPath();
        for (let i = 0; i < 6; i += 1) {
          const a = i * (Math.PI / 3) - Math.PI / 6;
          const px = x + Math.cos(a) * r;
          const py = y + Math.sin(a) * r;
          if (i === 0) hex.moveTo(px, py); else hex.lineTo(px, py);
        }
        hex.closePath();
        hex.strokePath();
      };
      drawHex(startR);
      this.tweens.addCounter({
        from: startR,
        to: 140,
        duration: 520,
        ease: 'Cubic.easeOut',
        onUpdate: (tw) => {
          hex.clear();
          hex.lineStyle(2, 0xf5c542, 0.85 * (1 - tw.progress));
          drawHex(tw.getValue() ?? 0);
        },
        onComplete: () => hex.destroy(),
      });
    }
    this.cameras.main.shake(120, 0.0032);
    this.playCue('levelup');
  }

  private flashAt(x: number, y: number, color: number, size: number) {
    if (size > 6) {
      const core = this.add.circle(x, y, size * 0.35, 0xe8f7f4, 0.85).setDepth(71);
      this.tweens.add({
        targets: core,
        alpha: 0,
        scale: 2.5,
        duration: 180,
        ease: 'Cubic.easeOut',
        onComplete: () => core.destroy(),
      });
    }
    const count = size > 10 ? 12 : 8;
    for (let i = 0; i < count; i += 1) {
      const spark = this.add.image(x, y, 'spark').setTint(i % 3 === 0 ? 0xe8f7f4 : color).setDepth(70);
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const distance = Phaser.Math.Between(size, size * 3);
      spark.setScale(Phaser.Math.FloatBetween(0.5, 1.2));
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scale: 0.1,
        duration: Phaser.Math.Between(220, 420),
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
  }

  private showGameOver() {
    if (this.isGameOver) {
      return;
    }

    this.isGameOver = true;
    this.portraitHint?.remove();
    this.portraitHint = undefined;
    this.socket?.emit('player:defeated', { defeatedBy: this.lastDefeatedBy });
    this.physics.pause();
    this.removeJoystick();
    this.playCue('death');

    const width = this.scale.width;
    const height = this.scale.height;
    const canRevive = (this.getRoomRemainingMs() ?? 0) > 2 * 60 * 1000;
    const container = this.add.container(0, 0).setScrollFactor(0).setDepth(1300);
    const overlay = this.add.rectangle(0, 0, width, height, 0x050709, 0.74).setOrigin(0);
    const title = this.add
      .text(width / 2, height / 2 - 70, '任务失败', {
        fontFamily: 'Inter, "Segoe UI", sans-serif',
        fontSize: '42px',
        color: '#ff6961',
      })
      .setOrigin(0.5);
    const stats = this.add
      .text(width / 2, height / 2 - 12, `击杀 ${this.kills}   等级 ${this.level}`, {
        fontFamily: 'Inter, "Segoe UI", sans-serif',
        fontSize: '18px',
        color: '#e8f7f4',
      })
      .setOrigin(0.5);
    const prompt = this.add
      .text(width / 2, height / 2 + 24, `被 ${this.lastDefeatedBy} 击败。${canRevive ? '复活会初始化等级和装备' : '最后 2 分钟不能复活'}`, {
        fontFamily: 'Inter, "Segoe UI", sans-serif',
        fontSize: '15px',
        color: '#9fffe0',
      })
      .setOrigin(0.5);
    const stacked = width < 480;
    const buttonWidth = stacked ? 184 : 168;
    const gap = 16;
    const continueX = stacked ? width / 2 : width / 2 - buttonWidth / 2 - gap / 2;
    const exitX = stacked ? width / 2 : width / 2 + buttonWidth / 2 + gap / 2;
    const continueY = height / 2 + 86;
    const exitY = stacked ? height / 2 + 142 : continueY;
    const continueButton = this.add
      .rectangle(continueX, continueY, buttonWidth, 48, 0x111a1f, 1)
      .setStrokeStyle(2, 0x4d8eff)
      .setInteractive({ useHandCursor: true });
    const continueLabel = this.add
      .text(continueX, continueY, canRevive ? '复活' : '等待结算', {
        fontFamily: 'Inter, "Segoe UI", sans-serif',
        fontSize: '17px',
        color: '#e8f7f4',
      })
      .setOrigin(0.5);
    const exitButton = this.add
      .rectangle(exitX, exitY, buttonWidth, 48, 0x111a1f, 1)
      .setStrokeStyle(2, 0xff5d6f)
      .setInteractive({ useHandCursor: true });
    const exitLabel = this.add
      .text(exitX, exitY, '退出房间', {
        fontFamily: 'Inter, "Segoe UI", sans-serif',
        fontSize: '17px',
        color: '#e8f7f4',
      })
      .setOrigin(0.5);

    const leaveRoom = () => this.leaveRoomToLobby();
    if (canRevive) {
      const revive = () => this.redeployAfterGameOver();
      continueButton.on('pointerover', () => continueButton.setFillStyle(0x17252a, 1));
      continueButton.on('pointerout', () => continueButton.setFillStyle(0x111a1f, 1));
      continueButton.on('pointerdown', revive);
      continueLabel.setInteractive({ useHandCursor: true }).on('pointerdown', revive);
    } else {
      continueButton.disableInteractive();
      continueButton.setAlpha(0.48);
      continueLabel.setAlpha(0.7);
    }
    exitButton.on('pointerover', () => exitButton.setFillStyle(0x211417, 1));
    exitButton.on('pointerout', () => exitButton.setFillStyle(0x111a1f, 1));
    exitButton.on('pointerdown', leaveRoom);
    exitLabel.setInteractive({ useHandCursor: true }).on('pointerdown', leaveRoom);
    container.add([overlay, title, stats, prompt, continueButton, continueLabel, exitButton, exitLabel]);
    this.gameOverLayer = container;
    this.showGameOverPanel(canRevive);
    continueButton.disableInteractive();
    continueLabel.disableInteractive();
    exitButton.disableInteractive();
    exitLabel.disableInteractive();
  }

  private showGameOverPanel(canRevive: boolean) {
    this.gameOverPanel?.remove();
    const panel = document.createElement('div');
    panel.className = 'game-over-panel';
    panel.innerHTML = `
      <div class="game-over-box">
        <div class="game-over-title">任务失败</div>
        <div class="game-over-stats">击杀 ${this.kills}　等级 ${this.level}</div>
        <div class="game-over-prompt">被 ${this.lastDefeatedBy} 击败。${canRevive ? '复活会初始化等级和装备' : '最后 2 分钟不能复活'}</div>
        <div class="game-over-actions">
          <button class="game-over-revive" type="button" ${canRevive ? '' : 'disabled'}>${canRevive ? '复活' : '等待结算'}</button>
          <button class="game-over-exit" type="button">退出房间</button>
        </div>
      </div>
    `;
    panel.querySelector<HTMLButtonElement>('.game-over-revive')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (canRevive) {
        this.redeployAfterGameOver();
      }
    });
    panel.querySelector<HTMLButtonElement>('.game-over-exit')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.leaveRoomToLobby();
    });
    document.body.appendChild(panel);
    this.gameOverPanel = panel;
  }

  private redeployAfterGameOver() {
    if (!this.isGameOver || !this.socket?.connected || !this.isInMultiplayerRoom) {
      return;
    }

    this.socket.emit('player:revive', {}, (response: { ok?: boolean; error?: string; player?: NetworkPlayer }) => {
      if (!response?.ok || !response.player) {
        this.showAnnouncement(response?.error || '复活失败', 3000);
        return;
      }

      this.gameOverLayer?.destroy(true);
      this.gameOverLayer = undefined;
      this.gameOverPanel?.remove();
      this.gameOverPanel = undefined;
      this.clearRunObjects();
      this.resetRunState(true);
      this.localSocketId = response.player.socketId;
      this.localTeamKey = response.player.teamKey;
      this.localTeamName = response.player.teamName;
      this.localTeamColorCss = response.player.color;
      this.localTeamTint = this.cssColorToNumber(response.player.color);
      this.localCrown = response.player.crown ?? this.localCrown;
      this.isTeamLeader = Boolean(response.player.teamLeader);
      this.player.setPosition(response.player.x, response.player.y);
      this.applyPreservedBossVehicleOrMech(false);
      this.player.setTint(this.localTeamTint || 0xffffff);
      this.spawnInitialWorld();
      this.physics.resume();
      this.syncJoystick();
      this.showAnnouncement('已复活，等级和装备已初始化', 2600);
      this.sendNetworkState();
    });
  }

  private leaveRoomToLobby() {
    this.socket?.emit('room:leave', {}, () => {
      this.socket?.emit('rooms:list');
    });
    this.isInMultiplayerRoom = false;
    this.joinedRoomId = '';
    this.localTeamKey = '';
    this.localTeamName = '';
    this.localTeamColorCss = '#36f0d2';
    this.localTeamTint = 0x4d8eff;
    this.currentRoom = undefined;
    this.latestRoomState = undefined;
    this.onlineButton?.remove();
    this.onlineButton = undefined;
    this.onlinePanel?.remove();
    this.onlinePanel = undefined;
    this.summonButton?.remove();
    this.summonButton = undefined;
    this.exitButton?.remove();
    this.exitButton = undefined;
    this.mobileControls?.remove();
    this.mobileControls = undefined;
    this.removeJoystick();
    this.gameOverLayer?.destroy(true);
    this.gameOverLayer = undefined;
    this.gameOverPanel?.remove();
    this.gameOverPanel = undefined;
    this.clearRunObjects();
    this.resetRunState();
    this.player.setPosition(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    this.applyVehicle('mech', false);
    this.player.clearTint();
    this.physics.pause();
    this.showLobbyOverlay();
    this.socket?.emit('rooms:list');
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#080b10',
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: MainScene,
};

installPrivacyModeToggle();
new Phaser.Game(config);
