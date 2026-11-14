// The DOM HUD: crosshair, hit marker, health, ammunition, timer, score, money, kill feed
// and the buy menu. It never touches the simulation; main.js pushes numbers in and reads
// the callbacks out. DOM writes are guarded by last-value caches, so a steady HUD costs
// no layout work per frame.
import { WEAPONS, GRENADE, ARMOR } from './weapons.js';

const COPY = {
  start: {
    title: 'Meridian Yard',
    copy: 'Vanguard attacks, Sentinel defends. Plant the device at site A or B — or eliminate the other team. First to 5 rounds takes the match.',
    action: 'Click to play',
  },
  paused: { title: 'Meridian Yard', copy: 'Paused. Click to resume.', action: 'Click to resume' },
  roundEnd: { title: '', copy: '', action: 'Next round' },
  matchEnd: { title: '', copy: '', action: 'Play again' },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const healthNum = $('health-num');
  const healthFill = $('health-fill');
  const armorNum = $('armor-num');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const scoreV = $('score-vanguard');
  const scoreS = $('score-sentinel');
  const roundLabel = $('round-label');
  const aliveV = $('alive-vanguard');
  const aliveS = $('alive-sentinel');
  const bombStatus = $('bomb-status');
  const feed = $('feed');
  const hitmarker = $('hitmarker');
  const crosshair = $('crosshair');
  const vignette = $('vignette');
  const scope = $('scope');
  const banner = $('banner');
  const buyPanel = $('buy');
  const buyGrid = $('buy-grid');
  const buyMoney = $('buy-money');

  let lastHealth = -1;
  let lastArmor = -1;
  let lastMag = -1;
  let lastReserve = -1;
  let lastWeapon = '';
  let lastMoney = -1;
  let lastTimer = null; // null, not '': the static HTML may hold a placeholder timer
  // ("BUY 12") that must be overwritten on the first write, and the cache must not
  // claim the DOM already shows the empty timer when it does not.
  let lastScore = '';
  let lastAlive = '';
  let lastBomb = '';
  let hitTimer = 0;
  let bannerTimer = 0;
  let buyHandler = null;

  const shop = [
    { id: 'rifle', name: 'VK-47 Rifle', desc: 'Auto · 30 rounds · steady at range', price: WEAPONS.rifle.price },
    { id: 'smg', name: 'Hornet-9 SMG', desc: 'Auto · fast · close quarters', price: WEAPONS.smg.price },
    { id: 'sniper', name: 'Longbow', desc: 'Bolt · one shot, one kill', price: WEAPONS.sniper.price },
    { id: 'pistol', name: 'P9 Pistol', desc: 'Sidearm · always with you', price: WEAPONS.pistol.price },
    { id: 'grenade', name: 'Frag Grenade', desc: 'Throw with G · 120 damage', price: GRENADE.price },
    { id: 'armor', name: 'Vest', desc: 'Absorbs half the damage', price: ARMOR.price },
  ];
  for (const item of shop) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'buy-item';
    button.dataset.item = item.id;
    button.innerHTML = `<b></b><span></span><i></i>`;
    button.querySelector('b').textContent = item.name;
    button.querySelector('span').textContent = item.desc;
    button.querySelector('i').textContent = `$${item.price}`;
    button.addEventListener('click', () => {
      if (buyHandler) buyHandler(item.id);
    });
    buyGrid.appendChild(button);
  }

  function setText(element, value, last) {
    if (value === last) return last;
    element.textContent = value;
    return value;
  }

  return {
    setHealth(value) {
      if (value === lastHealth) return;
      lastHealth = value;
      healthNum.textContent = String(Math.max(0, Math.ceil(value)));
      healthFill.style.width = `${Math.max(0, Math.min(100, value))}%`;
      healthFill.classList.toggle('low', value <= 30);
    },
    setArmor(value) {
      if (value === lastArmor) return;
      lastArmor = value;
      armorNum.textContent = value > 0 ? `VEST ${Math.ceil(value)}` : '';
    },
    setAmmo(mag, reserve, name) {
      if (mag !== lastMag) {
        lastMag = mag;
        ammoMag.textContent = String(mag);
        $('ammo').classList.toggle('empty', mag === 0);
      }
      if (reserve !== lastReserve) {
        lastReserve = reserve;
        ammoReserve.textContent = `/ ${reserve}`;
      }
      if (name !== lastWeapon) {
        lastWeapon = name;
        weaponName.textContent = name;
      }
    },
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      moneyValue.textContent = `$${value}`;
      buyMoney.textContent = `$${value}`;
    },
    setTimer(seconds, label) {
      const text = label ? `${label} ${Math.max(0, Math.ceil(seconds))}` : '';
      lastTimer = setText(timerValue, text, lastTimer);
    },
    setScore(vanguard, sentinel, round) {
      const text = `${vanguard}–${sentinel}`;
      if (text !== lastScore) {
        lastScore = text;
        scoreV.textContent = String(vanguard);
        scoreS.textContent = String(sentinel);
      }
      const label = `ROUND ${round}`;
      if (label !== roundLabel.textContent) roundLabel.textContent = label;
    },
    setAlive(vanguard, sentinel) {
      const text = `${vanguard}|${sentinel}`;
      if (text === lastAlive) return;
      lastAlive = text;
      aliveV.textContent = '●'.repeat(Math.max(0, vanguard)) + '○'.repeat(Math.max(0, 5 - vanguard));
      aliveS.textContent = '●'.repeat(Math.max(0, sentinel)) + '○'.repeat(Math.max(0, 5 - sentinel));
    },
    setBomb(text) {
      if (text === lastBomb) return;
      lastBomb = text;
      bombStatus.textContent = text;
      bombStatus.classList.toggle('danger', text.startsWith('DEVICE'));
    },
    setGrenades(count) {
      const element = $('grenades');
      if (element) element.textContent = count > 0 ? `FRAG ×${count}` : '';
    },
    feedLine(text) {
      const line = document.createElement('div');
      line.textContent = text;
      feed.prepend(line);
      while (feed.children.length > 5) feed.removeChild(feed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      vignette.classList.add('on');
      setTimeout(() => vignette.classList.remove('on'), 180);
    },
    setSpread(spread) {
      const gap = Math.round(4 + spread * 900);
      crosshair.style.setProperty('--gap', `${Math.min(26, gap)}px`);
    },
    setScoped(on) {
      scope.hidden = !on;
      crosshair.style.visibility = on ? 'hidden' : 'visible';
    },
    showBanner(text, holdMs = 2200) {
      banner.textContent = text;
      banner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.remove('on'), holdMs);
    },
    showBuy(open) {
      buyPanel.hidden = !open;
    },
    onBuy(handler) {
      buyHandler = handler;
    },
    refreshShop(money, owned) {
      for (const button of buyGrid.children) {
        const id = button.dataset.item;
        const price = shop.find((item) => item.id === id).price;
        button.disabled = money < price || (owned[id] && id !== 'grenade' && id !== 'armor');
        button.classList.toggle('owned', Boolean(owned[id]) && id !== 'grenade' && id !== 'armor');
      }
    },
    showOverlay(mode, data = {}) {
      const text = COPY[mode];
      if (mode === 'roundEnd') {
        title.textContent = data.title ?? 'Round over';
        copy.textContent = data.copy ?? '';
        play.textContent = 'Next round';
      } else if (mode === 'matchEnd') {
        title.textContent = data.title ?? 'Match over';
        copy.textContent = data.copy ?? '';
        play.textContent = 'Play again';
      } else {
        title.textContent = text.title;
        copy.textContent = text.copy;
        play.textContent = text.action;
      }
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
