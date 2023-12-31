import { App } from 'homey' // eslint-disable-line import/no-extraneous-dependencies
import axios from 'axios'
import { wrapper } from 'axios-cookiejar-support'
import { CookieJar } from 'tough-cookie'
import { DateTime, Duration, Settings as LuxonSettings } from 'luxon'
import withAPI from './mixins/withAPI'
import {
  loginURL,
  type LoginCredentials,
  type LoginData,
  type LoginPostData,
  type HomeySettings,
  type HomeySettingValue,
} from './types'

const DOMAIN = 'www.ariston-net.remotethermo.com'
const MAX_INT32: number = 2 ** 31 - 1

wrapper(axios)
axios.defaults.jar = new CookieJar()
axios.defaults.baseURL = `https://${DOMAIN}`

export = class AristonApp extends withAPI(App) {
  public retry = true

  #loginTimeout!: NodeJS.Timeout

  readonly #retryTimeout!: NodeJS.Timeout

  public async onInit(): Promise<void> {
    LuxonSettings.defaultZone = this.homey.clock.getTimezone()
    await this.login()
  }

  public async login(
    loginCredentials: LoginCredentials = {
      username:
        (this.homey.settings.get('username') as HomeySettings['username']) ??
        '',
      password:
        (this.homey.settings.get('password') as HomeySettings['password']) ??
        '',
    },
  ): Promise<boolean> {
    this.clearLoginRefresh()
    try {
      const { username, password } = loginCredentials
      if (!username || !password) {
        return false
      }
      const postData: LoginPostData = {
        email: username,
        password,
        rememberMe: true,
      }
      const { data, config } = await this.api.post<LoginData>(
        loginURL,
        postData,
      )
      const { ok } = data
      if (ok) {
        this.setSettings({
          username,
          password,
          // @ts-expect-error: `CookieJar` is partially typed
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expires: (config.jar?.store?.idx?.[DOMAIN]?.['/']?.[
            '.AspNet.ApplicationCookie'
          ]?.expires ?? null) as HomeySettings['expires'],
        })
        this.refreshLogin()
      }
      return ok
    } catch (error: unknown) {
      return false
    }
  }

  public handleRetry(): void {
    this.retry = false
    this.homey.clearTimeout(this.#retryTimeout)
    this.homey.setTimeout(
      () => {
        this.retry = true
      },
      Duration.fromObject({ minutes: 1 }).as('milliseconds'),
    )
  }

  private refreshLogin(): void {
    const expires: string =
      (this.homey.settings.get('expires') as HomeySettings['expires']) ?? ''
    const ms: number = DateTime.fromISO(expires)
      .minus({ days: 1 })
      .diffNow()
      .as('milliseconds')
    if (ms > 0) {
      this.#loginTimeout = this.homey.setTimeout(
        async (): Promise<void> => {
          await this.login()
        },
        Math.min(ms, MAX_INT32),
      )
    }
  }

  private clearLoginRefresh(): void {
    this.homey.clearTimeout(this.#loginTimeout)
  }

  private setSettings(settings: Partial<HomeySettings>): void {
    Object.entries(settings)
      .filter(
        ([setting, value]: [string, HomeySettingValue]) =>
          value !== this.homey.settings.get(setting),
      )
      .forEach(([setting, value]: [string, HomeySettingValue]): void => {
        this.homey.settings.set(setting, value)
      })
  }
}
