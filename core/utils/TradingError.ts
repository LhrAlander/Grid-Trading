export enum ETradingErrorType {
  NO_ENOUGH_BALANCE = 'NO_ENOUGH_BALANCE',
}

export default class TradingError extends Error {

  code: ETradingErrorType

  constructor(code: ETradingErrorType) {
    super(code)
    this.code = code
  }

  logError() {
    console.error((new Date()).toUTCString() + ' error in trading: ' + this.code)
    console.error(this.stack)
  }

}
