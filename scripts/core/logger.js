import { MODULE_ID } from "./constants.js";

export class Logger {
  static get debugEnabled() {
    return game?.settings?.get(MODULE_ID, "debug") ?? false;
  }

  static debug(...args) {
    if (this.debugEnabled) console.debug(`${MODULE_ID} |`, ...args);
  }

  static info(...args) {
    console.info(`${MODULE_ID} |`, ...args);
  }

  static warn(...args) {
    console.warn(`${MODULE_ID} |`, ...args);
  }

  static error(...args) {
    console.error(`${MODULE_ID} |`, ...args);
  }
}
