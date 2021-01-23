import {ETradeStatus, IBaseOptions, IBotPlatformIndependentAbilities, ITradeOptions} from './types'
import DataBaseHelper from '../database'
import {ETradingType, ITradingGrid} from '../database/types'
import TradingError, {ETradingErrorType} from '../utils/TradingError'
import GridError from '../utils/GridError'

const PLATFORM_REQUEST_DURATION = 2000
const PLATFORM_TRADE_OPERATE_DURATION = 1 * 60 * 1000

function isTradeFinish(grid: ITradingGrid) {
  return [
    ETradeStatus.FAILED,
    ETradeStatus.SUCCESS,
    ETradeStatus.FINISHED
  ].includes(grid.tradeStatus)
}

export default class TradeBot {

  private readonly dbHelper: DataBaseHelper
  private readonly grids: ITradingGrid[]
  private needUpdateBuyTrade: boolean
  private needUpdateSellTrade: boolean

  abilities: IBotPlatformIndependentAbilities
  baseOptions: IBaseOptions
  tradeOptions: ITradeOptions
  workLoopIntervalId: NodeJS.Timeout
  lastIntervalTime: number
  inIntervalWork: boolean


  constructor(
    abilities: IBotPlatformIndependentAbilities,
    baseOptions: IBaseOptions
  ) {
    if (!abilities) {
      throw new Error('未赋予机器人平台能力')
    }

    if (!baseOptions || typeof baseOptions !== 'object') {
      throw new Error('未正确设置机器人参数')
    }
    this.baseOptions = baseOptions;

    this.dbHelper = new DataBaseHelper(this.baseOptions.tradingPair)
    this.grids = this.dbHelper.getGrids()

    this.abilities = abilities
    this.baseOptions = {
      ...baseOptions
    }
  }

  async initBot(tradeOptions: ITradeOptions) {
    this.tradeOptions = {...tradeOptions}
  }

  async setBasePrice(basePrice) {
    // 自动设置基准价格
    if (typeof basePrice === 'undefined') {
      basePrice = await this.abilities.getCurrentPrice(this.baseOptions.tradingPair)
    }
    this.tradeOptions.basePrice = basePrice
  }

  start() {
    if (this.workLoopIntervalId) {
      clearInterval(this.workLoopIntervalId)
    }
    this.workLoopIntervalId = setInterval(async () => {
      if (
        this.inIntervalWork ||
        this.needUpdateBuyTrade ||
        this.needUpdateSellTrade ||
        this.lastIntervalTime &&
        +new Date() - this.lastIntervalTime < PLATFORM_REQUEST_DURATION
      ) {
        return
      }

      this.lastIntervalTime = +new Date()
      this.inIntervalWork = true
      try {
        const currentPrice = await this.abilities.getCurrentPrice(this.baseOptions.tradingPair)
        await this.dealPrice(currentPrice)
      } catch (err) {
        throw err
      } finally {
        this.inIntervalWork = false
      }
    }, PLATFORM_REQUEST_DURATION)
  }

  pause() {
    clearInterval(this.workLoopIntervalId)
  }

  private async dealPrice(price: number) {
    const validNeedSellGrids = this.grids.filter(grid => {
      if (isTradeFinish(grid) || grid.tradingType === ETradingType.SELL) {
        return false
      }
      return grid.needSellPrice <= price && grid.sellAmount <= grid.operatingAmount
    })
    const validLastOperateGrid = this.grids[this.grids.length - 1]

    if (validNeedSellGrids.length) {
      console.log(`当前${this.baseOptions.tradingPair}价格：${price}，满足卖出条件，开始卖出`)
      await this.doSell(validNeedSellGrids, price)
    }

    if (validLastOperateGrid.nextBuyPrice >= price) {
      console.log(`当前${this.baseOptions.tradingPair}价格：${price}，满足加仓条件，开始加仓`)
      await this.doBuy(validLastOperateGrid, price)
    } else if (!validNeedSellGrids.length) {
      console.log(`当前${this.baseOptions.tradingPair}价格：${price}，不满足任何条件，继续运行`)
    }

  }

