// 打地鼠 · Phaser 3.90.0 · 移动端竖屏
// 限时 + 难度递增 + 地鼠/炸弹 + 金币道具 + 等级
'use strict';

// ============ 常量 ============
const GAME_TIME = 30;            // 每局 30 秒
const POINTS_PER_MOLE = 1;      // 打中好地鼠 +1
const BOMB_PENALTY = 2;         // 点炸弹 -2
const BOMB_TIME_PENALTY = 2;    // 点炸弹扣 2s
const COIN_EVERY = 10;          // 每 10 分得 1 金币
const POINTS_PER_LEVEL = 50;    // 每 50 分升 1 级
const PROP_COST = 5;
const PROP_CD = 10000;          // 道具冷却 10s
const HOLES = [];              // 洞位置（420×800 竖屏）
(function buildHoles() {
  const cols = [135, 285], rows = [210, 360, 510];
  for (const y of rows) for (const x of cols) HOLES.push({ x, y });
})();

function difficulty(level) {
  return {
    popDuration: Math.max(700, 1500 - (level - 1) * 110),   // 冒头停留，越级越短
    spawnInterval: Math.max(450, 950 - (level - 1) * 70),    // 刷怪间隔，越级越快
    maxSimultaneous: Math.min(4, 1 + Math.floor(level / 2)), // 同时在场数
    bombChance: Math.min(0.42, 0.10 + level * 0.04),         // 炸弹占比，越级越高
  };
}

// 程序化纹理
function createTextures(scene) {
  let g = scene.make.graphics({ x: 0, y: 0, add: false });
  // 洞（泥土）
  g.fillStyle(0x3a2a1a, 1);
  g.fillEllipse(0, 0, 100, 54);
  g.fillStyle(0x2a1d10, 1);
  g.fillEllipse(0, 0, 78, 40);
  g.generateTexture('hole', 100, 54);
  g.destroy();

  // 好地鼠
  g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0x8a6a3a, 1);
  g.fillCircle(35, 42, 30);            // 身体
  g.fillCircle(35, 20, 18);            // 头
  g.fillStyle(0xd9b87a, 1);
  g.fillCircle(35, 42, 16);            // 肚皮
  g.fillStyle(0x222, 1);
  g.fillCircle(28, 18, 3); g.fillCircle(42, 18, 3); // 眼睛
  g.fillCircle(35, 26, 4);             // 鼻子
  g.fillStyle(0x8a6a3a, 1);
  g.fillCircle(14, 30, 8); g.fillCircle(56, 30, 8); // 手
  g.generateTexture('mole', 70, 74);
  g.destroy();

  // 炸弹
  g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0x2a2f3a, 1);
  g.fillCircle(35, 44, 28);
  g.lineStyle(4, 0x6b5210, 1);
  g.beginPath(); g.moveTo(40, 20); g.lineTo(52, 8); g.strokePath(); // 引信
  g.fillStyle(0xffcf3f, 1);
  g.fillCircle(54, 6, 4);
  g.fillStyle(0xff5b5b, 0.5);
  g.fillCircle(28, 38, 8);
  g.generateTexture('bomb', 70, 74);
  g.destroy();
}

// ============ 场景（class 写法，Phaser 标准最稳） ============
class Boot extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' });
  }
  create() {
    createTextures(this);
    this.scene.start('Start');
  }
}

