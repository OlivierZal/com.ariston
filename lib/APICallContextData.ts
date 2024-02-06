import type { InternalAxiosRequestConfig } from 'axios'

export default abstract class APICallContextData {
  public readonly method: InternalAxiosRequestConfig['method']

  public readonly url: InternalAxiosRequestConfig['url']

  public readonly params: InternalAxiosRequestConfig['params']

  public constructor(config?: InternalAxiosRequestConfig) {
    this.method = config?.method?.toUpperCase()
    this.url = config?.url
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    this.params = config?.params
  }
}
