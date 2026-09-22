/**
 * A cake is one of four shapes. Round cakes are sold by diameter and stack
 * into tiers; the other three are their own bakes with their own sizes, so
 * they sit beside the tier options rather than inside them.
 */
export type CakeShape = 'round' | 'tall' | 'sheet' | 'slab'

export interface SizeInfo {
  /** the value stored on the order — short enough to read on a card */
  size: string
  /** the big text on the chip */
  label: string
  /** the small text under it */
  serves: string
  shape: CakeShape
}

export const SIZES: SizeInfo[] = [
  { size: '4"', label: '4"', serves: 'Serves 4–6', shape: 'round' },
  { size: '6"', label: '6"', serves: 'Serves 8–10', shape: 'round' },
  { size: '8"', label: '8"', serves: 'Serves 15–20', shape: 'round' },
  { size: '10"', label: '10"', serves: 'Serves 25–30', shape: 'round' },
  { size: '12"', label: '12"', serves: 'Serves 35–40', shape: 'round' },
  // a tall cake is a deeper round bake, so it feeds more than its width suggests
  { size: 'Tall 6"', label: '6"', serves: 'Serves 12–15', shape: 'tall' },
  { size: 'Tall 8"', label: '8"', serves: 'Serves 25–30', shape: 'tall' },
  // trays, cut into roughly 2" squares
  { size: 'Sheet 18×9', label: '18" × 9"', serves: 'Serves 40–45', shape: 'sheet' },
  { size: 'Sheet 12×9', label: '12" × 9"', serves: 'Serves 25–30', shape: 'sheet' },
  { size: 'Slab 18×6', label: '18" × 6"', serves: 'Serves 25–30', shape: 'slab' },
]

/** Only round cakes stack, so only these appear in the per-tier pickers. */
export const ROUND_SIZES = SIZES.filter((s) => s.shape === 'round')

export const sizesFor = (shape: CakeShape): SizeInfo[] => SIZES.filter((s) => s.shape === shape)

export const isRoundSize = (size: string): boolean => ROUND_SIZES.some((s) => s.size === size)

/** Which shape a stored size belongs to; anything unrecognised reads as round. */
export const shapeOf = (size: string): CakeShape =>
  SIZES.find((s) => s.size === size)?.shape ?? 'round'

export const SERVES_RANGE: Record<string, [number, number]> = {
  '4"': [4, 6],
  '6"': [8, 10],
  '8"': [15, 20],
  '10"': [25, 30],
  '12"': [35, 40],
  'Tall 6"': [12, 15],
  'Tall 8"': [25, 30],
  'Sheet 18×9': [40, 45],
  'Sheet 12×9': [25, 30],
  'Slab 18×6': [25, 30],
}

/**
 * The row at the top of the form: three tier counts, then the three shapes
 * that aren't stacked at all.
 */
export interface CakeType {
  key: string
  label: string
  shape: CakeShape
  tiers: number
}

export const CAKE_TYPES: CakeType[] = [
  { key: 'round-1', label: 'Single tier', shape: 'round', tiers: 1 },
  { key: 'round-2', label: 'Double tier', shape: 'round', tiers: 2 },
  { key: 'round-3', label: 'Triple tier', shape: 'round', tiers: 3 },
  { key: 'tall', label: 'Tall', shape: 'tall', tiers: 1 },
  { key: 'sheet', label: 'Sheet', shape: 'sheet', tiers: 1 },
  { key: 'slab', label: 'Slab', shape: 'slab', tiers: 1 },
]

export const TIERS = [
  { count: 1, label: 'Single tier' },
  { count: 2, label: 'Double tier' },
  { count: 3, label: 'Triple tier' },
] as const

export const TIER_NAMES: Record<number, string[]> = {
  2: ['Bottom tier', 'Top tier'],
  3: ['Bottom tier', 'Middle tier', 'Top tier'],
}

/** sensible starting sizes when switching tier count */
export const TIER_DEFAULTS: Record<number, string[]> = {
  1: ['8"'],
  2: ['8"', '6"'],
  3: ['10"', '8"', '6"'],
}

export interface FlavourInfo {
  name: string
  group: 'Classic' | 'Signature' | 'Exotic'
}

// Flavours from zayakabakesnbites.com/menu — all eggless
export const FLAVOURS: FlavourInfo[] = [
  { name: 'Vanilla', group: 'Classic' },
  { name: 'Chocolate', group: 'Classic' },
  { name: 'Pineapple', group: 'Signature' },
  { name: 'Strawberry', group: 'Signature' },
  { name: 'Black Forest', group: 'Signature' },
  { name: 'White Forest', group: 'Signature' },
  { name: 'Red Velvet', group: 'Signature' },
  { name: 'Chocolate Mousse', group: 'Signature' },
  { name: 'Chocolate Oreo', group: 'Signature' },
  { name: 'Tiramisu', group: 'Signature' },
  { name: 'Lemon', group: 'Exotic' },
  { name: 'Pistachio', group: 'Exotic' },
  { name: 'Coconut Cream', group: 'Exotic' },
  { name: 'Rasmalai', group: 'Exotic' },
  { name: 'Mango Rasmalai', group: 'Exotic' },
  { name: 'Gulab Jamun', group: 'Exotic' },
]

export const PAYMENT_METHODS = [
  { value: 'e-transfer', label: 'E-Transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
] as const
