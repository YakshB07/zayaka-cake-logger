/**
 * Chart palette — the validated categorical set, with a dark column stepped for
 * the dark surface rather than flipped automatically.
 *
 * Verified with the dataviz validator against this app's real chart surfaces
 * (light #ffffff, dark #221c1f): lightness band, chroma floor, CVD separation,
 * normal-vision floor and contrast all pass in both modes. Three light-mode
 * hues sit under 3:1 on white, which is why every chart here ships visible
 * direct labels and a "Numbers" table view.
 *
 * Slots are assigned in fixed order and never cycled — a category keeps its
 * colour even when a filter changes how many are on screen.
 */

export type Mode = 'light' | 'dark'

const CATEGORICAL: Record<Mode, string[]> = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
}

/** Past the eighth slot the tail folds into one muted "Other" grey. */
const OTHER: Record<Mode, string> = { light: '#6b615c', dark: '#b0a4a2' }

export function categorical(mode: Mode, index: number): string {
  const slots = CATEGORICAL[mode]
  return index < slots.length ? slots[index] : OTHER[mode]
}

/**
 * Money in, money out, and what's left — slots 1–3, which clear all-pairs.
 *
 * Profit/loss deliberately uses the blue↔red diverging pair, not the obvious
 * green↔red: green-on-red is the classic colourblindness trap and measures
 * ΔE 6.9 under deuteranopia (barely distinguishable), where blue↔red measures
 * 21.6. Position above/below the zero line carries the sign as well.
 */
export const roles = (mode: Mode) => ({
  revenue: CATEGORICAL[mode][0], // blue
  costs: CATEGORICAL[mode][1], // orange
  profit: CATEGORICAL[mode][0], // blue — the positive pole
  loss: CATEGORICAL[mode][7], // red — the negative pole
  accent: CATEGORICAL[mode][2], // aqua, for third-series use
  neutral: OTHER[mode],
})

export const MAX_SLOTS = CATEGORICAL.light.length