class Start extends Phaser.Scene {
  constructor() {
    super({ key: 'Start' });
  }
  create() {
    this.cameras.main.setBackgroundColor(0x1a1f2e);
    const best = Number(localStorage.getItem('wm_best') || 0);
    const coins = Number(localStorage.getItem('wm_coins') || 0);
    this.add.text(210, 180, '🔨 打地鼠', { color: '#fff', fontSize: '44px', fontStyle: 'bold' }).setOrigin(0.5).setDepth(10);
    this.add.text(0, 0, '', {
      color: '#c8d2ec', fontSize: '19px', align: 'center', lineSpacing: 8,
    }).setOrigin(0.5).setPosition(210, 320).setDepth(10).setText(
      '限时 ' + GAME_TIME + ' 秒，点冒头的地鼠\n\n' +
      '🔵 好地鼠 +1\n' +
      '💣 炸弹 -2 且扣 2 秒\n\n' +
      '每 10 分得 1 金币，可买道具\n' +
      '每 50 分升 1 级：地鼠更快、炸弹更多\n\n' +
      '最高分 ' + best + '  ·  金币 ' + coins
    );
    const btn = this.add.rectangle(210, 560, 220, 74, 0x4d8bff, 1).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.start('Game'));
    this.add.text(210, 560, '开 始', { color: '#fff', fontSize: '30px', fontStyle: 'bold' }).setOrigin(0.5).setDepth(11);
    this.add.text(210, 640, '竖屏游玩 · 连击爽点', { color: '#6b7a9e', fontSize: '15px' }).setOrigin(0.5);
  }
}

class Game extends Phaser.Scene {
  constructor() {
    super({ key: 'Game' });
    this.score = 0;
    this.coins = 0;
    this.pointsSinceCoin = 0;
    this.level = 1;
    this.timeLeft = GAME_TIME;
    this.running = true;
    this.moleMap = {};
    this.props = [];
    this.spawner = null;
    this.timer = null;
    this._msg = null;
  }

  create() {
    this.score = 0;
    this.coins = Number(localStorage.getItem('wm_coins') || 0);
    this.pointsSinceCoin = 0;
    this.level = 1;
    this.timeLeft = GAME_TIME;
    this.running = true;
    this.moleMap = {};
    this.props = [];
    this._msg = null;

    this.cameras.main.setBackgroundColor(0x1a1f2e);
    // 洞（静态）
    HOLES.forEach((h) => this.add.image(h.x, h.y, 'hole').setDepth(1));

    // HUD
    this.hudLevel = this.add.text(20, 18, 'Lv ' + this.level, { color: '#ffcf3f', fontSize: '18px', fontStyle: 'bold' }).setDepth(5);
    this.hudTime = this.add.text(400, 18, this.timeLeft + 's', { color: '#5bff9f', fontSize: '20px', fontStyle: 'bold' }).setOrigin(1, 0).setDepth(5);
    this.hudScore = this.add.text(210, 34, '0', { color: '#fff', fontSize: '34px', fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(5);
    this.add.text(210, 68, '分数', { color: '#6b7a9e', fontSize: '13px' }).setOrigin(0.5, 0).setDepth(5);
    this.hudCoins = this.add.text(210, 92, '🪙 ' + this.coins, { color: '#ffd77a', fontSize: '17px' }).setOrigin(0.5, 0).setDepth(5);

    this.buildPropUI();

    // 刷怪 + 倒计时
    this.spawner = this.time.addEvent({ delay: difficulty(this.level).spawnInterval, loop: true, callback: () => this.spawn() });
    this.timer = this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tick() });
  }

  spawn() {
    if (!this.running) return;
    const d = difficulty(this.level);
    // 场上不能超过 maxSimultaneous
    if (Object.keys(this.moleMap).length >= d.maxSimultaneous) return;
    // 选一个空闲洞
    const free = HOLES.map((_, i) => i).filter((i) => !this.moleMap[i]);
    if (free.length === 0) return;
    const hi = free[Math.floor(Math.random() * free.length)];
    const isBomb = Math.random() < d.bombChance;
    const key = isBomb ? 'bomb' : 'mole';
    const h = HOLES[hi];
    const img = this.add.image(h.x, h.y, key).setDepth(2).setScale(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.hit(hi, img));
    const ent = { img, isBomb, hi, dead: false };
    this.moleMap[hi] = ent;
    // 冒头
    const slowMul = this.props[0] && this.time.now < this.props[0].activeUntil ? 1.8 : 1;
    this.tweens.add({ targets: img, scale: 1, duration: 120, ease: 'Back.easeOut',
      onComplete: () => {
        this.time.delayedCall(d.popDuration * slowMul, () => {
          if (ent.dead || !this.moleMap[hi]) return;
          delete this.moleMap[hi];
          this.tweens.add({ targets: img, scale: 0, duration: 120, ease: 'Quad.easeIn', onComplete: () => img.destroy() });
        });
      } });
  }

