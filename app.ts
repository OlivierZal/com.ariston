import { App } from 'homey' // eslint-disable-line import/no-extraneous-dependencies
import axios from 'axios'
import { wrapper } from 'axios-cookiejar-support'
import { CookieJar } from 'tough-cookie'
import { DateTime } from 'luxon'
import withAPI from './mixins/withAPI'
import {
  loginURL,
  type LoginCredentials,
  type LoginData,
  type LoginPostData,
  type HomeySettings,
  type HomeySettingValue,
} from './types'

const domain = 'www.ariston-net.remotethermo.com'

wrapper(axios)
axios.defaults.jar = new CookieJar()
axios.defaults.baseURL = `https://${domain}`

export = class AristonApp extends withAPI(App) {
  #loginTimeout!: NodeJS.Timeout

  public async onInit(): Promise<void> {
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
          expires: (config.jar?.store?.idx?.[domain]?.['/']?.[
            '.AspNet.ApplicationCookie'
          ]?.expires ?? null) as HomeySettings['expires'],
        })
        await this.refreshLogin()
      }
      return ok
    } catch (error: unknown) {
      return false
    }
  }

  private async refreshLogin(): Promise<void> {
    const expires: string =
      (this.homey.settings.get('expires') as HomeySettings['expires']) ?? ''
    const ms = Number(DateTime.fromISO(expires).minus({ days: 1 }).diffNow())
    if (ms > 0) {
      const maxTimeout: number = 2 ** 31 - 1
      this.#loginTimeout = this.homey.setTimeout(
        async (): Promise<void> => {
          await this.login()
        },
        Math.min(ms, maxTimeout),
      )
      return
    }
    await this.login()
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
