import type { SimpleClass } from 'homey'
import type Homey from 'homey/lib/Homey'

export const loginURL = '/R2/Account/Login'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HomeyClass = new (...args: any[]) => SimpleClass & {
  readonly homey: Homey
  readonly setWarning?: (warning: string | null) => Promise<void>
}

export type CapabilityOptions = object & {
  readonly min: number
  readonly max: number
}

export type CapabilityValue = boolean | number | string | null

type ValueOf<T> = T[keyof T]

export interface Settings {
  readonly always_on?: boolean
  readonly min?: number
  readonly max?: number
}

export type SettingValue = ValueOf<Settings>

interface BaseHomeySettingValue<T> {
  readonly username: T
  readonly password: T
  readonly expires: T
}

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
  opMode?: number
}

interface PostPlantData extends BaseData {
  mode?: number
}

interface ViewModel extends BaseData {
  plantMode?: number
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
      readonly antilegionellaOnOff: true
      readonly preHeatingOnOff: true
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
  SlpAntilegionellaOnOff?: BasePostSettingsWithOld<0 | 1>
  SlpPreHeatingOnOff?: BasePostSettingsWithOld<0 | 1>
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
