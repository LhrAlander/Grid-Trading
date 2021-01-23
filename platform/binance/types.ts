// 该部分接口有些没有用到的地方就没有写明，比如ETradeType中其实应该包含止盈订单等类型
export enum ETradeDirection {
  BUY = 'BUY',
  SELL = 'SELL'
}

export enum ETradeType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT'
}

// 有效方式，定义了订单多久能够变成失效
export enum ETimeInForce {
  // 成交为止 订单会一直有效，直到被成交或者取消。
  GTC = 'GTC',
  //无法立即成交的部分就撤销 订单在失效前会尽量多的成交。
  IOC = 'IOC',
  // 无法全部立即成交就撤销 如果无法全部成交，订单会失效。
  FOK = 'FOK'
}

export enum ETradeRespType {
  ACK = 'ACK',
  RESULT = 'RESULT',
  FULL = 'FULL'
}

export enum ETradeStatus {
  NEW = 'NEW',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  FILLED = 'FILLED',
  REJECTED = 'REJECTED',
  CANCELED = 'CANCELED',
  EXPIRED = 'EXPIRED'
}

export interface ITradeRequestParams {
  symbol: string;
  side: ETradeDirection;
  type: ETradeType;
  timestamp: number;
  timeInForce?: ETimeInForce;
  // 如eth/usdt，quantity表示需要卖出或买入多少个eth
  quantity?: number;
  // 如eth/usdt，quoteOrderQty表示需要买入或卖出多少价值usdt的eth
  quoteOrderQty?: number;
  price?: number;
  newOrderRespType?: ETradeRespType;
  recvWindow?: number;
}

export interface ITradeResponseParams {
  symbol: string;
  orderId: number;
  clientOrderId: string;
  transactTime: number;
}

export interface ICancelTradeRequestParams {
  symbol: string;
  timestamp: number;
  orderId?: number;
  origClientOrderId?: string;
  recvWindow?: number;
}

export interface ICancelTradeResponseParams {
  origClientOrderId: string;
  orderId: number;
  status: ETradeStatus;
  // 已达成交易的数量
  executedQty: number;
}

export interface ISearchTradeRequestParams {
  symbol: string;
  timestamp: number;
  origClientOrderId?: string;
  orderId?: string;
  recvWindow?: number;
}

export interface ISearchTradeResponseParams {
  symbol: string;
  orderId: number;
  clientOrderId: string;
  price: string;
  origQty: string;
  executedQty: string;
  // 累计交易的金额
  cummulativeQuoteQty: string;
  status: ETradeStatus;
  timeInForce: ETimeInForce;
  type: ETradeType;
  side: ETradeDirection;
  origQuoteOrderQty: string;
}

export interface IGetPriceRequestParams {
  symbol: string;
}

export interface IGetPriceResponseParams {
  symbol: string;
  price: string;
}
