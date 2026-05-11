import Phaser from 'phaser';
import { io, Socket } from 'socket.io-client';
import './styles.css';

const GAME_WIDTH = 1280;
const GAME_HEIGHT = 720;
const WORLD_WIDTH = 3000;
const WORLD_HEIGHT = 2000;

type VehicleKey =
  | 'mech'
  | 'motorcycle'
  | 'tank'
  | 'fighter'
  | 'hovercraft'
  | 'railgun'
  | 'walker'
  | 'artillery';
type EnemyKind = 'drone' | 'stalker' | 'warden' | 'crusher';
type EnemyTier = 'white' | 'green' | 'blue' | 'purple' | 'red';
type UpgradeKey = 'damage' | 'rate' | 'speed' | 'armor' | 'magnet';
type BuffKey = 'overclock' | 'rapid' | 'barrier' | 'regen';
type WeaponKey =
  | 'attackDrone'
  | 'healDrone'
  | 'rocketLauncher'
  | 'grenadeLauncher'
  | 'teslaEmitter';
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
  maxLevel: number;
  color: number;
}

interface UpgradeSpec {
  key: string;
  title: string;
  detail: string;
  apply: (scene: MainScene) => void;
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
  players: number;
  maxPlayers: number;
  remainingMs: number;
  nextInvasionMs: number;
  scores: Record<string, number>;
  ended: boolean;
}

interface NetworkPlayer {
  socketId: string;
  userId: string;
  name: string;
  teamKey: string;
  teamName: string;
  color: string;
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
}

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
    bodyWidth: 58,
    bodyHeight: 38,
    projectileTexture: 'shot-missile',
    projectileScale: 1.08,
    aoe: 76,
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
    maxLevel: 5,
    color: 0x36f0d2,
  },
  healDrone: {
    name: '治疗无人机',
    detail: '周期修复生命，高等级附带护盾恢复',
    texture: 'weapon-heal-drone',
    maxLevel: 5,
    color: 0xa7e65d,
  },
  rocketLauncher: {
    name: '火箭筒',
    detail: '发射高伤害火箭，命中后范围爆炸',
    texture: 'shot-missile',
    maxLevel: 5,
    color: 0xff6961,
  },
  grenadeLauncher: {
    name: '手榴弹模块',
    detail: '抛射延时爆弹，适合清理密集目标',
    texture: 'shot-grenade',
    maxLevel: 5,
    color: 0xffd166,
  },
  teslaEmitter: {
    name: '电弧发生器',
    detail: '瞬发电弧连锁打击近距离目标',
    texture: 'buff-core',
    maxLevel: 5,
    color: 0xba7cff,
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
];
const BUFF_ORDER: BuffKey[] = ['overclock', 'rapid', 'barrier', 'regen'];
const WEAPON_ORDER: WeaponKey[] = [
  'attackDrone',
  'healDrone',
  'rocketLauncher',
  'grenadeLauncher',
  'teslaEmitter',
];
const MAX_WEAPON_SLOTS = 3;
const TARGET_RANGE_MIN = 220;
const TARGET_RANGE_MAX = 980;
const TARGET_RANGE_STEP = 60;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

class MainScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private enemies!: Phaser.Physics.Arcade.Group;
  private projectiles!: Phaser.Physics.Arcade.Group;
  private chests!: Phaser.Physics.Arcade.Group;
  private vehiclePods!: Phaser.Physics.Arcade.Group;
  private buffPickups!: Phaser.Physics.Arcade.Group;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: MoveKeys;
  private rangeKeys!: RangeKeys;
  private upgradeHotkeys: Phaser.Input.Keyboard.Key[] = [];
  private hud!: Phaser.GameObjects.Graphics;
  private targetRing!: Phaser.GameObjects.Graphics;
  private enemyHud!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private modal?: Phaser.GameObjects.Container;
  private gameOverLayer?: Phaser.GameObjects.Container;
  private currentUpgradeChoices: UpgradeSpec[] = [];
  private socket?: Socket;
  private lobbyOverlay?: HTMLDivElement;
  private lobbyRoomsEl?: HTMLDivElement;
  private lobbyStatusEl?: HTMLDivElement;
  private playerNameInput?: HTMLInputElement;
  private localUserId = '';
  private localSocketId = '';
  private isInMultiplayerRoom = false;
  private joinedRoomId = '';
  private localTeamKey = '';
  private localTeamName = '';
  private localTeamColorCss = '#36f0d2';
  private localTeamTint = 0x36f0d2;
  private latestRoomState?: RoomState;
  private lastNetworkSendAt = 0;
  private invasionMessageUntil = 0;
  private invasionMessage = '';
  private weaponSlots: WeaponKey[] = [];
  private weaponLevels: Record<WeaponKey, number> = {
    attackDrone: 0,
    healDrone: 0,
    rocketLauncher: 0,
    grenadeLauncher: 0,
    teslaEmitter: 0,
  };
  private weaponCooldowns: Record<WeaponKey, number> = {
    attackDrone: 0,
    healDrone: 0,
    rocketLauncher: 0,
    grenadeLauncher: 0,
    teslaEmitter: 0,
  };
  private weaponVisuals: Partial<Record<WeaponKey, Phaser.GameObjects.Image>> = {};

  public damageMultiplier = 1;
  public fireRateMultiplier = 1;
  public speedBonus = 0;
  public magnetRadius = 0;

  private hp = 120;
  private maxHp = 120;
  private xp = 0;
  private level = 1;
  private xpToNext = 28;
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
  };
  private activeBuffs: Record<BuffKey, number> = {
    overclock: 0,
    rapid: 0,
    barrier: 0,
    regen: 0,
  };
  private vehicleExpiresAt = 0;
  private targetRange = 560;
  private areaAlert = 0;
  private isChoosingUpgrade = false;
  private isGameOver = false;
  private lastAimAngle = 0;
  private nextEngineTrailAt = 0;

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
    this.physics.add.overlap(this.player, this.vehiclePods, this.handleVehiclePodPickup, undefined, this);
    this.physics.add.overlap(this.player, this.buffPickups, this.handleBuffPickup, undefined, this);

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

  private resetRunState() {
    this.damageMultiplier = 1;
    this.fireRateMultiplier = 1;
    this.speedBonus = 0;
    this.magnetRadius = 0;
    this.hp = 120;
    this.maxHp = 120;
    this.xp = 0;
    this.level = 1;
    this.xpToNext = 28;
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
    };
    this.activeBuffs = {
      overclock: 0,
      rapid: 0,
      barrier: 0,
      regen: 0,
    };
    this.vehicleExpiresAt = 0;
    this.targetRange = 560;
    this.areaAlert = 0;
    this.isChoosingUpgrade = false;
    this.isGameOver = false;
    this.lastAimAngle = 0;
    this.nextEngineTrailAt = 0;
    this.currentUpgradeChoices = [];
    this.weaponSlots = [];
    this.weaponLevels = {
      attackDrone: 0,
      healDrone: 0,
      rocketLauncher: 0,
      grenadeLauncher: 0,
      teslaEmitter: 0,
    };
    this.weaponCooldowns = {
      attackDrone: 0,
      healDrone: 0,
      rocketLauncher: 0,
      grenadeLauncher: 0,
      teslaEmitter: 0,
    };
    this.weaponVisuals = {};
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
      this.renderRoomList(rooms);
    });
    this.socket.on('room:state', (state: RoomState) => {
      this.latestRoomState = state;
    });
    this.socket.on('room:invasion', (payload: { wave: number }) => {
      this.handleInvasionWave(payload.wave);
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
            <div class="lobby-subtitle">输入名字，马上开战。10 分钟一局，积分最高阵营获胜。</div>
          </div>
          <button class="lobby-refresh" type="button">刷新</button>
        </div>
        <div class="lobby-row">
          <input class="lobby-name" maxlength="18" />
          <button class="lobby-quick" type="button">马上开战</button>
          <button class="lobby-create" type="button">开新房</button>
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
    this.playerNameInput.placeholder = '输入昵称';
    this.playerNameInput.value = savedName || `机兵${this.localUserId.slice(0, 4)}`;

    overlay.querySelector('.lobby-refresh')?.addEventListener('click', () => {
      this.socket?.emit('rooms:list');
    });
    overlay.querySelector('.lobby-create')?.addEventListener('click', () => {
      this.createRoom();
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
      meta.textContent = `${room.players}/${room.maxPlayers} 人   剩余 ${this.formatClock(
        room.remainingMs,
      )}   入侵 ${this.formatClock(room.nextInvasionMs)}`;
      info.append(title, meta);

      const join = document.createElement('button');
      join.type = 'button';
      join.textContent = '进入';
      join.addEventListener('click', () => this.joinRoom(room.id));

      item.append(info, join);
      this.lobbyRoomsEl?.appendChild(item);
    });
  }

  private createRoom() {
    if (!this.socket?.connected) {
      this.setLobbyStatus('还没有连接到房间服务器');
      return;
    }

    this.socket.emit('room:create', { name: this.getPlayerName() }, (response: any) => {
      if (!response?.ok) {
        this.setLobbyStatus(response?.error || '创建房间失败');
        return;
      }

      this.joinRoom(response.room.id);
    });
  }

  private quickJoinRoom() {
    if (!this.socket?.connected) {
      this.setLobbyStatus('还没有连接到服务器');
      return;
    }

    const name = this.getPlayerName();
    window.localStorage.setItem('mech-harvest-player-name', name);
    this.setLobbyStatus('正在匹配战区...');
    this.socket.emit(
      'room:quick-join',
      {
        userId: this.localUserId,
        name,
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
    this.latestRoomState = undefined;

    this.player.setPosition(player.x, player.y);
    this.applyVehicle('mech', false);
    this.player.setTint(this.localTeamTint);

    this.spawnInitialWorld();
    this.lobbyOverlay?.remove();
    this.lobbyOverlay = undefined;
    this.physics.resume();
  }

  private clearRunObjects() {
    [this.enemies, this.projectiles, this.chests, this.vehiclePods, this.buffPickups].forEach((group) => {
      group?.clear(true, true);
    });
    Object.values(this.weaponVisuals).forEach((visual) => visual?.destroy());
    this.enemyHud?.clear();
    this.targetRing?.clear();
  }

  private spawnInitialWorld() {
    for (let i = 0; i < 11; i += 1) {
      this.spawnEnemy(i < 6 ? 'drone' : 'stalker');
    }

    for (let i = 0; i < 4; i += 1) {
      this.spawnChestNearPlayer(360 + i * 130);
    }

    this.nextEnemySpawnAt = 900;
    this.nextChestAt = 10500;
  }

  private cssColorToNumber(color: string) {
    return Number.parseInt(color.replace('#', ''), 16);
  }

  private formatClock(ms: number) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
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
    this.invasionMessageUntil = this.elapsedMs + 4500;

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

  private handleRoomEnd(payload: {
    winner: { key: string; name: string; color: string; score: number };
    scores: Record<string, number>;
  }) {
    if (!this.isInMultiplayerRoom) {
      return;
    }

    this.isGameOver = true;
    this.physics.pause();

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
        `${payload.winner.name} 获胜   ${payload.winner.score} 分`,
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
      .text(width / 2, height / 2 + 58, '返回房间列表', {
        fontFamily: 'Inter, "Segoe UI", sans-serif',
        fontSize: '18px',
        color: '#e8f7f4',
      })
      .setOrigin(0.5);
    button.on('pointerdown', () => window.location.reload());
    container.add([overlay, title, detail, button, label]);
    this.gameOverLayer = container;
  }

  update(_time: number, delta: number) {
    this.drawHud();
    this.drawTargetRing();

    if (!this.isInMultiplayerRoom) {
      return;
    }

    if (this.isGameOver || this.isChoosingUpgrade) {
      this.handleUpgradeHotkeys();
      return;
    }

    this.elapsedMs += delta;
    const deltaSeconds = delta / 1000;

    if (this.currentVehicle !== 'mech' && this.elapsedMs >= this.vehicleExpiresAt) {
      this.applyVehicle('mech', true);
    }

    this.updateBuffs(deltaSeconds);
    this.handleTargetRangeInput();
    this.updatePlayer(deltaSeconds);
    this.updateProjectiles(delta);
    this.updateEnemies(deltaSeconds);
    this.updateSpawns();
    this.autoFire();
    this.updateWeaponSystems(deltaSeconds);
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

    for (let i = 0; i < 80; i += 1) {
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
    const moveX =
      (this.keys.D.isDown || this.cursors.right?.isDown ? 1 : 0) -
      (this.keys.A.isDown || this.cursors.left?.isDown ? 1 : 0);
    const moveY =
      (this.keys.S.isDown || this.cursors.down?.isDown ? 1 : 0) -
      (this.keys.W.isDown || this.cursors.up?.isDown ? 1 : 0);

    const length = Math.hypot(moveX, moveY);
    const speed = vehicle.speed + this.speedBonus + this.getBuffSpeedBonus();

    if (length > 0) {
      const vx = (moveX / length) * speed;
      const vy = (moveY / length) * speed;
      this.player.setVelocity(vx, vy);
      this.lastAimAngle = Math.atan2(vy, vx);
      this.emitEngineTrail(this.lastAimAngle, vehicle);
    } else {
      this.player.setVelocity(0, 0);
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
      this.targetRange = clamp(
        this.targetRange - TARGET_RANGE_STEP,
        TARGET_RANGE_MIN,
        TARGET_RANGE_MAX,
      );
    }

    if (Phaser.Input.Keyboard.JustDown(this.rangeKeys.E)) {
      this.targetRange = clamp(
        this.targetRange + TARGET_RANGE_STEP,
        TARGET_RANGE_MIN,
        TARGET_RANGE_MAX,
      );
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
      }
    });
  }

  private updateWeaponVisuals() {
    const droneWeapons = this.weaponSlots.filter(
      (weapon) => weapon === 'attackDrone' || weapon === 'healDrone',
    );

    droneWeapons.forEach((weapon, index) => {
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
      .setScale(0.95);
    this.weaponVisuals[weapon] = visual;
    return visual;
  }

  private updateAttackDrone() {
    const level = this.getWeaponLevel('attackDrone');
    if (level <= 0 || this.elapsedMs < this.weaponCooldowns.attackDrone) {
      return;
    }

    const target = this.findNearestTarget(this.targetRange + 90 + level * 24);
    if (!target) {
      return;
    }

    const visual = this.getWeaponVisual('attackDrone');
    const angle = Phaser.Math.Angle.Between(visual.x, visual.y, target.x, target.y);
    const shots = level >= 4 ? 2 : 1;

    for (let i = 0; i < shots; i += 1) {
      const offset = (i - (shots - 1) / 2) * 0.12;
      this.spawnProjectileFrom({
        x: visual.x + Math.cos(angle) * 16,
        y: visual.y + Math.sin(angle) * 16,
        angle: angle + offset,
        texture: 'shot-pulse',
        damage: (8 + level * 5) * this.getDamageMultiplier(),
        projectileSpeed: 720 + level * 30,
        ttl: 900,
        aoe: level >= 5 ? 18 : 0,
        scale: 0.8,
        tint: WEAPONS.attackDrone.color,
        trailColor: 0x36f0d2,
        impactColor: 0x9fffe0,
      });
    }
    this.drawArcBolt(visual.x, visual.y, target.x, target.y, 0x36f0d2, 1.4, 110);

    this.weaponCooldowns.attackDrone =
      this.elapsedMs + Math.max(170, (900 - level * 85) * this.getFireRateMultiplier());
  }

  private updateHealDrone(deltaSeconds: number) {
    const level = this.getWeaponLevel('healDrone');
    if (level <= 0) {
      return;
    }

    if (level >= 4) {
      this.hp = clamp(this.hp + 1.8 * deltaSeconds, 0, this.maxHp);
    }

    if (this.elapsedMs < this.weaponCooldowns.healDrone) {
      return;
    }

    const heal = 7 + level * 6;
    this.hp = clamp(this.hp + heal, 0, this.maxHp);
    const visual = this.getWeaponVisual('healDrone');
    this.flashAt(visual.x, visual.y, WEAPONS.healDrone.color, 10 + level * 2);
    this.healPulse(visual.x, visual.y, 46 + level * 8);
    this.weaponCooldowns.healDrone = this.elapsedMs + Math.max(1900, 5200 - level * 420);
  }

  private updateRocketLauncher() {
    const level = this.getWeaponLevel('rocketLauncher');
    if (level <= 0 || this.elapsedMs < this.weaponCooldowns.rocketLauncher) {
      return;
    }

    const target = this.findNearestTarget(this.targetRange + 160 + level * 34);
    if (!target) {
      return;
    }

    const shots = level >= 5 ? 2 : 1;
    const baseAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
    for (let i = 0; i < shots; i += 1) {
      const offset = (i - (shots - 1) / 2) * 0.16;
      this.spawnProjectileFrom({
        x: this.player.x + Math.cos(baseAngle + offset) * 34,
        y: this.player.y + Math.sin(baseAngle + offset) * 34,
        angle: baseAngle + offset,
        texture: 'shot-missile',
        damage: (26 + level * 18) * this.getDamageMultiplier(),
        projectileSpeed: 520 + level * 36,
        ttl: 1250,
        aoe: 64 + level * 13,
        scale: 1.08,
        tint: WEAPONS.rocketLauncher.color,
        trailColor: 0xff6961,
        impactColor: 0xffd166,
      });
    }
    this.cameras.main.shake(70, 0.0025);

    this.addThreatNoise(this.player.x, this.player.y, 34 + level * 3, 560 + level * 30);
    this.weaponCooldowns.rocketLauncher =
      this.elapsedMs + Math.max(560, (2100 - level * 180) * this.getFireRateMultiplier());
  }

  private updateGrenadeLauncher() {
    const level = this.getWeaponLevel('grenadeLauncher');
    if (level <= 0 || this.elapsedMs < this.weaponCooldowns.grenadeLauncher) {
      return;
    }

    const target = this.findNearestTarget(this.targetRange + 120 + level * 24);
    if (!target) {
      return;
    }

    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
    const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, target.x, target.y);
    this.spawnProjectileFrom({
      x: this.player.x + Math.cos(angle) * 26,
      y: this.player.y + Math.sin(angle) * 26,
      angle,
      texture: 'shot-grenade',
      damage: (18 + level * 15) * this.getDamageMultiplier(),
      projectileSpeed: 330 + level * 24,
      ttl: clamp(distance * 2.1, 560, 1150),
      aoe: 82 + level * 18,
      scale: 1.05,
      explodeOnExpire: true,
      tint: WEAPONS.grenadeLauncher.color,
      trailColor: 0xffd166,
      impactColor: 0xffd166,
    });

    this.addThreatNoise(this.player.x, this.player.y, 24 + level * 3, 480 + level * 28);
    this.weaponCooldowns.grenadeLauncher =
      this.elapsedMs + Math.max(700, (2600 - level * 210) * this.getFireRateMultiplier());
  }

  private updateTeslaEmitter() {
    const level = this.getWeaponLevel('teslaEmitter');
    if (level <= 0 || this.elapsedMs < this.weaponCooldowns.teslaEmitter) {
      return;
    }

    const targets = this.getTargetsInRange(230 + level * 42, 1 + Math.floor(level / 2));
    if (targets.length === 0) {
      return;
    }

    targets.forEach((target, index) => {
      const damage = (12 + level * 8) * this.getDamageMultiplier() * (1 - index * 0.18);
      this.damageTarget(target, damage);
      this.drawArcBolt(
        index === 0 ? this.player.x : targets[index - 1].x,
        index === 0 ? this.player.y : targets[index - 1].y,
        target.x,
        target.y,
        WEAPONS.teslaEmitter.color,
        2 + level * 0.45,
        180,
      );
    });

    this.weaponCooldowns.teslaEmitter =
      this.elapsedMs + Math.max(380, (1300 - level * 110) * this.getFireRateMultiplier());
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

      this.emitProjectileTrail(projectile);
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
      this.splashDamageChests(x, y, aoe, damage);
      this.flashAt(x, y, projectile.getData('impactColor') as number, Math.max(14, aoe / 4));
      this.shockwave(x, y, aoe, projectile.getData('impactColor') as number);
      this.cameras.main.shake(90, clamp(aoe / 36000, 0.002, 0.006));
    }

    projectile.destroy();
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

      const decayRate = distanceToPlayer > spec.noticeRadius ? spec.decay * 1.35 : spec.decay * 0.34;
      aggro = clamp(aggro - decayRate * deltaSeconds, 0, 100);
      enemy.setData('aggro', aggro);

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

      enemy.setTint(this.getEnemyTint(enemy));

      aggroTotal += aggro;
      activeCount += 1;
    });

    const averageAggro = activeCount > 0 ? aggroTotal / activeCount : 0;
    this.areaAlert = clamp(averageAggro * 0.58 + hunterCount * 5.5, 0, 100);
  }

  private getEnemyTint(enemy: Phaser.Physics.Arcade.Sprite) {
    const tier = enemy.getData('tier') as EnemyTier | undefined;
    return tier ? ENEMY_TIERS[tier].color : 0xe8f7f4;
  }

  private getEnemySpeed(enemy: Phaser.Physics.Arcade.Sprite, fallback: EnemySpec) {
    return (enemy.getData('speed') as number | undefined) ?? fallback.speed;
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
    this.damagePlayer(enemy.getData('damage') as number);
    this.flashAt(enemy.x, enemy.y, 0xff6961, 5);
  }

  private damagePlayer(amount: number) {
    const shieldMultiplier = this.isBuffActive('barrier') ? 0.55 : 1;
    const taken = amount * this.getCurrentVehicleSpec().damageTaken * shieldMultiplier;
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

    this.damageEnemy(enemy, damage);
    this.impactBurst(hitX, hitY, impactColor, aoe > 0 ? 1.35 : 0.9);
    projectile.destroy();

    if (aoe > 0) {
      this.splashDamage(hitX, hitY, aoe, damage * 0.62);
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
    projectile.destroy();

    this.damageChest(chest, damage);
    this.impactBurst(hitX, hitY, impactColor, aoe > 0 ? 1.2 : 0.8);

    if (aoe > 0) {
      this.splashDamage(hitX, hitY, aoe, damage * 0.62);
      this.splashDamageChests(hitX, hitY, aoe, damage * 0.62, chest);
      this.flashAt(hitX, hitY, impactColor, Math.max(10, aoe / 4));
      this.shockwave(hitX, hitY, aoe, impactColor);
    }
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

  private breakChest(chest: Phaser.Physics.Arcade.Image) {
    if (!chest.active || chest.getData('broken')) {
      return;
    }

    chest.setData('broken', true);
    const vehicle = Phaser.Utils.Array.GetRandom(VEHICLE_ORDER);
    this.spawnVehiclePod(chest.x, chest.y, vehicle);
    this.flashAt(chest.x, chest.y, 0xffd166, 14);
    this.shockwave(chest.x, chest.y, 86, 0xffd166);
    this.addThreatNoise(chest.x, chest.y, 24, 420);
    chest.destroy();
  }

  private killEnemy(enemy: Phaser.Physics.Arcade.Sprite) {
    const kind = enemy.getData('kind') as EnemyKind;
    const tier = enemy.getData('tier') as EnemyTier;
    const xp = enemy.getData('xp') as number;
    this.kills += 1;
    this.gainXp(xp);
    this.addTeamScore(xp);
    this.flashAt(enemy.x, enemy.y, ENEMY_TIERS[tier].color, 8);
    if (tier === 'purple' || tier === 'red') {
      this.shockwave(enemy.x, enemy.y, tier === 'red' ? 150 : 105, ENEMY_TIERS[tier].color);
    }

    if (Phaser.Math.Between(1, 100) <= 5) {
      this.spawnChestAt(enemy.x, enemy.y);
    }

    if (tier === 'purple' || tier === 'red') {
      this.spawnBuffAt(enemy.x, enemy.y);
    }

    enemy.destroy();
  }

  private gainXp(amount: number) {
    this.xp += amount;

    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level += 1;
      this.xpToNext = Math.floor(this.xpToNext * 1.22 + 10);
      this.showUpgradeChoices();
      break;
    }
  }

  private showUpgradeChoices() {
    if (this.isChoosingUpgrade || this.isGameOver) {
      return;
    }

    this.isChoosingUpgrade = true;
    this.physics.pause();

    const choices = this.pickUpgradeChoices();
    this.currentUpgradeChoices = choices;
    const width = this.scale.width;
    const height = this.scale.height;
    const compact = width < 820;
    const cardWidth = compact ? Math.min(300, width - 48) : 246;
    const cardHeight = compact ? 96 : 128;
    const gap = compact ? 12 : 22;
    const startX = compact ? width / 2 : width / 2 - cardWidth - gap;
    const startY = compact ? height / 2 - cardHeight - gap : height / 2 + 10;
    const titleY = compact ? Math.max(44, startY - cardHeight / 2 - 30) : height / 2 - 132;
    const container = this.add.container(0, 0).setScrollFactor(0).setDepth(1200);

    const overlay = this.add.rectangle(0, 0, width, height, 0x050709, 0.68).setOrigin(0);
    const title = this.add
      .text(width / 2, titleY, `等级 ${this.level}`, {
        fontFamily: 'Inter, "Segoe UI", sans-serif',
        fontSize: '30px',
        color: '#e8f7f4',
      })
      .setOrigin(0.5);
    const prompt = this.add
      .text(width / 2, titleY + 38, '点击卡片，或按 1 / 2 / 3 选择升级', {
        fontFamily: 'Inter, "Segoe UI", sans-serif',
        fontSize: '16px',
        color: '#9fffe0',
      })
      .setOrigin(0.5);

    container.add([overlay, title, prompt]);

    choices.forEach((choice, index) => {
      const x = compact ? startX : startX + index * (cardWidth + gap);
      const y = compact ? startY + index * (cardHeight + gap) : startY;
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

      card.on('pointerover', () => card.setFillStyle(0x17252a, 1));
      card.on('pointerout', () => card.setFillStyle(0x111a1f, 0.98));
      card.on('pointerdown', () => this.applyUpgrade(choice));
      container.add([card, number, name, detail]);
    });

    this.modal = container;
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

  private getActiveBuffText() {
    const active = BUFF_ORDER.filter((buff) => this.isBuffActive(buff)).map((buff) => {
      const remaining = Math.ceil((this.activeBuffs[buff] - this.elapsedMs) / 1000);
      return `${BUFFS[buff].name}${remaining}s`;
    });

    return active.length > 0 ? active.join('  ') : '无临时增益';
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

    WEAPON_ORDER.forEach((weapon) => {
      const spec = WEAPONS[weapon];
      const level = this.getWeaponLevel(weapon);

      if (level > 0 && level < spec.maxLevel) {
        upgrades.push({
          key: `weapon-upgrade-${weapon}`,
          title: `${spec.name} Lv.${level + 1}`,
          detail: `升级已有武器：${spec.detail}`,
          apply: (scene) => {
            scene.equipOrUpgradeWeapon(weapon);
          },
        });
        return;
      }

      if (level === 0 && this.weaponSlots.length < MAX_WEAPON_SLOTS) {
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

    this.weaponLevels[weapon] = clamp(currentLevel + 1, 1, WEAPONS[weapon].maxLevel);
  }

  private getWeaponLevel(weapon: WeaponKey) {
    return this.weaponLevels[weapon] ?? 0;
  }

  private getWeaponSlotText() {
    if (this.weaponSlots.length === 0) {
      return `武器槽 0/${MAX_WEAPON_SLOTS}`;
    }

    const weapons = this.weaponSlots.map((weapon) => {
      return `${WEAPONS[weapon].name}Lv.${this.getWeaponLevel(weapon)}`;
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
    this.modal?.destroy(true);
    this.modal = undefined;
    this.currentUpgradeChoices = [];
    this.isChoosingUpgrade = false;
    this.physics.resume();
  }

  private spawnEnemy(preferredKind?: EnemyKind, forcedTier?: EnemyTier) {
    const kind = preferredKind ?? this.pickEnemyKind();
    const spec = ENEMIES[kind];
    const tier = forcedTier ?? this.pickEnemyTier();
    const tierSpec = ENEMY_TIERS[tier];
    const position = this.pickSpawnPosition();
    const enemy = this.physics.add.sprite(position.x, position.y, spec.texture);
    enemy.setDepth(18);
    enemy.setTint(tierSpec.color);
    enemy.setCollideWorldBounds(true);
    const timeHpBonus = Math.floor(this.elapsedMs / 45000) * 12;
    const maxHp = Math.round((spec.hp + timeHpBonus) * tierSpec.hpMultiplier);
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

    const body = enemy.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(Math.max(20, enemy.width * 0.72), Math.max(20, enemy.height * 0.72), true);

    this.enemies.add(enemy);
    this.assignPatrolTarget(enemy, spec);
    return enemy;
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
      return roll < 72 ? 'drone' : 'stalker';
    }

    if (seconds < 70) {
      if (roll < 42) return 'drone';
      if (roll < 78) return 'stalker';
      return 'warden';
    }

    if (roll < 28) return 'drone';
    if (roll < 58) return 'stalker';
    if (roll < 86) return 'warden';
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

  private applyVehicle(vehicle: VehicleKey, burst: boolean) {
    if (vehicle !== 'mech') {
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

    if (vehicle === 'mech') {
      this.vehicleExpiresAt = 0;
    } else {
      this.vehicleExpiresAt = this.elapsedMs + 28000 + (this.vehicleRanks[vehicle] - 1) * 4500;
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
      aoe: base.aoe > 0 ? base.aoe + rankBonus * 10 : base.aoe,
    };
  }

  private getVehicleRank(vehicle: VehicleKey) {
    if (vehicle === 'mech') {
      return 1;
    }

    return Math.max(1, this.vehicleRanks[vehicle]);
  }

  private findNearestTarget(range: number) {
    let nearest: Phaser.Physics.Arcade.Sprite | Phaser.Physics.Arcade.Image | undefined;
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

    return nearest;
  }

  private getTargetsInRange(
    range: number,
    limit: number,
  ): Array<Phaser.Physics.Arcade.Sprite | Phaser.Physics.Arcade.Image> {
    const targets: Array<{
      target: Phaser.Physics.Arcade.Sprite | Phaser.Physics.Arcade.Image;
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

    return targets
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit)
      .map((entry) => entry.target);
  }

  private damageTarget(
    target: Phaser.Physics.Arcade.Sprite | Phaser.Physics.Arcade.Image,
    damage: number,
  ) {
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
      const x = enemy.x - 19;
      const y = enemy.y - enemy.displayHeight / 2 - 13;

      this.enemyHud.fillStyle(ENEMY_TIERS[tier].color, 1);
      this.enemyHud.fillRect(x - 6, y, 4, 12);
      this.enemyHud.fillStyle(0x050709, 0.82);
      this.enemyHud.fillRect(x, y, 38, 4);
      this.enemyHud.fillStyle(aggro > 62 ? 0xff6961 : aggro > 24 ? 0xffd166 : 0x36f0d2, 1);
      this.enemyHud.fillRect(x, y, 38 * (aggro / 100), 4);
      this.enemyHud.fillStyle(0xa7e65d, 0.95);
      this.enemyHud.fillRect(x, y + 5, 38 * clamp(hp / maxHp, 0, 1), 3);
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
    const remainingText = this.latestRoomState
      ? this.formatClock(this.latestRoomState.remainingMs)
      : `${minutes}:${restSeconds}`;
    const teamScore = this.latestRoomState?.scores[this.localTeamKey] ?? 0;

    this.hud.clear();
    this.hud.fillStyle(0x050709, 0.78);
    this.hud.fillRoundedRect(16, 16, 430, 176, 8);
    this.hud.lineStyle(1, 0x36f0d2, 0.52);
    this.hud.strokeRoundedRect(16, 16, 430, 176, 8);

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
    const statText = `火力 x${this.getDamageMultiplier().toFixed(2)}   冷却 x${this.getFireRateMultiplier().toFixed(
      2,
    )}`;
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

    if (this.invasionMessage && this.elapsedMs < this.invasionMessageUntil) {
      this.hud.fillStyle(0x050709, 0.76);
      this.hud.fillRoundedRect(width / 2 - 150, 20, 300, 42, 8);
      this.hud.lineStyle(1, 0xff6961, 0.85);
      this.hud.strokeRoundedRect(width / 2 - 150, 20, 300, 42, 8);
    }

    const invasion = this.children.getByName('invasion-readout') as Phaser.GameObjects.Text | null;
    const showInvasion = this.invasionMessage && this.elapsedMs < this.invasionMessageUntil;
    if (invasion) {
      invasion.setVisible(Boolean(showInvasion));
      invasion.setText(this.invasionMessage);
      invasion.setPosition(width / 2, 41);
    } else {
      this.add
        .text(width / 2, 41, this.invasionMessage, {
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
  }

  private drawMiniMap(x: number, y: number, size: number) {
    if (!this.isInMultiplayerRoom) {
      return;
    }

    this.hud.fillStyle(0x050709, 0.78);
    this.hud.fillRoundedRect(x, y, size, size, 8);
    this.hud.lineStyle(1, 0x36f0d2, 0.5);
    this.hud.strokeRoundedRect(x, y, size, size, 8);

    const toMiniX = (worldX: number) => x + clamp(worldX / WORLD_WIDTH, 0, 1) * size;
    const toMiniY = (worldY: number) => y + clamp(worldY / WORLD_HEIGHT, 0, 1) * size;

    this.hud.fillStyle(this.localTeamTint, 1);
    this.hud.fillCircle(toMiniX(this.player.x), toMiniY(this.player.y), 4);

    const teammates =
      this.latestRoomState?.players.filter((player) => {
        return (
          player.socketId !== this.localSocketId &&
          player.teamKey === this.localTeamKey &&
          player.alive
        );
      }) ?? [];

    teammates.forEach((player) => {
      this.hud.fillStyle(this.cssColorToNumber(player.color), 0.92);
      this.hud.fillCircle(toMiniX(player.x), toMiniY(player.y), 3);
    });

    this.hud.lineStyle(1, 0xe8f7f4, 0.22);
    this.hud.lineBetween(x + size / 2, y + 6, x + size / 2, y + size - 6);
    this.hud.lineBetween(x + 6, y + size / 2, x + size - 6, y + size / 2);
  }

  private getProjectileColor(texture: string) {
    if (texture === 'shot-shell') return 0xffd166;
    if (texture === 'shot-missile') return 0xff6961;
    if (texture === 'shot-rail') return 0x5bc0ff;
    if (texture === 'shot-grenade') return 0xffd166;
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
    this.physics.pause();

    const width = this.scale.width;
    const height = this.scale.height;
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
    const button = this.add
      .rectangle(width / 2, height / 2 + 58, 176, 48, 0x111a1f, 1)
      .setStrokeStyle(2, 0x36f0d2)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(width / 2, height / 2 + 58, '重新部署', {
        fontFamily: 'Inter, "Segoe UI", sans-serif',
        fontSize: '18px',
        color: '#e8f7f4',
      })
      .setOrigin(0.5);

    button.on('pointerdown', () => this.scene.restart());
    this.input.keyboard?.once('keydown-SPACE', () => this.scene.restart());
    container.add([overlay, title, stats, button, label]);
    this.gameOverLayer = container;
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

new Phaser.Game(config);