  hit(hi, img) {
    const ent = this.moleMap[hi];
    if (!ent || ent.dead) return;
    ent.dead = true;
    delete this.moleMap[hi];
    if (ent.isBomb) {
      this.score = Math.max(0, this.score - BOMB_PENALTY);
      this.timeLeft = Math.max(0, this.timeLeft - BOMB_TIME_PENALTY);
      this.hudScore.setText(String(this.score));
      this.hudTime.setText(Math.ceil(this.timeLeft) + 's');
      this.boomFx(img);
    } else {
      let pts = POINTS_PER_MOLE;
      if (this.props[1] && this.time.now < this.props[1].activeUntil) pts *= 2; // 双倍
      this.addScore(pts);
      this.hitFx(img);
    }
    img.destroy();
  }

  addScore(pts) {
    this.score += pts;
    this.pointsSinceCoin += pts;
    while (this.pointsSinceCoin >= COIN_EVERY) { this.pointsSinceCoin -= COIN_EVERY; this.coins += 1; }
    this.hudScore.setText(String(this.score));
    this.hudCoins.setText('🪙 ' + this.coins);
    // 升级
    const newLevel = Math.floor(this.score / POINTS_PER_LEVEL) + 1;
    if (newLevel > this.level) {
      this.level = newLevel;
      this.hudLevel.setText('Lv ' + this.level);
      const d = difficulty(this.level);
      this.spawner.reset({ delay: d.spawnInterval });
      this.flashMsg('⬆ 升到 Lv' + this.level + '，更快了！', '#ffcf3f');
    }
  }

  tick() {
    if (!this.running) return;
    this.timeLeft -= 1;
    this.hudTime.setText(Math.max(0, this.timeLeft) + 's');
    if (this.timeLeft <= 0) this.endGame();
  }

  // ===== 道具 UI =====
  buildPropUI() {
    const defs = [
      { name: '减速', color: 0x5bff9f, cost: PROP_COST },
      { name: '双倍', color: 0xffcf3f, cost: PROP_COST },
      { name: '清屏', color: 0xff5b5b, cost: PROP_COST },
    ];
    const xs = [110, 210, 310], y = 720;
    this.props = defs.map((def, i) => {
      const x = xs[i];
      const btn = this.add.rectangle(x, y, 78, 64, def.color, 0.18).setStrokeStyle(2, def.color).setInteractive({ useHandCursor: true });
      const label = this.add.text(x, y - 12, def.name, { color: def.color, fontSize: '17px', fontStyle: 'bold' }).setOrigin(0.5);
      const costT = this.add.text(x, y + 14, def.cost + ' 🪙', { color: '#ffd77a', fontSize: '14px' }).setOrigin(0.5);
      btn.on('pointerdown', () => this.useProp(i));
      return { btn, label, costT, activeUntil: 0, cdUntil: 0 };
    });
  }

  useProp(i) {
    if (!this.running) return;
    const p = this.props[i];
    if (this.time.now < p.cdUntil || this.coins < PROP_COST) return;
    this.coins -= PROP_COST;
    this.hudCoins.setText('🪙 ' + this.coins);
    p.cdUntil = this.time.now + PROP_CD;
    p.btn.setAlpha(0.3);
    this.time.delayedCall(PROP_CD, () => { p.btn.setAlpha(1); });
    if (i === 0) { p.activeUntil = this.time.now + 3000; this.flashMsg('🐌 减速 3 秒：地鼠停留更久', '#5bff9f'); }
    if (i === 1) { p.activeUntil = this.time.now + 3000; this.flashMsg('✋ 双倍 3 秒：得分 ×2', '#ffcf3f'); }
    if (i === 2) { this.clearBombs(); this.flashMsg('💥 清屏：移除所有炸弹 +4s', '#ff5b5b'); this.timeLeft += 4; this.hudTime.setText(Math.ceil(this.timeLeft) + 's'); }
  }

