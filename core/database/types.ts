import {ETradeStatus} from '../bot/types';

export enum ETradingType {
  BUY,
  SELL
}

export interface ITradingGrid {
  tid: string;
  tradeStatus: ETradeStatus;
  operatingTime: string;
  operatingTimeFormat: string;
  // 成交价
  operatingPrice: number;
  // 成交额
  operatingAmount: number;
  tradingType: ETradingType;
  nextBuyPrice: number;
  // 以下是止盈相关参数
  // 止盈价格
  needSellPrice?: number;
  // 止盈卖出货币数量
  sellAmount?: number;
  // 止盈对应tid
  sellTids?: string[];
}

export interface IDBData {
  [key: string]: { tradingGrids: ITradingGrid[]; };
}

export interface IDBConstructorProps {
  tradingPair: string;
}
