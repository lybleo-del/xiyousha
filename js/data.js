/* ============================================================
 * 西游杀 - 游戏数据：武将 与 卡牌
 * 参考《三国杀》机制，以《西游记》为主题重新设计
 * ============================================================ */

/* ---------------- 花色与点数 ---------------- */
const SUITS = ['spade', 'heart', 'club', 'diamond'];
const SUIT_SYMBOL = { spade: '♠', heart: '♥', club: '♣', diamond: '♦' };
const SUIT_NAME = { spade: '黑桃', heart: '红桃', club: '梅花', diamond: '方块' };
const RED_SUITS = ['heart', 'diamond'];

function isRed(suit) { return RED_SUITS.includes(suit); }

/* ---------------- 武将定义 ----------------
 * skill: 通过引擎在特定时机调用的钩子。
 * 钩子点（可选，引擎会检查是否存在）:
 *   shaIgnoreDistance(player)   -> 杀无视距离
 *   extraShaCount(player)       -> 每回合可多出几张杀
 *   attackRangeBonus(player)    -> 攻击范围加成
 *   distanceToBonus(player)     -> 别人计算到“你”的距离 +X (防御马效果)
 *   distanceFromBonus(player)   -> “你”计算到别人的距离 -X (进攻马效果)
 *   onAfterDamaged(g, player, source, amount) -> 受到伤害后
 *   onAfterDamageDealt(g, player, victim, amount) -> 造成伤害后
 *   redCardAsShan(player)       -> 红色牌可当闪
 * ------------------------------------------------- */
