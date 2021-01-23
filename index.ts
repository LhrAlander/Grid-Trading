import TradeBot from './core/bot';
import Binance from './platform/binance/Binance'

const {
  baseOptions
} = require('./config.json');

process.on('uncaughtException', function (err) {
  console.error((new Date).toUTCString() + ' uncaughtException:', err)
  console.error(err.stack)
  process.exit(1)
})

class Main {
  bot: TradeBot;
  constructor() {
    this.bot = new TradeBot(new Binance(), baseOptions)
    this.bot.start();
  }
}

new Main();

