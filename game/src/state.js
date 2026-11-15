// The one state object: every number the sim reads or writes lives here, so a round can be
// reset by replacing this object and the renderer never holds game state of its own.
export function createState() {
  return {
    phase: 'menu', // menu | buy | live | roundEnd | matchEnd
    round: 1,
    maxRounds: 9,
    winsToTake: 5,
    score: { vanguard: 0, sentinel: 0 },
    timer: 0, // seconds left in the current phase
    money: 800,
    kills: 0,
    deaths: 0,
    roundKills: 0,
    bombPlanted: false,
    bombSite: null, // 'A' | 'B'
    bombTimer: 0,
    plantProgress: 0,
    defuseProgress: 0,
    bombCarrier: 'player', // 'player' | bot id | null (dropped)
    bombDroppedAt: null,
    attackSite: 'A', // the site Vanguard pushes this round; the squad converges on it
    roundWinner: null,
    roundReason: '',
    matchWinner: null,
    elapsed: 0,
    noise: [], // {x, z, radius, time} gunfire the bots can hear
    feed: [], // kill-feed lines, newest first
  };
}

export const ECONOMY = {
  startMoney: 800,
  killReward: 300,
  winReward: 3250,
  lossReward: 1900,
  plantReward: 300,
  roundTime: 100,
  buyTime: 12,
  plantTime: 3.5,
  defuseTime: 5,
  fuseTime: 35,
};
