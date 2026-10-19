/** One-off: Stephen's K500 Longhorn investment — only K489 reached the company's bank; expense the K11 transfer charge. */
import 'dotenv/config';
import { investmentService } from '../services/investment.service';

investmentService.bookForwardingCharge('INVW-1791797488055-6ZRL9S', 489)
    .then(c => { console.log(c ? `booked K${c} charge` : 'nothing to book (already done?)'); process.exit(0); })
    .catch(e => { console.error(e.message); process.exit(1); });
