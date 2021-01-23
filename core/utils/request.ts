const request = require('request');
const PROXY = 'http://127.0.0.1:7890';
const proxyOptions = {
  proxy:PROXY
}

class Request {
  get<T, R>(url, options): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      request.get(url, {...proxyOptions, ...options, json: true}, (err, resp, body: R) => {
        if (err) {
          reject(err)
        } else {
          resolve(body)
        }
      })
    });
  }

  post<T, R>(url, body, options): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      request.post(url, {
        ...proxyOptions,
        ...options,
        body,
        json: true
      }, (err, resp, data: R) => {
        if (err) {
          reject(err)
        }
        resolve(data)
      })
    })
  }

  delete<T, R>(url, body, options): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      request.delete(url, {
        ...proxyOptions,
        body,
        json: true,
        ...options
      }, (err, resp, data: R) => {
        if (err) {
          reject(err)
        }
        resolve(data)
      })
    })
  }
}

export default new Request();
