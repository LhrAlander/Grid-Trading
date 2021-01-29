import {ETradeStatus, IBaseOptions, IBotPlatformIndependentAbilities, ITradeOptions} from './types'
import DataBaseHelper from '../database'
import {ETradingType, ITradingGrid} from '../database/types'
import TradingError, {ETradingErrorType} from '../utils/TradingError'
import GridError from '../utils/GridError'

const PLATFORM_REQUEST_DURATION = 2000
const PLATFORM_TRADE_OPERATE_DURATION = 60 * 1000

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
    this.baseOptions = baseOptions

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
        (this.lastIntervalTime &&
          +new Date() - this.lastIntervalTime < PLATFORM_REQUEST_DURATION)
      ) {
        return
      }

      this.lastIntervalTime = +new Date()
      this.inIntervalWork = true
      try {
        const currentPrice = await this.abilities.getCurrentPrice(this.baseOptions.tradingPair)
        await this.dealPrice(currentPrice)
        this.inIntervalWork = false
      } catch (err) {
        this.inIntervalWork = false
        throw err
      } finally {
      }
    }, PLATFORM_REQUEST_DURATION)
  }

  pause() {
    clearInterval(this.workLoopIntervalId)
  }

  private async dealPrice(price: number) {
    this.fixSellPrice(price)
    const validNeedSellGrids = this.grids.filter(grid => {
      if (grid.tradingType === ETradingType.SELL) {
        return false
      }
      return grid.needSellPrice <= price && grid.sellAmount < grid.operatingAmount
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
      // console.log(`当前${this.baseOptions.tradingPair}价格：${price}，不满足任何条件，继续运行`)
    }

  }

  private fixSellPrice(price: number) {
    const lastGrid = this.grids[this.grids.length - 1];
    if (!lastGrid || lastGrid.tradingType === ETradingType.BUY) {
      return;
    }

    const lastOperatingPrice = lastGrid.operatingPrice;
    if (lastOperatingPrice >= price) {
      return;
    }
    let i = 1;
    while(true) {
      const gridPrice = lastOperatingPrice * Math.pow((1 + this.baseOptions.sellUpRate), i);
      if (gridPrice <= price) {
        i++
        continue
      }
      break
    }
    if (i === 1) {
      return;
    }
    const gridPrice = lastOperatingPrice * Math.pow((1 + this.baseOptions.sellUpRate), i - 1);
    const nextBuyPrice = parseFloat((gridPrice * (1 - this.baseOptions.buyDownRate)).toFixed(2));
    if (nextBuyPrice <= lastGrid.nextBuyPrice) {
      return;
    }
    lastGrid.nextBuyPrice = nextBuyPrice;
    console.log('开始修改网格价格，当前价格为' + price + ', 上一次操作价格为 ' + lastOperatingPrice + ', 共完整跨越 ' + i + ' 个网格，修改后补仓价为：' + lastGrid.nextBuyPrice);
    this.dbHelper.updateOrAddGrid(lastGrid)
    this.dbHelper.flushIntoFile()
  }

  async doSell(grids: ITradingGrid[], price: number) {
    try {
      let balance = await this.abilities.getAccountBalance('ETH')
      let amount = grids.reduce<number>((res, {operatingAmount, sellAmount}) => {
        return res + operatingAmount - Number(sellAmount)
      }, 0)
      amount = amount > balance ? balance : amount;
      amount = Math.floor( amount * 100 ) / 100
      if (amount <= 0) {
        this.needUpdateSellTrade = false
        this.start()
        return console.log('账户不够卖出或余额不满足最低卖出数量，继续运行')
      }
      const tid = await this.abilities.sellCoin(price, amount, this.baseOptions.tradingPair)
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
            grids.forEach(grid => {
              grid.sellTids = Array.from(new Set(grid.sellTids.concat(tid)))
              const needSellAmount = grid.operatingAmount - Number(grid.sellAmount)
              if (needSellAmount <= 0 || !reserveAmount) return
              if (needSellAmount <= reserveAmount) {
                grid.sellAmount += needSellAmount
                reserveAmount -= needSellAmount
              } else {
                grid.sellAmount += reserveAmount
                reserveAmount = 0
              }
              this.dbHelper.updateOrAddGrid(grid)
            })
            const newGrid: ITradingGrid = {
              tid,
              tradeStatus: status,
              operatingTime: +new Date() + '',
              operatingTimeFormat: (new Date()).toLocaleString('en-US', {hour12: false}),
              operatingPrice,
              operatingAmount: gainAmount,
              tradingType: ETradingType.SELL,
              nextBuyPrice: Number((operatingPrice * (1 - this.baseOptions.buyDownRate)).toFixed(this.baseOptions.fixNum)),
            }
            this.grids.push(newGrid)
            this.dbHelper.updateOrAddGrid(newGrid)
            this.dbHelper.flushIntoFile()
          } catch (err) {
            GridError.logError(err)
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
      const tid = await this.abilities.buyCoin(price, this.baseOptions.needBuyAnchorAmount, this.baseOptions.tradingPair)
      if (tid) {

        console.log(`当前${this.baseOptions.tradingPair}卖单 ${tid} 挂单成功，暂停一分钟运行等待挂单结果`)
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
            const newGrid: ITradingGrid = {
              tid,
              tradeStatus: status,
              operatingTime: +new Date() + '',
              operatingTimeFormat: (new Date()).toLocaleString('en-US', {hour12: false}),
              operatingPrice,
              operatingAmount: gainAmount,
              tradingType: ETradingType.BUY,
              nextBuyPrice: Number((operatingPrice * (1 - this.baseOptions.buyDownRate)).toFixed(this.baseOptions.fixNum)),
              needSellPrice: Number((operatingPrice * (1 + this.baseOptions.sellUpRate)).toFixed(this.baseOptions.fixNum)),
              sellAmount: 0,
              sellTids: []
            }
            this.grids.push(newGrid)
            this.dbHelper.updateOrAddGrid(newGrid)
            this.dbHelper.flushIntoFile()
          } catch (err) {
            GridError.logError('程序运行出错，买入后未能写入日志，中断运行否则会造成资产损失')
            GridError.logError(err)
            process.exit(1)
          } finally {
            this.needUpdateBuyTrade = false
            this.start()
          }
        }, PLATFORM_TRADE_OPERATE_DURATION)
      }
    } catch (err) {
      if (err instanceof TradingError && err.code === ETradingErrorType.NO_ENOUGH_BALANCE) {
        console.error('告警！：账户余额不足！', {grid, price})
      }
      GridError.logError(err)
    }
  }

}
