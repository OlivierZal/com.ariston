import type { SimpleClass } from 'homey'
import type Homey from 'homey/lib/Homey'
import type NuosDevice from './drivers/nuos/device'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HomeyClass = new (...args: any[]) => SimpleClass & {
  readonly homey: Homey
  readonly setWarning?: (warning: string | null) => Promise<void>
}

export enum Mode {
  auto = 1,
  manual = 2,
}

export enum OperationMode {
  green = 0,
  comfort = 1,
  fast = 2,
  auto = 3,
}

export enum Switch {
  off = 0,
  on = 1,
}

export interface Capabilities {
  readonly measure_temperature: number
  readonly 'measure_temperature.required': number
  readonly meter_power: number
  readonly 'meter_power.hp': number
  readonly 'meter_power.resistor': number
  readonly measure_power: number
  readonly 'measure_power.hp': number
  readonly 'measure_power.resistor': number
  readonly onoff: boolean
  readonly 'onoff.auto': boolean
  readonly 'onoff.boost': boolean
  readonly 'onoff.legionella': boolean
  readonly 'onoff.preheating': boolean
  readonly operation_mode: keyof typeof OperationMode
  readonly target_temperature: number
  readonly vacation: string
}

export type CapabilityKey = keyof Capabilities

export type CapabilityOptions = object & {
  readonly min: number
  readonly max: number
}

type ValueOf<T> = T[keyof T]

export interface Settings {
  readonly always_on?: boolean
  readonly min?: number
  readonly max?: number
}

export type SettingKey = keyof Settings

export type SettingValue = ValueOf<Settings>

interface BaseHomeySettingValue<T> {
  readonly username: T
  readonly password: T
  readonly expires: T
}

export type HomeySettingKey = keyof HomeySettings

export type HomeySettings = BaseHomeySettingValue<string | null>

export type HomeySettingValue = ValueOf<HomeySettings>

export interface LoginCredentials {
  readonly username: string
  readonly password: string
}

export interface LoginPostData {
  readonly email: string
  readonly password: string
  readonly rememberMe: true
}

export interface LoginData {
  readonly ok: boolean
}

export interface Plant {
  readonly gw: string
  readonly name: string
  readonly wheType: number
}

interface BaseData {
  on?: boolean
  boostOn?: boolean
  comfortTemp?: number
  holidayUntil?: string | null
  opMode?: OperationMode
}

interface PostPlantData extends BaseData {
  mode?: Mode
}

interface ViewModel extends BaseData {
  plantMode?: Mode
}

export interface PostData {
  readonly plantData: PostPlantData
  readonly viewModel: ViewModel
}

export interface GetData {
  readonly data: {
    readonly plantData: Readonly<Required<PostPlantData>> & {
      readonly procReqTemp: number
      readonly waterTemp: number
    }
    readonly plantSettings?: {
      readonly antilegionellaOnOff: boolean
      readonly preHeatingOnOff: boolean
      readonly minSetpointTemp: { value: number }
      readonly maxSetpointTemp: { value: number }
    }
    readonly viewModel: Readonly<Required<ViewModel>>
  }
}

interface BasePostSettings<T> {
  readonly new: T
}

interface BasePostSettingsWithOld<T> extends BasePostSettings<T> {
  readonly old: T
}

export interface PostSettings {
  SlpAntilegionellaOnOff?: BasePostSettingsWithOld<Switch>
  SlpPreHeatingOnOff?: BasePostSettingsWithOld<Switch>
  SlpMinSetpointTemperature?: BasePostSettings<number>
  SlpMaxSetpointTemperature?: BasePostSettings<number>
}

export interface GetSettings {
  readonly success: boolean
}

export interface DeviceDetails {
  readonly data: { readonly id: string }
  readonly name: string
}

export interface HistogramData {
  readonly tab: string
  readonly period: string
  readonly series: 'DhwHp' | 'DhwResistor'
  readonly items: readonly {
    readonly x:
      | '00'
      | '02'
      | '04'
      | '06'
      | '08'
      | '10'
      | '12'
      | '14'
      | '16'
      | '18'
      | '20'
      | '22'
    readonly y: number
  }[]
}

export interface ReportData {
  readonly data: {
    readonly asKwhRaw: {
      readonly histogramData: readonly HistogramData[]
    }
  }
}

export interface FlowArgs {
  readonly device: NuosDevice
  readonly onoff: boolean
  readonly operation_mode: keyof typeof OperationMode
}
