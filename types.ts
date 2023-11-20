import type Homey from 'homey/lib/Homey'

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Loggable {
  /* eslint-disable @typescript-eslint/method-signature-style */
  error(...errorArgs: any[]): void
  log(...logArgs: any[]): void
  /* eslint-enable @typescript-eslint/method-signature-style */
}

export type LogClass = abstract new (...args: any[]) => Loggable

export type HomeyClass = new (...args: any[]) => Loggable & {
  readonly homey: Homey

  readonly setWarning?: (warning: string | null) => Promise<void>
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export type CapabilityValue = boolean | number | string

type ValueOf<T> = T[keyof T]

export interface Settings {
  readonly always_on?: boolean
}

export type SettingValue = ValueOf<Settings>

interface BaseHomeySettingValue<T> {
  readonly username: T
  readonly password: T
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

export interface Data {
  readonly data: {
    readonly plantData: {
      on?: boolean
      waterTemp?: number
      comfortTemp?: number
      opMode?: number
    }
    readonly viewModel: {
      on?: boolean
      comfortTemp?: number
      opMode?: number
    }
  }
}

export type PlantData = Readonly<Required<Data['data']['plantData']>>

export interface DeviceDetails {
  readonly data: {
    readonly id: string
  }
  readonly name: string
}
