import { type Cookie, CookieJar } from 'tough-cookie'
import { DateTime, Settings as LuxonSettings } from 'luxon'
import type { HomeySettings, LoginCredentials, ValueOf } from './types'
import { App } from 'homey'
import axios from 'axios'
import withAPI from './mixins/withAPI'
import { wrapper } from 'axios-cookiejar-support'

const DOMAIN = 'https://www.ariston-net.remotethermo.com'
const MAX_INT32 = 2147483647
const NO_TIME_DIFF = 0

wrapper(axios)
axios.defaults.baseURL = DOMAIN
axios.defaults.jar = new CookieJar()
axios.defaults.withCredentials = true

export = class AristonApp extends withAPI(App) {
  #retry = true

  #loginTimeout!: NodeJS.Timeout

  #retryTimeout!: NodeJS.Timeout

  public get retry(): boolean {
    return this.#retry
  }

  public set retry(value: boolean) {
    this.#retry = value
  }

  public get retryTimeout(): NodeJS.Timeout {
    return this.#retryTimeout
  }

  public set retryTimeout(value: NodeJS.Timeout) {
    this.#retryTimeout = value
  }

  public async onInit(): Promise<void> {
    LuxonSettings.defaultZone = this.homey.clock.getTimezone()
    await this.login()
  }

  public async login(
    { password, username }: LoginCredentials = {
      password: this.getHomeySetting('password') ?? '',
      username: this.getHomeySetting('username') ?? '',
    },
  ): Promise<boolean> {
    this.clearLoginRefresh()
    if (username && password) {
      try {
        const { config, data } = await this.apiLogin({
          email: username,
          password,
          rememberMe: true,
        })
        if (data.ok && config.jar) {
          this.setHomeySettings({ password, username })
          this.setCookieExpiration(config.jar)
          this.refreshLogin()
        }
        return data.ok
      } catch (error: unknown) {
        // Pass
      }
    }
    return false
  }

  private refreshLogin(): void {
    const expires: string = this.getHomeySetting('expires') ?? ''
    const ms: number = DateTime.fromISO(expires)
      .minus({ days: 1 })
      .diffNow()
      .as('milliseconds')
    if (ms > NO_TIME_DIFF) {
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

  private getHomeySetting<K extends keyof HomeySettings>(
    setting: K,
  ): HomeySettings[K] {
    return this.homey.settings.get(setting) as HomeySettings[K]
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

  private setCookieExpiration(jar: CookieJar): void {
    jar.getCookies(DOMAIN, (error, cookies): void => {
      if (error) {
        this.error(error.message)
        return
      }
      const aspNetCookie: Cookie | undefined = cookies.find(
        (cookie: Cookie) => cookie.key === '.AspNet.ApplicationCookie',
      )
      if (aspNetCookie) {
        this.setHomeySettings({ expires: String(aspNetCookie.expires) })
      }
    })
  }
}
