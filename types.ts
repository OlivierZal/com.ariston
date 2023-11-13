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

  readonly setWarning?: (warning: string) => Promise<void>
}
/* eslint-enable @typescript-eslint/no-explicit-any */

type ValueOf<T> = T[keyof T]

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

export interface DeviceDetails {
  readonly data: {
    readonly id: string
  }
  readonly name: string
}
