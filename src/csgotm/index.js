import Logger       from '../logger';
import RateLimiter  from 'limitme';
import EventEmitter from 'events';
import Promise      from 'bluebird';

import request      from 'request-promise';

const logger      = new Logger('CSGOTM');

const log         = logger.log;
const error       = logger.error;

const API_URL               = 'https://market.csgo.com/api/';
const API_TIMEOUT           = 450;
const PING_PONG_TIMEOUT     = 180 * 1000;
const MARKET_TRADES_TIMEOUT = 60 * 1000;
const HANDLE_ITEM_TIMEOUT   = 60 * 1000;

export default class CSGOTM  extends EventEmitter {
  constructor(apiKey) {
    super();

    this.apiKey = apiKey;
    this.limiter = new RateLimiter(API_TIMEOUT);

    log('Market created with APIKey: ' + this.apiKey);

    this.makeOnline();
  }

  makeOnline = () => {
    setTimeout(async () => {
      await this.pingPong();
      this.makeOnline();
    }, PING_PONG_TIMEOUT);
  };

  loadHandlers() {
    this.startHandleTrades();
  }

  startHandleTrades() {
    this.handleTrades();
  };

  handleTrades() {
    this.getTrades()
      .then(async (trades) => {
        await Promise.each(trades, async (trade) => {
          //FIXME?
          await new Promise((resolve) => {
            setTimeout(() => {
              switch (trade.ui_status) {
                case '2': {
                  this.emit('handleItem', trade, 'in');
                  resolve();
                  break;
                }
                case '4': {
                  this.emit('handleItem', trade, 'out');
                  resolve();
                  break;
                }
              }
            }, HANDLE_ITEM_TIMEOUT);
          });
        });
        setTimeout(() => { this.handleTrades(); }, MARKET_TRADES_TIMEOUT);
      })
      .catch((err) => {
        error('Cant handle market trades: ' + err);
        setTimeout(() => { this.handleTrades(); }, MARKET_TRADES_TIMEOUT);
      })
  }

  getBestBuyOffer(classid, instanceid) {
    return this.limiter.enqueue()
      .then(() =>
        request.get({
          uri: API_URL + `BestBuyOffer/${classid}_${instanceid}/`,
          qs: { key: this.apiKey },
          json: true
        }));
  }

  getInventory() {
    return this.limiter.enqueue()
      .then(() =>
        request.get({
          uri: API_URL + `GetInv`,
          qs: { key: this.apiKey },
          json: true
        }));
  }

  updateInventory() {
    return this.limiter.enqueue()
      .then(() =>
        request.get({
          uri: API_URL + `UpdateInventory`,
          qs: { key: this.apiKey },
          json: true
        }));
  }

  getTrades() {
    return this.limiter.enqueue()
      .then(() =>
        request.get({
          uri: API_URL + `Trades`,
          qs: { key: this.apiKey },
          json: true
        }));
  }

  makeItemRequest(type, botid) {
    return this.limiter.enqueue()
      .then(() =>
        request.get({
          uri: API_URL + `ItemRequest/${type}/${botid || 1}`,
          qs: { key: this.apiKey },
          json: true
        }));
  }

  /* uiID = new_[classid]_[instanceid] */
  // min price is 50
  sellItem(ui_id, price) {
    return this.limiter.enqueue()
      .then(() =>
        request.get({
          uri: API_URL + `SetPrice/${ui_id}/${price}/`,
          qs: { key: this.apiKey },
          json: true
        }));
  }

  pingPong() {
    return this.limiter.enqueue()
      .then(() =>
        request.get({
          uri: API_URL + `PingPong`,
          qs: { key: this.apiKey },
          json: true
        }));
  }
}
