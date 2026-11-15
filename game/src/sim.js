// The match: buy phase, live round, round end, next round. One state machine, driven by
// the fixed-step sim; it owns the timers, the economy and the win conditions, and tells the
// HUD and the audio what happened. Elimination, detonation, defuse and the clock are the
// four ways a round ends; first to 5 rounds takes the match, at most 9 rounds.
import { ECONOMY } from './state.js';

export function createSim(state, deps) {
  const { bots, hud, audio, bomb, arsenal, player } = deps;

  function resetPositions() {
    // Player back to the Vanguard spawn, facing the yard.
    player.body.state.position.set(0, 0, 15);
    player.body.state.velocity.set(0, 0, 0);
    player.body.state.yaw = 0;
    player.body.state.pitch = 0;
    player.health = 100;
    player.alive = true;
    player.armor = arsenal.state.armor;
  }

  function startRound() {
    state.bombPlanted = false;
    state.bombSite = null;
    state.bombTimer = 0;
    state.plantProgress = 0;
    state.defuseProgress = 0;
    state.bombCarrier = 'player';
    state.bombDroppedAt = null;
    // The squad pushes one site together, alternating by round; a human who walks
    // into the other site re-points the squad (see main.js: attackSite follows the
    // carrier). A split 2+2 attack bled rounds to the defenders.
    state.attackSite = state.round % 2 === 1 ? 'A' : 'B';
    state.roundKills = 0;
    state.roundWinner = null;
    state.roundReason = '';
    resetPositions();
    bots.spawnRound();
    bomb.hide();
    arsenal.refillRound();
    state.phase = 'buy';
    state.timer = ECONOMY.buyTime;
    hud.setBomb('');
    hud.setAlive(5, 5);
    hud.showBuy(true);
    hud.refreshShop(state.money, arsenal.state.owned);
    hud.showBanner(`ROUND ${state.round} — BUY PHASE`);
  }

  function startMatch() {
    state.score.vanguard = 0;
    state.score.sentinel = 0;
    state.round = 1;
    state.money = ECONOMY.startMoney;
    state.kills = 0;
    state.deaths = 0;
    state.matchWinner = null;
    arsenal.state.owned = { rifle: true, pistol: true, smg: false, sniper: false };
    arsenal.state.grenades = 0;
    arsenal.state.armor = 0;
    arsenal.switchTo('rifle');
    startRound();
  }

  function award(winner) {
    if (winner === 'vanguard') {
      state.money += ECONOMY.winReward;
    } else {
      state.money += ECONOMY.lossReward;
    }
  }

  function endRound(winner, reason) {
    if (state.phase !== 'live' && state.phase !== 'buy') return;
    state.phase = 'roundEnd';
    state.roundWinner = winner;
    state.roundReason = reason;
    state.score[winner] += 1;
    award(winner);
    hud.showBuy(false);
    if (winner === 'vanguard') audio.roundWin();
    else audio.roundLose();
    hud.showOverlay('roundEnd', {
      title: winner === 'vanguard' ? 'Round won' : 'Round lost',
      copy: `${reason} — Vanguard ${state.score.vanguard}, Sentinel ${state.score.sentinel}. $${state.money} to spend.`,
    });
    state.timer = 4;
  }

  function endMatch(winner) {
    state.phase = 'matchEnd';
    state.matchWinner = winner;
    hud.showBuy(false);
    hud.showOverlay('matchEnd', {
      title: winner === 'vanguard' ? 'Vanguard takes the match' : 'Sentinel takes the match',
      copy: `Final score Vanguard ${state.score.vanguard} — ${state.score.sentinel} Sentinel. ${state.kills} eliminations.`,
    });
  }

  function nextRound() {
    if (state.score.vanguard >= state.winsToTake || state.score.sentinel >= state.winsToTake) {
      endMatch(state.score.vanguard > state.score.sentinel ? 'vanguard' : 'sentinel');
      return;
    }
    if (state.round >= state.maxRounds) {
      endMatch(state.score.vanguard > state.score.sentinel ? 'vanguard' : state.score.vanguard < state.score.sentinel ? 'sentinel' : 'vanguard');
      return;
    }
    state.round += 1;
    startRound();
  }

  function checkElimination() {
    if (state.phase !== 'live') return;
    const vanguardAlive = (player.alive ? 1 : 0) + bots.aliveCount('vanguard');
    const sentinelAlive = bots.aliveCount('sentinel');
    if (sentinelAlive === 0) endRound('vanguard', 'Sentinel team eliminated');
    else if (vanguardAlive === 0) endRound('sentinel', 'Vanguard team eliminated');
  }

  let beepTimer = 0;
  function update(dt) {
    if (state.phase === 'buy') {
      state.timer -= dt;
      if (state.timer <= 0) {
        state.phase = 'live';
        state.timer = ECONOMY.roundTime;
        hud.showBuy(false);
        hud.showBanner('GO — PLANT THE DEVICE');
      }
      return;
    }
    if (state.phase === 'live') {
      state.timer -= dt;
      if (state.bombPlanted) {
        state.bombTimer -= dt;
        beepTimer -= dt;
        if (beepTimer <= 0) {
          beepTimer = bomb.beepInterval(state.bombTimer);
          audio.plantBeep();
        }
        if (state.bombTimer <= 0) {
          bomb.hide();
          endRound('vanguard', 'Device detonated at site ' + state.bombSite);
          return;
        }
      }
      if (state.timer <= 0) {
        if (state.bombPlanted) {
          // The fuse decides it; the clock no longer matters.
        } else {
          endRound('sentinel', 'Time expired — device never planted');
        }
      }
      return;
    }
    if (state.phase === 'roundEnd') {
      state.timer -= dt;
      if (state.timer <= 0) {
        hud.hideOverlay();
        nextRound();
      }
    }
  }

  return { startMatch, startRound, endRound, endMatch, nextRound, checkElimination, update };
}
