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

// ============ 场景 ============
function Boot(scene) {
  scene.create = function () { createTextures(this); this.scene.start('Start'); };
}

function Start(scene) {
  scene.create = function () {
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
      .setOnPointerDown(() => this.scene.start('Game'));
    this.add.text(210, 560, '开 始', { color: '#fff', fontSize: '30px', fontStyle: 'bold' }).setOrigin(0.5).setDepth(11);
    this.add.text(210, 640, '竖屏游玩 · 连击爽点', { color: '#6b7a9e', fontSize: '15px' }).setOrigin(0.5);
  };
}

function Game(scene) {
  let score, coins, pointsSinceCoin, level, timeLeft, running;
  let moleMap = {};          // holeIndex -> active entity
  let props = [];           // 3 个道具按钮状态
  let spawner, timer;
  let hudScore, hudTime, hudCoins, hudLevel;

  scene.init = function () {
    score = 0;
    coins = Number(localStorage.getItem('wm_coins') || 0);
    pointsSinceCoin = 0;
    level = 1;
    timeLeft = GAME_TIME;
    running = true;
    moleMap = {};
  };

  scene.create = function () {
    this.cameras.main.setBackgroundColor(0x1a1f2e);
    // 洞（静态）
    HOLES.forEach((h, i) => this.add.image(h.x, h.y, 'hole').setDepth(1));

    // HUD
    hudLevel = this.add.text(20, 18, 'Lv ' + level, { color: '#ffcf3f', fontSize: '18px', fontStyle: 'bold' }).setDepth(5);
    hudTime = this.add.text(400, 18, timeLeft + 's', { color: '#5bff9f', fontSize: '20px', fontStyle: 'bold' }).setOrigin(1, 0).setDepth(5);
    hudScore = this.add.text(210, 34, '0', { color: '#fff', fontSize: '34px', fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(5);
    this.add.text(210, 68, '分数', { color: '#6b7a9e', fontSize: '13px' }).setOrigin(0.5, 0).setDepth(5);
    hudCoins = this.add.text(210, 92, '🪙 ' + coins, { color: '#ffd77a', fontSize: '17px' }).setOrigin(0.5, 0).setDepth(5);

    buildPropUI();

    // 刷怪
    spawner = this.time.addEvent({ delay: difficulty(level).spawnInterval, loop: true, callback: () => spawn() });
    // 倒计时
    timer = this.time.addEvent({ delay: 1000, loop: true, callback: () => tick() });
  };

  function spawn() {
    if (!running) return;
    const d = difficulty(level);
    // 场上不能超过 maxSimultaneous
    if (Object.keys(moleMap).length >= d.maxSimultaneous) return;
    // 选一个空闲洞
    const free = HOLES.map((_, i) => i).filter((i) => !moleMap[i]);
    if (free.length === 0) return;
    const hi = free[Math.floor(Math.random() * free.length)];
    const isBomb = Math.random() < d.bombChance;
    const key = isBomb ? 'bomb' : 'mole';
    const h = HOLES[hi];
    const img = scene.add.image(h.x, h.y, key).setDepth(2).setScale(0)
      .setInteractive({ useHandCursor: true })
      .setOnPointerDown((p) => hit(hi, img));
    const ent = { img, isBomb, hi, dead: false };
    moleMap[hi] = ent;
    // 冒头
    const slowMul = props[0] && scene.time.now < props[0].activeUntil ? 1.8 : 1;
    scene.tweens.add({ targets: img, scale: 1, duration: 120, ease: 'Back.easeOut',
      onComplete: () => {
        // 停留后缩回消失
        scene.time.delayedCall(d.popDuration * slowMul, () => {
          if (ent.dead || !moleMap[hi]) return;
          delete moleMap[hi];
          scene.tweens.add({ targets: img, scale: 0, duration: 120, ease: 'Quad.easeIn', onComplete: () => img.destroy() });
        });
      } });
  }

  function hit(hi, img) {
    const ent = moleMap[hi];
    if (!ent || ent.dead) return;
    ent.dead = true;
    delete moleMap[hi];
    if (ent.isBomb) {
      // 惩罚
      score = Math.max(0, score - BOMB_PENALTY);
      timeLeft = Math.max(0, timeLeft - BOMB_TIME_PENALTY);
      hudScore.setText(String(score));
      hudTime.setText(Math.ceil(timeLeft) + 's');
      boomFx(img);
    } else {
      // 命中
      let pts = POINTS_PER_MOLE;
      if (props[1] && scene.time.now < props[1].activeUntil) pts *= 2; // 双倍
      addScore(pts);
      hitFx(img);
    }
    // 销毁
    img.destroy();
  }

  function addScore(pts) {
    score += pts;
    pointsSinceCoin += pts;
    // 金币累积
    while (pointsSinceCoin >= COIN_EVERY) { pointsSinceCoin -= COIN_EVERY; coins += 1; }
    hudScore.setText(String(score));
    hudCoins.setText('🪙 ' + coins);
    // 升级
    const newLevel = Math.floor(score / POINTS_PER_LEVEL) + 1;
    if (newLevel > level) {
      level = newLevel;
      hudLevel.setText('Lv ' + level);
      const d = difficulty(level);
      spawner.reset({ delay: d.spawnInterval });
      flashMsg(scene, '⬆ 升到 Lv' + level + '，更快了！', '#ffcf3f');
    }
  }

  function tick() {
    if (!running) return;
    timeLeft -= 1;
    hudTime.setText(Math.max(0, timeLeft) + 's');
    if (timeLeft <= 0) endGame();
  }

  // ===== 道具 UI =====
  function buildPropUI() {
    const defs = [
      { name: '减速', color: 0x5bff9f, cost: PROP_COST },
      { name: '双倍', color: 0xffcf3f, cost: PROP_COST },
      { name: '清屏', color: 0xff5b5b, cost: PROP_COST },
    ];
    const xs = [110, 210, 310], y = 720;
    props = defs.map((def, i) => {
      const x = xs[i];
      const btn = scene.add.rectangle(x, y, 78, 64, def.color, 0.18).setStrokeStyle(2, def.color).setInteractive({ useHandCursor: true });
      const label = scene.add.text(x, y - 12, def.name, { color: def.color, fontSize: '17px', fontStyle: 'bold' }).setOrigin(0.5);
      const costT = scene.add.text(x, y + 14, def.cost + ' 🪙', { color: '#ffd77a', fontSize: '14px' }).setOrigin(0.5);
      btn.setOnPointerDown(() => useProp(i));
      return { btn, label, costT, activeUntil: 0, cdUntil: 0 };
    });
  }

  function useProp(i) {
    if (!running) return;
    const p = props[i];
    if (scene.time.now < p.cdUntil || coins < PROP_COST) return;
    coins -= PROP_COST;
    hudCoins.setText('🪙 ' + coins);
    p.cdUntil = scene.time.now + PROP_CD;
    // 灰色覆盖表示冷却
    p.btn.setAlpha(0.3);
    scene.time.delayedCall(PROP_CD, () => { p.btn.setAlpha(1); });
    if (i === 0) { p.activeUntil = scene.time.now + 3000; flashMsg(scene, '🐌 减速 3 秒：地鼠停留更久', '#5bff9f'); }
    if (i === 1) { p.activeUntil = scene.time.now + 3000; flashMsg(scene, '✋ 双倍 3 秒：得分 ×2', '#ffcf3f'); }
    if (i === 2) { clearBombs(); flashMsg(scene, '💥 清屏：移除所有炸弹 +4s', '#ff5b5b'); timeLeft += 4; hudTime.setText(Math.ceil(timeLeft) + 's'); }
  }

  function clearBombs() {
    Object.keys(moleMap).forEach((k) => {
      const ent = moleMap[k];
      if (ent.isBomb) {
        ent.dead = true;
        delete moleMap[k];
        boomFx(ent.img);
        scene.tweens.add({ targets: ent.img, scale: 0, duration: 150, onComplete: () => ent.img.destroy() });
      }
    });
  }

  // ===== 特效 =====
  function hitFx(img) {
    const t = scene.add.text(img.x, img.y - 40, '+1', { color: '#5bff9f', fontSize: '22px', fontStyle: 'bold' }).setOrigin(0.5).setDepth(8);
    scene.tweens.add({ targets: t, y: t.y - 30, alpha: 0, duration: 500, onComplete: () => t.destroy() });
  }
  function boomFx(img) {
    const t = scene.add.text(img.x, img.y - 40, '-2 💥', { color: '#ff5b5b', fontSize: '22px', fontStyle: 'bold' }).setOrigin(0.5).setDepth(8);
    scene.tweens.add({ targets: t, y: t.y - 30, alpha: 0, duration: 500, onComplete: () => t.destroy() });
  }
  function flashMsg(sc, msg, color) {
    if (sc._msg) sc._msg.destroy();
    sc._msg = sc.add.text(210, 660, msg, { color, fontSize: '17px', fontStyle: 'bold' }).setOrigin(0.5).setDepth(9).setAlpha(0);
    sc.tweens.add({ targets: sc._msg, alpha: 1, duration: 150, onComplete: () =>
      sc.tweens.add({ targets: sc._msg, alpha: 0, duration: 400, delay: 900, onComplete: () => { sc._msg = null; } }) });
  }

  function endGame() {
    if (!running) return;
    running = false;
    spawner.reset({ delay: 999999, loop: false });
    timer.reset({ delay: 999999, loop: false });
    // 存金币 & 最高分
    localStorage.setItem('wm_coins', String(coins));
    const best = Number(localStorage.getItem('wm_best') || 0);
    if (score > best) localStorage.setItem('wm_best', String(score));
    scene.scene.start('End', { p: score, coins, level, record: score >= best && score > 0 });
  }
}

function End(scene) {
  scene.init = function (data) { this.data = data; };
  scene.create = function () {
    this.cameras.main.setBackgroundColor(0x1a1f2e);
    const { p, coins, level, record } = this.data;
    const totalCoins = Number(localStorage.getItem('wm_coins') || 0);
    this.add.text(210, 200, '时间到！', { color: '#fff', fontSize: '40px', fontStyle: 'bold' }).setOrigin(0.5).setDepth(10);
    this.add.text(210, 280, '得分 ' + p + '  ·  Lv' + level, { color: '#c8d2ec', fontSize: '24px' }).setOrigin(0.5).setDepth(10);
    this.add.text(210, 330, record ? '🏆 新纪录！' : '最高分 ' + Number(localStorage.getItem('wm_best') || 0), { color: '#ffcf3f', fontSize: '22px' }).setOrigin(0.5).setDepth(10);
    this.add.text(210, 380, '持有金币 🪙 ' + totalCoins, { color: '#ffd77a', fontSize: '18px' }).setOrigin(0.5).setDepth(10);

    const btn = this.add.rectangle(210, 520, 220, 74, 0x4d8bff, 1).setInteractive({ useHandCursor: true })
      .setOnPointerDown(() => this.scene.start('Game'));
    this.add.text(210, 520, '再来一局', { color: '#fff', fontSize: '28px', fontStyle: 'bold' }).setOrigin(0.5).setDepth(11);

    const menu = this.add.text(210, 620, '← 返回主页', { color: '#5bc8ff', fontSize: '18px' }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(10);
    menu.on('pointerdown', () => this.scene.start('Start'));
  };
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1a1f2e',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 420, height: 800 },
  scene: [Boot, Start, Game, End],
});
