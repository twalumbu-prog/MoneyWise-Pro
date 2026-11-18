import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { adsOverview, buyAd, cancelAd, adEvents, imageSearch } from '../controllers/marketplaceAds.controller';
import { quote, placeOrder, myOrders, getOrder, updateStatus, dispute, disputeRespond, disputeResolve, refund, payLaterOverview, payLaterPay, settle } from '../controllers/marketplaceOrders.controller';
import * as rfq from '../controllers/rfq.controller';
import * as advice from '../controllers/advice.controller';
import { catalog as priceCatalog, catalogItem as priceCatalogItem, compare as priceCompare, submitReport as priceReport, myReports as priceMyReports, knownPlaces as priceKnownPlaces } from '../controllers/priceCompare.controller';
import { browse as importsBrowse, quote as importsQuote, fromLink as importsFromLink, placeOrder as importsPlace, myOrders as importsMine } from '../controllers/imports.controller';
import {
    getMarketplaceListings, createAuction, cancelAuction, placeBid, buyNowAuction, getAuctionBids,
    getSellerReviews, saveSellerReview, deleteMyReview, getMyLocation, saveMyLocation, getStoreTheme, saveStoreTheme, getMyContact, saveMyContact, replyToReview,
} from '../controllers/marketplace.controller';

const router = Router();

// The scheduler's entry point is secured inside the handler with the cron secret, so it sits before requireAuth.
router.post('/settle', settle);

router.use(requireAuth);

// Everything listed on the Marketplace, in one response: the app filters, searches and sorts it on the device, so typing in the
// search box never waits on the network.
router.get('/listings', getMarketplaceListings);

// Auctions
router.post('/auctions', createAuction);
router.post('/auctions/:id/cancel', cancelAuction);
router.post('/auctions/:id/bids', placeBid);
router.post('/auctions/:id/buy-now', buyNowAuction);
router.get('/auctions/:id/bids', getAuctionBids);

// Seller reviews and star ratings
router.get('/sellers/:orgId/reviews', getSellerReviews);
router.post('/sellers/:orgId/reviews', saveSellerReview);
router.delete('/sellers/:orgId/reviews', deleteMyReview);

// Checkout and orders: the buyer pays from a MoneyWise wallet (MoneyWise Pay, no fee)
router.post('/checkout/quote', quote);
router.post('/orders', placeOrder);
router.get('/orders', myOrders);
router.get('/orders/:id', getOrder);
router.post('/orders/:id/status', updateStatus);
router.post('/orders/:id/dispute', dispute);
router.post('/orders/:id/dispute/respond', disputeRespond);
router.post('/orders/:id/dispute/resolve', disputeResolve);
router.post('/orders/:id/refund', refund);
router.get('/pay-later', payLaterOverview);
router.post('/pay-later/instalments/:id/pay', payLaterPay);

// Imported products: ordered from overseas stores by MoneyWise on the buyer's behalf
// Price comparison: the shared product catalogue and every offer for one product
router.get('/catalog', priceCatalog);
router.get('/catalog/:id', priceCatalogItem);
router.get('/compare/:id', priceCompare);
router.get('/compare/:id/business', advice.business);
router.get('/advice/templates', advice.templates);
router.post('/advice/basket', advice.basket);
router.get('/advice/sharing', advice.getSharing);
router.post('/advice/sharing', advice.setSharing);
router.post('/price-reports', priceReport);
router.get('/price-reports/mine', priceMyReports);
router.get('/price-reports/places', priceKnownPlaces);

// Requests for quote
router.get('/rfq', rfq.mine);
router.get('/rfq/board', rfq.board);
router.post('/rfq', rfq.create);
router.get('/rfq/:id', rfq.one);
router.post('/rfq/:id/quotes', rfq.quote);
router.post('/rfq/:id/cancel', rfq.cancel);
router.post('/rfq/quotes/:id/accept', rfq.accept);
router.post('/rfq/quotes/:id/withdraw', rfq.withdraw);

router.get('/imports', importsBrowse);
router.get('/imports/orders', importsMine);
router.post('/imports/orders', importsPlace);
router.post('/imports/quote', importsQuote);
router.post('/imports/from-link', importsFromLink);

// Where the store is
router.get('/stores/:orgId', getStoreTheme);
router.put('/my-store-theme', saveStoreTheme);
router.post('/image-search', imageSearch);
router.get('/ads', adsOverview);
router.post('/ads', buyAd);
router.post('/ads/events', adEvents);
router.post('/ads/:id/cancel', cancelAd);
router.get('/my-contact', getMyContact);
router.put('/my-contact', saveMyContact);
router.post('/reviews/:id/reply', replyToReview);
router.get('/my-location', getMyLocation);
router.put('/my-location', saveMyLocation);

export default router;
