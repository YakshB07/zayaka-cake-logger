export interface SizeInfo {
  /** the value stored on the order — short enough to read on a card */
  size: string
  /** the big text on the chip */
  label: string
  /** the small text under it */
  serves: string
  group: SizeGroup
}

/**
 * Round layer cakes are sold by diameter and can be stacked into tiers. The
 * large-format ones are single rectangular bakes sold by the tray, so they
 * carry their dimensions in the name and never stack.
 */
export type SizeGroup = 'Round' | 'Large'

export const SIZES: SizeInfo[] = [
  { size: '4"', label: '4"', serves: 'Serves 4–6', group: 'Round' },
  { size: '6"', label: '6"', serves: 'Serves 8–10', group: 'Round' },
  { size: '8"', label: '8"', serves: 'Serves 15–20', group: 'Round' },
  { size: '10"', label: '10"', serves: 'Serves 25–30', group: 'Round' },
  { size: '12"', label: '12"', serves: 'Serves 35–40', group: 'Round' },
  // Tall, sheet and slab as the bakery lists them. 12×9 and 18×6 are the same
  // 108 square inches, so they serve the same number — the shape is the choice.
  { size: 'Tall 18×9', label: 'Tall', serves: '18" × 9" · serves 40–50', group: 'Large' },
  { size: 'Sheet 12×9', label: 'Sheet cake', serves: '12" × 9" · serves 25–30', group: 'Large' },
  { size: 'Slab 18×6', label: 'Slab cake', serves: '18" × 6" · serves 25–30', group: 'Large' },
]

/** Only these can be stacked, so only these appear in the per-tier pickers. */
export const ROUND_SIZES = SIZES.filter((s) => s.group === 'Round')
export const LARGE_SIZES = SIZES.filter((s) => s.group === 'Large')

export const isRoundSize = (size: string): boolean =>
  ROUND_SIZES.some((s) => s.size === size)

export const SERVES_RANGE: Record<string, [number, number]> = {
  '4"': [4, 6],
  '6"': [8, 10],
  '8"': [15, 20],
  '10"': [25, 30],
  '12"': [35, 40],
  'Tall 18×9': [40, 50],
  'Sheet 12×9': [25, 30],
  'Slab 18×6': [25, 30],
}

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
