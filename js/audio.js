/* ============================================================
 * 西游杀 - 音效合成（Web Audio API，无需外部音频文件）
 * 所有音效通过振荡器 + 包络实时合成，带东方仙侠风格。
 * ============================================================ */

const SFX = {
  ctx: null,
  enabled: true,

  init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { this.enabled = false; }
  },

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  /* 通用工具：创建增益节点 */
  _gain(vol) {
    const g = this.ctx.createGain();
    g.gain.value = vol;
    g.connect(this.ctx.destination);
    return g;
  },

  /* 振荡器音符 */
  _osc(type, freq, start, dur, vol, fadeStart, fadeEnd) {
    if (!this.ctx || !this.enabled) return;
    const g = this.ctx.createGain();
    g.connect(this.ctx.destination);
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(fadeEnd || 0.001, start + dur);
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.connect(g);
    o.start(start);
    o.stop(start + dur + 0.05);
  },

  /* 噪声冲击（用于打击感） */
  _noise(start, dur, vol, lpFreq) {
    if (!this.ctx || !this.enabled) return;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = lpFreq || 2000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    src.connect(lp); lp.connect(g); g.connect(this.ctx.destination);
    src.start(start); src.stop(start + dur + 0.05);
  },

  /* ── 出杀：金属撞击 + 高频扫频 ── */
  sha() {
    if (!this.ctx || !this.enabled) return; this.resume();
    const t = this.ctx.currentTime;
    this._noise(t, 0.12, 0.6, 800);
    this._osc('sawtooth', 600, t, 0.08, 0.3);
    this._osc('square', 300, t, 0.15, 0.2);
    // 金属余音
    this._osc('sine', 1200, t + 0.05, 0.25, 0.15);
  },

  /* ── 出闪：轻快掠过风声 ── */
  shan() {
    if (!this.ctx || !this.enabled) return; this.resume();
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(800, t + 0.18);
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + 0.3);
  },

  /* ── 用桃/回血：仙气叮咚 ── */
  tao() {
    if (!this.ctx || !this.enabled) return; this.resume();
    const t = this.ctx.currentTime;
    // 三个泛音叠加，像木鱼+钟声
    [[523, 0.4], [784, 0.25], [1047, 0.15]].forEach(([f, v], i) => {
      this._osc('sine', f, t + i * 0.06, 0.5 - i * 0.1, v);
    });
  },

  /* ── 受到伤害：沉闷击打 ── */
  damage() {
    if (!this.ctx || !this.enabled) return; this.resume();
    const t = this.ctx.currentTime;
    this._noise(t, 0.18, 0.8, 300);
    this._osc('sine', 80, t, 0.2, 0.4);
    this._osc('triangle', 160, t, 0.12, 0.25);
  },

  /* ── 角色阵亡：低沉下行 ── */
  death() {
    if (!this.ctx || !this.enabled) return; this.resume();
    const t = this.ctx.currentTime;
    this._noise(t, 0.35, 0.5, 200);
    [220, 185, 155, 130].forEach((f, i) => {
      this._osc('sine', f, t + i * 0.08, 0.25, 0.3 - i * 0.05);
    });
  },

  /* ── 使用锦囊：仙符咒语 ── */
  trick() {
    if (!this.ctx || !this.enabled) return; this.resume();
    const t = this.ctx.currentTime;
    // 快速上行琶音
    [392, 494, 587, 784].forEach((f, i) => {
      this._osc('sine', f, t + i * 0.05, 0.2, 0.2 - i * 0.03);
    });
    this._noise(t + 0.1, 0.15, 0.2, 4000);
  },

  /* ── 装备牌：厚重铠甲声 ── */
  equip() {
    if (!this.ctx || !this.enabled) return; this.resume();
    const t = this.ctx.currentTime;
    this._noise(t, 0.1, 0.5, 600);
    this._osc('square', 110, t, 0.18, 0.3);
    this._osc('sine', 220, t + 0.05, 0.2, 0.2);
  },

  /* ── 摸牌：轻薄卡片翻动 ── */
  draw() {
    if (!this.ctx || !this.enabled) return; this.resume();
    const t = this.ctx.currentTime;
    this._noise(t, 0.04, 0.2, 3000);
    this._osc('sine', 900, t, 0.04, 0.08);
  },

  /* ── 无懈可击：仙气反弹 ── */
  wuxie() {
    if (!this.ctx || !this.enabled) return; this.resume();
    const t = this.ctx.currentTime;
    [784, 659, 523, 659, 784].forEach((f, i) => {
      this._osc('sine', f, t + i * 0.06, 0.18, 0.2);
    });
  },

  /* ── 判定：铜钟一击 ── */
  judge() {
    if (!this.ctx || !this.enabled) return; this.resume();
    const t = this.ctx.currentTime;
    this._osc('sine', 440, t, 0.8, 0.4);
    this._osc('sine', 880, t, 0.4, 0.2);
    this._osc('triangle', 220, t, 0.3, 0.15);
  },

  /* ── 回合开始：鼓声 ── */
  turnStart() {
    if (!this.ctx || !this.enabled) return; this.resume();
    const t = this.ctx.currentTime;
    this._noise(t, 0.08, 0.4, 500);
    this._osc('sine', 100, t, 0.12, 0.35);
  },

  /* ── 胜利：上行号角 ── */
  win() {
    if (!this.ctx || !this.enabled) return; this.resume();
    const t = this.ctx.currentTime;
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      this._osc('square', f, t + i * 0.15, 0.35, 0.25 - i * 0.02);
      this._osc('sine', f * 2, t + i * 0.15, 0.25, 0.1);
    });
  },

  /* ── 失败：下行哀鸣 ── */
  lose() {
    if (!this.ctx || !this.enabled) return; this.resume();
    const t = this.ctx.currentTime;
    [440, 392, 349, 294].forEach((f, i) => {
      this._osc('sine', f, t + i * 0.2, 0.4, 0.3);
      this._osc('triangle', f / 2, t + i * 0.2, 0.3, 0.15);
    });
  },
};
