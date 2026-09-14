export type PaymentMethod = 'cash' | 'e-transfer' | 'card'

export type OrderStatus = 'upcoming' | 'completed'

export interface ReminderRecord {
  sentAt: string
  ok: boolean
  detail: string
}

export interface RemindersSent {
  twoDay?: ReminderRecord
  oneDay?: ReminderRecord
  dayOf?: ReminderRecord
}

export interface CakeOrder {
  id: string
  createdAt: string
  customerName: string
  customerPhone: string
  /** display string, e.g. '8"' or '6" + 8"' for tiered cakes */
  size: string
  tierCount: number // 1 = single, 2 = double, 3 = triple
  tierSizes: string[] // inches per tier, bottom-up not enforced; length === tierCount
  flavour: string
  pickupDate: string // YYYY-MM-DD
  pickupTime: string // HH:mm ('' if not set)
  price: number
  depositAmount: number
  depositMethod: PaymentMethod | ''
  balanceMethod: PaymentMethod | ''
  balancePaid: boolean
  cakeText: string
  designNotes: string
  imageUrls: string[]
  status: OrderStatus
  remindersSent: RemindersSent
}

export type NewOrder = Omit<CakeOrder, 'id' | 'createdAt' | 'remindersSent'>
