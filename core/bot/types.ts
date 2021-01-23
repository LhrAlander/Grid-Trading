export enum ETradeStatus {
  NOT_START,
  SUCCESS,
  PENDING,
  FAILED,
  FINISHED,
  UNKNOW
}
// TODO: 模型待定
export interface IBotTrade {
  status: ETradeStatus;
  // 花费数量
  givenAmount: number;
  // 获得数量
  gainAmount: number;
  // 成交价
  operatingPrice: number;
}

// 机器人所需平台抽象能力
export interface IBotPlatformIndependentAbilities {
  getCurrentPrice: (tradePair: string) => Promise<number>;
  getAccountBalance: (key: string) => Promise<number>;
  buyCoin: (price: number, anchorCoinCount: number, tradingPair: string) => Promise<string>;
  sellCoin: (price: number, targetCoinCount: number, tradingPair: string) => Promise<string>;
  searchTrade: (tid: string, tradingPair) => Promise<IBotTrade>;
  cancelTrade: (tid: string, tradingPair: string) => Promise<boolean>;
}

// 机器人固化参数
export interface IBaseOptions {
  tradingPair: string;
  targetCoin: string;
  // 锚定的货币种类，目前全部为USDT
  anchorCoin: string;
  // 降低的费率 < 1
  buyDownRate: number;
  // 止盈的比例 < 1
  sellUpRate: number;
  // 价格保留小数位数
  fixNum: number;
  // 当加仓时需要加仓多少个锚定货币，如100USDT
  needBuyAnchorAmount: number;
}

// 机器人交易参数
export interface ITradeOptions {
  basePrice: number;
  // 作为锚定的货币的总量
  totalAnchorCoinCount: number;
}
