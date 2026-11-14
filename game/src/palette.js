// The look plan, in one place. Meridian Yard is a container yard at dusk: warm amber sun,
// cool blue shadow, rust and teal paint on steel. Every colour in the game is one of these
// six names; the same names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#232835', // dusk sky / fog
  surface: '#23262e', // concrete floor and walls
  hairline: '#3a3f4a', // dark steel
  ink: '#e9e6df', // light concrete, UI text
  muted: '#8b95a5', // cool shadow blue-grey
  accent: '#f0a830', // amber sun, tracer, HUD warning
};

export const TEAM = {
  vanguard: '#f0a830', // amber: the player's team
  sentinel: '#4fc3e8', // cyan: the defending team
};

export function shade(name) {
  return PALETTE[name];
}