  async doSell(grids: ITradingGrid[], price: number) {
    const amount = grids.reduce<number>((res, {operatingAmount, sellAmount}) => {
      return res + operatingAmount - Number(sellAmount)
    }, 0)
    try {
      const tid = await this.abilities.sellCoin(price, amount, this.baseOptions.targetCoin)
      if (tid) {
        console.log(`当前${this.baseOptions.tradingPair}卖单 ${tid} 挂单成功，暂停一分钟运行等待挂单结果`)
        this.needUpdateSellTrade = true
        setTimeout(async () => {
          try {
            const {
              givenAmount,
              gainAmount,
              status,
              operatingPrice
            } = await this.abilities.searchTrade(tid, this.baseOptions.tradingPair)
            await this.abilities.cancelTrade(tid, this.baseOptions.tradingPair)
            console.log(`当前${this.baseOptions.tradingPair}卖单 ${tid} 查询条件成功`)
            let reserveAmount = gainAmount
            if (givenAmount && gainAmount) {
              grids.forEach(grid => {
                grid.sellTids = Array.from(new Set(grid.sellTids.concat(tid)))
                const needSellAmount = grid.operatingAmount - Number(grid.sellAmount)
                if (needSellAmount <= 0 || !reserveAmount) return
                if (needSellAmount <= reserveAmount) {
                  grid.sellAmount += needSellAmount
                  reserveAmount -= needSellAmount
                } else {
                  reserveAmount = 0
                  grid.sellAmount += reserveAmount
                }
                this.dbHelper.updateOrAddGrid(grid)
              })
              const newGrid: ITradingGrid = {
                tid,
                tradeStatus: status,
                operatingTime: +new Date() + '',
                operatingTimeFormat: (new Date()).toLocaleDateString(),
                operatingPrice,
                operatingAmount: gainAmount,
                tradingType: ETradingType.SELL,
                nextBuyPrice: Number((operatingPrice * (1 - this.baseOptions.buyDownRate)).toFixed(this.baseOptions.fixNum)),
              }
              this.dbHelper.updateOrAddGrid(newGrid)
            }
          } catch (err) {
          } finally {
            this.needUpdateSellTrade = false
            this.start()
          }
        }, PLATFORM_TRADE_OPERATE_DURATION)
      }
    } catch (err) {
      this.start()
    }
  }

  async doBuy(grid: ITradingGrid, price: number) {
    try {
      const tid = await this.abilities.buyCoin(price, this.baseOptions.needBuyAnchorAmount, this.baseOptions.targetCoin)
      if (tid) {

        console.log(`当前${this.baseOptions.tradingPair}卖单 ${tid} 挂单失败，暂停一分钟运行等待挂单结果`)
        this.needUpdateBuyTrade = true
        setTimeout(async () => {
          try {
            const {
              givenAmount,
              gainAmount,
              status,
              operatingPrice
            } = await this.abilities.searchTrade(tid, this.baseOptions.tradingPair)
            await this.abilities.cancelTrade(tid, this.baseOptions.tradingPair)
            console.log(`当前${this.baseOptions.tradingPair}买单 ${tid} 查询条件成功`)
            if (givenAmount && gainAmount) {
              const newGrid: ITradingGrid = {
                tid,
                tradeStatus: status,
                operatingTime: +new Date() + '',
                operatingTimeFormat: (new Date()).toLocaleDateString(),
                operatingPrice,
                operatingAmount: gainAmount,
                tradingType: ETradingType.BUY,
                nextBuyPrice: Number((operatingPrice * (1 - this.baseOptions.buyDownRate)).toFixed(this.baseOptions.fixNum)),
                needSellPrice: Number((operatingPrice * (1 + this.baseOptions.sellUpRate)).toFixed(this.baseOptions.fixNum)),
                sellAmount: 0,
                sellTids: []
              }
              this.dbHelper.updateOrAddGrid(newGrid)
            }
          } catch (err) {
            GridError.logError(err)
          } finally {
            this.needUpdateBuyTrade = false
            this.start()
          }
        }, PLATFORM_TRADE_OPERATE_DURATION)
      }
    } catch (err) {
      if (err instanceof TradingError && err.code === ETradingErrorType.NO_ENOUGH_BALANCE) {
        console.error('告警！：账户余额不足！', { grid, price })
      }
      GridError.logError(err)
    }
  }

}