const CHARACTERS = [
  {
    id: 'wukong', name: '孙悟空', title: '齐天大圣', maxHp: 4, faction: '取经',
    avatar: '🐵',
    skillName: '火眼金睛 / 大圣神威',
    skillDesc: '【火眼金睛】你使用「杀」无视距离限制。【大圣神威】你每回合可以使用任意数量的「杀」。',
    shaIgnoreDistance: () => true,
    extraShaCount: () => 99,
  },
  {
    id: 'tangseng', name: '唐三藏', title: '金蝉转世', maxHp: 4, faction: '取经', lordHpBonus: 1,
    avatar: '🧘',
    skillName: '慈悲 / 普度众生',
    skillDesc: '【慈悲】受到伤害后，你可以摸一张牌。【普度众生】(主公技) 其他「取经」角色濒死时，全场可对其使用「桃」。',
    onAfterDamaged: (g, p) => { if (p.alive) { g.draw(p, 1); g.log(`${p.name} 发动【慈悲】摸一张牌`); } },
  },
  {
    id: 'bajie', name: '猪八戒', title: '天蓬元帅', maxHp: 4, faction: '取经',
    avatar: '🐷',
    skillName: '倒打一耙',
    skillDesc: '受到伤害后，你可以摸两张牌（每点伤害摸两张）。',
    onAfterDamaged: (g, p, src, amt) => { if (p.alive) { g.draw(p, 2 * amt); g.log(`${p.name} 发动【倒打一耙】摸 ${2 * amt} 张牌`); } },
  },
  {
    id: 'shaseng', name: '沙悟净', title: '卷帘大将', maxHp: 4, faction: '取经',
    avatar: '🗿',
    skillName: '任劳任怨',
    skillDesc: '弃牌阶段结束时，若你没有手牌，则摸两张牌。',
    onEndDiscard: (g, p) => { if (p.alive && p.hand.length === 0) { g.draw(p, 2); g.log(`${p.name} 发动【任劳任怨】摸两张牌`); } },
  },
  {
    id: 'bailongma', name: '白龙马', title: '西海三太子', maxHp: 4, faction: '取经',
    avatar: '🐴',
    skillName: '神骏',
    skillDesc: '其他角色计算与你的距离 +1，你计算与其他角色的距离 -1（自带的宝马）。',
    distanceToBonus: () => 1,
    distanceFromBonus: () => 1,
  },
  {
    id: 'niumowang', name: '牛魔王', title: '平天大圣', maxHp: 5, faction: '妖魔',
    avatar: '🐂',
    skillName: '蛮力',
    skillDesc: '你使用「杀」造成伤害时，可以弃置一张手牌使该伤害 +1（每回合一次）。',
    // 在引擎出杀结算处处理
    bruteForce: true,
  },
  {
    id: 'tieshan', name: '铁扇公主', title: '罗刹女', maxHp: 4, faction: '妖魔',
    avatar: '🪭',
    skillName: '芭蕉扇',
    skillDesc: '你的红色手牌都可以当作「闪」使用或打出。',
    redCardAsShan: () => true,
  },
  {
    id: 'honghaier', name: '红孩儿', title: '圣婴大王', maxHp: 3, faction: '妖魔',
    avatar: '🔥',
    skillName: '三昧真火',
    skillDesc: '你造成伤害后，可以弃置目标一张牌（每回合一次）。',
    onAfterDamageDealt: (g, p, victim) => {
      if (!p._sanmeiUsed && victim.alive && (victim.hand.length || g.hasEquip(victim))) {
        p._sanmeiUsed = true;
        const card = g.aiPickStealTarget ? null : null;
        g.discardRandomCardFrom(victim);
        g.log(`${p.name} 发动【三昧真火】弃置了 ${victim.name} 一张牌`);
      }
    },
  },
  {
    id: 'baigujing', name: '白骨精', title: '尸魔', maxHp: 3, faction: '妖魔',
    avatar: '💀',
    skillName: '化身夺魄',
    skillDesc: '你对其他角色造成伤害后，可以获得其一张牌（每回合一次）。',
    onAfterDamageDealt: (g, p, victim) => {
      if (!p._huashenUsed && victim.alive && victim !== p && (victim.hand.length || g.hasEquip(victim))) {
        p._huashenUsed = true;
        g.stealRandomCard(p, victim);
        g.log(`${p.name} 发动【化身夺魄】获得了 ${victim.name} 一张牌`);
      }
    },
  },
  {
    id: 'erlang', name: '二郎神', title: '显圣真君', maxHp: 4, faction: '天庭',
    avatar: '👁️',
    skillName: '三尖两刃',
    skillDesc: '你的攻击范围 +1，且使用「杀」无视防具效果（神威）。',
    attackRangeBonus: () => 1,
    ignoreArmor: () => true,
  },
  {
    id: 'guanyin', name: '观音菩萨', title: '南海大士', maxHp: 3, faction: '天庭',
    avatar: '🪷',
    skillName: '杨柳甘露',
    skillDesc: '准备阶段，你可以令一名已受伤的角色回复 1 点体力，然后你失去 1 点体力（自损济人，每回合可选）。',
    // 在引擎准备阶段处理（仅 AI 谨慎使用 / 玩家可选）
    ganlu: true,
  },
  {
    id: 'taishang', name: '太上老君', title: '道德天尊', maxHp: 3, faction: '天庭',
    avatar: '⚗️',
    skillName: '仙丹妙药',
    skillDesc: '摸牌阶段，你额外摸一张牌。',
    extraDraw: () => 1,
  },
];

/* ---------------- 卡牌定义 ----------------
 * type: 'basic' | 'trick' | 'equip'
 * basicKind: 'sha' | 'shan' | 'tao'
 * trickKind: 'instant' | 'delayed'
 * equipKind: 'weapon' | 'armor' | 'horsePlus' | 'horseMinus'
 * ------------------------------------------------- */

