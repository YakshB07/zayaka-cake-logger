export interface SizeInfo {
  size: string
  serves: string
}

export const SIZES: SizeInfo[] = [
  { size: '4"', serves: 'Serves 4–6' },
  { size: '6"', serves: 'Serves 8–10' },
  { size: '8"', serves: 'Serves 15–20' },
  { size: '10"', serves: 'Serves 25–30' },
  { size: '12"', serves: 'Serves 35–40' },
]

export const SERVES_RANGE: Record<string, [number, number]> = {
  '4"': [4, 6],
  '6"': [8, 10],
  '8"': [15, 20],
  '10"': [25, 30],
  '12"': [35, 40],
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
