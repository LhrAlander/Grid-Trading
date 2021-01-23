import {IDBData, ITradingGrid} from './types'

const fs = require('fs')
const path = require('path')

const dbFilePath = path.resolve(__dirname, '../../db.json')

export default class BaseDB {

  private static instance: BaseDB

  private isDirty: boolean

  private flushDBIntervalId: NodeJS.Timeout

  private updateMap: {
    [key: string]: {
      tradingGrids: ITradingGrid[];
    };
  }

  _data: IDBData

  static getInstance() {
    return BaseDB.instance || (BaseDB.instance = new BaseDB())
  }

  constructor() {
    this.initDBData()
  }

  private initDBData() {
    try {
      this.updateMap = {}
      this._data = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../db.json')).toString('utf-8'))
      if (!this._data) {
        this._data = {}
        this.isDirty = true
      }
    } catch (err) {
      this._data = {}
      this.isDirty = true
    } finally {
      this.intervalFlushData()
    }
  }

  flushDataIntoFile() {
    if (!this.isDirty) {
      return
    }

    Object.keys(this.updateMap).forEach(key => {
      if (!this._data[key]) {
        this._data[key] = {
          ...this.updateMap[key]
        }
        return
      }

      const tidGridMap = new Map(this.updateMap[key].tradingGrids.map((grid) => [grid.tid, grid]))

      this._data[key].tradingGrids = this._data[key].tradingGrids.map(prevGrid => {
        if (tidGridMap.has(prevGrid.tid)) {
          const value = tidGridMap.get(prevGrid.tid)
          tidGridMap.delete(prevGrid.tid)
          return value
        }
        return prevGrid
      })

      this._data[key].tradingGrids = [...this._data[key].tradingGrids, ...Array.from(tidGridMap.values())]
    })

    try {
      fs.writeFileSync(dbFilePath, JSON.stringify(this._data), {})
      this.isDirty = false
    } catch (err) {
      console.error((new Date()).toUTCString() + ' Error: in flushDataIntoFile', err)
      console.error(err.stack)
      this.isDirty = true
    }
  }

  private intervalFlushData() {
    if (!this.flushDBIntervalId) {
      this.flushDBIntervalId = setInterval(() => {
        this.flushDataIntoFile();
      }, 1 * 60 * 1000)
    }
  }

  updateOrAddGrid(tradingPair: string, grid: ITradingGrid) {
    this.isDirty = true
    try {
      if (!this.updateMap[tradingPair]) {
        this.updateMap[tradingPair] = {
          tradingGrids: [grid]
        }
        return
      }

      const {tid: targetTid} = grid
      const existGridIdx = this.updateMap[tradingPair].tradingGrids.findIndex(({tid}) => tid === targetTid)
      if (existGridIdx < 0) {
        return this.updateMap[tradingPair].tradingGrids.push(grid)
      }
      return this.updateMap[tradingPair].tradingGrids.splice(existGridIdx, 1, grid)
    } catch (err) {
      console.error((new Date()).toUTCString() + ' Error: in updateOrAddGrid', err)
      console.error(err.stack)
    }
  }

  getDataByTradingPair(tradingPair: string) {
    if (this.isDirty) {
      this.flushDataIntoFile()
    }
    if (!this._data[tradingPair]) {
      this.isDirty = true
      this.updateMap[tradingPair] = {
        tradingGrids: []
      }
      return this.updateMap[tradingPair]
    }
    return this._data[tradingPair]
  }
}
