import { DateTime, Duration } from 'luxon'
import type {
  GetData,
  GetSettings,
  LoginCredentials,
  LoginData,
  LoginPostData,
  Plant,
  PostData,
  PostSettings,
  ReportData,
} from './types'
import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import APICallRequestData from './lib/APICallRequestData'
import APICallResponseData from './lib/APICallResponseData'
import { CookieJar } from 'tough-cookie'
import createAPICallErrorData from './lib/APICallErrorData'
import { wrapper } from 'axios-cookiejar-support'

interface APISettings {
  readonly expires?: string | null
  readonly password?: string | null
  readonly username?: string | null
}

interface SettingManager {
  get: <K extends keyof APISettings>(
    key: K,
  ) => APISettings[K] | null | undefined
  set: <K extends keyof APISettings>(key: K, value: APISettings[K]) => void
}

const DOMAIN = 'https://www.ariston-net.remotethermo.com'
const LOGIN_URL = '/R2/Account/Login'

export default class AristonAPI {
  #retry = true

  #retryTimeout!: NodeJS.Timeout

  readonly #api: AxiosInstance

  readonly #errorLogger

  readonly #logger

  readonly #settingManager: SettingManager

  public constructor(
    settingManager: SettingManager,
    // eslint-disable-next-line no-console
    logger = console.log,
    errorLogger = logger,
  ) {
    this.#settingManager = settingManager
    this.#logger = logger
    this.#errorLogger = errorLogger
    wrapper(axios)
    this.#api = axios.create({
      baseURL: DOMAIN,
      jar: new CookieJar(),
      withCredentials: true,
    })
    this.#setupAxiosInterceptors()
  }

  public async applyLogin(data?: LoginCredentials): Promise<boolean> {
    const { password, username } = data ?? {
      password: this.#settingManager.get('password') ?? '',
      username: this.#settingManager.get('username') ?? '',
    }
    if (username && password) {
      try {
        return (
          await this.login({ email: username, password, rememberMe: true })
        ).data.ok
      } catch (error) {
        if (typeof data !== 'undefined') {
          throw new Error(
            error instanceof Error ? error.message : String(error),
          )
        }
      }
    }
    return false
  }

  public async login(postData: LoginPostData): Promise<{ data: LoginData }> {
    const response = await this.#api.post<LoginData>(LOGIN_URL, postData)
    if (response.data.ok) {
      this.#settingManager.set('username', postData.email)
      this.#settingManager.set('password', postData.password)
    }
    return response
  }

  public async plantData(
    id: string,
    postData?: PostData,
  ): Promise<{ data: GetData }> {
    return this.#api<GetData>({
      method: postData ? 'POST' : 'GET',
      url: `/R2/PlantHomeSlp/${postData ? 'SetData' : 'GetData'}/${id}`,
      ...(postData ? { data: postData } : {}),
      ...(postData
        ? {}
        : { params: { fetchSettings: 'false', fetchTimeProg: 'false' } }),
    })
  }

  public async plantMetering(id: string): Promise<{ data: ReportData }> {
    return this.#api.post<ReportData>(`/R2/PlantMetering/GetData/${id}`)
  }

  public async plantSettings(
    id: string,
    settings: PostSettings,
  ): Promise<{ data: GetSettings }> {
    return this.#api.post<GetSettings>(
      `/api/v2/velis/slpPlantData/${id}/PlantSettings`,
      settings,
    )
  }

  public async plants(): Promise<{ data: Plant[] }> {
    return this.#api.get<Plant[]>('/api/v2/velis/plants')
  }

  async #handleError(error: AxiosError): Promise<AxiosError> {
    const apiCallData = createAPICallErrorData(error)
    this.#errorLogger(String(apiCallData))
    if (
      error.response?.status === axios.HttpStatusCode.MethodNotAllowed &&
      this.#retry &&
      error.config?.url !== LOGIN_URL
    ) {
      this.#handleRetry()
      if ((await this.applyLogin()) && error.config) {
        return this.#api.request(error.config)
      }
    }
    return Promise.reject(error)
  }

  async #handleRequest(
    config: InternalAxiosRequestConfig,
  ): Promise<InternalAxiosRequestConfig> {
    if (config.url !== LOGIN_URL) {
      const expires = this.#settingManager.get('expires') ?? ''
      if (expires && DateTime.fromISO(expires) < DateTime.now()) {
        await this.applyLogin()
      }
    }
    this.#logger(String(new APICallRequestData(config)))
    return config
  }

  async #handleResponse(response: AxiosResponse): Promise<AxiosResponse> {
    this.#logger(String(new APICallResponseData(response)))
    if (
      // @ts-expect-error: `axios` is partially typed
      response.headers.hasContentType('application/json') !== true &&
      this.#retry &&
      response.config.url !== LOGIN_URL
    ) {
      this.#handleRetry()
      if (await this.applyLogin()) {
        return this.#api.request(response.config)
      }
    }
    if (response.config.jar) {
      this.#setCookieExpiration(response.config.jar)
    }
    return response
  }

  #handleRetry(): void {
    this.#retry = false
    clearTimeout(this.#retryTimeout)
    this.#retryTimeout = setTimeout(
      () => {
        this.#retry = true
      },
      Duration.fromObject({ minutes: 1 }).as('milliseconds'),
    )
  }

  #setCookieExpiration(jar: CookieJar): void {
    jar.getCookies(DOMAIN, (error, cookies): void => {
      if (error) {
        this.#errorLogger(error.message)
        return
      }
      const aspNetCookie = cookies.find(
        (cookie) => cookie.key === '.AspNet.ApplicationCookie',
      )
      if (aspNetCookie) {
        const expiresDate = new Date(String(aspNetCookie.expires))
        this.#settingManager.set('expires', expiresDate.toISOString())
      }
    })
  }

  #setupAxiosInterceptors(): void {
    this.#api.interceptors.request.use(
      async (
        config: InternalAxiosRequestConfig,
      ): Promise<InternalAxiosRequestConfig> => this.#handleRequest(config),
      async (error: AxiosError): Promise<AxiosError> =>
        this.#handleError(error),
    )
    this.#api.interceptors.response.use(
      async (response: AxiosResponse): Promise<AxiosResponse> =>
        this.#handleResponse(response),
      async (error: AxiosError): Promise<AxiosError> =>
        this.#handleError(error),
    )
  }
}
