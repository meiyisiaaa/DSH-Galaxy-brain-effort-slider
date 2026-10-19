import type { ReactNode } from 'react'

/** Presentation contract. IDs and labels always come from the selected host model. */
export interface EffortOption { readonly value: string; readonly label: string }
export interface GalaxyEffortSliderProps {
  readonly options: readonly EffortOption[]
  readonly value: string | undefined
  readonly onCommit: (value: string) => Promise<void>
  readonly disabled: boolean
  readonly pending: boolean
  readonly error?: string
  readonly modelLabel?: string
  readonly currentLabel?: string
  readonly disabledReason?: string
  readonly modelPicker?: ReactNode
  readonly selectionKey?: string
  readonly triggerLabel?: string
  readonly triggerDisabled?: boolean
  readonly avatarSrc?: string
  readonly avatarAlt?: string
  readonly avatarLayout?: 'single' | 'triptych'
}
