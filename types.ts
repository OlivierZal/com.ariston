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

export type CapabilityValue = boolean | number | null

type ValueOf<T> = T[keyof T]

export interface Settings {
  readonly always_on?: boolean
}

export type SettingValue = ValueOf<Settings>

interface BaseHomeySettingValue<T> {
  readonly username: T
  readonly password: T
  readonly token: T
}

export type HomeySettings = BaseHomeySettingValue<string | null>

export type HomeySettingValue = ValueOf<HomeySettings>

export interface LoginCredentials {
  readonly username: string
  readonly password: string
}

export interface LoginPostData {
  readonly usr: string
  readonly pwd: string
}

export interface LoginData {
  readonly token: string
}

export interface Plant {
  readonly gw: string
  readonly name: string
}

export interface PlantData {
  readonly on: boolean
  readonly mode: number
  readonly waterTemp: number
  readonly comfortTemp: number
  readonly reducedTemp: number
  readonly procReqTemp: number
  readonly opMode: number
  readonly boostOn: boolean
  readonly hpState: number
}

export interface PlantSettings {
  readonly SlpMaxGreenTemperature: number
  readonly SlpMaxSetpointTemperature: number
  readonly SlpMaxSetpointTemperatureMin: number
  readonly SlpMaxSetpointTemperatureMax: number
  readonly SlpMinSetpointTemperature: number
  readonly SlpMinSetpointTemperatureMin: number
  readonly SlpMinSetpointTemperatureMax: number
  readonly SlpAntilegionellaOnOff: number
  readonly SlpPreHeatingOnOff: number
  readonly SlpHeatingRate: number
  readonly SlpHcHpMode: number
}

export interface Success {
  readonly success: boolean
}

export interface Failure {
  readonly Message?: string
}

export interface DeviceDetails {
  readonly data: {
    readonly id: string
  }
  readonly name: string
}
