import Logger       from './logger';
import Promise      from 'bluebird';

import Market       from './csgotm';
import Steam        from './steam';

const logger  = new Logger('Seller');

const log     = logger.log;
const error   = logger.error;

const MIN_SALE_PRICE = 100;

class Seller {
  constructor(data) {
    this.data    = data;
    this.steam   = new Steam();
    this.market  = new Market(data.apiKey);
  }

  boot = async () => {
    this.marketEvents();
    this.market.loadHandlers();

    this.steamEvents();
    await this.steam.login(this.data);
    this.steam.loadHandlers();

    await this.service();
  };

  service = async () => {
    let validItems = await this.getValidForSaleItems();
    await this.sellItems(validItems, MIN_SALE_PRICE);
  };

  sellItems = async (items, minPrice) => {
    let totalCost  = 0;
    let handledItems = [];

    await Promise.each(items, async (item) => {
      let response = await this.market.getBestBuyOffer(
        item.i_classid, item.i_instanceid);

      if(!response.success)
        return error('Cant get best price: ' + response.error);

      if(response.best_offer <= minPrice)
        return log('Too low price for: ' + item.i_market_hash_name);

      item.sellPrice = response.best_offer - 10;
      totalCost += ++item.sellPrice;

      let sell = await this.market.sellItem(item.ui_id, item.sellPrice);

      if(!sell.success || sell.result != 1)
        return error('Cant sell item: ' + sell.error | sell.result);

      log(`Sold! ${item.i_market_hash_name} with price ${item.sellPrice / 100}`);

      handledItems.push(item);
    });

    log(`Sold: ${handledItems.length} / ${items.length} items`);
    log(`Total cost: ${totalCost / 100}`);
  };

  getValidForSaleItems = async () => {
    await this.market.updateInventory();

    let inventory =  await this.market.getInventory();
    if(!inventory.ok) return error('Cant load inventory: ' + inventory.error);

    return inventory.data;
  };

  marketEvents = () => {
    this.market.on('handleItem', async (data, type) => {
      log(`To ${ (type == 'in') ? 'send' : 'get' }: ${data.i_name}`);

      let res = await this.market.makeItemRequest(
        type, ((type == 'in') ? '1' : data.ui_bid));

      if(!res.success)
        return log('Cant handle item: ' + res.error);

      await this.steam.acceptOffer(res.trade);
    });
  };

  steamEvents = () => {
    this.steam.on('receivedOffer', (offer) => {
      log('Found received offer: ' + offer.tradeofferid);
    });
  };
}

new Seller({
  accountName:    'test', //login
  password:       'test', //password
  sharedSecret:   'test', //for TOTP
  identitySecret: 'test', //for Confirmations
  appId:          730,    //for inventory
  contextId:      2,      //too
  apiKey:         'test', //CSGOTM api key
}).boot();
