import { DateTime, Duration, Settings as LuxonSettings } from 'luxon'
import type {
  HomeySettings,
  LoginCredentials,
  LoginData,
  ValueOf,
} from './types'
import { App } from 'homey'
import { CookieJar } from 'tough-cookie'
import axios from 'axios'
import withAPI from './mixins/withAPI'
import { wrapper } from 'axios-cookiejar-support'

const DOMAIN = 'www.ariston-net.remotethermo.com'
const MAX_INT32 = 2147483647

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
      password: this.getHomeySetting('password') ?? '',
      username: this.getHomeySetting('username') ?? '',
    },
  ): Promise<boolean> {
    this.clearLoginRefresh()
    const { username, password } = loginCredentials
    if (username && password) {
      try {
        const { data, config } = await this.api.post<LoginData>(
          AristonApp.loginURL,
          {
            email: username,
            password,
            rememberMe: true,
          },
        )
        if (data.ok) {
          this.setHomeySettings({
            expires:
              // @ts-expect-error: `CookieJar` is partially typed
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              config.jar?.store?.idx?.[DOMAIN]?.['/']?.[
                '.AspNet.ApplicationCookie'
              ]?.expires as string,
            password,
            username,
          })
          this.refreshLogin()
        }
        return data.ok
      } catch (error: unknown) {
        // Pass
      }
    }
    return false
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
    const expires: string = this.getHomeySetting('expires') ?? ''
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

  private setHomeySettings(settings: Partial<HomeySettings>): void {
    Object.entries(settings)
      .filter(
        ([setting, value]: [string, ValueOf<HomeySettings>]) =>
          value !== this.getHomeySetting(setting as keyof HomeySettings),
      )
      .forEach(([setting, value]: [string, ValueOf<HomeySettings>]) => {
        this.homey.settings.set(setting, value)
      })
  }
}