// 卡牌“原型”，配上一组(花色,点数)生成实体牌
const CARD_TEMPLATES = [
  // ---------- 基本牌 ----------
  { key: 'sha', name: '杀', type: 'basic', basicKind: 'sha',
    desc: '对你攻击范围内的一名角色造成 1 点伤害，目标需打出「闪」抵消。' },
  { key: 'shan', name: '闪', type: 'basic', basicKind: 'shan',
    desc: '抵消一张「杀」。' },
  { key: 'tao', name: '桃', type: 'basic', basicKind: 'tao',
    desc: '出牌阶段回复 1 点体力；或在角色濒死时救其一命。' },

  // ---------- 即时锦囊 ----------
  { key: 'huazhai', name: '化斋', type: 'trick', trickKind: 'instant', target: 'self',
    desc: '（无中生有）摸两张牌。' },
  { key: 'doufa', name: '斗法', type: 'trick', trickKind: 'instant', target: 'single',
    desc: '（决斗）你与目标轮流打出「杀」，先不出者受到 1 点伤害。' },
  { key: 'shunshou', name: '顺手牵羊', type: 'trick', trickKind: 'instant', target: 'single', range1: true,
    desc: '获得距离 1 以内一名角色的一张牌。' },
  { key: 'chaiqiao', name: '过河拆桥', type: 'trick', trickKind: 'instant', target: 'single',
    desc: '弃置任意一名角色的一张牌。' },
  { key: 'pantao', name: '蟠桃盛会', type: 'trick', trickKind: 'instant', target: 'allAlly',
    desc: '（桃园结义）所有角色各回复 1 点体力。' },
  { key: 'qunyao', name: '群妖来袭', type: 'trick', trickKind: 'instant', target: 'allEnemy',
    desc: '（南蛮入侵）其他所有角色需打出一张「杀」，否则受到 1 点伤害。' },
  { key: 'feisha', name: '飞沙走石', type: 'trick', trickKind: 'instant', target: 'allEnemy',
    desc: '（万箭齐发）其他所有角色需打出一张「闪」，否则受到 1 点伤害。' },
  { key: 'wuxie', name: '无懈可击', type: 'trick', trickKind: 'instant', target: 'trick',
    desc: '抵消一张锦囊牌的效果。' },
  // ---------- 延时锦囊 ----------
  { key: 'jingu', name: '紧箍咒', type: 'trick', trickKind: 'delayed', target: 'single',
    desc: '（乐不思蜀）置于目标判定区，其判定阶段进行判定，非红桃则跳过出牌阶段。' },
  { key: 'tianlei', name: '天雷', type: 'trick', trickKind: 'delayed', target: 'selfChain',
    desc: '（闪电）判定为黑桃 2~9 时受到 3 点雷电伤害，否则移交下家。' },

  // ---------- 装备牌 ----------
  { key: 'jingubang', name: '金箍棒', type: 'equip', equipKind: 'weapon', range: 3,
    desc: '武器，攻击范围 3。' },
  { key: 'dingpa', name: '九齿钉耙', type: 'equip', equipKind: 'weapon', range: 2,
    desc: '武器，攻击范围 2。' },
  { key: 'baozhang', name: '降妖宝杖', type: 'equip', equipKind: 'weapon', range: 4,
    desc: '武器，攻击范围 4。' },
  { key: 'lianhuajia', name: '莲花宝甲', type: 'equip', equipKind: 'armor',
    desc: '防具，当你需要打出「闪」时，进行判定，为红色则视为已打出「闪」（八卦阵）。' },
  { key: 'mawang', name: '千里马', type: 'equip', equipKind: 'horseMinus',
    desc: '-1 坐骑，你计算与其他角色的距离 -1。' },
  { key: 'huoyan', name: '火眼金睛甲', type: 'equip', equipKind: 'horsePlus',
    desc: '+1 坐骑，其他角色计算与你的距离 +1。' },
];

/* 生成完整牌堆：为每种牌配置若干 (花色,点数) */
function buildDeck() {
  const deck = [];
  let uid = 0;
  const make = (tpl, suit, point) => {
    deck.push(Object.assign({}, tpl, { uid: ++uid, suit, point }));
  };

  // 数量配置（精简版牌堆，约 80 张）
  const config = {
    sha: 20, shan: 12, tao: 8,
    huazhai: 4, doufa: 3, shunshou: 4, chaiqiao: 4,
    pantao: 1, qunyao: 2, feisha: 2, wuxie: 4,
    jingu: 2, tianlei: 1,
    jingubang: 1, dingpa: 1, baozhang: 1, lianhuajia: 1, mawang: 2, huoyan: 2,
  };

  const tplByKey = {};
  CARD_TEMPLATES.forEach(t => tplByKey[t.key] = t);

  Object.keys(config).forEach(key => {
    const tpl = tplByKey[key];
    const count = config[key];
    for (let i = 0; i < count; i++) {
      const suit = SUITS[Math.floor(Math.random() * 4)];
      const point = 1 + Math.floor(Math.random() * 13);
      make(tpl, suit, point);
    }
  });

  return deck;
}

const POINT_NAME = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
function pointLabel(p) { return POINT_NAME[p] || String(p); }