  clearBombs() {
    Object.keys(this.moleMap).forEach((k) => {
      const ent = this.moleMap[k];
      if (ent.isBomb) {
        ent.dead = true;
        delete this.moleMap[k];
        this.boomFx(ent.img);
        this.tweens.add({ targets: ent.img, scale: 0, duration: 150, onComplete: () => ent.img.destroy() });
      }
    });
  }

  // ===== 特效 =====
  hitFx(img) {
    const t = this.add.text(img.x, img.y - 40, '+1', { color: '#5bff9f', fontSize: '22px', fontStyle: 'bold' }).setOrigin(0.5).setDepth(8);
    this.tweens.add({ targets: t, y: t.y - 30, alpha: 0, duration: 500, onComplete: () => t.destroy() });
  }
  boomFx(img) {
    const t = this.add.text(img.x, img.y - 40, '-2 💥', { color: '#ff5b5b', fontSize: '22px', fontStyle: 'bold' }).setOrigin(0.5).setDepth(8);
    this.tweens.add({ targets: t, y: t.y - 30, alpha: 0, duration: 500, onComplete: () => t.destroy() });
  }
  flashMsg(msg, color) {
    if (this._msg) this._msg.destroy();
    this._msg = this.add.text(210, 660, msg, { color, fontSize: '17px', fontStyle: 'bold' }).setOrigin(0.5).setDepth(9).setAlpha(0);
    this.tweens.add({ targets: this._msg, alpha: 1, duration: 150, onComplete: () =>
      this.tweens.add({ targets: this._msg, alpha: 0, duration: 400, delay: 900, onComplete: () => { this._msg = null; } }) });
  }

  endGame() {
    if (!this.running) return;
    this.running = false;
    localStorage.setItem('wm_coins', String(this.coins));
    const best = Number(localStorage.getItem('wm_best') || 0);
    if (this.score > best) localStorage.setItem('wm_best', String(this.score));
    this.scene.start('End', { p: this.score, coins: this.coins, level: this.level, record: this.score >= best && this.score > 0 });
  }
}

class End extends Phaser.Scene {
  constructor() {
    super({ key: 'End' });
  }
  init(data) {
    this.resultData = data || { p: 0, coins: 0, level: 1, record: false };
  }
  create() {
    this.cameras.main.setBackgroundColor(0x1a1f2e);
    const { p, level, record } = this.resultData;
    const totalCoins = Number(localStorage.getItem('wm_coins') || 0);
    this.add.text(210, 200, '时间到！', { color: '#fff', fontSize: '40px', fontStyle: 'bold' }).setOrigin(0.5).setDepth(10);
    this.add.text(210, 280, '得分 ' + p + '  ·  Lv' + level, { color: '#c8d2ec', fontSize: '24px' }).setOrigin(0.5).setDepth(10);
    this.add.text(210, 330, record ? '🏆 新纪录！' : '最高分 ' + Number(localStorage.getItem('wm_best') || 0), { color: '#ffcf3f', fontSize: '22px' }).setOrigin(0.5).setDepth(10);
    this.add.text(210, 380, '持有金币 🪙 ' + totalCoins, { color: '#ffd77a', fontSize: '18px' }).setOrigin(0.5).setDepth(10);

    const btn = this.add.rectangle(210, 520, 220, 74, 0x4d8bff, 1).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.start('Game'));
    this.add.text(210, 520, '再来一局', { color: '#fff', fontSize: '28px', fontStyle: 'bold' }).setOrigin(0.5).setDepth(11);

    const menu = this.add.text(210, 620, '← 返回主页', { color: '#5bc8ff', fontSize: '18px' }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(10);
    menu.on('pointerdown', () => this.scene.start('Start'));
  }
}

window.game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1a1f2e',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 420, height: 800 },
  scene: [Boot, Start, Game, End],
});
