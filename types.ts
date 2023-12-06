import type Homey from 'homey/lib/Homey'

export const loginURL = '/R2/Account/Login'

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Loggable {
  /* eslint-disable @typescript-eslint/method-signature-style */
  error(...errorArgs: any[]): void
  log(...logArgs: any[]): void
  /* eslint-enable @typescript-eslint/method-signature-style */
}

export type LogClass = new (...args: any[]) => Loggable

export type HomeyClass = new (...args: any[]) => Loggable & {
  readonly homey: Homey

  readonly setWarning?: (warning: string | null) => Promise<void>
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export type CapabilityValue = boolean | number | string | null

type ValueOf<T> = T[keyof T]

export interface Settings {
  readonly always_on?: boolean
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
  procReqTemp?: number
  waterTemp?: number
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
    readonly plantData: Readonly<Required<PostPlantData>>
    readonly plantSettings?: {
      readonly antilegionellaOnOff: true
      readonly preHeatingOnOff: true
    }
    readonly viewModel: Readonly<Required<ViewModel>>
  }
}

interface BasePostSettings {
  readonly new: 0 | 1
  readonly old: 0 | 1
}

export interface PostSettings {
  SlpAntilegionellaOnOff?: BasePostSettings
  SlpPreHeatingOnOff?: BasePostSettings
}

export interface GetSettings {
  readonly success: boolean
}

export interface DeviceDetails {
  readonly data: {
    readonly id: string
  }
  readonly name: string
}
