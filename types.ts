import type NuosDevice from './drivers/nuos/device'
import type { OperationMode } from './ariston/types'

export interface Capabilities {
  readonly measure_power: number
  readonly 'measure_power.hp': number
  readonly 'measure_power.resistor': number
  readonly measure_temperature: number
  readonly 'measure_temperature.required': number
  readonly meter_power: number
  readonly 'meter_power.hp': number
  readonly 'meter_power.resistor': number
  readonly onoff: boolean
  readonly 'onoff.auto': boolean
  readonly 'onoff.boost': boolean
  readonly 'onoff.legionella': boolean
  readonly 'onoff.preheating': boolean
  readonly operation_mode: keyof typeof OperationMode
  readonly target_temperature: number
  readonly vacation: string
}

export interface CapabilityOptionsEntries {
  readonly target_temperature: object & {
    readonly max: number
    readonly min: number
  }
}

export interface Settings {
  readonly always_on?: boolean
  readonly max?: number
  readonly min?: number
}

export interface DeviceDetails {
  readonly data: { readonly id: string }
  readonly name: string
}

export interface FlowArgs {
  readonly device: NuosDevice
  readonly onoff: boolean
  readonly operation_mode: keyof typeof OperationMode
}
