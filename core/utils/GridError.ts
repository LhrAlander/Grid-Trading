export default class GridError {
  public static logError(error: Error | any) {
    if (error.logError) {
      error.logError();
    } else if (error instanceof Error) {
      console.error((new Date()).toUTCString() + ': detect error', error)
      console.error(error.stack)
    } else {
      console.log((new Date()).toUTCString() + ': can\'t detect the type of error', error)
    }
  }
}
