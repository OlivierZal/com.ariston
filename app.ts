import { App } from 'homey' // eslint-disable-line import/no-extraneous-dependencies
import axios from 'axios'
import { wrapper } from 'axios-cookiejar-support'
import { CookieJar } from 'tough-cookie'
import { DateTime } from 'luxon'
import withAPI, { getErrorMessage } from './mixins/withAPI'
import type {
  LoginCredentials,
  LoginData,
  LoginPostData,
  HomeySettings,
  HomeySettingValue,
} from './types'

const domain = 'www.ariston-net.remotethermo.com'

wrapper(axios)
axios.defaults.jar = new CookieJar()
axios.defaults.baseURL = `https://${domain}`

export = class AristonApp extends withAPI(App) {
  #loginTimeout!: NodeJS.Timeout

  public async onInit(): Promise<void> {
    const loginCredentials: LoginCredentials = {
      username:
        (this.homey.settings.get('username') as HomeySettings['username']) ??
        '',
      password:
        (this.homey.settings.get('password') as HomeySettings['password']) ??
        '',
    }
    await this.tryLogin(loginCredentials)
  }

  public async login(loginCredentials: LoginCredentials): Promise<boolean> {
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
        '/R2/Account/Login',
        postData,
      )
      const { ok } = data
      if (ok) {
        this.setSettings({
          username,
          password,
          // @ts-expect-error: CookieJar is partially typed
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expires: (config.jar?.store?.idx?.[domain]?.['/']?.[
            '.AspNet.ApplicationCookie'
          ]?.expires ?? null) as HomeySettings['expires'],
        })
        await this.refreshLogin()
      }
      return ok
    } catch (error: unknown) {
      throw new Error(getErrorMessage(error))
    }
  }

  private async refreshLogin(): Promise<void> {
    const loginCredentials: LoginCredentials = {
      username:
        (this.homey.settings.get('username') as HomeySettings['username']) ??
        '',
      password:
        (this.homey.settings.get('password') as HomeySettings['password']) ??
        '',
    }
    const expires: string | null = this.homey.settings.get(
      'expires',
    ) as HomeySettings['expires']
    const ms: number =
      expires !== null
        ? Number(DateTime.fromISO(expires).minus({ days: 1 }).diffNow())
        : 0
    if (ms) {
      const maxTimeout: number = 2 ** 31 - 1
      const interval: number = Math.min(ms, maxTimeout)
      this.#loginTimeout = this.homey.setTimeout(async (): Promise<void> => {
        await this.tryLogin(loginCredentials)
      }, interval)
      this.log('Login refresh has been scheduled')
      return
    }
    await this.tryLogin(loginCredentials)
  }

  private async tryLogin(loginCredentials: LoginCredentials): Promise<void> {
    try {
      await this.login(loginCredentials)
    } catch (error: unknown) {
      // Logged by `withAPI`
    }
  }

  private clearLoginRefresh(): void {
    this.homey.clearTimeout(this.#loginTimeout)
    this.log('Login refresh has been paused')
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
