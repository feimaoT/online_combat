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
const WORLD_WIDTH = 5200;
const WORLD_HEIGHT = 3600;

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
type EnemyKind = 'drone' | 'stalker' | 'warden' | 'crusher' | 'mender' | 'sniper' | 'bomber' | 'turret' | 'boss';
type EnemyTier = 'white' | 'green' | 'blue' | 'purple' | 'red';
type TeamKey = 'A' | 'B' | 'C';
type UpgradeKey = 'damage' | 'rate' | 'speed' | 'armor' | 'magnet';
type BuffKey = 'overclock' | 'rapid' | 'barrier' | 'regen';
type WeatherKey = 'sunny' | 'wind' | 'snow' | 'fog' | 'storm';
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
  round: number;
  players: number;
  maxPlayers: number;
  unlimitedPlayers?: boolean;
  teamCounts: Record<string, number>;
  remainingMs: number;
  nextInvasionMs: number;
  scores: Record<string, number>;
  joinLocked?: boolean;
  ended: boolean;
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
  teamSummonRemainingMs?: Record<string, number>;
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

interface RemotePlayerView {
  sprite: Phaser.Physics.Arcade.Sprite;
  label: Phaser.GameObjects.Text;
  crown: Phaser.GameObjects.Text;
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
    tint: 0x8ddbd1,
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
    tint: 0xffbd59,
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
    tint: 0xff6961,
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
    tint: 0x5bc0ff,
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
    tint: 0xffd166,
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
    tint: 0x9fffe0,
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
    color: 0x5bc0ff,
    hpMultiplier: 1.85,
    speedMultiplier: 1.08,
    damageMultiplier: 1.3,
    xpMultiplier: 2.1,
  },
  purple: {
    name: '紫',
    color: 0xba7cff,
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
    color: 0xffd166,
  },
  rapid: {
    name: '急速冷却',
    detail: '开火更快',
    color: 0x36f0d2,
  },
  barrier: {
    name: '偏转护盾',
    detail: '减伤提升',
    color: 0x5bc0ff,
  },
  regen: {
    name: '修复纳米云',
    detail: '持续回血',
    color: 0xa7e65d,
  },
};

