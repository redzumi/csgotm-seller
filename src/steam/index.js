import Logger             from '../logger';
import Promise            from 'bluebird';
import EventEmitter       from 'events';

import SteamTotp          from 'steam-totp';
import SteamUser          from 'steam-user';
import SteamTradeOffers   from 'steam-tradeoffers';
import SteamAPIKey        from 'steam-web-api-key';
import SteamMobile        from './mobile';

const logger              = new Logger('Steam');

const log                 = logger.log;
const error               = logger.error;
const promisify           = Promise.promisify;

const MOBILE_LOGIN_TIMEOUT      = 30 * 1000;
const MOBILE_CONFS_TIMEOUT      = 10 * 1000;
const RECEIVED_OFFERS_TIMEOUT   = 60 * 1000;

export default class Steam extends EventEmitter {
  constructor() {
    super();

    this.client   = new SteamUser();
    this.offers   = new SteamTradeOffers();
    this.mobile   = new SteamMobile();

    log('Steam created');
  }

  login = (data) => {
    return new Promise((resolve) => {
      this.client.on('loggedOn', () => {
        this.client.on('webSession', async (sessionId, steamCookies) => {

          let apiKey = await promisify(SteamAPIKey)({
            sessionID: sessionId,
            webCookie: steamCookies
          });

          this.offers.setup({
            sessionID: sessionId,
            webCookie: steamCookies,
            APIKey: apiKey
          });

          log('Logged on as ' + data.accountName);

          //mobile login
          setTimeout(async () => {
            await this.mobile.login(data);

            this.mobile.startConfirmationChecker(
              data.identitySecret, MOBILE_CONFS_TIMEOUT);

            log('Mobile service logged on');
            resolve(apiKey);

          }, MOBILE_LOGIN_TIMEOUT);
        });

        this.client.on('disconnected', (res, msg) => {
          this.emit('loggedOut', res, msg);
        });

        this.mobile.on('loggedOut', (err) => {
          error('Mobile service logged off: ' + err);
        });
      });

      data.twoFactorCode = this.getTOTPCode(data.sharedSecret);
      this.client.logOn(data);
    });
  };

  loadHandlers() {
    this.startHandleReceivedOffers();
  }

  getInventory = (data) => {
    return new Promise((resolve, reject) => {
      this.offers.loadMyInventory(data, (err, response) => {
        (err) ? reject(err.message) : resolve(response);
      })
    })
  };

  acceptOffer = (tradeofferid) => {
    return new Promise((resolve, reject) => {
      this.offers.acceptOffer({ tradeOfferId: tradeofferid }, (err, response) => {
        (err) ? reject(err.message) : resolve(response);
      })
    });
  };

  startHandleReceivedOffers() {
    this.handleReceivedOffers();
  };

  handleReceivedOffers() {
    this.getReceivedOffers()
      .then((body) => {
        if(body && body.response && body.response.trade_offers_received) {
          body.response.trade_offers_received.forEach((offer) => {
            if(offer.trade_offer_state === 2)
              this.emit('receivedOffer', offer);
          });
        }
        setTimeout(() => { this.handleReceivedOffers(); }, RECEIVED_OFFERS_TIMEOUT);
      })
      .catch((err) => {
        error('Cant handle received offers: ' + err);
        setTimeout(() => { this.handleReceivedOffers(); }, RECEIVED_OFFERS_TIMEOUT);
      })
  }

  getReceivedOffers() {
    return new Promise((resolve, reject) => {
      this.offers.getOffers({ get_received_offers: 1, active_only: 1 }, (err, body) => {
        (err) ? reject(err.message) : resolve(body);
      });
    });
  };

  getTOTPCode(sharedSecret) {
    return SteamTotp.generateAuthCode(new Buffer(sharedSecret, 'base64'));
  }
}
