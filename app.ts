import { App } from 'homey' // eslint-disable-line import/no-extraneous-dependencies
import axios from 'axios'
import withAPI, { getErrorMessage } from './mixins/withAPI'
import type {
  LoginCredentials,
  LoginData,
  LoginPostData,
  HomeySettings,
  HomeySettingValue,
} from './types'

axios.defaults.baseURL = 'https://www.ariston-net.remotethermo.com/api/v2'
axios.defaults.headers.common['Content-Type'] = 'application/json'

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
        usr: username,
        pwd: password,
      }
      const { data } = await this.api.post<LoginData>(
        '/accounts/login',
        postData,
      )
      const { token } = data
      this.setSettings({
        username,
        password,
        token,
      })
      this.refreshLogin(loginCredentials)
      return true
    } catch (error: unknown) {
      throw new Error(getErrorMessage(error))
    }
  }

  private refreshLogin(loginCredentials: LoginCredentials): void {
    this.#loginTimeout = this.homey.setTimeout(async (): Promise<void> => {
      await this.tryLogin(loginCredentials)
    }, 86400000)
    this.log('Login refresh has been scheduled')
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
