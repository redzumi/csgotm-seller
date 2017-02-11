import SteamTotp          from 'steam-totp';
import SteamCommunity     from 'steamcommunity';

import EventEmitter       from 'events';

const logInAttempts         = 3;
const logInTimeout          = 30 * 100;
const defConfCheckTimeout   = 10 * 100;

let currentAttempt        = 0;

export default class SteamMobile extends EventEmitter {
  constructor() {
    super();
    this.community = new SteamCommunity();
  }

  login(data) {
    return new Promise((resolve, reject) => {
      data.twoFactorCode = this.getTOTPCode(data.sharedSecret);
      this.community.login(data, (err) => {
        if(err) {
          if(err.message != 'SteamGuardMobile') return reject(err);

          if(currentAttempt >= logInAttempts) return reject(err);
          ++currentAttempt;

          setTimeout(() => { this.login(data); }, logInTimeout);
        } else {
          this.community.on('sessionExpired', (err) => {
            this.emit('loggedOut', err);
          });
          resolve();
        }
      });
    })
  }

  startConfirmationChecker(identitySecret, timeout) {
    this.community.startConfirmationChecker((timeout || defConfCheckTimeout),
      new Buffer(identitySecret, 'base64'));
  }

  stopConfirmationChecker() {
    this.community.stopConfirmationChecker();
  }

  getTOTPCode(sharedSecret) {
    return SteamTotp.generateAuthCode(new Buffer(sharedSecret, 'base64'));
  }
}