const WEAPONS: Record<WeaponKey, WeaponSpec> = {
  attackDrone: {
    name: '攻击无人机',
    detail: '环绕玩家，自动射击索敌目标',
    texture: 'weapon-attack-drone',
    color: 0x36f0d2,
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
    color: 0xff6961,
  },
  grenadeLauncher: {
    name: '手榴弹模块',
    detail: '抛射延时爆弹，适合清理密集目标',
    texture: 'shot-grenade',
    color: 0xffd166,
  },
  teslaEmitter: {
    name: '电弧发生器',
    detail: '瞬发电弧连锁打击近距离目标',
    texture: 'buff-core',
    color: 0xba7cff,
  },
  beamCannon: {
    name: '聚束光炮',
    detail: '周期发射穿透光束，远距离打击直线目标',
    texture: 'shot-rail',
    color: 0x5bc0ff,
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
    color: 0x9ed7ff,
  },
  nanoSwarm: {
    name: '纳米蜂群',
    detail: '持续撕咬近距离多个目标',
    texture: 'weapon-swarm',
    color: 0xff8bd1,
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
    color: 0x64f5ff,
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
const BUFF_ORDER: BuffKey[] = ['overclock', 'rapid', 'barrier', 'regen'];
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
  { key: 'A', name: 'A 阵营', color: '#36f0d2', spawnX: 850, spawnY: 820 },
  { key: 'B', name: 'B 阵营', color: '#ff6961', spawnX: 4350, spawnY: 820 },
  { key: 'C', name: 'C 阵营', color: '#ffd166', spawnX: 2600, spawnY: 2850 },
];
const MAX_WEAPON_SLOTS = 5;
const PERFECT_WEAPON_LEVEL = 6;
const TARGET_RANGE_MIN = 220;
const TARGET_RANGE_MAX = 980;
const TARGET_RANGE_STEP = 60;
const BOSS_MINIMAP_COLOR = 0xff9f1c;
const MIN_BOSS_COUNT = 5;
const BOSS_START_MS = 5 * 60 * 1000;
const BOSS_FIXATION_MS = 13000;
const BOSS_FLEE_MS = 4200;
const BOSS_HEAL_RATE = 0.055;
const BOSS_HEAL_COOLDOWN_MS = 3600;
const BOSS_SPAWNS = [
  { x: 820, y: 720 },
  { x: WORLD_WIDTH - 820, y: 720 },
  { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 },
  { x: 940, y: WORLD_HEIGHT - 760 },
  { x: WORLD_WIDTH - 940, y: WORLD_HEIGHT - 760 },
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
};
const WEATHER_KEYS: Exclude<WeatherKey, 'sunny'>[] = ['wind', 'snow', 'fog', 'storm'];
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
  private vehiclePods!: Phaser.Physics.Arcade.Group;
  private buffPickups!: Phaser.Physics.Arcade.Group;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: MoveKeys;
  private rangeKeys!: RangeKeys;
  private upgradeHotkeys: Phaser.Input.Keyboard.Key[] = [];
  private hud!: Phaser.GameObjects.Graphics;
  private weatherOverlay!: Phaser.GameObjects.Graphics;
  private targetRing!: Phaser.GameObjects.Graphics;
  private enemyHud!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
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
  private localUserId = '';
  private localSocketId = '';
  private isInMultiplayerRoom = false;
  private joinedRoomId = '';
  private localTeamKey = '';
  private localTeamName = '';
  private localTeamColorCss = '#36f0d2';
  private localTeamTint = 0x36f0d2;
  private selectedTeamKey: TeamKey = 'A';
  private latestRoomState?: RoomState;
  private roomStateSyncedAt = 0;
  private remotePlayers = new Map<string, RemotePlayerView>();
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
  private onlinePanel?: HTMLDivElement;
  private moveTarget?: Phaser.Math.Vector2;
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
  };
  private vehicleExpiresAt = 0;
  private vehicleShield = 0;
  private maxVehicleShield = 0;
  private targetRange = 560;
  private areaAlert = 0;
  private isChoosingUpgrade = false;
  private isGameOver = false;
  private lastAimAngle = 0;
  private nextEngineTrailAt = 0;
  private upgradeChoiceExpiresAt = 0;
  private upgradeCountdownText?: Phaser.GameObjects.Text;
  private currentWeather: WeatherKey = 'sunny';
  private pendingWeather?: PendingWeather;
  private weatherActiveUntil = 0;
  private nextWeatherDecisionAt = 0;
  private nextLightningAt = 0;
  private lightningStrikes: LightningStrike[] = [];
  private snowSlideX = 0;
  private snowSlideY = 0;

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
    this.upgradeHotkeys = [
      Phaser.Input.Keyboard.KeyCodes.ONE,
      Phaser.Input.Keyboard.KeyCodes.TWO,
      Phaser.Input.Keyboard.KeyCodes.THREE,
      Phaser.Input.Keyboard.KeyCodes.NUMPAD_ONE,
      Phaser.Input.Keyboard.KeyCodes.NUMPAD_TWO,
      Phaser.Input.Keyboard.KeyCodes.NUMPAD_THREE,
    ].map((keyCode) => this.input.keyboard!.addKey(keyCode));

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
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
    this.physics.add.overlap(this.player, this.vehiclePods, this.handleVehiclePodPickup, undefined, this);
    this.physics.add.overlap(this.player, this.buffPickups, this.handleBuffPickup, undefined, this);

    this.weatherOverlay = this.add.graphics().setScrollFactor(0).setDepth(850);
    this.hud = this.add.graphics().setScrollFactor(0).setDepth(900);
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
    this.connectLobby();
    this.showLobbyOverlay();
  }

  private resetRunState(preservePermanentVehicles = false) {
    const savedPermanentVehicleRanks = preservePermanentVehicles
      ? { ...this.permanentVehicleRanks }
      : undefined;
    this.damageMultiplier = 1;
    this.fireRateMultiplier = 1;
    this.speedBonus = 0;
    this.magnetRadius = 0;
    this.hp = 120;
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
    };
    this.vehicleExpiresAt = 0;
    this.vehicleShield = 0;
    this.maxVehicleShield = 0;
    this.targetRange = 560;
    this.areaAlert = 0;
    this.isChoosingUpgrade = false;
    this.isGameOver = false;
    this.lastAimAngle = 0;
    this.nextEngineTrailAt = 0;
    this.upgradeChoiceExpiresAt = 0;
    this.upgradeCountdownText = undefined;
    this.currentWeather = 'sunny';
    this.pendingWeather = undefined;
    this.weatherActiveUntil = 0;
    this.nextWeatherDecisionAt = Phaser.Math.Between(18000, 42000);
    this.nextLightningAt = 0;
    this.lightningStrikes = [];
    this.snowSlideX = 0;
    this.snowSlideY = 0;
    this.moveTarget = undefined;
    this.lastDefeatedBy = '未知单位';
    this.currentUpgradeChoices = [];
    this.upgradePanel?.remove();
    this.upgradePanel = undefined;
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
      this.latestRoomState = state;
      this.roomStateSyncedAt = this.elapsedMs;
      this.syncRemotePlayers(state.players);
      const localPlayer = state.players.find((player) => player.socketId === this.localSocketId);
      if (localPlayer) {
        this.localCrown = localPlayer.crown ?? 0;
        this.isTeamLeader = Boolean(localPlayer.teamLeader);
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
            <div class="lobby-subtitle">固定 5 个战区。选择 A / B / C 阵营，10 分钟结算后自动开新局。</div>
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
              <p>武器槽最多 5 个。6 级会变成完全体，但不是等级上限，之后仍可继续强化。</p>
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
              <p>宝箱更容易掉落载具。载具临时替换机体，带独立护盾、速度、射速和武器形态。</p>
              <ul>
                <li>疾电摩托、突击越野车：高速机动，适合拉扯。</li>
                <li>重装坦克、火箭炮车、焚烧工程车：慢但硬，范围火力强。</li>
                <li>掠空战机、磁悬浮艇：速度和火力均衡。</li>
                <li>轨道炮车、棱镜装甲车：远距离高伤害直线打击。</li>
                <li>四足机甲：多弹道持续输出。</li>
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
                <li>播报用于天气预警、召集、击败、载具结束、完全体等重要事件。</li>
                <li>播报不会自动关闭；点击顶部播报右侧 x 才会关闭。</li>
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
      title.textContent = room.name;
      const meta = document.createElement('div');
      meta.className = 'lobby-room-meta';
      const scores = TEAM_OPTIONS.map((team) => `${team.key}:${room.scores[team.key] ?? 0}`).join('  ');
      const teams = TEAM_OPTIONS.map((team) => `${team.key}${room.teamCounts?.[team.key] ?? 0}`).join(' / ');
      const capacityText = room.unlimitedPlayers ? `${room.players}/不限` : `${room.players}/${room.maxPlayers}`;
      meta.textContent = `第 ${room.round} 局   真人 ${capacityText}   剩余 ${this.formatClock(
        room.remainingMs,
      )}   入侵 ${this.formatClock(room.nextInvasionMs)}   ${teams}   ${scores}`;
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
    [this.enemies, this.projectiles, this.enemyProjectiles, this.chests, this.vehiclePods, this.buffPickups].forEach((group) => {
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

  private addTeamScore(amount: number) {
    if (!this.socket?.connected || !this.isInMultiplayerRoom) {
      return;
    }

    this.socket.emit('score:add', { amount });
  }

  private handleInvasionWave(wave: number) {
    if (!this.isInMultiplayerRoom || this.isGameOver) {
      return;
    }

    this.invasionMessage = `第 ${wave} 波高仇恨入侵`;
    this.invasionMessageUntil = Number.POSITIVE_INFINITY;

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

  private showJoinMessage(payload: { message?: string; player?: NetworkPlayer; name?: string; teamKey?: string; teamName?: string }) {
    if (!this.isInMultiplayerRoom) {
      return;
    }

    const name = payload.player?.name || payload.name?.trim() || '真人玩家';
    const teamName = payload.player?.teamName || payload.teamName || `${payload.player?.teamKey || payload.teamKey || ''} 阵营`;
    this.showAnnouncement(payload.message || `真人加入：${name} 加入 ${teamName}`, 3500);
  }

  private showAnnouncement(message: string, _durationMs = 3500) {
    this.invasionMessage = message;
    this.invasionMessageUntil = Number.POSITIVE_INFINITY;
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

    this.drawWeatherEffects();
  }

  private startWeather(weather: PendingWeather) {
    this.currentWeather = weather.key;
    this.weatherActiveUntil = this.elapsedMs + weather.durationMs;
    this.showAnnouncement(`${WEATHER_SPECS[weather.key].name}开始，持续 ${Math.ceil(weather.durationMs / 1000)} 秒`, 3600);
    if (weather.key === 'storm') {
      this.nextLightningAt = this.elapsedMs + Phaser.Math.Between(1200, 2600);
    }
  }

  private endWeather() {
    this.currentWeather = 'sunny';
    this.weatherActiveUntil = 0;
    this.nextWeatherDecisionAt = this.elapsedMs + Phaser.Math.Between(22000, 52000);
    this.nextLightningAt = 0;
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

  private createLightningStrike() {
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const distance = Phaser.Math.Between(80, 260);
    const x = clamp(this.player.x + Math.cos(angle) * distance, 50, WORLD_WIDTH - 50);
    const y = clamp(this.player.y + Math.sin(angle) * distance, 50, WORLD_HEIGHT - 50);
    const radius = Phaser.Math.Between(62, 86);
    const strike: LightningStrike = { x, y, radius };
    this.lightningStrikes.push(strike);

    const warning = this.add
      .circle(x, y, radius, 0xffd166, 0.12)
      .setStrokeStyle(3, 0xffd166, 0.88)
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
    this.shockwave(strike.x, strike.y, strike.radius, 0x5bc0ff);
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
      this.weatherOverlay.lineStyle(2, 0x9ed7ff, 0.34);
      for (let i = 0; i < 84; i += 1) {
        const x = ((i * 47 + t * 0.3) % (width + 80)) - 40;
        const y = ((i * 67 + t * 0.62) % (height + 90)) - 60;
        this.weatherOverlay.lineBetween(x, y, x + 14, y + 54);
      }
      if (this.lightningStrikes.length > 0 || Math.floor(t / 120) % 37 === 0) {
        this.weatherOverlay.fillStyle(0xcfefff, 0.11);
        this.weatherOverlay.fillRect(0, 0, width, height);
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
            fontFamily: 'Inter, "Segoe UI", sans-serif',
            fontSize: '12px',
            color: '#ffd166',
          })
          .setOrigin(0.5)
          .setDepth(23);

        view = { sprite, label, crown };
        this.remotePlayers.set(player.socketId, view);
      }

      const tint = player.teamKey === this.localTeamKey ? this.localTeamTint : this.cssColorToNumber(player.color);
      view.sprite.setPosition(player.x, player.y);
      view.sprite.setRotation(player.angle);
      view.sprite.setTint(tint);
      view.sprite.setAlpha(player.alive ? 0.86 : 0.18);
      view.sprite.setVisible(player.alive);
      view.label.setText(player.name);
      view.label.setPosition(player.x, player.y - 42);
      view.label.setColor(player.teamKey === this.localTeamKey ? '#9fffe0' : '#ffb4ae');
      view.label.setVisible(player.alive);
      view.crown.setText(player.crown ? `皇冠${Math.min(9, player.crown)}` : '');
      view.crown.setPosition(player.x, player.y - 62);
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

  private updateRemotePlayerViews() {
    if (!this.latestRoomState) {
      return;
    }

    this.syncRemotePlayers(this.latestRoomState.players);
  }

  private updateLocalCrownView() {
    const existing = this.children.getByName('local-crown-readout') as Phaser.GameObjects.Text | null;
    if (this.localCrown <= 0 || !this.player?.active || !this.isInMultiplayerRoom) {
      existing?.setVisible(false);
      return;
    }

    const text = `皇冠${Math.min(9, this.localCrown)}`;
    if (existing) {
      existing.setText(text);
      existing.setPosition(this.player.x, this.player.y - 58);
      existing.setVisible(true);
      return;
    }

    this.add
      .text(this.player.x, this.player.y - 58, text, {
        fontFamily: 'Inter, "Segoe UI", sans-serif',
        fontSize: '14px',
        color: '#ffda8a',
        stroke: '#050709',
        strokeThickness: 3,
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
      return;
    }

    if (!this.mobileControls) {
      const panel = document.createElement('div');
      panel.className = 'mobile-controls';

      const landscape = document.createElement('button');
      landscape.type = 'button';
      landscape.textContent = '横屏';
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
  }

  private requestLandscapeMode() {
    const fullscreenPromise = document.fullscreenElement
      ? Promise.resolve()
      : (document.documentElement.requestFullscreen?.().catch(() => undefined) ?? Promise.resolve());

    fullscreenPromise.then(() => {
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (orientation: string) => Promise<void>;
      };
      if (!orientation?.lock) {
        this.showAnnouncement('当前浏览器不支持自动横屏，请手动旋转手机', 3000);
        return;
      }

      orientation
        .lock('landscape')
        .then(() => this.showAnnouncement('已尝试切换横屏', 1800))
        .catch(() => this.showAnnouncement('横屏切换被浏览器拦截，请手动旋转手机', 3000));
    });
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
          crown.textContent = player.crown ? `皇冠${Math.min(9, player.crown)}` : '';

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
    this.flashAt(payload.x, payload.y, this.localTeamTint || 0x36f0d2, 18);
    if (payload.leaderSocketId !== this.localSocketId) {
      this.player.setPosition(
        clamp(payload.x + Phaser.Math.Between(-72, 72), 60, WORLD_WIDTH - 60),
        clamp(payload.y + Phaser.Math.Between(-72, 72), 60, WORLD_HEIGHT - 60),
      );
      this.moveTarget = undefined;
      this.flashAt(this.player.x, this.player.y, this.localTeamTint || 0x36f0d2, 18);
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
      .setStrokeStyle(2, 0x36f0d2)
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
      this.applyVehicle('mech', false);
      this.player.setTint(this.localTeamTint || 0xffffff);
      this.spawnInitialWorld();
      this.physics.resume();
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
    this.syncSummonButton();
    this.syncExitButton();
    this.syncMobileControls();

    if (!this.isInMultiplayerRoom) {
      this.weatherOverlay?.clear();
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
    if (!this.isChoosingUpgrade) {
      this.handleTargetRangeInput();
      this.updatePlayer(deltaSeconds);
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
    this.updateRemotePlayerViews();
    this.updateLocalCrownView();
    this.sendNetworkState();
    this.drawEnemyBars();
  }

  private createTextures() {
    this.makeTexture('grid-tile', 256, 256, (g) => {
      g.fillStyle(0x080b10, 1);
      g.fillRect(0, 0, 256, 256);
      g.lineStyle(1, 0x1f3a3b, 0.7);
      for (let i = 0; i <= 256; i += 32) {
        g.lineBetween(i, 0, i, 256);
        g.lineBetween(0, i, 256, i);
      }
      g.lineStyle(2, 0x2c6e64, 0.28);
      g.lineBetween(0, 128, 256, 128);
      g.lineBetween(128, 0, 128, 256);
      g.fillStyle(0x9fffe0, 0.42);
      g.fillRect(124, 124, 8, 8);
    });

    this.makeTexture('unit-mech', 58, 44, (g) => {
      g.fillStyle(0x111a1f, 1);
      g.fillRoundedRect(11, 8, 32, 28, 5);
      g.lineStyle(2, 0x36f0d2, 1);
      g.strokeRoundedRect(11, 8, 32, 28, 5);
      g.fillStyle(0x263238, 1);
      g.fillRect(3, 15, 12, 7);
      g.fillRect(3, 25, 12, 7);
      g.fillRect(40, 17, 14, 5);
      g.fillRect(40, 26, 14, 5);
      g.fillStyle(0x9fffe0, 1);
      g.fillRect(27, 18, 17, 4);
      g.fillRect(27, 25, 17, 4);
      g.fillStyle(0xffd166, 1);
      g.fillRect(42, 20, 5, 9);
    });

    this.makeTexture('unit-bike', 68, 34, (g) => {
      g.lineStyle(3, 0x36f0d2, 1);
      g.strokeCircle(14, 25, 8);
      g.strokeCircle(52, 25, 8);
      g.fillStyle(0x0f181c, 1);
      g.fillRoundedRect(18, 12, 32, 11, 4);
      g.fillStyle(0xffd166, 1);
      g.fillTriangle(48, 12, 65, 17, 48, 22);
      g.lineStyle(2, 0x9fffe0, 1);
      g.lineBetween(24, 12, 41, 4);
      g.lineBetween(35, 22, 51, 15);
    });

    this.makeTexture('unit-tank', 76, 54, (g) => {
      g.fillStyle(0x151d21, 1);
      g.fillRoundedRect(7, 8, 56, 38, 5);
      g.lineStyle(2, 0xa7e65d, 1);
      g.strokeRoundedRect(7, 8, 56, 38, 5);
      g.fillStyle(0x28351e, 1);
      g.fillRoundedRect(17, 15, 29, 24, 5);
      g.fillStyle(0xffd166, 1);
      g.fillRect(42, 24, 30, 6);
      g.fillStyle(0x0a0f12, 1);
      for (let i = 10; i <= 58; i += 12) {
        g.fillCircle(i, 46, 3);
        g.fillCircle(i, 8, 3);
      }
    });

    this.makeTexture('unit-fighter', 78, 58, (g) => {
      g.fillStyle(0x10181e, 1);
      g.fillTriangle(8, 29, 56, 8, 70, 29);
      g.fillTriangle(8, 29, 56, 50, 70, 29);
      g.lineStyle(2, 0x36f0d2, 1);
      g.strokeTriangle(8, 29, 56, 8, 70, 29);
      g.strokeTriangle(8, 29, 56, 50, 70, 29);
      g.fillStyle(0xff6961, 1);
      g.fillRect(33, 25, 26, 8);
      g.fillStyle(0x9fffe0, 1);
      g.fillRect(50, 26, 12, 6);
    });

    this.makeTexture('unit-hover', 74, 46, (g) => {
      g.fillStyle(0x0f181c, 1);
      g.fillRoundedRect(10, 13, 50, 20, 10);
      g.lineStyle(2, 0x36f0d2, 1);
      g.strokeRoundedRect(10, 13, 50, 20, 10);
      g.fillStyle(0x9fffe0, 0.9);
      g.fillCircle(16, 23, 5);
      g.fillCircle(58, 23, 5);
      g.fillStyle(0xffd166, 1);
      g.fillTriangle(52, 16, 70, 23, 52, 30);
    });

    this.makeTexture('unit-railgun', 82, 44, (g) => {
      g.fillStyle(0x12181f, 1);
      g.fillRoundedRect(7, 12, 52, 24, 5);
      g.lineStyle(2, 0x5bc0ff, 1);
      g.strokeRoundedRect(7, 12, 52, 24, 5);
      g.fillStyle(0x263238, 1);
      g.fillRect(20, 18, 34, 12);
      g.fillStyle(0x9fffe0, 1);
      g.fillRect(47, 19, 31, 4);
      g.fillRect(47, 26, 31, 4);
      g.fillStyle(0x0a0f12, 1);
      g.fillCircle(18, 37, 4);
      g.fillCircle(48, 37, 4);
    });

    this.makeTexture('unit-walker', 68, 58, (g) => {
      g.fillStyle(0x151b1f, 1);
      g.fillRoundedRect(18, 13, 30, 26, 5);
      g.lineStyle(2, 0xba7cff, 1);
      g.strokeRoundedRect(18, 13, 30, 26, 5);
      g.fillStyle(0x9fffe0, 1);
      g.fillRect(35, 23, 24, 6);
      g.lineStyle(3, 0x59646b, 1);
      g.lineBetween(21, 36, 9, 51);
      g.lineBetween(44, 36, 57, 51);
      g.lineBetween(22, 16, 8, 4);
      g.lineBetween(44, 16, 58, 4);
      g.fillStyle(0xffd166, 1);
      g.fillCircle(40, 26, 4);
    });

    this.makeTexture('unit-artillery', 82, 48, (g) => {
      g.fillStyle(0x1e1b16, 1);
      g.fillRoundedRect(8, 12, 54, 26, 5);
      g.lineStyle(2, 0xffd166, 1);
      g.strokeRoundedRect(8, 12, 54, 26, 5);
      g.fillStyle(0xff6961, 1);
      g.fillRect(34, 12, 39, 6);
      g.fillRect(34, 21, 39, 6);
      g.fillRect(34, 30, 39, 6);
      g.fillStyle(0x0a0f12, 1);
      g.fillCircle(20, 39, 4);
      g.fillCircle(50, 39, 4);
    });

    this.makeTexture('unit-buggy', 74, 42, (g) => {
      g.fillStyle(0x10181e, 1);
      g.fillRoundedRect(10, 13, 46, 18, 5);
      g.lineStyle(2, 0x36f0d2, 1);
      g.strokeRoundedRect(10, 13, 46, 18, 5);
      g.fillStyle(0xffd166, 1);
      g.fillTriangle(54, 14, 70, 22, 54, 30);
      g.fillStyle(0x0a0f12, 1);
      g.fillCircle(19, 33, 6);
      g.fillCircle(50, 33, 6);
      g.fillStyle(0x9fffe0, 1);
      g.fillRect(31, 8, 14, 6);
    });

    this.makeTexture('unit-laser-van', 80, 48, (g) => {
      g.fillStyle(0x111923, 1);
      g.fillRoundedRect(9, 11, 54, 28, 6);
      g.lineStyle(2, 0x5bc0ff, 1);
      g.strokeRoundedRect(9, 11, 54, 28, 6);
      g.fillStyle(0x263238, 1);
      g.fillRect(20, 17, 30, 16);
      g.fillStyle(0x5bc0ff, 1);
      g.fillRect(48, 22, 29, 5);
      g.fillStyle(0xba7cff, 1);
      g.fillCircle(36, 25, 6);
    });

    this.makeTexture('unit-flame-rig', 84, 50, (g) => {
      g.fillStyle(0x211612, 1);
      g.fillRoundedRect(8, 12, 56, 28, 6);
      g.lineStyle(2, 0xff9f1c, 1);
      g.strokeRoundedRect(8, 12, 56, 28, 6);
      g.fillStyle(0xff6961, 1);
      g.fillRect(50, 20, 29, 7);
      g.fillStyle(0xffd166, 1);
      g.fillTriangle(72, 16, 83, 23, 72, 31);
      g.fillStyle(0x0a0f12, 1);
      g.fillCircle(22, 41, 4);
      g.fillCircle(54, 41, 4);
    });

    this.makeTexture('enemy-drone', 38, 38, (g) => {
      g.fillStyle(0x142022, 1);
      g.fillCircle(19, 19, 13);
      g.lineStyle(2, 0x8ddbd1, 1);
      g.strokeCircle(19, 19, 13);
      g.fillStyle(0xff6961, 1);
      g.fillCircle(25, 19, 4);
      g.lineStyle(2, 0x8ddbd1, 0.7);
      g.lineBetween(2, 19, 36, 19);
    });

    this.makeTexture('enemy-stalker', 46, 34, (g) => {
      g.fillStyle(0x1f1710, 1);
      g.fillRoundedRect(8, 9, 27, 14, 4);
      g.lineStyle(2, 0xffbd59, 1);
      g.strokeRoundedRect(8, 9, 27, 14, 4);
      g.fillStyle(0xff6961, 1);
      g.fillTriangle(32, 12, 43, 17, 32, 22);
      g.lineStyle(2, 0xffbd59, 0.9);
      g.lineBetween(13, 23, 6, 32);
      g.lineBetween(24, 23, 19, 32);
      g.lineBetween(14, 9, 6, 2);
      g.lineBetween(27, 9, 35, 2);
    });

    this.makeTexture('enemy-warden', 52, 52, (g) => {
      g.fillStyle(0x132015, 1);
      g.fillRoundedRect(11, 9, 30, 34, 5);
      g.lineStyle(2, 0xa7e65d, 1);
      g.strokeRoundedRect(11, 9, 30, 34, 5);
      g.fillStyle(0xffd166, 1);
      g.fillRect(26, 2, 5, 13);
      g.fillRect(26, 37, 5, 13);
      g.fillStyle(0xa7e65d, 0.95);
      g.fillRect(32, 23, 14, 6);
    });

    this.makeTexture('enemy-crusher', 62, 58, (g) => {
      g.fillStyle(0x241615, 1);
      g.fillRoundedRect(10, 10, 38, 36, 5);
      g.lineStyle(3, 0xff6961, 1);
      g.strokeRoundedRect(10, 10, 38, 36, 5);
      g.fillStyle(0xffd166, 1);
      g.fillRect(38, 24, 20, 8);
      g.fillStyle(0x0a0f12, 1);
      g.fillCircle(22, 22, 4);
      g.fillCircle(22, 35, 4);
    });

    this.makeTexture('enemy-mender', 54, 44, (g) => {
      g.fillStyle(0x102015, 1);
      g.fillRoundedRect(10, 9, 32, 24, 5);
      g.lineStyle(2, 0xa7e65d, 1);
      g.strokeRoundedRect(10, 9, 32, 24, 5);
      g.fillStyle(0xa7e65d, 1);
      g.fillRect(24, 13, 5, 16);
      g.fillRect(18, 18, 17, 5);
      g.lineStyle(2, 0x9fffe0, 0.9);
      g.strokeCircle(26, 22, 18);
    });

    this.makeTexture('enemy-sniper', 62, 38, (g) => {
      g.fillStyle(0x101923, 1);
      g.fillRoundedRect(8, 10, 32, 18, 4);
      g.lineStyle(2, 0x5bc0ff, 1);
      g.strokeRoundedRect(8, 10, 32, 18, 4);
      g.fillStyle(0x5bc0ff, 1);
      g.fillRect(35, 16, 24, 5);
      g.fillStyle(0xffd166, 1);
      g.fillCircle(18, 19, 4);
    });

    this.makeTexture('enemy-bomber', 58, 48, (g) => {
      g.fillStyle(0x241d10, 1);
      g.fillCircle(25, 24, 17);
      g.lineStyle(3, 0xffd166, 1);
      g.strokeCircle(25, 24, 17);
      g.fillStyle(0xff6961, 1);
      g.fillTriangle(37, 17, 55, 24, 37, 31);
      g.fillStyle(0xe8f7f4, 1);
      g.fillCircle(25, 24, 5);
    });

    this.makeTexture('enemy-turret', 58, 58, (g) => {
      g.fillStyle(0x10181b, 1);
      g.fillCircle(29, 29, 21);
      g.lineStyle(3, 0x9fffe0, 1);
      g.strokeCircle(29, 29, 21);
      g.fillStyle(0x263238, 1);
      g.fillRoundedRect(25, 6, 8, 28, 3);
      g.fillStyle(0xff6961, 1);
      g.fillCircle(29, 29, 7);
      g.lineStyle(2, 0xffd166, 0.8);
      g.lineBetween(12, 46, 46, 46);
    });

    this.makeTexture('enemy-boss', 96, 84, (g) => {
      g.fillStyle(0x241013, 1);
      g.fillRoundedRect(14, 12, 58, 56, 8);
      g.lineStyle(4, 0xff4d4d, 1);
      g.strokeRoundedRect(14, 12, 58, 56, 8);
      g.fillStyle(0x0a0f12, 1);
      g.fillCircle(34, 34, 8);
      g.fillCircle(54, 34, 8);
      g.fillStyle(0xffd166, 1);
      g.fillRect(66, 36, 25, 10);
      g.lineStyle(3, 0xba7cff, 0.95);
      g.lineBetween(24, 12, 8, 2);
      g.lineBetween(62, 12, 82, 2);
      g.lineBetween(24, 68, 8, 82);
      g.lineBetween(62, 68, 82, 82);
    });

    this.makeTexture('shot-pulse', 18, 8, (g) => {
      g.fillStyle(0x9fffe0, 1);
      g.fillRoundedRect(0, 2, 15, 4, 2);
      g.fillStyle(0xffffff, 1);
      g.fillRect(11, 3, 5, 2);
    });

    this.makeTexture('shot-shell', 24, 10, (g) => {
      g.fillStyle(0xffd166, 1);
      g.fillRoundedRect(1, 2, 18, 6, 3);
      g.fillStyle(0xff6961, 1);
      g.fillTriangle(18, 1, 24, 5, 18, 9);
    });

    this.makeTexture('shot-missile', 24, 9, (g) => {
      g.fillStyle(0xe8f7f4, 1);
      g.fillRoundedRect(0, 2, 17, 5, 2);
      g.fillStyle(0x36f0d2, 1);
      g.fillTriangle(16, 0, 24, 4.5, 16, 9);
      g.fillStyle(0xff6961, 1);
      g.fillRect(0, 2, 4, 5);
    });

    this.makeTexture('shot-rail', 32, 8, (g) => {
      g.fillStyle(0x5bc0ff, 1);
      g.fillRoundedRect(0, 2, 28, 4, 2);
      g.fillStyle(0xe8f7f4, 1);
      g.fillRect(18, 3, 11, 2);
      g.fillStyle(0xba7cff, 1);
      g.fillTriangle(28, 0, 32, 4, 28, 8);
    });

    this.makeTexture('shot-grenade', 18, 18, (g) => {
      g.fillStyle(0x1b2422, 1);
      g.fillCircle(9, 10, 7);
      g.lineStyle(2, 0xffd166, 1);
      g.strokeCircle(9, 10, 7);
      g.fillStyle(0xff6961, 1);
      g.fillRect(7, 2, 5, 5);
      g.fillStyle(0x9fffe0, 1);
      g.fillCircle(12, 8, 2);
    });

    this.makeTexture('shot-flame', 22, 14, (g) => {
      g.fillStyle(0xffd166, 1);
      g.fillEllipse(9, 7, 18, 10);
      g.fillStyle(0xff6961, 0.9);
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
      g.lineStyle(2, 0x9ed7ff, 1);
      g.strokeCircle(11, 11, 8);
      g.lineBetween(11, 2, 11, 20);
      g.lineBetween(2, 11, 20, 11);
    });

    this.makeTexture('shot-ion', 34, 8, (g) => {
      g.fillStyle(0x64f5ff, 1);
      g.fillRoundedRect(0, 2, 28, 4, 2);
      g.fillStyle(0xe8f7f4, 1);
      g.fillTriangle(25, 0, 34, 4, 25, 8);
    });

    this.makeTexture('enemy-bullet', 12, 12, (g) => {
      g.fillStyle(0xff6961, 1);
      g.fillCircle(6, 6, 5);
      g.fillStyle(0xffd166, 0.9);
      g.fillCircle(6, 6, 2);
    });

    this.makeTexture('weapon-attack-drone', 34, 34, (g) => {
      g.fillStyle(0x10181e, 1);
      g.fillCircle(17, 17, 10);
      g.lineStyle(2, 0x36f0d2, 1);
      g.strokeCircle(17, 17, 10);
      g.lineStyle(2, 0x9fffe0, 0.8);
      g.lineBetween(2, 17, 32, 17);
      g.lineBetween(17, 2, 17, 32);
      g.fillStyle(0xffd166, 1);
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
      g.lineStyle(2, 0x9fffe0, 0.75);
      g.strokeCircle(17, 17, 15);
    });

    this.makeTexture('weapon-swarm', 34, 34, (g) => {
      g.fillStyle(0x22121d, 1);
      g.fillCircle(17, 17, 10);
      g.lineStyle(2, 0xff8bd1, 1);
      g.strokeCircle(17, 17, 10);
      g.fillStyle(0xff8bd1, 1);
      g.fillCircle(11, 13, 3);
      g.fillCircle(22, 16, 3);
      g.fillCircle(16, 23, 3);
    });

    this.makeTexture('spark', 10, 10, (g) => {
      g.fillStyle(0xffd166, 1);
      g.fillCircle(5, 5, 4);
    });

    this.makeTexture('chest', 48, 42, (g) => {
      g.fillStyle(0x111a1f, 1);
      g.fillRoundedRect(4, 10, 40, 25, 4);
      g.lineStyle(2, 0xffd166, 1);
      g.strokeRoundedRect(4, 10, 40, 25, 4);
      g.fillStyle(0x263238, 1);
      g.fillRect(7, 4, 34, 10);
      g.fillStyle(0x36f0d2, 1);
      g.fillRect(21, 18, 6, 9);
      g.lineStyle(1, 0x9fffe0, 0.8);
      g.lineBetween(8, 17, 40, 17);
    });

    this.makeTexture('vehicle-bubble', 70, 70, (g) => {
      g.fillStyle(0x36f0d2, 0.12);
      g.fillCircle(35, 35, 31);
      g.lineStyle(3, 0x36f0d2, 0.92);
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

  private addMap() {
    this.add
      .tileSprite(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 'grid-tile')
      .setOrigin(0)
      .setDepth(-20);

    const circuits = this.add.graphics().setDepth(-10);
    circuits.lineStyle(2, 0x36f0d2, 0.22);
    circuits.fillStyle(0xffd166, 0.38);

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
    if (keyboardMoving) {
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
    const speed = (vehicle.speed + this.speedBonus + this.getBuffSpeedBonus()) * this.getWeatherSpeedMultiplier();

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
    this.player.setRotation(this.lastAimAngle);

    if (this.magnetRadius > 0) {
      this.pullChests(deltaSeconds);
    }
  }

  private pullChests(deltaSeconds: number) {
    this.chests.getChildren().forEach((rawChest) => {
      const chest = rawChest as Phaser.Physics.Arcade.Image;
      if (!chest.active) {
        return;
      }

      const distance = Phaser.Math.Distance.Between(chest.x, chest.y, this.player.x, this.player.y);
      if (distance > this.magnetRadius || distance < 18) {
        return;
      }

      const angle = Phaser.Math.Angle.Between(chest.x, chest.y, this.player.x, this.player.y);
      chest.x += Math.cos(angle) * 120 * deltaSeconds;
      chest.y += Math.sin(angle) * 120 * deltaSeconds;
    });

    [...this.vehiclePods.getChildren(), ...this.buffPickups.getChildren()].forEach((rawLoot) => {
      const loot = rawLoot as Phaser.Physics.Arcade.Image;
      if (!loot.active) {
        return;
      }

      const distance = Phaser.Math.Distance.Between(loot.x, loot.y, this.player.x, this.player.y);
      if (distance > this.magnetRadius || distance < 18) {
        return;
      }

      const angle = Phaser.Math.Angle.Between(loot.x, loot.y, this.player.x, this.player.y);
      loot.x += Math.cos(angle) * 145 * deltaSeconds;
      loot.y += Math.sin(angle) * 145 * deltaSeconds;
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
        trailColor: 0x36f0d2,
        impactColor: 0x9fffe0,
      });
    }
    this.drawArcBolt(visual.x, visual.y, target.x, target.y, perfect ? 0xe8f7f4 : 0x36f0d2, perfect ? 3 : 1.4, 110);
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
        trailColor: 0xff6961,
        impactColor: perfect ? 0xe8f7f4 : 0xffd166,
      });
    }
    this.cameras.main.shake(perfect ? 110 : 70, perfect ? 0.004 : 0.0025);

    this.addThreatNoise(this.player.x, this.player.y, 34 + level * 4 + (perfect ? 10 : 0), 560 + level * 40);
    this.weaponCooldowns.rocketLauncher =
      this.elapsedMs + Math.max(perfect ? 420 : 560, (2100 - level * 220 - (perfect ? 180 : 0)) * this.getFireRateMultiplier());
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
        trailColor: perfect ? 0xe8f7f4 : 0xffd166,
        impactColor: 0xffd166,
      });
    }

    this.addThreatNoise(this.player.x, this.player.y, 24 + level * 4 + (perfect ? 8 : 0), 480 + level * 38);
    this.weaponCooldowns.grenadeLauncher =
      this.elapsedMs + Math.max(perfect ? 520 : 700, (2600 - level * 260 - (perfect ? 220 : 0)) * this.getFireRateMultiplier());
  }

  private updateTeslaEmitter() {
    const level = this.getWeaponLevel('teslaEmitter');
    if (level <= 0 || this.elapsedMs < this.weaponCooldowns.teslaEmitter) {
      return;
    }

    const perfect = this.isWeaponPerfect('teslaEmitter');
    const targets = this.getTargetsInRange(
      230 + level * 58 + (perfect ? 170 : 0),
      perfect ? 7 : 1 + Math.floor(level / 2),
    );
    if (targets.length === 0) {
      return;
    }

    targets.forEach((target, index) => {
      const damage = (12 + level * 10 + (perfect ? 16 : 0)) * this.getDamageMultiplier() * Math.max(0.35, 1 - index * (perfect ? 0.1 : 0.18));
      this.damageTarget(target, damage);
      this.drawArcBolt(
        index === 0 ? this.player.x : targets[index - 1].x,
        index === 0 ? this.player.y : targets[index - 1].y,
        target.x,
        target.y,
        perfect ? 0xe8f7f4 : WEAPONS.teslaEmitter.color,
        2 + level * 0.55 + (perfect ? 1.2 : 0),
        perfect ? 230 : 180,
      );
      if (perfect) {
        this.shockwave(target.x, target.y, 26, WEAPONS.teslaEmitter.color);
      }
    });

    this.weaponCooldowns.teslaEmitter =
      this.elapsedMs + Math.max(perfect ? 240 : 380, (1300 - level * 145 - (perfect ? 160 : 0)) * this.getFireRateMultiplier());
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
    this.drawArcBolt(this.player.x, this.player.y, target.x, target.y, perfect ? 0xe8f7f4 : WEAPONS.beamCannon.color, 4 + level * 0.45 + (perfect ? 2 : 0), perfect ? 260 : 190);
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
      this.elapsedMs + Math.max(perfect ? 620 : 820, (2700 - level * 235 - (perfect ? 220 : 0)) * this.getFireRateMultiplier());
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

    const radius = 92 + level * 25 + (perfect ? 64 : 0);
    const strikes = perfect ? 3 : 1;
    this.time.delayedCall(260, () => {
      if (this.isGameOver) {
        return;
      }
      for (let i = 0; i < strikes; i += 1) {
        const angle = (i / strikes) * Math.PI * 2 + this.elapsedMs * 0.001;
        const strikeX = target.x + (perfect ? Math.cos(angle) * 68 : 0);
        const strikeY = target.y + (perfect ? Math.sin(angle) * 68 : 0);
        const damage = (32 + level * 27 + (perfect ? 38 : 0)) * this.getDamageMultiplier();
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
      this.elapsedMs + Math.max(perfect ? 900 : 1200, (3600 - level * 320 - (perfect ? 360 : 0)) * this.getFireRateMultiplier());
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
      this.drawArcBolt(this.player.x, this.player.y, target.x, target.y, WEAPONS.nanoSwarm.color, perfect ? 2.4 : 1.5, 120);
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
      this.elapsedMs + Math.max(perfect ? 1250 : 1600, (3900 - level * 310 - (perfect ? 360 : 0)) * this.getFireRateMultiplier());
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
        trailColor: 0x64f5ff,
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
      if (this.elapsedMs - lastTrailAt > 45) {
        projectile.setData('lastTrailAt', this.elapsedMs);
        const trail = this.add.circle(projectile.x, projectile.y, 4, 0xff6961, 0.35).setDepth(22);
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
    this.flashAt(projectile.x, projectile.y, 0xff6961, 8);
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
      this.splashDamage(x, y, aoe, damage);
      this.splashDamageRemotePlayers(x, y, aoe, damage);
      this.splashDamageChests(x, y, aoe, damage);
      this.flashAt(x, y, projectile.getData('impactColor') as number, Math.max(14, aoe / 4));
      this.shockwave(x, y, aoe, projectile.getData('impactColor') as number);
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

      if (aggro >= spec.chaseThreshold) {
        hunterCount += 1;
        this.chasePlayer(enemy, spec, aggro, distanceToPlayer);
      } else if (aggro >= 22) {
        this.watchPlayer(enemy, spec, aggro);
      } else {
        this.patrol(enemy, spec, deltaSeconds);
      }

      if (aggro >= spec.chaseThreshold && distanceToPlayer <= spec.attackRange) {
        this.enemyAttack(enemy, spec);
      }

      this.updateEliteSkill(enemy, spec, distanceToPlayer);

      enemy.setTint(this.getEnemyTint(enemy));

      aggroTotal += aggro;
      activeCount += 1;
    });

    const averageAggro = activeCount > 0 ? aggroTotal / activeCount : 0;
    this.areaAlert = clamp(averageAggro * 0.58 + hunterCount * 5.5, 0, 100);
  }

  private updateBoss(
    enemy: Phaser.Physics.Arcade.Sprite,
    spec: EnemySpec,
    deltaSeconds: number,
  ): { aggro: number; hunting: boolean } {
    if (enemy.getData('neutralAsleep')) {
      enemy.setVelocity(0, 0);
      enemy.setRotation(Math.sin(this.elapsedMs / 900 + enemy.x) * 0.08);
      return { aggro: 0, hunting: false };
    }

    const hp = enemy.getData('hp') as number;
    const maxHp = enemy.getData('maxHp') as number;
    const target = this.findBossTarget(enemy, spec.noticeRadius);
    const mode = enemy.getData('bossMode') as string | undefined;
    const hasLockedTarget = Boolean(enemy.getData('bossTargetId'));
    const healCooldownUntil = (enemy.getData('bossHealCooldownUntil') as number | undefined) ?? 0;

    if (!target) {
      enemy.setData('bossMode', 'heal');
      enemy.setVelocity(0, 0);
      this.healBoss(enemy, deltaSeconds, this.elapsedMs >= healCooldownUntil);
      enemy.setTint(hp < maxHp ? 0xa7e65d : BOSS_MINIMAP_COLOR);
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
    if (!hasLockedTarget && this.elapsedMs >= fleeUntil && this.elapsedMs - targetSince > BOSS_FIXATION_MS) {
      enemy.setData('bossMode', 'flee');
      enemy.setData('bossFleeUntil', this.elapsedMs + BOSS_FLEE_MS);
      enemy.setData('bossFleeFromId', target.id);
      enemy.setData('bossTargetSince', this.elapsedMs);
    }

    if ((enemy.getData('bossMode') as string) === 'flee') {
      if (this.elapsedMs < ((enemy.getData('bossFleeUntil') as number | undefined) ?? 0)) {
        this.moveBossAway(enemy, target, spec.speed * 1.35);
        enemy.setTint(0xffd166);
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
    enemy.setTint(BOSS_MINIMAP_COLOR);
    return { aggro: 100, hunting: true };
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
    enemy.setRotation(angle);
  }

  private updateBossSkill(enemy: Phaser.Physics.Arcade.Sprite, spec: EnemySpec, target: BossTarget, distance: number) {
    const nextSkillAt = (enemy.getData('nextSkillAt') as number | undefined) ?? 0;
    if (this.elapsedMs < nextSkillAt) {
      return;
    }

    const bossName = ENEMIES.boss.name;
    enemy.setData('nextSkillAt', this.elapsedMs + Phaser.Math.Between(2400, 3600));
    if (distance < 180) {
      this.shockwave(enemy.x, enemy.y, 180, BOSS_MINIMAP_COLOR);
      if (target.isLocal) {
        this.damagePlayer((enemy.getData('damage') as number) * 1.25, bossName);
      }
      return;
    }

    this.drawArcBolt(enemy.x, enemy.y, target.x, target.y, BOSS_MINIMAP_COLOR, 4, 220);
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
      this.drawArcBolt(enemy.x, enemy.y, this.player.x, this.player.y, 0x5bc0ff, tier === 'red' ? 3.5 : 2.5, 160);
      this.damagePlayer(spec.damage * (tier === 'red' ? 0.9 : 0.62), spec.name);
      return;
    }

    if ((kind === 'bomber' || kind === 'crusher') && distanceToPlayer < 150) {
      const radius = tier === 'red' ? 150 : 105;
      this.shockwave(enemy.x, enemy.y, radius, 0xffd166);
      this.damagePlayer(spec.damage * (tier === 'red' ? 1.1 : 0.72), spec.name);
      return;
    }

    if (kind === 'stalker' || kind === 'drone') {
      this.moveEnemyToward(enemy, this.player.x, this.player.y, this.getEnemySpeed(enemy, spec) * 1.85);
      this.flashAt(enemy.x, enemy.y, ENEMY_TIERS[tier].color, 8);
    }
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
      if (mode === 'flee') return 0xffd166;
      return BOSS_MINIMAP_COLOR;
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
    enemy.setRotation(angle);
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
    enemy.setRotation(angle);
  }

  private enemyAttack(enemy: Phaser.Physics.Arcade.Sprite, spec: EnemySpec) {
    const nextAttackAt = (enemy.getData('nextAttackAt') as number | undefined) ?? 0;
    if (this.elapsedMs < nextAttackAt) {
      return;
    }

    enemy.setData('nextAttackAt', this.elapsedMs + spec.attackDelay);
    enemy.setData('aggro', clamp((enemy.getData('aggro') as number) + 9, 0, 100));
    this.damagePlayer(enemy.getData('damage') as number, spec.name);
    this.flashAt(enemy.x, enemy.y, 0xff6961, 5);
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
    this.muzzleBurst(enemy.x, enemy.y, angle, 0xff6961);
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
    if (this.currentVehicle !== 'mech' && this.vehicleShield > 0) {
      this.vehicleShield = Math.max(0, this.vehicleShield - taken);
      this.player.setTint(0x5bc0ff);
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
    this.player.setTint(0xff6961);
    this.time.delayedCall(90, () => {
      if (!this.isGameOver) {
        this.player.setTint(this.localTeamTint || 0xffffff);
      }
    });

    if (this.hp <= 0) {
      this.showGameOver();
    }
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
    const hp = (enemy.getData('hp') as number) - damage;
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
    this.time.delayedCall(60, () => {
      if (enemy.active) {
        enemy.setTint(this.getEnemyTint(enemy));
      }
    });

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
    this.flashAt(target.x, target.y, 0xff6961, 8);
  }

  private breakChest(chest: Phaser.Physics.Arcade.Image) {
    if (!chest.active || chest.getData('broken')) {
      return;
    }

    chest.setData('broken', true);
    const roll = Phaser.Math.Between(1, 100);
    if (roll <= 46) {
      const vehicle = Phaser.Utils.Array.GetRandom(VEHICLE_ORDER);
      this.spawnVehiclePod(chest.x, chest.y, vehicle);
    } else if (roll <= 76) {
      this.spawnBuffAt(chest.x, chest.y);
    } else {
      this.hp = clamp(this.hp + 6, 0, this.maxHp);
      this.healPulse(chest.x, chest.y, 46);
    }
    this.flashAt(chest.x, chest.y, 0xffd166, 14);
    this.shockwave(chest.x, chest.y, 86, 0xffd166);
    this.addThreatNoise(chest.x, chest.y, 24, 420);
    chest.destroy();
  }

  private killEnemy(enemy: Phaser.Physics.Arcade.Sprite) {
    const kind = enemy.getData('kind') as EnemyKind;
    const tier = enemy.getData('tier') as EnemyTier;
    const xp = enemy.getData('xp') as number;
    const killX = enemy.x;
    const killY = enemy.y;
    this.kills += 1;
    this.gainXp(xp);
    this.spawnXpOrb(killX, killY, xp);
    this.addTeamScore(xp);
    const isBoss = kind === 'boss';
    this.flashAt(killX, killY, isBoss ? BOSS_MINIMAP_COLOR : ENEMY_TIERS[tier].color, isBoss ? 20 : 8);
    if (tier === 'purple' || tier === 'red') {
      this.shockwave(killX, killY, isBoss ? 260 : tier === 'red' ? 150 : 105, isBoss ? BOSS_MINIMAP_COLOR : ENEMY_TIERS[tier].color);
    }

    if (isBoss) {
      this.grantPermanentVehicle(killX, killY);
    } else if (Phaser.Math.Between(1, 100) <= 5) {
      this.spawnChestAt(killX, killY);
    }

    if (!isBoss && (tier === 'purple' || tier === 'red')) {
      this.spawnBuffAt(killX, killY);
    }

    enemy.destroy();
    if (isBoss) {
      this.time.delayedCall(1800, () => {
        if (this.isInMultiplayerRoom && !this.isGameOver) {
          this.ensureBossCount();
        }
      });
    }
  }

  private spawnXpOrb(x: number, y: number, amount: number) {
    const orb = this.add.circle(x, y, 7, 0x36f0d2, 0.94).setDepth(66);
    const halo = this.add.circle(x, y, 13, 0x9fffe0, 0.24).setDepth(65);
    const startX = x;
    const startY = y;
    const label = this.add
      .text(x, y - 22, `+${amount}`, {
        fontFamily: 'Inter, "Segoe UI", sans-serif',
        fontSize: '13px',
        color: '#9fffe0',
      })
      .setOrigin(0.5)
      .setDepth(67);

    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 560,
      ease: 'Cubic.easeInOut',
      onUpdate: (tween) => {
        if (!this.player?.active || !this.isInMultiplayerRoom) {
          return;
        }
        const progress = tween.getValue() ?? 1;
        const eased = Phaser.Math.Easing.Cubic.InOut(progress);
        const nextX = Phaser.Math.Linear(startX, this.player.x, eased);
        const nextY = Phaser.Math.Linear(startY, this.player.y, eased);
        orb.setPosition(nextX, nextY);
        halo.setPosition(nextX, nextY);
        label.setPosition(nextX, nextY - 20);
        orb.setScale(1 - progress * 0.45);
        halo.setScale(1 + progress * 0.6);
        halo.setAlpha(0.24 * (1 - progress));
        label.setAlpha(1 - progress * 0.7);
      },
      onComplete: () => {
        orb.destroy();
        halo.destroy();
        label.destroy();
        this.flashAt(this.player.x, this.player.y, 0x36f0d2, 5);
      },
    });
  }

  private grantPermanentVehicle(x: number, y: number) {
    const vehicle = Phaser.Utils.Array.GetRandom(VEHICLE_ORDER);
    const nextRank = clamp(
      Math.max(this.permanentVehicleRanks[vehicle] ?? 0, this.vehicleRanks[vehicle] ?? 0) + 1,
      1,
      5,
    );
    this.permanentVehicleRanks[vehicle] = nextRank;
    this.vehicleRanks[vehicle] = nextRank;
    this.applyVehicle(vehicle, true, false);
    this.hp = clamp(this.hp + 28, 0, this.maxHp);
    this.addTeamScore(150);
    this.flashAt(x, y, BOSS_MINIMAP_COLOR, 24);
    this.shockwave(x, y, 240, BOSS_MINIMAP_COLOR);
    this.invasionMessage = `击败 Boss，永久解锁 ${VEHICLES[vehicle].name} Lv.${nextRank}`;
    this.invasionMessageUntil = Number.POSITIVE_INFINITY;
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
      this.showUpgradeChoices();
      if (this.isChoosingUpgrade) {
        break;
      }
    }
  }

  private getXpRequirementForLevel(level: number) {
    if (level < 20) {
      return Math.floor(16 + level * 5 + Math.pow(level, 1.14) * 3.6);
    }

    return Math.floor(145 + (level - 20) * 30 + Math.pow(level - 19, 1.5) * 15);
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
    this.upgradeChoiceExpiresAt = this.elapsedMs + 3000;
    const width = this.scale.width;
    const height = this.scale.height;
    const compact = width < 820;
    const compactLandscape = compact && width > height && height < 520;
    const gap = compact ? 14 : 22;
    const cardWidth = compactLandscape
      ? Math.max(188, Math.min(238, (width - 56 - gap * 2) / 3))
      : compact
        ? Math.min(360, width - 28)
        : 246;
    const cardHeight = compact ? 118 : 128;
    const startX = compactLandscape ? width / 2 - cardWidth - gap : compact ? width / 2 : width / 2 - cardWidth - gap;
    const startY = compactLandscape ? Math.max(178, height / 2 + 36) : compact ? Math.max(136, height / 2 - cardHeight - gap) : height / 2 + 10;
    const titleY = compactLandscape ? 42 : compact ? Math.max(44, startY - cardHeight / 2 - 30) : height / 2 - 132;
    const container = this.add.container(0, 0).setScrollFactor(0).setDepth(1200);

    const overlay = this.add.rectangle(0, 0, width, height, 0x050709, 0.28).setOrigin(0);
    const title = this.add
      .text(width / 2, titleY, `等级 ${this.level}`, {
        fontFamily: 'Inter, "Segoe UI", sans-serif',
        fontSize: '30px',
        color: '#e8f7f4',
      })
      .setOrigin(0.5);
    const prompt = this.add
      .text(width / 2, titleY + 38, '点击卡片，或按 1 / 2 / 3 选择升级。3 秒后默认选择 1', {
        fontFamily: 'Inter, "Segoe UI", sans-serif',
        fontSize: '16px',
        color: '#9fffe0',
      })
      .setOrigin(0.5);
    const countdown = this.add
      .text(width / 2, titleY + 68, '剩余 3.0s', {
        fontFamily: 'Inter, "Segoe UI", sans-serif',
        fontSize: '15px',
        color: '#ffda8a',
      })
      .setOrigin(0.5);

    this.upgradeCountdownText = countdown;
    container.add([overlay, title, prompt, countdown]);

    choices.forEach((choice, index) => {
      const x = compact && !compactLandscape ? startX : startX + index * (cardWidth + gap);
      const y = compact && !compactLandscape ? startY + index * (cardHeight + gap) : startY;
      const card = this.add
        .rectangle(x, y, cardWidth, cardHeight, 0x111a1f, 0.98)
        .setStrokeStyle(2, index === 0 ? 0x36f0d2 : index === 1 ? 0xffd166 : 0xa7e65d)
        .setInteractive({ useHandCursor: true });
      const number = this.add
        .text(x - cardWidth / 2 + 18, y - cardHeight / 2 + 18, `按 ${index + 1}`, {
          fontFamily: 'Inter, "Segoe UI", sans-serif',
          fontSize: '16px',
          color: '#9fffe0',
        })
        .setOrigin(0, 0.5);
      const name = this.add
        .text(x, y - (compact ? 22 : 28), choice.title, {
          fontFamily: 'Inter, "Segoe UI", sans-serif',
          fontSize: '19px',
          color: '#e8f7f4',
        })
        .setOrigin(0.5);
      const detail = this.add
        .text(x, y + (compact ? 22 : 22), choice.detail, {
          fontFamily: 'Inter, "Segoe UI", sans-serif',
          fontSize: '14px',
          color: '#a9c7c1',
          align: 'center',
          wordWrap: { width: cardWidth - 34 },
        })
        .setOrigin(0.5);
      const chooseLabel = this.add
        .text(x, y + cardHeight / 2 - 20, '选择', {
          fontFamily: 'Inter, "Segoe UI", sans-serif',
          fontSize: '15px',
          color: '#9fffe0',
        })
        .setOrigin(0.5);

      const choose = () => this.applyUpgrade(choice);
      card.on('pointerover', () => card.setFillStyle(0x17252a, 1));
      card.on('pointerout', () => card.setFillStyle(0x111a1f, 0.98));
      card.on('pointerdown', choose);
      [number, name, detail, chooseLabel].forEach((item) => {
        item.setInteractive({ useHandCursor: true }).on('pointerdown', choose);
      });
      container.add([card, number, name, detail, chooseLabel]);
    });

    this.modal = container;
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
    hint.textContent = '点击选择升级，3 秒后默认选择 1';

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

    box.append(title, hint, list);
    panel.appendChild(box);
    document.body.appendChild(panel);
    this.upgradePanel = panel;
  }

  private updateUpgradeChoiceTimer() {
    if (!this.isChoosingUpgrade || this.currentUpgradeChoices.length === 0) {
      return;
    }

    const remainingMs = Math.max(0, this.upgradeChoiceExpiresAt - this.elapsedMs);
    this.upgradeCountdownText?.setText(`剩余 ${(remainingMs / 1000).toFixed(1)}s`);
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
    return this.damageMultiplier * (this.isBuffActive('overclock') ? 1.35 : 1);
  }

  private getFireRateMultiplier() {
    return this.fireRateMultiplier * (this.isBuffActive('rapid') ? 0.72 : 1);
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

      if (level > 0) {
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
        title: '物资牵引',
        detail: '宝箱会缓慢靠近',
        apply: (scene) => {
          scene.magnetRadius += 80;
        },
      },
    ];
  }

  private applyUpgrade(choice?: UpgradeSpec) {
    if (!choice || !this.isChoosingUpgrade) {
      return;
    }

    choice.apply(this);
    this.restoreOnUpgrade();
    this.modal?.destroy(true);
    this.modal = undefined;
    this.upgradePanel?.remove();
    this.upgradePanel = undefined;
    this.upgradeCountdownText = undefined;
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
    const enemy = this.physics.add.sprite(position.x, position.y, spec.texture);
    enemy.setDepth(kind === 'boss' ? 19 : 18);
    enemy.setTint(tierSpec.color);
    enemy.setCollideWorldBounds(true);
    const timeHpBonus = Math.floor(this.elapsedMs / 45000) * 12;
    const maxHp = Math.round((spec.hp + (kind === 'boss' ? timeHpBonus * 6 : timeHpBonus)) * tierSpec.hpMultiplier);
    enemy.setData('kind', kind);
    enemy.setData('tier', tier);
    enemy.setData('hp', maxHp);
    enemy.setData('maxHp', maxHp);
    enemy.setData('speed', spec.speed * tierSpec.speedMultiplier);
    enemy.setData('damage', Math.round(spec.damage * tierSpec.damageMultiplier));
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
      enemy.setData('aggro', 0);
      enemy.setData('neutralAsleep', true);
      enemy.setData('bossMode', 'sleep');
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

    this.enemies.add(enemy);
    this.assignPatrolTarget(enemy, spec);
    return enemy;
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

    for (let i = activeBosses; i < MIN_BOSS_COUNT; i += 1) {
      const spawn = BOSS_SPAWNS[i % BOSS_SPAWNS.length];
      const boss = this.spawnEnemy('boss', 'red', {
        x: clamp(spawn.x + Phaser.Math.Between(-120, 120), 100, WORLD_WIDTH - 100),
        y: clamp(spawn.y + Phaser.Math.Between(-120, 120), 100, WORLD_HEIGHT - 100),
      });
      boss.setScale(1.12);
      this.shockwave(boss.x, boss.y, 110, BOSS_MINIMAP_COLOR);
    }
  }

  private pickEnemyTier(): EnemyTier {
    const seconds = this.elapsedMs / 1000;
    const roll = Phaser.Math.Between(1, 100);

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
      if (roll < 86) return 'stalker';
      return 'mender';
    }

    if (seconds < 70) {
      if (roll < 30) return 'drone';
      if (roll < 58) return 'stalker';
      if (roll < 74) return 'mender';
      if (roll < 84) return 'sniper';
      if (roll < 92) return 'turret';
      return 'warden';
    }

    if (roll < 18) return 'drone';
    if (roll < 40) return 'stalker';
    if (roll < 56) return 'mender';
    if (roll < 69) return 'sniper';
    if (roll < 80) return 'turret';
    if (roll < 90) return 'bomber';
    if (roll < 97) return 'warden';
    return 'crusher';
  }

  private pickSpawnPosition() {
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const distance = Phaser.Math.Between(560, 880);
    return {
      x: clamp(this.player.x + Math.cos(angle) * distance, 60, WORLD_WIDTH - 60),
      y: clamp(this.player.y + Math.sin(angle) * distance, 60, WORLD_HEIGHT - 60),
    };
  }

  private updateSpawns() {
    if (this.elapsedMs >= this.nextEnemySpawnAt) {
      const difficulty = 1 + this.elapsedMs / 52000;
      const count = clamp(Math.floor(difficulty), 1, 5);
      for (let i = 0; i < count; i += 1) {
        this.spawnEnemy();
      }
      this.nextEnemySpawnAt =
        this.elapsedMs + Math.max(360, 1180 - this.elapsedMs / 95);
    }

    if (this.elapsedMs >= this.nextChestAt) {
      this.spawnChestNearPlayer(Phaser.Math.Between(360, 620));
      this.nextChestAt = this.elapsedMs + Phaser.Math.Between(13000, 19000);
    }

    this.ensureBossCount();
  }

  private spawnChestNearPlayer(distance: number) {
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
    const body = chest.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(38, 30, true);
    this.chests.add(chest);

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

  private spawnBuffAt(x: number, y: number) {
    const buff = Phaser.Utils.Array.GetRandom(BUFF_ORDER);
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
    this.applyVehicle(vehicle, true);
    this.hp = clamp(this.hp + 8, 0, this.maxHp);
    this.flashAt(pod.x, pod.y, 0x36f0d2, 13);
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
    this.activeBuffs[buff] = this.elapsedMs + 60000;
    this.flashAt(pickup.x, pickup.y, BUFFS[buff].color, 12);
    pickup.destroy();
  }

  private applyVehicle(vehicle: VehicleKey, burst: boolean, rankUp = true) {
    const previousVehicle = this.currentVehicle;
    if (vehicle !== 'mech' && rankUp) {
      this.vehicleRanks[vehicle] = clamp(this.vehicleRanks[vehicle] + 1, 1, 5);
    }

    this.currentVehicle = vehicle;
    const baseSpec = VEHICLES[vehicle];
    const spec = this.getVehicleSpec(vehicle);
    this.player.setTexture(baseSpec.texture);
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
      const color =
        vehicle === 'tank' || vehicle === 'artillery'
          ? 0xa7e65d
          : vehicle === 'railgun'
            ? 0x5bc0ff
            : vehicle === 'walker'
              ? 0xba7cff
              : 0x36f0d2;
      this.flashAt(
        this.player.x,
        this.player.y,
        color,
        16,
      );
      this.vehicleSwitchRing(color);
      this.cameras.main.shake(110, 0.0025);
    }
  }

  private timeoutVehicle() {
    if (this.currentVehicle === 'mech') {
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
    const blastColor =
      expiredVehicle === 'tank' || expiredVehicle === 'artillery' || expiredVehicle === 'flameRig'
        ? 0xffd166
        : expiredVehicle === 'railgun' || expiredVehicle === 'laserVan'
          ? 0x5bc0ff
          : 0xff6961;
    this.shockwave(this.player.x, this.player.y, 120, blastColor);
    this.flashAt(this.player.x, this.player.y, blastColor, 24);
    this.cameras.main.shake(160, 0.005);
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
      fireDelay: Math.max(58, base.fireDelay * (1 - rankBonus * 0.08)),
      damage: base.damage * (1 + rankBonus * 0.18),
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
    for (let i = 0; i < 3; i += 1) {
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
    this.targetRing.lineStyle(2, 0x36f0d2, 0.42);
    this.targetRing.strokeCircle(this.player.x, this.player.y, this.targetRange);
    this.targetRing.lineStyle(1, 0xe8f7f4, 0.18);
    this.targetRing.strokeCircle(this.player.x, this.player.y, Math.max(12, this.targetRange - 8));
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
      this.enemyHud.fillStyle(aggro > 62 ? 0xff6961 : aggro > 24 ? 0xffd166 : 0x36f0d2, 1);
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
      this.enemyHud.fillStyle(0xffd166, 1);
      this.enemyHud.fillRect(x, y, 42 * clamp(hp / maxHp, 0, 1), 5);
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
    const isCompact = width < 760;
    const minimapSize = isCompact ? 112 : 150;
    const minimapX = width - minimapSize - 16;
    const minimapY = 16;
    const rightPanelWidth = Math.min(284, width - 32);
    const rightPanelHeight = 128;
    const rightPanelX = isCompact ? 16 : width - rightPanelWidth - 16;
    const rightPanelY = isCompact
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

    this.hud.clear();
    this.hud.fillStyle(0x050709, 0.78);
    this.hud.fillRoundedRect(16, 16, 430, 198, 8);
    this.hud.lineStyle(1, 0x36f0d2, 0.52);
    this.hud.strokeRoundedRect(16, 16, 430, 198, 8);

    this.hud.fillStyle(0x132022, 1);
    this.hud.fillRect(34, 56, 220, 11);
    this.hud.fillStyle(0xff6961, 1);
    this.hud.fillRect(34, 56, 220 * clamp(this.hp / this.maxHp, 0, 1), 11);

    this.hud.fillStyle(0x132022, 1);
    this.hud.fillRect(34, 82, 220, 9);
    this.hud.fillStyle(0x36f0d2, 1);
    this.hud.fillRect(34, 82, 220 * clamp(this.xp / this.xpToNext, 0, 1), 9);

    this.hud.fillStyle(0x132022, 1);
    this.hud.fillRect(34, 108, 220, 9);
    this.hud.fillStyle(this.areaAlert > 68 ? 0xff6961 : this.areaAlert > 34 ? 0xffd166 : 0xa7e65d, 1);
    this.hud.fillRect(34, 108, 220 * (this.areaAlert / 100), 9);

    this.drawMiniMap(minimapX, minimapY, minimapSize);

    this.hud.fillStyle(0x050709, 0.72);
    this.hud.fillRoundedRect(rightPanelX, rightPanelY, rightPanelWidth, rightPanelHeight, 8);
    this.hud.lineStyle(1, 0xffd166, 0.44);
    this.hud.strokeRoundedRect(rightPanelX, rightPanelY, rightPanelWidth, rightPanelHeight, 8);

    if (this.currentVehicle !== 'mech') {
      const vehicleBarWidth = rightPanelWidth - 34;
      this.hud.fillStyle(0x132022, 1);
      this.hud.fillRect(rightPanelX + 17, rightPanelY + 14, vehicleBarWidth, 10);
      this.hud.fillStyle(this.currentVehicle === 'tank' ? 0xa7e65d : 0x36f0d2, 1);
      this.hud.fillRect(rightPanelX + 17, rightPanelY + 14, vehicleBarWidth * remainingVehicle, 10);
    }

    this.hudText.setText(
      [
        `生命 ${Math.ceil(this.hp)}/${this.maxHp}     等级 ${this.level}`,
        `经验 ${this.xp}/${this.xpToNext}`,
        `索敌 ${Math.round(this.targetRange)}   区域警戒 ${Math.round(this.areaAlert)}%`,
        `击杀 ${this.kills}     剩余 ${remainingText}`,
        `阵营 ${this.localTeamName || '未加入'}     积分 ${teamScore}`,
        `载具 ${vehicle.name}${this.currentVehicle === 'mech' ? '' : ` Lv.${vehicleRank}`}`,
        this.getWeatherHudText(),
        this.getWeaponSlotText(),
      ].join('\n'),
    );
    this.hudText.setPosition(34, 28);

    const rightText =
      this.currentVehicle === 'mech'
        ? '载具舱：待发现'
        : `${vehicle.name} Lv.${vehicleRank}  ${Math.ceil(
            (this.vehicleExpiresAt - this.elapsedMs) / 1000,
          )}s`;
    const rightTextY = rightPanelY + (this.currentVehicle === 'mech' ? 18 : 30);
    this.hudText.setDepth(901);

    const existing = this.children.getByName('vehicle-readout') as Phaser.GameObjects.Text | null;
    if (existing) {
      existing.setText(rightText);
      existing.setPosition(rightPanelX + 18, rightTextY);
    } else {
      this.add
        .text(rightPanelX + 18, rightTextY, rightText, {
          fontFamily: 'Inter, "Segoe UI", sans-serif',
          fontSize: '18px',
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
        : `   护盾 ${Math.ceil(this.vehicleShield)}/${Math.ceil(this.maxVehicleShield)}`;
    const actualFireDelay = Math.max(52, vehicleSpec.fireDelay * this.getFireRateMultiplier());
    const shotsPerSecond = (vehicleSpec.shots * 1000) / actualFireDelay;
    const statText = `火力 x${this.getDamageMultiplier().toFixed(2)}   射速 ${shotsPerSecond.toFixed(
      1,
    )}/s   冷却 ${Math.round(actualFireDelay)}ms${shieldText}`;
    if (stat) {
      stat.setText(statText);
      stat.setPosition(rightPanelX + 18, rightPanelY + 52);
    } else {
      this.add
        .text(rightPanelX + 18, rightPanelY + 52, statText, {
          fontFamily: 'Inter, "Segoe UI", sans-serif',
          fontSize: '13px',
          color: '#a9c7c1',
        })
        .setName('stat-readout')
        .setScrollFactor(0)
        .setDepth(901);
    }

    const controls = this.children.getByName('control-readout') as Phaser.GameObjects.Text | null;
    const controlText = 'WASD移动   Q/E调索敌圈';
    if (controls) {
      controls.setText(controlText);
      controls.setPosition(rightPanelX + 18, rightPanelY + 73);
    } else {
      this.add
        .text(rightPanelX + 18, rightPanelY + 73, controlText, {
          fontFamily: 'Inter, "Segoe UI", sans-serif',
          fontSize: '12px',
          color: '#9fffe0',
        })
        .setName('control-readout')
        .setScrollFactor(0)
        .setDepth(901);
    }

    const buffs = this.children.getByName('buff-readout') as Phaser.GameObjects.Text | null;
    const buffText = this.getActiveBuffText();
    if (buffs) {
      buffs.setText(buffText);
      buffs.setPosition(rightPanelX + 18, rightPanelY + 96);
    } else {
      this.add
        .text(rightPanelX + 18, rightPanelY + 96, buffText, {
          fontFamily: 'Inter, "Segoe UI", sans-serif',
          fontSize: '12px',
          color: '#ffda8a',
          wordWrap: { width: rightPanelWidth - 36 },
        })
        .setName('buff-readout')
        .setScrollFactor(0)
        .setDepth(901);
    }

    const vignetteAlpha = clamp(this.areaAlert / 100, 0, 0.34);
    this.hud.lineStyle(4, this.areaAlert > 65 ? 0xff6961 : 0xffd166, vignetteAlpha);
    this.hud.strokeRect(2, 2, width - 4, height - 4);

    if (this.invasionMessage) {
      this.hud.fillStyle(0x050709, 0.76);
      this.hud.fillRoundedRect(width / 2 - 182, 20, 364, 42, 8);
      this.hud.lineStyle(1, 0xff6961, 0.85);
      this.hud.strokeRoundedRect(width / 2 - 182, 20, 364, 42, 8);
    }

    const invasion = this.children.getByName('invasion-readout') as Phaser.GameObjects.Text | null;
    const showInvasion = Boolean(this.invasionMessage);
    if (invasion) {
      invasion.setVisible(showInvasion);
      invasion.setText(this.invasionMessage);
      invasion.setPosition(width / 2 - 8, 41);
    } else {
      this.add
        .text(width / 2 - 8, 41, this.invasionMessage, {
          fontFamily: 'Inter, "Segoe UI", sans-serif',
          fontSize: '18px',
          color: '#ff6961',
        })
        .setName('invasion-readout')
        .setScrollFactor(0)
        .setOrigin(0.5)
        .setVisible(Boolean(showInvasion))
        .setDepth(902);
    }

    if (showInvasion) {
      if (this.announcementClose) {
        this.announcementClose.setVisible(true);
        this.announcementClose.setPosition(width / 2 + 154, 41);
      } else {
        this.announcementClose = this.add
          .text(width / 2 + 154, 41, 'x', {
            fontFamily: 'Inter, "Segoe UI", sans-serif',
            fontSize: '18px',
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
    this.hud.lineStyle(1, foggy ? 0x8f989b : 0x36f0d2, foggy ? 0.55 : 0.5);
    this.hud.strokeRoundedRect(x, y, size, size, 8);

    const toMiniX = (worldX: number) => x + clamp(worldX / WORLD_WIDTH, 0, 1) * size;
    const toMiniY = (worldY: number) => y + clamp(worldY / WORLD_HEIGHT, 0, 1) * size;

    this.enemies.getChildren().forEach((rawEnemy) => {
      const enemy = rawEnemy as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active || !enemy.getData('isBoss')) {
        return;
      }

      this.hud.fillStyle(foggy ? 0xb8bec1 : BOSS_MINIMAP_COLOR, foggy ? 0.62 : 0.95);
      this.hud.fillCircle(toMiniX(enemy.x), toMiniY(enemy.y), 4);
    });

    this.latestRoomState?.players.forEach((player) => {
      if (!player.alive || player.socketId === this.localSocketId) {
        return;
      }

      const isAlly = player.teamKey === this.localTeamKey;
      this.hud.fillStyle(foggy ? 0xb8bec1 : isAlly ? 0x5bc0ff : 0xff4d4d, foggy ? 0.58 : 0.92);
      this.hud.fillCircle(toMiniX(player.x), toMiniY(player.y), isAlly ? 3.2 : 2.8);
    });

    this.hud.fillStyle(foggy ? 0xe0e5e5 : 0x5bc0ff, 1);
    this.hud.fillCircle(toMiniX(this.player.x), toMiniY(this.player.y), 4.4);

    this.hud.lineStyle(1, foggy ? 0xc4cbcc : 0xe8f7f4, foggy ? 0.14 : 0.22);
    this.hud.lineBetween(x + size / 2, y + 6, x + size / 2, y + size - 6);
    this.hud.lineBetween(x + 6, y + size / 2, x + size - 6, y + size / 2);
  }

  private getProjectileColor(texture: string) {
    if (texture === 'shot-shell') return 0xffd166;
    if (texture === 'shot-missile') return 0xff6961;
    if (texture === 'shot-rail') return 0x5bc0ff;
    if (texture === 'shot-grenade') return 0xffd166;
    if (texture === 'shot-flame') return 0xff9f1c;
    return 0x36f0d2;
  }

  private muzzleBurst(x: number, y: number, angle: number, color: number) {
    const flame = this.add
      .circle(x + Math.cos(angle) * 10, y + Math.sin(angle) * 10, 8, color, 0.82)
      .setDepth(32);
    this.tweens.add({
      targets: flame,
      scaleX: 2.6,
      scaleY: 0.45,
      rotation: angle,
      alpha: 0,
      duration: 130,
      ease: 'Cubic.easeOut',
      onComplete: () => flame.destroy(),
    });
  }

  private emitProjectileTrail(projectile: Phaser.Physics.Arcade.Image) {
    const lastTrailAt = (projectile.getData('lastTrailAt') as number | undefined) ?? 0;
    if (this.elapsedMs - lastTrailAt < 28) {
      return;
    }

    projectile.setData('lastTrailAt', this.elapsedMs);
    const color = projectile.getData('trailColor') as number;
    const angle = projectile.rotation + Math.PI;
    const trail = this.add
      .circle(
        projectile.x + Math.cos(angle) * 8,
        projectile.y + Math.sin(angle) * 8,
        Phaser.Math.FloatBetween(2.5, 5.5),
        color,
        0.58,
      )
      .setDepth(24);
    this.tweens.add({
      targets: trail,
      alpha: 0,
      scale: 2.8,
      duration: 260,
      ease: 'Cubic.easeOut',
      onComplete: () => trail.destroy(),
    });
  }

  private impactBurst(x: number, y: number, color: number, scale: number) {
    const core = this.add.circle(x, y, 7 * scale, color, 0.92).setDepth(42);
    this.tweens.add({
      targets: core,
      alpha: 0,
      scale: 3.2,
      duration: 210,
      ease: 'Cubic.easeOut',
      onComplete: () => core.destroy(),
    });

    for (let i = 0; i < 5; i += 1) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const spark = this.add.circle(x, y, 2.5 * scale, color, 0.95).setDepth(43);
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * Phaser.Math.Between(18, 38) * scale,
        y: y + Math.sin(angle) * Phaser.Math.Between(18, 38) * scale,
        alpha: 0,
        duration: 240,
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
  }

  private shockwave(x: number, y: number, radius: number, color: number) {
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
  }

  private emitEngineTrail(angle: number, vehicle: VehicleSpec) {
    if (this.elapsedMs < this.nextEngineTrailAt) {
      return;
    }

    this.nextEngineTrailAt = this.elapsedMs + (this.currentVehicle === 'fighter' ? 34 : 58);
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
  }

  private flashAt(x: number, y: number, color: number, size: number) {
    for (let i = 0; i < 8; i += 1) {
      const spark = this.add.image(x, y, 'spark').setTint(color).setDepth(70);
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
    this.socket?.emit('player:defeated', { defeatedBy: this.lastDefeatedBy });
    this.physics.pause();

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
      .setStrokeStyle(2, 0x36f0d2)
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
      .setStrokeStyle(2, 0xff6961)
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
      this.applyVehicle('mech', false);
      this.player.setTint(this.localTeamTint || 0xffffff);
      this.spawnInitialWorld();
      this.physics.resume();
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
    this.localTeamTint = 0x36f0d2;
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
    this.gameOverLayer?.destroy(true);
    this.gameOverLayer = undefined;
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
