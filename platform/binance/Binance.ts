import {ETradeStatus as ECoreTradeStatus, IBotPlatformIndependentAbilities, IBotTrade} from '../../core/bot/types';
import request from '../../core/utils/request';
import {apiKey, apiSecret} from './config';
import {
  EAPIErrorCode,
  ETimeInForce,
  ETradeDirection,
  ETradeRespType,
  ETradeStatus,
  ETradeType,
  ICancelTradeRequestParams,
  ICancelTradeResponseParams,
  IGetPriceRequestParams,
  IGetPriceResponseParams,
  ISearchTradeRequestParams,
  ISearchTradeResponseParams,
  ITradeRequestParams,
  ITradeResponseParams,
  TBinanceResp
} from './types';
import GridError from '../../core/utils/GridError';

const crypto = require('crypto')

const tradeStatusMap: {
  [key: string]: ECoreTradeStatus
} = {
  [ETradeStatus.FILLED]: ECoreTradeStatus.SUCCESS,
  [ETradeStatus.EXPIRED]: ECoreTradeStatus.FINISHED,
  [ETradeStatus.CANCELED]: ECoreTradeStatus.FINISHED,
  [ETradeStatus.NEW]: ECoreTradeStatus.NOT_START,
  [ETradeStatus.PARTIALLY_FILLED]: ECoreTradeStatus.PENDING,
  [ETradeStatus.REJECTED]: ECoreTradeStatus.FAILED
}

const orderUrl = 'https://api.binance.com/api/v3/order'
const priceUrl = 'https://api.binance.com/api/v3/ticker/price'
const balanceUrl = 'https://api.binance.com/sapi/v1/capital/config/getall'

export default class Binance implements IBotPlatformIndependentAbilities {

  async buyCoin(price: number, anchorCoinCount: number, tradingPair: string): Promise<string> {
    const params: ITradeRequestParams = {
      symbol: tradingPair,
      side: ETradeDirection.BUY,
      type: ETradeType.LIMIT,
      timeInForce: ETimeInForce.GTC,
      timestamp: +new Date(),
      quantity: Number((anchorCoinCount / price).toFixed(2)),
      price,
      newOrderRespType: ETradeRespType.ACK
    }
    try {
      const resp = await this.post<ITradeRequestParams, ITradeResponseParams>(orderUrl, params);
      if (!resp.clientOrderId) {
        throw resp;
      }
      return resp.clientOrderId;
    } catch(e) {
      GridError.logError(e);
    }
    return '';
  }

  async cancelTrade(tid: string, tradingPair: string): Promise<boolean> {
    const params: ICancelTradeRequestParams = {
      symbol: tradingPair,
      timestamp: +new Date(),
      origClientOrderId: tid
    }
    try {
      const resp = await this.delete<ICancelTradeRequestParams, ICancelTradeResponseParams>(orderUrl, params);
      const finishedStatus = [
        ETradeStatus.CANCELED,
        ETradeStatus.EXPIRED,
        ETradeStatus.FILLED
      ];
      return finishedStatus.includes(resp.status);
    } catch(e) {
      GridError.logError(e)
    }
    return false
  }

  async getAccountBalance(key: string): Promise<number> {
    try {
      const resp = await this.get<any, any>(balanceUrl, {timestamp: +new Date()}, true);
      return Number(resp.filter(coin => {
        return coin.coin === key
      })[0].free);
    } catch(err) {
      GridError.logError(err);
    }
    return NaN;
  }

  async getCurrentPrice(tradePair: string): Promise<number> {
    const params: IGetPriceRequestParams = {
      symbol: tradePair
    }

    try {
      const resp = await this.get<IGetPriceRequestParams, IGetPriceResponseParams>(priceUrl, params, false);
      return parseFloat(resp.price);
    } catch(err) {
      GridError.logError(err);
    }
    return NaN;
  }

  async searchTrade(tid: string, tradingPair: string): Promise<IBotTrade> {
    const params: ISearchTradeRequestParams = {
      symbol: tradingPair,
      timestamp: +new Date(),
      origClientOrderId: tid
    }
    try {
      let resp = await this.get<ISearchTradeRequestParams, TBinanceResp<ISearchTradeResponseParams>>(orderUrl, params, true);
      if (resp.code === EAPIErrorCode.NO_SUCH_ORDER) {
        console.log('查无订单，订单号：' + tid + ' 5min后重新尝试获取订单')
        let prev = +new Date();
        while(true) {
          const current = +new Date();
          if (current - prev > 5 * 60 * 1000) {
            break;
          }
        }
        if (resp.code === EAPIErrorCode.NO_SUCH_ORDER) {
          console.log('重新获取订单：' + tid + ' 后仍无订单，请及时手动处理db.json中相应数据')
        }
        resp = await this.get<ISearchTradeRequestParams, TBinanceResp<ISearchTradeResponseParams>>(orderUrl, params, true);
      }
      return {
        status: tradeStatusMap[resp.status],
        givenAmount: parseFloat(resp.cummulativeQuoteQty),
        gainAmount: parseFloat(resp.executedQty),
        operatingPrice: parseFloat(resp.price)
      }
    } catch(err) {
      GridError.logError(err);
    }
    return Promise.resolve(undefined)
  }

  async sellCoin(price: number, targetCoinCount: number, tradingPair: string): Promise<string> {
    const params: ITradeRequestParams = {
      symbol: tradingPair,
      side: ETradeDirection.SELL,
      type: ETradeType.LIMIT,
      timeInForce: ETimeInForce.GTC,
      timestamp: +new Date(),
      quantity: targetCoinCount,
      price,
      newOrderRespType: ETradeRespType.ACK
    }
    console.log('in sell', params)
    try {
      const resp = await this.post<ITradeRequestParams, ITradeResponseParams>(orderUrl, params);
      if (!resp.clientOrderId) {
        throw resp;
      }
      return resp.clientOrderId;
    } catch(e) {
      GridError.logError(e);
    }
    return '';
  }

  private get<T, R>(url, params: any, needSign: boolean): Promise<R> {
    if (needSign) {
      params.signature = this.getSignParams(params);
    }
    const urlParams = Object.keys(params).reduce<string[]>((result, key) => {
      result.push(`${key}=${params[key]}`)
      return result
    }, []).join('&')

    const reqUrl = `${url}?${urlParams}`
    return request.get<T, R>(reqUrl, needSign ? {
      headers: {
        'X-MBX-APIKEY': apiKey
      }
    } : {});
  }

  private post<T, R>(url, body): Promise<R> {
    body.signature = this.getSignParams(body);
    return request.post<T, R>(url, body, {
      headers: {
        'X-MBX-APIKEY': apiKey
      }
    })
  }

  private delete<T, R>(url, body): Promise<R> {
    body.signature = this.getSignParams(body);
    return request.delete<T, R>(url, body, {
      headers: {
        'X-MBX-APIKEY': apiKey
      }
    })
  }

  private getSignParams(data: any) {
    const signString = Object.keys(data).reduce<string[]>((result, key) => {
      result.push(`${key}=${data[key]}`)
      return result
    }, []).join('&')

    const hmac = crypto.createHmac('sha256', apiSecret)
    return hmac.update(signString, 'utf-8').digest('hex')
  }
}

