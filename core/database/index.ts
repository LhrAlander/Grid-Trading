import {ITradingGrid} from './types';
import BaseDB from './BaseDB';

export default class DataBaseHelper {

  private data: { tradingGrids: ITradingGrid[]; };

  private readonly dbInstance: BaseDB = BaseDB.getInstance();

  private readonly tradingPair: string;

  constructor(tradingPair: string) {
    this.data = this.dbInstance.getDataByTradingPair(tradingPair);
    this.tradingPair = tradingPair;
  }

  updateOrAddGrid(grid: ITradingGrid) {
    this.dbInstance.updateOrAddGrid(this.tradingPair, grid);
  }

  getGrids() {
    return this.data.tradingGrids;
  }
}