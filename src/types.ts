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

// ── Business tracker ──────────────────────────────────────────────────────────

/** How often a fixed cost is actually paid. Analytics spreads it per month. */
export type Cadence = 'weekly' | 'monthly' | 'quarterly' | 'yearly'

/** A recurring bill that doesn't change with how many cakes are sold. */
export interface FixedCost {
  id: string
  createdAt: string
  name: string // owner-named, e.g. 'Rent', 'Insurance', 'Website'
  amount: number // amount per `cadence`
  cadence: Cadence
  startMonth: string // YYYY-MM — first month this bill applies
  endMonth: string // YYYY-MM, '' = still paying it
  notes: string
}

/** Owner-named bucket an expense goes into. Unlimited, renameable. */
export interface CostCategory {
  id: string
  createdAt: string
  name: string // e.g. 'Ingredients', 'Boxes & Packaging', 'Gas'
  archived: boolean // hidden from pickers, kept so old expenses keep their name
}

/** One-off money going out, filed under a category. */
export interface Expense {
  id: string
  createdAt: string
  date: string // YYYY-MM-DD
  categoryId: string
  amount: number
  vendor: string
  note: string
  orderId: string // '' unless it was bought for one specific cake
}

/** Money in that isn't a logged cake order — walk-ins, market days, classes. */
export interface OtherIncome {
  id: string
  createdAt: string
  date: string // YYYY-MM-DD
  source: string
  amount: number
  note: string
}

/**
 * One-row collection holding the owner's own preferences — goals and tax
 * settings. Kept as a collection so it reuses the same store and API as
 * everything else; the app always reads/writes the first row.
 */
export interface Settings {
  id: string
  createdAt: string
  /** what she wants to make in a month, 0 = not set */
  revenueGoal: number
  profitGoal: number
  cakesGoal: number
  /** registered to charge HST? Ontario is 13%. */
  hstRegistered: boolean
  hstRate: number
  /** prices already include tax (most home bakeries) vs added on top */
  pricesIncludeTax: boolean
  /**
   * The month the bakery started keeping books here (YYYY-MM), '' = not set.
   *
   * Recurring bills would otherwise be charged backwards forever: add rent
   * today and last January suddenly shows a month of rent against no sales,
   * inventing losses for a time she wasn't tracking anything.
   */
  startMonth: string
}

export interface FinanceData {
  fixedCosts: FixedCost[]
  categories: CostCategory[]
  expenses: Expense[]
  income: OtherIncome[]
  settings: Settings[]
}

export const DEFAULT_SETTINGS: Omit<Settings, 'id' | 'createdAt'> = {
  revenueGoal: 0,
  profitGoal: 0,
  cakesGoal: 0,
  hstRegistered: false,
  hstRate: 0.13,
  pricesIncludeTax: true,
  startMonth: '',
}

export type FinanceKind = keyof FinanceData

export type NewFixedCost = Omit<FixedCost, 'id' | 'createdAt'>
export type NewCostCategory = Omit<CostCategory, 'id' | 'createdAt'>
export type NewExpense = Omit<Expense, 'id' | 'createdAt'>
export type NewOtherIncome = Omit<OtherIncome, 'id' | 'createdAt'>
